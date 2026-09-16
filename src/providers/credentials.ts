import { getEnvString } from '../envars';

import type { EnvVarKey } from '../envars';

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
    const value = getEnvString(envar as EnvVarKey);
    if (value) {
      return value;
    }
  }
  return undefined;
}
