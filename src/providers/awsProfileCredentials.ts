import { exec } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

import { getEnvString, getMergedEnvOverrides } from '../envars';
import { getScopedAwsEndpointOptions } from './awsEndpointConfig';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider, Logger } from '@smithy/types';

import type { EnvOverrides } from '../contracts/env';

interface AssumeRoleParams {
  RoleArn: string;
  RoleSessionName: string;
  ExternalId?: string;
  DurationSeconds: number;
  SerialNumber?: string;
  TokenCode?: string;
}

type RoleAssumer = (
  source: AwsCredentialIdentity,
  params: AssumeRoleParams,
) => Promise<AwsCredentialIdentity>;
type WebIdentityRoleAssumer = (params: Record<string, unknown>) => Promise<AwsCredentialIdentity>;

interface ProfileOptions {
  profile?: string;
  filepath?: string;
  configFilepath?: string;
  ignoreCache?: boolean;
  logger?: Logger;
  roleAssumer?: RoleAssumer;
  roleAssumerWithWebIdentity?: WebIdentityRoleAssumer;
  webIdentityTokenFile?: string;
  roleArn?: string;
  roleSessionName?: string;
  mfaCodeProvider?: (serial: string) => Promise<string>;
  clientConfig?: Record<string, unknown>;
  parentClientConfig?: Record<string, unknown>;
}

type Profile = Record<string, string | undefined>;
type Profiles = Record<string, Profile>;
type CredentialFactory = (options: ProfileOptions) => AwsCredentialIdentityProvider;
type CredentialChain = (
  ...providers: Array<() => Promise<AwsCredentialIdentity>>
) => () => Promise<AwsCredentialIdentity>;

const execAsync = promisify(exec);

/** Preserve the native default chain's valid-credential background refresh policy. */
function memoizeProfileCredentials(
  resolve: AwsCredentialIdentityProvider,
  needsRefresh: (identity: AwsCredentialIdentity) => boolean,
): AwsCredentialIdentityProvider {
  let current: AwsCredentialIdentity | undefined;
  let initial: Promise<AwsCredentialIdentity> | undefined;
  let background: Promise<void> | undefined;
  let forced: Promise<AwsCredentialIdentity> | undefined;
  const refresh: AwsCredentialIdentityProvider = async (properties) => {
    const next = await resolve(properties);
    current = next;
    return next;
  };
  const provider: AwsCredentialIdentityProvider = async (properties) => {
    if (properties?.forceRefresh) {
      return (forced ??= refresh(properties).finally(() => {
        forced = undefined;
      }));
    }
    if (current?.expiration && current.expiration.getTime() < Date.now()) {
      current = undefined;
    }
    if (initial) {
      return initial;
    }
    if (!current) {
      return (initial = refresh(properties).finally(() => {
        initial = undefined;
      }));
    }
    if (needsRefresh(current) && !background) {
      background = refresh(properties)
        .then(() => undefined)
        // The existing credentials remain usable until their actual expiration.
        .catch(() => undefined)
        .finally(() => {
          background = undefined;
        });
    }
    return current;
  };
  // Prevent the SDK from replacing this policy with its blocking explicit-provider cache.
  return Object.assign(provider, { memoized: true });
}

