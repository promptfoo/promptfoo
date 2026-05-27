import { isApiProvider } from '../types/providers';

import type { ApiProvider, ProviderTypeMap } from '../types/providers';

export const GRADING_PROVIDER_TYPE_KEYS = [
  'text',
  'embedding',
  'classification',
  'moderation',
] as const;

function isTypedProviderValue(value: unknown): boolean {
  if (typeof value === 'string' || isApiProvider(value)) {
    return true;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0;
}

export function isProviderTypeMap(provider: unknown): provider is ProviderTypeMap {
  return Boolean(
    provider &&
      typeof provider === 'object' &&
      !Array.isArray(provider) &&
      !isApiProvider(provider) &&
      !Object.hasOwn(provider, 'id') &&
      GRADING_PROVIDER_TYPE_KEYS.some(
        (providerType) =>
          Object.hasOwn(provider, providerType) &&
          isTypedProviderValue((provider as Record<string, unknown>)[providerType]),
      ),
  );
}

// Build a lookup of configured providers by both id() and label, with a
// null prototype so '__proto__'/'constructor' keys cannot pollute lookups.
// IDs are added first; labels only fill keys an ID has not already claimed,
// so a label collision can never silently shadow another provider's ID.
export function buildConfiguredProviderMap(providers: ApiProvider[]): Record<string, ApiProvider> {
  const providerMap: Record<string, ApiProvider> = Object.create(null);
  for (const provider of providers) {
    providerMap[provider.id()] = provider;
  }
  for (const provider of providers) {
    if (provider.label && !Object.hasOwn(providerMap, provider.label)) {
      providerMap[provider.label] = provider;
    }
  }
  return providerMap;
}

export function resolveConfiguredProviderReference<T>(
  provider: T,
  providerMap: Record<string, ApiProvider>,
): T | ApiProvider {
  if (typeof provider === 'string') {
    return Object.hasOwn(providerMap, provider) ? providerMap[provider] : provider;
  }
  if (
    !provider ||
    typeof provider !== 'object' ||
    Array.isArray(provider) ||
    isApiProvider(provider) ||
    Object.hasOwn(provider, 'id')
  ) {
    return provider;
  }

  let resolvedTypeMap: ProviderTypeMap | undefined;
  for (const providerType of GRADING_PROVIDER_TYPE_KEYS) {
    const nestedProvider = (provider as ProviderTypeMap)[providerType];
    if (!nestedProvider) {
      continue;
    }

    const resolvedProvider = resolveConfiguredProviderReference(nestedProvider, providerMap);
    if (resolvedProvider !== nestedProvider) {
      resolvedTypeMap ??= { ...(provider as ProviderTypeMap) };
      resolvedTypeMap[providerType] = resolvedProvider;
    }
  }

  return (resolvedTypeMap ?? provider) as T | ApiProvider;
}
