import { createRequire } from 'node:module';

import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types';

/** Preserve the native default chain's valid-credential background refresh policy. */
export function memoizeAwsCredentials(
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

/** Use only the installed client's native refresh predicate for environment credentials. */
export function memoizeAwsEnvironmentCredentials(
  resolve: AwsCredentialIdentityProvider,
): AwsCredentialIdentityProvider {
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
      if (typeof credentialsTreatedAsExpired !== 'function') {
        throw new Error('The installed SDK does not export its credential refresh predicate.');
      }
      return memoizeAwsCredentials(resolve, credentialsTreatedAsExpired);
    } catch (cause) {
      const error = new Error(
        'Reinstall the AWS SDK: its credential refresh helper is unavailable.',
      );
      (error as Error & { cause?: unknown }).cause = cause;
      throw error;
    }
  }
  throw new Error('Install an AWS SDK client to resolve scoped environment credentials.');
}