/** Resolve through an installed optional client, including with isolated pnpm layouts. */
function loadProfileSdk() {
  const rootRequire = createRequire(import.meta.url);
  for (const packageName of [
    '@aws-sdk/client-bedrock-runtime',
    '@aws-sdk/client-sagemaker-runtime',
    '@aws-sdk/client-bedrock-agent-runtime',
    '@aws-sdk/client-s3',
  ]) {
    let clientEntry: string;
    try {
      clientEntry = rootRequire.resolve(packageName);
    } catch {
      continue;
    }
    try {
      const clientRequire = createRequire(clientEntry);
      const nodeRequire = createRequire(clientRequire.resolve('@aws-sdk/credential-provider-node'));
      const { credentialsTreatedAsExpired } = nodeRequire('@aws-sdk/credential-provider-node') as {
        credentialsTreatedAsExpired?: (identity: AwsCredentialIdentity) => boolean;
      };
      const iniEntry = nodeRequire.resolve('@aws-sdk/credential-provider-ini');
      const iniRequire = createRequire(iniEntry);
      const { fromIni } = iniRequire(iniEntry) as { fromIni?: CredentialFactory };
      const { setCredentialFeature } = iniRequire('@aws-sdk/core/client') as {
        setCredentialFeature: (
          credentials: AwsCredentialIdentity,
          feature: string,
          value: string,
        ) => void;
      };
      const { parseKnownFiles, chain, CredentialsProviderError } = iniRequire(
        '@smithy/core/config',
      ) as {
        parseKnownFiles?: (options: ProfileOptions) => Promise<Profiles>;
        chain?: CredentialChain;
        CredentialsProviderError?: new (
          message: string,
          options?: { logger?: Logger; tryNextLink?: boolean },
        ) => Error;
      };
      if (
        typeof credentialsTreatedAsExpired !== 'function' ||
        typeof fromIni !== 'function' ||
        typeof parseKnownFiles !== 'function' ||
        typeof chain !== 'function' ||
        typeof CredentialsProviderError !== 'function'
      ) {
        throw new Error('The installed SDK does not export its profile credential helpers.');
      }
      const credentialProvider = (packageName: string, exportName: string) => {
        let factory: CredentialFactory | undefined;
        try {
          factory = nodeRequire(packageName)[exportName];
        } catch (cause) {
          const error = new Error(
            `Reinstall the AWS SDK: its ${packageName} provider is unavailable.`,
          );
          (error as Error & { cause?: unknown }).cause = cause;
          throw error;
        }
        if (typeof factory !== 'function') {
          throw new Error(`Reinstall the AWS SDK: ${packageName} does not export ${exportName}.`);
        }
        return factory;
      };
      return {
        credentialsTreatedAsExpired,
        fromIni,
        setCredentialFeature,
        parseKnownFiles,
        chain,
        CredentialsProviderError,
        fromProcess: (options: ProfileOptions) =>
          credentialProvider('@aws-sdk/credential-provider-process', 'fromProcess')(options),
        fromTokenFile: (options: ProfileOptions) =>
          credentialProvider('@aws-sdk/credential-provider-web-identity', 'fromTokenFile')(options),
        async fromRemote(options: ProfileOptions) {
          // Match the SDK's post-INI remote-provider choice without restarting
          // fromEnv/fromIni, which could restore a cleared host key pair.
          if (
            process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
            process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI
          ) {
            return chain(
              () => credentialProvider('@aws-sdk/credential-provider-http', 'fromHttp')(options)(),
              () =>
                credentialProvider(
                  '@smithy/credential-provider-imds',
                  'fromContainerMetadata',
                )(options)(),
            )();
          }
          if (
            process.env.AWS_EC2_METADATA_DISABLED &&
            process.env.AWS_EC2_METADATA_DISABLED !== 'false'
          ) {
            throw new CredentialsProviderError('EC2 Instance Metadata Service access disabled', {
              logger: options.logger,
            });
          }
          return credentialProvider(
            '@smithy/credential-provider-imds',
            'fromInstanceMetadata',
          )(options)();
        },
        fromSSO(options: ProfileOptions) {
          const { fromSSO } = iniRequire('@aws-sdk/credential-provider-sso') as {
            fromSSO?: CredentialFactory;
          };
          if (typeof fromSSO !== 'function') {
            throw new Error('Reinstall the AWS SDK: its SSO credential provider is unavailable.');
          }
          return fromSSO(options);
        },
        roleAssumer(options: Record<string, unknown>) {
          const { getDefaultRoleAssumer } = iniRequire('@aws-sdk/nested-clients/sts') as {
            getDefaultRoleAssumer?: (options: Record<string, unknown>) => RoleAssumer;
          };
          if (typeof getDefaultRoleAssumer !== 'function') {
            throw new Error(
              'Reinstall the AWS SDK: its STS role credential provider is unavailable.',
            );
          }
          return getDefaultRoleAssumer(options);
        },
        webIdentityRoleAssumer(options: Record<string, unknown>) {
          const { getDefaultRoleAssumerWithWebIdentity } = iniRequire(
            '@aws-sdk/nested-clients/sts',
          ) as {
            getDefaultRoleAssumerWithWebIdentity?: (
              options: Record<string, unknown>,
            ) => WebIdentityRoleAssumer;
          };
          if (typeof getDefaultRoleAssumerWithWebIdentity !== 'function') {
            throw new Error('Reinstall the AWS SDK: its STS web identity provider is unavailable.');
          }
          return getDefaultRoleAssumerWithWebIdentity(options);
        },
      };
    } catch (cause) {
      const error = new Error(
        `Scoped AWS profiles require the credential providers bundled with ${packageName}. Reinstall that AWS SDK package.`,
      );
      (error as Error & { cause?: unknown }).cause = cause;
      throw error;
    }
  }
  throw new Error(
    'Scoped AWS profiles require an AWS SDK client. Install the SDK package for the selected AWS provider.',
  );
}

