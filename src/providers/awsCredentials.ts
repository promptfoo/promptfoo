import { homedir } from 'node:os';
import path from 'node:path';

import { getEnvString, getMergedEnvOverrides } from '../envars';
import { memoizeAwsEnvironmentCredentials } from './awsCredentialRefresh';
import { getScopedAwsProfileCredentials } from './awsProfileCredentials';
import { createScopedSsoProvider } from './awsSsoCredentials';
import { getCredentialCacheNamespace, getOpaqueCredentialCacheNamespace } from './credentialCache';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types';

import type { EnvOverrides } from '../contracts/env';

interface AwsCredentialConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  profile?: string;
  apiKey?: string;
}

// Match the SDK's shared-ini loader, including Windows home selectors and ~/.
function resolveSharedFilePath(filename: string, kind: 'credentials' | 'config'): string {
  const awsHome =
    process.env.HOME ||
    process.env.USERPROFILE ||
    (process.env.HOMEPATH &&
      `${process.env.HOMEDRIVE || `C:${path.sep}`}${process.env.HOMEPATH}`) ||
    homedir();
  return filename
    ? filename.startsWith('~/')
      ? path.join(awsHome, filename.slice(2))
      : filename
    : path.join(awsHome, '.aws', kind);
}

/** Options consumed by the SDK's existing default credential provider. */
export function getAwsCredentialProviderOptions(env?: EnvOverrides) {
  const scoped = getMergedEnvOverrides(env);
  return {
    ...(['AWS_PROFILE', 'AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE'].some(
      (name) => scoped[name] !== undefined,
    )
      ? { ignoreCache: true }
      : {}),
    ...(scoped.AWS_SHARED_CREDENTIALS_FILE === undefined
      ? {}
      : { filepath: resolveSharedFilePath(scoped.AWS_SHARED_CREDENTIALS_FILE, 'credentials') }),
    ...(scoped.AWS_CONFIG_FILE === undefined
      ? {}
      : { configFilepath: resolveSharedFilePath(scoped.AWS_CONFIG_FILE, 'config') }),
    ...(scoped.AWS_WEB_IDENTITY_TOKEN_FILE === undefined
      ? {}
      : { webIdentityTokenFile: scoped.AWS_WEB_IDENTITY_TOKEN_FILE }),
    ...(scoped.AWS_ROLE_ARN === undefined ? {} : { roleArn: scoped.AWS_ROLE_ARN }),
    ...(scoped.AWS_ROLE_SESSION_NAME === undefined
      ? {}
      : { roleSessionName: scoped.AWS_ROLE_SESSION_NAME }),
  };
}

