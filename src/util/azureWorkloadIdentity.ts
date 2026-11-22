import type { TokenCredential, WorkloadIdentityCredentialOptions } from '@azure/identity';

/** Guard the SDK-owned source list before adapting scoped credential modes. */
async function getNativeSources(
  identity: typeof import('@azure/identity'),
  native: TokenCredential,
  selector: string | undefined,
) {
  const { default: metadata } = await import('@azure/identity/package.json', {
    with: { type: 'json' },
  });
  const unsupported = () =>
    new Error(
      'This Azure Identity SDK version or credential-chain layout cannot safely isolate scoped Azure credentials. Use a supported @azure/identity 4.x SDK or an explicit client-secret/certificate identity.',
    );
  const sources: unknown = Reflect.get(native, '_sources');
  const expected =
    selector === 'environmentcredential'
      ? ['EnvironmentCredential']
      : selector === 'workloadidentitycredential'
        ? ['WorkloadIdentityCredential']
        : selector === 'managedidentitycredential'
          ? ['ManagedIdentityCredential']
          : ['EnvironmentCredential', 'WorkloadIdentityCredential', 'ManagedIdentityCredential'];
  const classes = {
    EnvironmentCredential: identity.EnvironmentCredential,
    WorkloadIdentityCredential: identity.WorkloadIdentityCredential,
    ManagedIdentityCredential: identity.ManagedIdentityCredential,
  };
  const matches = (source: unknown, name: keyof typeof classes) =>
    source instanceof classes[name] ||
    (typeof source === 'object' &&
      source !== null &&
      source.constructor.name === 'UnavailableDefaultCredential' &&
      (Reflect.get(source, 'credentialName') === `createDefault${name}` ||
        (selector === 'managedidentitycredential' &&
          name === 'ManagedIdentityCredential' &&
          Reflect.get(source, 'credentialName') === '')));
  if (
    !/^4\./.test(metadata.version) ||
    !Array.isArray(sources) ||
    sources.length < expected.length ||
    (selector && sources.length !== expected.length) ||
    !sources.every((source) => source && typeof source.getToken === 'function') ||
    !expected.every((name, index) => matches(sources[index], name as keyof typeof classes)) ||
    sources
      .slice(expected.length)
      .some((source) =>
        Object.keys(classes).some((name) => matches(source, name as keyof typeof classes)),
      )
  ) {
    throw unsupported();
  }
  return { sources: sources as TokenCredential[], expected };
}

/** Skip a scoped environment mode whose constructor failed, preserving the SDK tail. */
export async function createAzureEnvironmentFallback(
  identity: typeof import('@azure/identity'),
  native: TokenCredential,
  selector: string | undefined,
): Promise<TokenCredential> {
  const { sources } = await getNativeSources(identity, native, selector);
  // The host environment cannot replace the selected but unavailable principal.
  return new identity.ChainedTokenCredential({ getToken: async () => null }, ...sources.slice(1));
}

/**
 * Keep the SDK's developer/Broker tail while binding both workload attempts to
 * the invocation. Azure Identity 4 has no public per-instance chain exclusions.
 * This is a read-only, guarded dependency on its private source-list layout.
 */
export async function createScopedAzureWorkloadCredential(
  identity: typeof import('@azure/identity'),
  native: TokenCredential,
  options: WorkloadIdentityCredentialOptions,
  selector: string | undefined,
): Promise<TokenCredential> {
  const { sources, expected } = await getNativeSources(identity, native, selector);
  const selected: TokenCredential[] = [];
  for (const [index, name] of expected.entries()) {
    if (name === 'WorkloadIdentityCredential') {
      try {
        selected.push(new identity.WorkloadIdentityCredential(options));
      } catch {
        // DAC skips unavailable constructors; the remaining SDK sources still
        // get their turn, including the separate managed token-exchange attempt.
        selected.push({ getToken: async () => null });
      }
    } else if (name === 'ManagedIdentityCredential') {
      if (!(sources[index] instanceof identity.ManagedIdentityCredential)) {
        selected.push(sources[index]);
        continue;
      }
      selected.push({
        async getToken(scopes) {
          try {
            // With a complete workload tuple, SDK ManagedIdentityCredential
            // retries workload exchange rather than IMDS. Its fresh credential
            // bypasses instance discovery and does not forward getToken options.
            const credential = new identity.WorkloadIdentityCredential({
              ...options,
              disableInstanceDiscovery: true,
            });
            const token = await credential.getToken(scopes, {});
            if (token === null) {
              throw new identity.CredentialUnavailableError(
                'Workload token exchange returned null.',
              );
            }
            return token;
          } catch (error) {
            if (error instanceof Error && error.name === 'AuthenticationRequiredError') {
              throw error;
            }
            throw new identity.CredentialUnavailableError(
              'Scoped workload token exchange failed.',
              {
                cause: error,
              },
            );
          }
        },
      });
    }
  }
  // Never mutate the SDK's chain or recreate developer/plugin credentials.
  return new identity.ChainedTokenCredential(...selected, ...sources.slice(expected.length));
}
