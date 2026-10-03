import { homedir } from 'node:os';
import path from 'node:path';

import { getEnvString, getMergedEnvOverrides } from '../envars';
import { getScopedAwsProfileCredentials } from './awsProfileCredentials';
import { getCredentialCacheNamespace } from './credentialCache';
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
  const harmlessStaticPlaceholders =
    keyFields.every((key) => !value(key)) &&
    !value('AWS_SESSION_TOKEN')?.trim() &&
    !keyFields.some((key) => scoped[key] === '' && process.env[key]);
  const fields = [
    ...(harmlessStaticPlaceholders ? [] : [...keyFields, 'AWS_SESSION_TOKEN']),
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
  if (!profile && !hasScopedKeys && hasCompleteKeys) {
    return undefined;
  }
  if (profile || !hasScopedKeys) {
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

/** Forward effective AWS credentials while keeping ambient SDK discovery as the fallback. */
export async function resolveAwsCredentials(
  config: AwsCredentialConfig = {},
  env?: EnvOverrides,
): Promise<AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined> {
  const source = getScopedAwsCredentialConfig(config, env);
  if (!source) {
    return undefined;
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
    return fromSSO({ ...getAwsCredentialProviderOptions(env), profile });
  }
  return getScopedAwsProfileCredentials({ ...getAwsCredentialProviderOptions(env), profile }, env);
}

/** Stable public identity partition for SDK credentials introduced by scoped environments. */
export function getAwsCredentialCacheNamespace(
  config: AwsCredentialConfig = {},
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