/** Select one scoped authentication context; ambient SDK discovery remains the fallback. */
export function getScopedAwsCredentialConfig(
  config: AwsCredentialConfig = {},
  env?: EnvOverrides,
  includeBearer = false,
): AwsCredentialConfig | undefined {
  // Keep explicit configuration and the existing per-key env merge contract.
  // In particular, a file that only supplies a session token may use access keys
  // from the host, just as loading that file into process.env did before scoping.
  if (config.accessKeyId && config.secretAccessKey) {
    return config;
  }
  if (config.profile || (includeBearer && config.apiKey)) {
    return config;
  }
  const scoped = getMergedEnvOverrides(env);
  const value = (key: string) => scoped[key] ?? getEnvString(key);
  const keyFields = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const metadataFields = ['AWS_CREDENTIAL_EXPIRATION', 'AWS_ACCOUNT_ID', 'AWS_CREDENTIAL_SCOPE'];
  const harmlessStaticPlaceholders =
    keyFields.every((key) => !value(key)) &&
    !value('AWS_SESSION_TOKEN')?.trim() &&
    !keyFields.some((key) => scoped[key] === '' && process.env[key]);
  const fields = [
    ...(harmlessStaticPlaceholders ? [] : [...keyFields, 'AWS_SESSION_TOKEN']),
    ...metadataFields,
    'AWS_PROFILE',
    ...(includeBearer ? ['AWS_BEARER_TOKEN_BEDROCK'] : []),
  ];
  if (
    !fields.some((key) => scoped[key] !== undefined) &&
    Object.keys(getAwsCredentialProviderOptions(env)).length === 0
  ) {
    return undefined;
  }
  const hasScopedKeys =
    !harmlessStaticPlaceholders &&
    [...keyFields, 'AWS_SESSION_TOKEN'].some((key) => scoped[key] !== undefined);
  const hasScopedEnvironmentCredentials =
    hasScopedKeys || metadataFields.some((key) => scoped[key] !== undefined);
  // A selected profile or bearer token must not be displaced by the host's key tuple.
  if (!hasScopedKeys && includeBearer && scoped.AWS_BEARER_TOKEN_BEDROCK !== undefined) {
    return { apiKey: scoped.AWS_BEARER_TOKEN_BEDROCK };
  }
  const profile = scoped.AWS_PROFILE ?? getEnvString('AWS_PROFILE');
  const hasCompleteKeys = Boolean(value('AWS_ACCESS_KEY_ID') && value('AWS_SECRET_ACCESS_KEY'));
  if (profile === '' && hasCompleteKeys) {
    return {
      accessKeyId: value('AWS_ACCESS_KEY_ID'),
      secretAccessKey: value('AWS_SECRET_ACCESS_KEY'),
      sessionToken: value('AWS_SESSION_TOKEN'),
      profile,
    };
  }
  // With no selected profile, the SDK tries ambient access keys before files or
  // web identity. Scoping only those later sources must not select them early
  // or change the response-cache namespace for the unchanged ambient identity.
  if (!profile && !hasScopedEnvironmentCredentials && hasCompleteKeys) {
    return undefined;
  }
  if (profile || !hasScopedEnvironmentCredentials) {
    return {
      // The SDK's nested INI loader restores process.env for an empty profile.
      // Normalize its implicit default after fromEnv is ruled out so cache
      // identity tracks both shared files, including an unscoped counterpart.
      profile: profile || 'default',
    };
  }
  if (!hasCompleteKeys) {
    // The native environment provider skips incomplete tuples and continues
    // through files, process, web identity, and metadata. Select the default
    // profile explicitly so a scoped clear cannot restore the host's keypair.
    // The profile adapter still validates Environment sources used by roles.
    return { profile: 'default' };
  }
  return {
    accessKeyId: value('AWS_ACCESS_KEY_ID'),
    secretAccessKey: value('AWS_SECRET_ACCESS_KEY'),
    sessionToken: value('AWS_SESSION_TOKEN'),
    profile: value('AWS_PROFILE'),
    apiKey: includeBearer ? value('AWS_BEARER_TOKEN_BEDROCK') : undefined,
  };
}

/** Keep configured SSO credential selection separate from SDK endpoint-profile discovery. */
export function getAwsSdkProfile(
  config: AwsCredentialConfig = {},
  env?: EnvOverrides,
): string | undefined {
  if ((config.accessKeyId && config.secretAccessKey) || config.profile) {
    const scopedProfile = getMergedEnvOverrides(env).AWS_PROFILE;
    // Explicit credentials and fromSSO(config.profile) historically left SDK
    // endpoint settings on the ambient profile. Forward invocation overrides
    // without selecting the separate credential profile for endpoint settings.
    return scopedProfile === undefined ? undefined : scopedProfile || 'default';
  }
  const profile = getScopedAwsCredentialConfig(config, env)?.profile;
  // An effective scoped clear must not let the SDK restore the host profile.
  return profile === '' ? 'default' : profile;
}

