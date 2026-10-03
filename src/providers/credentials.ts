import { type EnvVarKey, getEnvString, getProviderEnvString } from '../envars';

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
  for (const envar of envars) {
    const value = env?.[envar];
    if (value) {
      return value;
    }
  }
  for (const envar of envars) {
    if (env?.[envar] === '') {
      continue;
    }
    const value = getEnvString(envar as EnvVarKey);
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function resolveConfiguredApiKey(provider: {
  config: CredentialOptions;
  env?: Readonly<Record<string, string | undefined>>;
}): string | undefined {
  if (provider.config.apiKey !== undefined) {
    return provider.config.apiKey;
  }
  const apiKeyEnvar = provider.config.apiKeyEnvar as EnvVarKey | undefined;
  return apiKeyEnvar
    ? (getProviderEnvString(provider.env, apiKeyEnvar) ?? getEnvString(apiKeyEnvar))
    : undefined;
}
