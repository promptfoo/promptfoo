import { isApiProvider } from '../types/providers';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderTypeMap } from '../types/providers';

type ProviderTypeValue = NonNullable<ProviderTypeMap[keyof ProviderTypeMap]>;

export const GRADING_PROVIDER_TYPE_KEYS = [
  'text',
  'embedding',
  'classification',
  'moderation',
] as const;

function isTypedProviderValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (isApiProvider(value)) {
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

function getConfiguredProvider(
  id: string,
  providerMap: Record<string, ApiProvider>,
): ApiProvider | undefined {
  return Object.hasOwn(providerMap, id) ? providerMap[id] : undefined;
}

function resolveTypedProviderValue(
  provider: ProviderTypeValue,
  providerMap: Record<string, ApiProvider>,
  env: EnvOverrides | undefined,
): ProviderTypeValue {
  if (typeof provider === 'string') {
    return getConfiguredProvider(provider, providerMap) ?? (env ? { id: provider, env } : provider);
  }
  if (isApiProvider(provider)) {
    return provider;
  }

  // An id-only typed entry is a reference; entries with options stay inline.
  const configuredProvider =
    Object.keys(provider).length === 1 && typeof provider.id === 'string'
      ? getConfiguredProvider(provider.id, providerMap)
      : undefined;
  if (configuredProvider) {
    return configuredProvider;
  }

  return env ? { ...provider, env: { ...env, ...provider.env } } : provider;
}

// Resolve configured grader references while carrying suite env into typed
// provider values that must stay lazy until their assertion type is selected.
export function resolveConfiguredProviderReference<T>(
  provider: T,
  providerMap: Record<string, ApiProvider>,
  env?: EnvOverrides,
): T | ApiProvider {
  if (typeof provider === 'string') {
    return getConfiguredProvider(provider, providerMap) ?? provider;
  }
  if (!isProviderTypeMap(provider)) {
    return provider;
  }

  let resolvedTypeMap: ProviderTypeMap | undefined;
  for (const providerType of GRADING_PROVIDER_TYPE_KEYS) {
    const nestedProvider = provider[providerType];
    if (!nestedProvider) {
      continue;
    }

    const resolvedProvider = resolveTypedProviderValue(nestedProvider, providerMap, env);
    if (resolvedProvider !== nestedProvider) {
      resolvedTypeMap ??= { ...provider };
      resolvedTypeMap[providerType] = resolvedProvider;
    }
  }

  return (resolvedTypeMap ?? provider) as T | ApiProvider;
}