/** Forward effective AWS credentials while keeping ambient SDK discovery as the fallback. */
export async function resolveAwsCredentials(
  config: AwsCredentialConfig = {},
  env?: EnvOverrides,
): Promise<AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined> {
  const source = getScopedAwsCredentialConfig(config, env);
  if (!source) {
    const scoped = getMergedEnvOverrides(env);
    const hasScopedEnvironment = Object.values(scoped).some((value) => value !== undefined);
    // A process profile may depend only on custom invocation variables. Keep
    // native fromEnv precedence when the host has a complete static tuple and
    // no selected profile; otherwise let the adapter detect a process leaf.
    const ambientKeys = getEnvString('AWS_ACCESS_KEY_ID') && getEnvString('AWS_SECRET_ACCESS_KEY');
    return hasScopedEnvironment && (!ambientKeys || getEnvString('AWS_PROFILE'))
      ? getScopedAwsProfileCredentials(getAwsCredentialProviderOptions(env), env)
      : undefined;
  }
  const { accessKeyId, secretAccessKey, sessionToken, profile } = source;
  // Incomplete configured tuples have always fallen through to config.profile.
  // Scoped static identities still validate their effective key pair.
  if (
    (source !== config || (accessKeyId && secretAccessKey)) &&
    [accessKeyId, secretAccessKey, sessionToken].some((value) => value !== undefined)
  ) {
    if (!accessKeyId?.trim() || !secretAccessKey?.trim()) {
      throw new Error(
        'AWS access credentials are incomplete. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY together in the effective environment.',
      );
    }
    if (source !== config) {
      // Capture invocation overrides, but refresh inherited host values like the
      // native environment provider. A later invocation must not supply them.
      const scoped = getMergedEnvOverrides(env);
      return memoizeAwsEnvironmentCredentials(async () => {
        const value = (name: string) => scoped[name] ?? process.env[name];
        const currentAccessKeyId = value('AWS_ACCESS_KEY_ID');
        const currentSecretAccessKey = value('AWS_SECRET_ACCESS_KEY');
        if (!currentAccessKeyId?.trim() || !currentSecretAccessKey?.trim()) {
          throw new Error(
            'AWS access credentials are incomplete. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY together in the effective environment.',
          );
        }
        const currentSessionToken = value('AWS_SESSION_TOKEN');
        const expiration = value('AWS_CREDENTIAL_EXPIRATION');
        const credentialScope = value('AWS_CREDENTIAL_SCOPE');
        const accountId = value('AWS_ACCOUNT_ID');
        return {
          accessKeyId: currentAccessKeyId,
          secretAccessKey: currentSecretAccessKey,
          sessionToken: currentSessionToken?.trim() ? currentSessionToken : undefined,
          ...(expiration ? { expiration: new Date(expiration) } : {}),
          ...(credentialScope ? { credentialScope } : {}),
          ...(accountId ? { accountId } : {}),
        };
      });
    }
    return {
      accessKeyId,
      secretAccessKey,
      sessionToken: sessionToken?.trim() ? sessionToken : undefined,
    };
  }
  if (profile && !profile.trim()) {
    throw new Error(
      'Scoped AWS_PROFILE is empty. Supply a profile name or remove the scoped override.',
    );
  }
  // Keep the documented explicit SSO configuration. Scoped AWS_PROFILE is passed
  // to the SDK itself, which also supports shared-file and process profiles.
  if (profile && source === config) {
    const { fromSSO } = await import('@aws-sdk/credential-provider-sso').catch(() => {
      throw new Error(
        'AWS SSO profiles require @aws-sdk/credential-provider-sso. Please install it with: npm install @aws-sdk/credential-provider-sso',
      );
    });
    return createScopedSsoProvider(
      fromSSO,
      { ...getAwsCredentialProviderOptions(env), profile },
      getMergedEnvOverrides(env),
    );
  }
  return getScopedAwsProfileCredentials({ ...getAwsCredentialProviderOptions(env), profile }, env);
}

/** Stable public identity partition for SDK credentials introduced by scoped environments. */
export function getAwsCredentialCacheNamespace(
  config: AwsCredentialConfig = {},
  env?: EnvOverrides,
): string | undefined {
  const identity = getScopedCredentialCacheNamespace(config, env);
  const endpoint = getAwsEndpointCacheNamespace(env);
  const process = getAwsProcessCacheNamespace(config, env);
  return [identity, endpoint, process].filter(Boolean).join(':') || undefined;
}

/** Scoped SDK routing must partition responses even when explicit credentials win. */
export function getAwsEndpointCacheNamespace(env?: EnvOverrides): string | undefined {
  const scoped = getMergedEnvOverrides(env);
  const fileSelectors = ['AWS_PROFILE', 'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE'];
  const settings = Object.entries(scoped)
    .filter(
      ([key, value]) =>
        value !== undefined &&
        (key === 'AWS_USE_FIPS_ENDPOINT' ||
          key === 'AWS_USE_DUALSTACK_ENDPOINT' ||
          key === 'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS' ||
          key === 'AWS_ENDPOINT_URL' ||
          key.startsWith('AWS_ENDPOINT_URL_')),
    )
    .sort(([left], [right]) => left.localeCompare(right));
  if (!settings.length && !fileSelectors.some((key) => scoped[key] !== undefined)) {
    return undefined;
  }
  const options = getAwsCredentialProviderOptions(env);
  // Files can contain endpoint credentials. Partition by public selectors and
  // revisions only; direct endpoint values receive an opaque process-local ID.
  const files = getCredentialCacheNamespace(
    [scoped.AWS_PROFILE ?? getEnvString('AWS_PROFILE') ?? 'default'],
    [
      options.configFilepath ??
        resolveSharedFilePath(getEnvString('AWS_CONFIG_FILE') ?? '', 'config'),
      options.filepath ??
        resolveSharedFilePath(getEnvString('AWS_SHARED_CREDENTIALS_FILE') ?? '', 'credentials'),
    ],
  );
  const direct = settings.length
    ? `:${getOpaqueCredentialCacheNamespace(JSON.stringify(settings))}`
    : '';
  return `aws-endpoint:${files}${direct}`;
}

