import { type ApiProvider, isApiProvider, type ProviderTypeMap } from '../types/providers';

import type { Assertion, AssertionOrSet, TestCase } from '../types/index';

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
      !Object.prototype.hasOwnProperty.call(provider, 'id') &&
      GRADING_PROVIDER_TYPE_KEYS.some(
        (providerType) =>
          Object.prototype.hasOwnProperty.call(provider, providerType) &&
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
    if (provider.label && !Object.prototype.hasOwnProperty.call(providerMap, provider.label)) {
      providerMap[provider.label] = provider;
    }
  }
  return providerMap;
}

function getConfiguredProvider(
  id: string,
  providerMap: Record<string, ApiProvider>,
): ApiProvider | undefined {
  return Object.prototype.hasOwnProperty.call(providerMap, id) ? providerMap[id] : undefined;
}

function resolveTypedProviderValue(
  provider: ProviderTypeValue,
  providerMap: Record<string, ApiProvider>,
): ProviderTypeValue {
  if (typeof provider === 'string') {
    return getConfiguredProvider(provider, providerMap) ?? provider;
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

  return provider;
}

// Unconfigured typed entries stay lazy and inherit the evaluation scope when loaded.
export function resolveConfiguredProviderReference<T>(
  provider: T,
  providerMap: Record<string, ApiProvider>,
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

    const resolvedProvider = resolveTypedProviderValue(nestedProvider, providerMap);
    if (resolvedProvider !== nestedProvider) {
      resolvedTypeMap ??= { ...provider };
      resolvedTypeMap[providerType] = resolvedProvider;
    }
  }

  return (resolvedTypeMap ?? provider) as T | ApiProvider;
}

/** Resolve labels and typed graders without replacing unchanged test or assertion objects. */
export function resolveRuntimeGradingProviderReferences(
  testCase: Pick<TestCase, 'options' | 'assert'>,
  providerMap: Record<string, ApiProvider>,
  used?: Set<ApiProvider>,
): void {
  function resolve<T>(value: T) {
    const result = resolveConfiguredProviderReference(value, providerMap);
    if (used) {
      const providers = isProviderTypeMap(result)
        ? GRADING_PROVIDER_TYPE_KEYS.map((type) => result[type])
        : [result];
      for (const provider of providers) {
        if (isApiProvider(provider)) {
          used.add(provider);
        }
      }
    }
    return result;
  }

  function resolveAssertion(assertion: AssertionOrSet): AssertionOrSet {
    if (assertion.type === 'assert-set') {
      const children = assertion.assert.map((child) => resolveAssertion(child) as Assertion);
      return children.every((child, index) => child === assertion.assert[index])
        ? assertion
        : { ...assertion, assert: children };
    }
    const provider = resolve(assertion.provider);
    return provider === assertion.provider ? assertion : { ...assertion, provider };
  }

  if (testCase.options?.provider) {
    const provider = resolve(testCase.options.provider);
    if (provider !== testCase.options.provider) {
      testCase.options = { ...testCase.options, provider };
    }
  }
  if (testCase.assert) {
    const assertions = testCase.assert.map(resolveAssertion);
    if (assertions.some((assertion, index) => assertion !== testCase.assert?.[index])) {
      testCase.assert = assertions;
    }
  }
}
