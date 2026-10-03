import { createRequire } from 'node:module';

import { getEnvString, getMergedEnvOverrides } from '../envars';
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

interface ProfileOptions {
  profile?: string;
  filepath?: string;
  configFilepath?: string;
  ignoreCache?: boolean;
  logger?: Logger;
  roleAssumer?: RoleAssumer;
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
      const iniEntry = nodeRequire.resolve('@aws-sdk/credential-provider-ini');
      const iniRequire = createRequire(iniEntry);
      const { fromIni } = iniRequire(iniEntry) as { fromIni?: CredentialFactory };
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
        fromIni,
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
 * provider drops custom filenames. Intercept only those leaves; use the SDK's
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
  if (!scopedKeys && !scopedFiles) {
    return undefined;
  }
  const sdk = loadProfileSdk();
  const profile =
    options.profile === undefined
      ? getEnvString('AWS_PROFILE') || 'default'
      : options.profile || 'default';
  const effective = (key: string) => scoped[key] ?? getEnvString(key);
  const environmentCredentials = {
    accessKeyId: effective('AWS_ACCESS_KEY_ID'),
    secretAccessKey: effective('AWS_SECRET_ACCESS_KEY'),
    sessionToken: effective('AWS_SESSION_TOKEN'),
  };
  function resolveEnvironmentCredentials(): AwsCredentialIdentity {
    const { accessKeyId, secretAccessKey, sessionToken } = environmentCredentials;
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
    if (
      isStatic(data) ||
      (data.web_identity_token_file && data.role_arn) ||
      data.credential_process
    ) {
      return false;
    }
    return (
      scopedFiles &&
      ['sso_start_url', 'sso_account_id', 'sso_session', 'sso_region', 'sso_role_name'].some(
        (key) => typeof data[key] === 'string',
      )
    );
  }

  if (!needsScopedProvider(await sdk.parseKnownFiles(options), profile)) {
    return undefined;
  }

  let defaultRoleAssumer: RoleAssumer | undefined;
  return async (properties) => {
    const profiles = await sdk.parseKnownFiles(options);
    const callerClientConfig = properties?.callerClientConfig as
      | Record<string, unknown>
      | undefined;
    const resolve = async (name: string, recursive = false): Promise<AwsCredentialIdentity> => {
      const data = profiles[name];
      if (!isRole(data) && !(recursive && !data.role_arn && data.credential_source)) {
        return sdk.fromSSO({ ...options, profile: name })(properties);
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
      const assume = data.role_arn
        ? (options.roleAssumer ??
          (defaultRoleAssumer ??= sdk.roleAssumer({
            ...options.clientConfig,
            credentialProviderLogger: options.logger,
            parentClientConfig: {
              ...callerClientConfig,
              ...options.parentClientConfig,
              region:
                data.region ?? options.parentClientConfig?.region ?? callerClientConfig?.region,
            },
          })))
        : undefined;
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
    const settings = { ...options, profile };
    // Bind caller properties explicitly: the SDK's generic chain helper does
    // not forward arguments. Keep only the native tail after the adapted INI
    // provider, including its unavailable-versus-terminal error handling.
    return sdk.chain(
      () =>
        needsScopedProvider(profiles, profile)
          ? resolve(profile)
          : sdk.fromIni(settings)(properties),
      () => sdk.fromProcess(settings)(properties),
      () => sdk.fromTokenFile(settings)(properties),
      () => sdk.fromRemote(settings),
      async () => {
        throw new sdk.CredentialsProviderError('Could not load credentials from any providers', {
          logger: options.logger,
          tryNextLink: false,
        });
      },
    )();
  };
}
