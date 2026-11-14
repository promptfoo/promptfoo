import { type EnvVarKey, getEnvString, getProviderEnvString } from '../envars';
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
  ambientEnvars: readonly string[] = defaultEnvars,
): string | undefined {
  if (config?.apiKey) {
    return config.apiKey;
  }
  const envars = config?.apiKeyEnvar ? [config.apiKeyEnvar] : defaultEnvars;
  return resolveProviderEnv(env, envars, config?.apiKeyEnvar ? envars : ambientEnvars)?.value;
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
