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
  ambientEnvars: readonly string[] = defaultEnvars,
): string | undefined {
  if (config?.apiKey) {
    return config.apiKey;
  }
  const envars = config?.apiKeyEnvar ? [config.apiKeyEnvar] : defaultEnvars;
  const masked = new Set<string>();
  const ambient = Object.fromEntries(envars.map((key) => [key, getEnvString(key as EnvVarKey)]));
  for (const layer of [env, getEnvOverrides(), getEnvOverrides('file'), ambient]) {
    // Preserve providers whose legacy shell aliases use a different preference order.
    const aliases = layer === ambient && !config?.apiKeyEnvar ? ambientEnvars : envars;
    for (const envar of aliases) {
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