const isStatic = (data: Profile) =>
  typeof data.aws_access_key_id === 'string' && typeof data.aws_secret_access_key === 'string';

function isRole(data: Profile) {
  return (
    typeof data.role_arn === 'string' &&
    ['role_session_name', 'external_id', 'mfa_serial'].every(
      (key) => data[key] === undefined || typeof data[key] === 'string',
    ) &&
    ((typeof data.source_profile === 'string' && data.credential_source === undefined) ||
      (typeof data.credential_source === 'string' && data.source_profile === undefined))
  );
}

/**
 * The SDK's nested Environment provider reads process.env, and its nested SSO
 * provider drops custom filenames; credential_process inherits the host env.
 * Intercept only those leaves; use the SDK's
 * exported package entrypoints for INI parsing, other providers, and STS calls.
 */
export async function getScopedAwsProfileCredentials(
  options: ProfileOptions,
  env?: EnvOverrides,
): Promise<AwsCredentialIdentityProvider | undefined> {
  const scoped = getMergedEnvOverrides(env);
  const scopedKeys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'].some(
    (key) => scoped[key] !== undefined,
  );
  const scopedFiles = options.filepath !== undefined || options.configFilepath !== undefined;
  const scopedEnvironment = Object.fromEntries(
    Object.entries(scoped).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const hasScopedEnvironment = Object.keys(scopedEnvironment).length > 0;
  const hasScopedStsSettings = [
    'AWS_CONFIG_FILE',
    'AWS_SHARED_CREDENTIALS_FILE',
    'AWS_PROFILE',
    'AWS_USE_FIPS_ENDPOINT',
    'AWS_USE_DUALSTACK_ENDPOINT',
    'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
    'AWS_ENDPOINT_URL',
    'AWS_ENDPOINT_URL_STS',
  ].some((name) => scoped[name] !== undefined);
  if (!hasScopedEnvironment && !scopedFiles) {
    return undefined;
  }
  const sdk = loadProfileSdk();
  const profile =
    options.profile === undefined
      ? getEnvString('AWS_PROFILE') || 'default'
      : options.profile || 'default';

  async function resolveProcess(profiles: Profiles, name: string, fromProfile = false) {
    const command = profiles[name]?.credential_process;
    if (command === undefined) {
      throw new sdk.CredentialsProviderError(
        `Profile ${name} did not contain credential_process.`,
        {
          logger: options.logger,
        },
      );
    }
    try {
      // The SDK does not accept a child environment. Keep its shell and output
      // contract, changing only the environment for this individual invocation.
      const { stdout } = await execAsync(command, {
        env: { ...process.env, ...scopedEnvironment },
      });
      let data;
      try {
        data = JSON.parse(stdout.trim());
      } catch {
        throw new Error(`Profile ${name} credential_process returned invalid JSON.`);
      }
      if (data.Version !== 1) {
        throw new Error(`Profile ${name} credential_process did not return Version 1.`);
      }
      if (data.AccessKeyId === undefined || data.SecretAccessKey === undefined) {
        throw new Error(`Profile ${name} credential_process returned invalid credentials.`);
      }
      if (data.Expiration && new Date(data.Expiration) < new Date()) {
        throw new Error(`Profile ${name} credential_process returned expired credentials.`);
      }
      const accountId = data.AccountId || profiles[name]?.aws_account_id;
      const credentials: AwsCredentialIdentity = {
        accessKeyId: data.AccessKeyId,
        secretAccessKey: data.SecretAccessKey,
        ...(data.SessionToken && { sessionToken: data.SessionToken }),
        ...(data.Expiration && { expiration: new Date(data.Expiration) }),
        ...(data.CredentialScope && { credentialScope: data.CredentialScope }),
        ...(accountId && { accountId }),
      };
      sdk.setCredentialFeature(credentials, 'CREDENTIALS_PROCESS', 'w');
      if (fromProfile) {
        sdk.setCredentialFeature(credentials, 'CREDENTIALS_PROFILE_PROCESS', 'v');
      }
      return credentials;
    } catch (error) {
      throw new sdk.CredentialsProviderError(
        error instanceof Error ? error.message : String(error),
        { logger: options.logger },
      );
    }
  }
  function resolveEnvironmentCredentials(): AwsCredentialIdentity {
    // Keep invocation overrides bound, but follow native fromEnv when inherited
    // host credentials rotate between role refreshes. Another invocation's
    // active environment must not replace this provider's captured overrides.
    const accessKeyId = scoped.AWS_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = scoped.AWS_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = scoped.AWS_SESSION_TOKEN ?? process.env.AWS_SESSION_TOKEN;
    if (!accessKeyId || !secretAccessKey) {
      // Unavailable Environment credentials are a skipped link in the SDK's
      // default chain. A selected but malformed tuple remains a terminal error.
      throw new sdk.CredentialsProviderError('AWS role source credentials are incomplete.', {
        logger: options.logger,
      });
    }
    if (!accessKeyId?.trim() || !secretAccessKey?.trim()) {
      throw new Error(
        'AWS role source credentials are incomplete. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY together in the effective environment.',
      );
    }
    return {
      accessKeyId,
      secretAccessKey,
      sessionToken: sessionToken?.trim() ? sessionToken : undefined,
    };
  }

  function needsScopedProvider(
    profiles: Profiles,
    name: string,
    visited = new Set<string>(),
  ): boolean {
    const data = profiles[name];
    if (!data || visited.has(name) || (visited.size > 0 && isStatic(data))) {
      return false;
    }
    const recursiveSource = visited.size > 0 && !data.role_arn && !!data.credential_source;
    if (isRole(data) || recursiveSource) {
      if (data.source_profile) {
        return needsScopedProvider(profiles, data.source_profile, new Set([...visited, name]));
      }
      return scopedKeys && data.credential_source === 'Environment';
    }
    if (isStatic(data) || (data.web_identity_token_file && data.role_arn)) {
      return false;
    }
    if (data.credential_process !== undefined) {
      return hasScopedEnvironment;
    }
    return (
      scopedFiles &&
      ['sso_start_url', 'sso_account_id', 'sso_session', 'sso_region', 'sso_role_name'].some(
        (key) => typeof data[key] === 'string',
      )
    );
  }

  const profiles = await sdk.parseKnownFiles(options);
  const needsScopedSts = (profiles: Profiles) =>
    hasScopedStsSettings &&
    (Boolean(profiles[profile]?.role_arn) ||
      Boolean(
        (options.webIdentityTokenFile ?? process.env.AWS_WEB_IDENTITY_TOKEN_FILE) &&
          (options.roleArn ?? process.env.AWS_ROLE_ARN),
      ));
  if (
    !needsScopedProvider(profiles, profile) &&
    !needsScopedSts(profiles) &&
    !(hasScopedEnvironment && profiles[profile]?.credential_process !== undefined)
  ) {
    return undefined;
  }

  let defaultRoleAssumer: RoleAssumer | undefined;
  let defaultWebIdentityAssumer: WebIdentityRoleAssumer | undefined;
  const resolveCredentials: AwsCredentialIdentityProvider = async (properties) => {
    const profiles = await sdk.parseKnownFiles(options);
    const callerClientConfig = properties?.callerClientConfig as
      | Record<string, unknown>
      | undefined;
    const scopedStsClientConfig = async () => {
      const clientConfig = options.clientConfig ?? {};
      const endpointOptions = await getScopedAwsEndpointOptions(
        'STS',
        {
          ...options,
          ...clientConfig,
          // Native nested STS inherits the caller profile, but never its endpoint.
          profile: (clientConfig.profile ??
            options.parentClientConfig?.profile ??
            callerClientConfig?.profile ??
            scoped.AWS_PROFILE) as string | undefined,
        },
        scoped,
      );
      return { ...clientConfig, ...endpointOptions };
    };
    const getRoleAssumer = async (region?: string): Promise<RoleAssumer> =>
      options.roleAssumer ??
      (defaultRoleAssumer ??= sdk.roleAssumer({
        ...(needsScopedSts(profiles) ? await scopedStsClientConfig() : options.clientConfig),
        credentialProviderLogger: options.logger,
        parentClientConfig: {
          ...callerClientConfig,
          ...options.parentClientConfig,
          region: region ?? options.parentClientConfig?.region ?? callerClientConfig?.region,
        },
      }));
    const resolveLeaf = (name: string) =>
      profiles[name].credential_process === undefined
        ? sdk.fromSSO({ ...options, profile: name })(properties)
        : resolveProcess(profiles, name, true);
    const resolve = async (name: string, recursive = false): Promise<AwsCredentialIdentity> => {
      const data = profiles[name];
      if (!isRole(data) && !(recursive && !data.role_arn && data.credential_source)) {
        return resolveLeaf(name);
      }
      // Native fromIni treats missing MFA configuration as terminal even when
      // the source credentials are unavailable.
      if (data.role_arn && data.mfa_serial && !options.mfaCodeProvider) {
        throw new sdk.CredentialsProviderError(
          `AWS profile ${name} requires an MFA code provider.`,
          { logger: options.logger, tryNextLink: false },
        );
      }
      const tokenCode =
        data.role_arn && data.mfa_serial
          ? await options.mfaCodeProvider!(data.mfa_serial)
          : undefined;
      // Match the SDK: the outer role initializes the assumer, which is shared
      // by nested roles and refreshes of this credential-provider lifetime.
      const assume = data.role_arn ? await getRoleAssumer(data.region) : undefined;
      const source = data.source_profile
        ? await resolve(data.source_profile, true)
        : resolveEnvironmentCredentials();
      if (!data.role_arn || !assume) {
        return source;
      }
      const params: AssumeRoleParams = {
        RoleArn: data.role_arn,
        RoleSessionName: data.role_session_name || `aws-sdk-js-${Date.now()}`,
        ExternalId: data.external_id,
        DurationSeconds: Number.parseInt(data.duration_seconds || '3600', 10),
      };
      if (data.mfa_serial) {
        params.SerialNumber = data.mfa_serial;
        params.TokenCode = tokenCode;
      }
      return assume(source, params);
    };
    const settings = (): ProfileOptions => {
      if (!needsScopedSts(profiles)) {
        return { ...options, profile };
      }
      return {
        ...options,
        profile,
        roleAssumer:
          options.roleAssumer ??
          (async (source, params) => {
            const assume = await getRoleAssumer(profiles[profile]?.region);
            return assume(source, params);
          }),
        // Native fromIni drops clientConfig when it delegates a web-identity
        // profile. Supply only that native assumer with the scoped STS settings.
        roleAssumerWithWebIdentity:
          options.roleAssumerWithWebIdentity ??
          (async (params) => {
            defaultWebIdentityAssumer ??= sdk.webIdentityRoleAssumer({
              ...(await scopedStsClientConfig()),
              credentialProviderLogger: options.logger,
              parentClientConfig: { ...callerClientConfig, ...options.parentClientConfig },
            });
            return defaultWebIdentityAssumer(params);
          }),
      };
    };
    // Bind caller properties explicitly: the SDK's generic chain helper does
    // not forward arguments. Keep only the native tail after the adapted INI
    // provider, including its unavailable-versus-terminal error handling.
    return sdk.chain(
      () =>
        needsScopedProvider(profiles, profile)
          ? resolve(profile)
          : sdk.fromIni(settings())(properties),
      () =>
        hasScopedEnvironment
          ? resolveProcess(profiles, profile)
          : sdk.fromProcess({ ...options, profile })(properties),
      () => sdk.fromTokenFile(settings())(properties),
      () => sdk.fromRemote({ ...options, profile }),
      async () => {
        throw new sdk.CredentialsProviderError('Could not load credentials from any providers', {
          logger: options.logger,
          tryNextLink: false,
        });
      },
    )();
  };
  return memoizeProfileCredentials(resolveCredentials, sdk.credentialsTreatedAsExpired);
}
