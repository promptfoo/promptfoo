import { homedir } from 'node:os';
import path from 'node:path';

import { getEnvOverrides, getEnvString } from '../envars';
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

/** Options consumed by the SDK's existing default credential provider. */
export function getAwsCredentialProviderOptions(env?: EnvOverrides) {
  const scoped = Object.assign({}, getEnvOverrides('file'), getEnvOverrides(), env);
  return {
    ...(scoped.AWS_SHARED_CREDENTIALS_FILE === undefined
      ? {}
      : { filepath: scoped.AWS_SHARED_CREDENTIALS_FILE }),
    ...(scoped.AWS_CONFIG_FILE === undefined ? {} : { configFilepath: scoped.AWS_CONFIG_FILE }),
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
  const scoped = Object.assign({}, getEnvOverrides('file'), getEnvOverrides(), env);
  const fields = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_PROFILE',
    ...(includeBearer ? ['AWS_BEARER_TOKEN_BEDROCK'] : []),
  ];
  if (
    !fields.some((key) => scoped[key] !== undefined) &&
    Object.keys(getAwsCredentialProviderOptions(env)).length === 0
  ) {
    return undefined;
  }
  const hasScopedKeys = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'].some(
    (key) => scoped[key] !== undefined,
  );
  // A selected profile or bearer token must not be displaced by the host's key tuple.
  if (!hasScopedKeys && includeBearer && scoped.AWS_BEARER_TOKEN_BEDROCK !== undefined) {
    return { apiKey: scoped.AWS_BEARER_TOKEN_BEDROCK };
  }
  const profile = scoped.AWS_PROFILE ?? getEnvString('AWS_PROFILE');
  if (profile || !hasScopedKeys) {
    return { profile };
  }
  const value = (key: string) => scoped[key] ?? getEnvString(key);
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
  if ([accessKeyId, secretAccessKey, sessionToken].some((value) => value !== undefined)) {
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
    return fromSSO({ profile });
  }
  return undefined;
}

/** Stable public identity partition for SDK credentials introduced by scoped environments. */
export function getAwsCredentialCacheNamespace(
  config: AwsCredentialConfig = {},
  env?: EnvOverrides,
): string | undefined {
  const source = getScopedAwsCredentialConfig(config, env);
  if (!source || source === config) {
    return undefined;
  }
  const options = getAwsCredentialProviderOptions(env);
  const files = [options.filepath, options.configFilepath, options.webIdentityTokenFile];
  if (source.profile) {
    files.push(
      options.filepath ??
        getEnvString('AWS_SHARED_CREDENTIALS_FILE') ??
        path.join(homedir(), '.aws', 'credentials'),
    );
    files.push(
      options.configFilepath ??
        getEnvString('AWS_CONFIG_FILE') ??
        path.join(homedir(), '.aws', 'config'),
    );
  }
  return getCredentialCacheNamespace(
    [source.accessKeyId, source.profile, options.roleArn, options.roleSessionName],
    [...new Set(files.filter((file): file is string => file !== undefined))],
  );
}
