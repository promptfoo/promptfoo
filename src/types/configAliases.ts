export const CONFIG_PROVIDER_INPUT_KEYS = ['providers', 'targets'] as const;

export const CONFIG_PROVIDER_INPUT_ERROR =
  "Exactly one of 'targets' or 'providers' must be provided, but not both";

export function hasValidConfigProviders(
  data: { providers?: unknown; targets?: unknown },
  allowMissing = false,
) {
  const count = CONFIG_PROVIDER_INPUT_KEYS.filter((key) => data[key] !== undefined).length;
  return allowMissing ? count <= 1 : count === 1;
}

export function normalizeConfigProviderAlias<T extends { providers?: unknown; targets?: unknown }>(
  config: T,
): T {
  if (!config.targets || config.providers) {
    return config;
  }
  const { targets, ...rest } = config;
  return { ...rest, providers: targets } as T;
}