function getAwsProcessCacheNamespace(config: AwsCredentialConfig, env?: EnvOverrides) {
  const source = getScopedAwsCredentialConfig(config, env);
  // Explicit configuration uses static IAM or the documented SSO provider.
  // Neither reads custom environment variables through credential_process.
  if (source === config || (source?.accessKeyId && source.secretAccessKey)) {
    return undefined;
  }
  if (
    !source &&
    !getEnvString('AWS_PROFILE') &&
    getEnvString('AWS_ACCESS_KEY_ID') &&
    getEnvString('AWS_SECRET_ACCESS_KEY')
  ) {
    return undefined;
  }
  const scoped = Object.entries(getMergedEnvOverrides(env))
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  const publicSelectors = ['AWS_PROFILE', 'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE'];
  if (!scoped.some(([key]) => !publicSelectors.includes(key))) {
    return undefined;
  }
  // A process helper may read any variable. Conservatively isolate possible
  // process discovery without synchronously parsing profiles or persisting
  // custom values (or their hashes) in response-cache keys.
  return `aws-process:${getOpaqueCredentialCacheNamespace(JSON.stringify(scoped))}`;
}

function getScopedCredentialCacheNamespace(
  config: AwsCredentialConfig,
  env?: EnvOverrides,
): string | undefined {
  const source = getScopedAwsCredentialConfig(config, env);
  const options = getAwsCredentialProviderOptions(env);
  const hasScopedProfileFiles =
    source?.profile &&
    !(source.accessKeyId && source.secretAccessKey) &&
    (options.filepath !== undefined || options.configFilepath !== undefined);
  if (!source || (source === config && !hasScopedProfileFiles)) {
    return undefined;
  }
  const scoped = getMergedEnvOverrides(env);
  const profileSourceAccessKey =
    source !== config &&
    source.profile &&
    ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'].some(
      (key) => scoped[key] !== undefined,
    )
      ? (scoped.AWS_ACCESS_KEY_ID ?? getEnvString('AWS_ACCESS_KEY_ID'))
      : undefined;
  // A selected profile can use Environment credentials or fall through when
  // their key pair is unavailable. Partition that choice without persisting a
  // secret or its hash; whitespace-only selected keys instead fail terminally.
  const sourceAccessKey = scoped.AWS_ACCESS_KEY_ID ?? getEnvString('AWS_ACCESS_KEY_ID');
  const sourceSecretKey = scoped.AWS_SECRET_ACCESS_KEY ?? getEnvString('AWS_SECRET_ACCESS_KEY');
  const profileSourceAvailability =
    source !== config && source.profile
      ? !sourceAccessKey || !sourceSecretKey
        ? 'source-unavailable'
        : !sourceAccessKey.trim() || !sourceSecretKey.trim()
          ? 'source-invalid'
          : 'source-available'
      : undefined;
  // A scoped profile can fall through to the SDK's ambient web-identity link.
  // Include its public selectors and file revision in this new scoped namespace.
  const webIdentityTokenFile =
    options.webIdentityTokenFile ??
    (source !== config && source.profile ? getEnvString('AWS_WEB_IDENTITY_TOKEN_FILE') : undefined);
  const files = [options.filepath, options.configFilepath, webIdentityTokenFile];
  // The SDK combines a scoped token file with an inherited role ARN. Keep that
  // public account/role selector in the same response-cache identity.
  const roleArn =
    options.roleArn ?? (webIdentityTokenFile ? getEnvString('AWS_ROLE_ARN') : undefined);
  const roleSessionName =
    options.roleSessionName ??
    (webIdentityTokenFile ? getEnvString('AWS_ROLE_SESSION_NAME') : undefined);
  if (source.profile) {
    files.push(
      options.filepath ??
        resolveSharedFilePath(getEnvString('AWS_SHARED_CREDENTIALS_FILE') ?? '', 'credentials'),
    );
    files.push(
      options.configFilepath ??
        resolveSharedFilePath(getEnvString('AWS_CONFIG_FILE') ?? '', 'config'),
    );
  }
  return getCredentialCacheNamespace(
    [
      source.accessKeyId,
      source.profile,
      roleArn,
      roleSessionName,
      profileSourceAccessKey,
      ...(profileSourceAvailability ? [profileSourceAvailability] : []),
    ],
    [...new Set(files.filter((file): file is string => file !== undefined))],
  );
}
