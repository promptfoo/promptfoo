import { getEnvOverrides } from '../envars';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';

import type { EnvOverrides } from '../contracts/env';

interface AwsCredentialConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  profile?: string;
  apiKey?: string;
}

/** Select one scoped authentication context; ambient SDK discovery remains the fallback. */
export function getScopedAwsCredentialConfig(
  config: AwsCredentialConfig = {},
  env?: EnvOverrides,
  includeBearer = false,
): AwsCredentialConfig | undefined {
  const sources = [
    config,
    ...[env, getEnvOverrides(), getEnvOverrides('file')].map((layer) => ({
      accessKeyId: layer?.AWS_ACCESS_KEY_ID,
      secretAccessKey: layer?.AWS_SECRET_ACCESS_KEY,
      sessionToken: layer?.AWS_SESSION_TOKEN,
      profile: layer?.AWS_PROFILE,
      apiKey: includeBearer ? layer?.AWS_BEARER_TOKEN_BEDROCK : undefined,
    })),
  ];
  return sources.find((source) =>
    [
      source.accessKeyId,
      source.secretAccessKey,
      source.sessionToken,
      source.profile,
      ...(includeBearer ? [source.apiKey] : []),
    ].some((value) => value !== undefined),
  );
}

/** Resolve complete scoped key tuples without mixing credentials from different scopes. */
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
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS access credentials are incomplete. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY together in the same configuration scope.',
      );
    }
    return { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
  }
  if (profile !== undefined && !profile) {
    throw new Error(
      'Scoped AWS_PROFILE is empty. Supply a profile name or remove the scoped override.',
    );
  }
  // Keep the documented explicit SSO configuration. Scoped AWS_PROFILE is passed
  // to the SDK itself, which also supports shared-file and process profiles.
  if (profile && source === config) {
    const { fromSSO } = await import('@aws-sdk/credential-provider-sso');
    return fromSSO({ profile });
  }
  return undefined;
}
