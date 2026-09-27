import { resolveProviderEnv } from './env';

interface CredentialOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
}

/** A named credential selects its own namespace, rather than falling back to another vendor. */
export function resolveProviderApiKey(
  config: CredentialOptions | undefined,
  env: Readonly<Record<string, string | undefined>> | undefined,
  defaultEnvars: readonly string[],
): string | undefined {
  if (config?.apiKey) {
    return config.apiKey;
  }
  const envars = config?.apiKeyEnvar ? [config.apiKeyEnvar] : defaultEnvars;
  return resolveProviderEnv(env, envars)?.value;
}
