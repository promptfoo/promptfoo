import { type EnvVarKey, getEnvOverrides, getEnvString } from '../envars';

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
  const masked = new Set<string>();
  for (const layer of [
    env,
    getEnvOverrides(),
    getEnvOverrides('file'),
    Object.fromEntries(envars.map((key) => [key, getEnvString(key as EnvVarKey)])),
  ]) {
    for (const envar of envars) {
      const value = layer?.[envar];
      if (masked.has(envar) || value === undefined) {
        continue;
      }
      masked.add(envar);
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}
