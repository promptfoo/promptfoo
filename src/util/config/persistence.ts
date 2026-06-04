import { isDeepStrictEqual } from 'node:util';

interface ProviderMetadata {
  label?: string;
  transform?: unknown;
  delay?: number;
  inputs?: unknown;
  config?: unknown;
}

interface ReplayableProvider extends ProviderMetadata {
  id?: string;
}

interface ApiProviderLike extends ProviderMetadata {
  id: () => string;
  callApi: (...args: unknown[]) => unknown;
}

type ProviderFunctionWithMetadata = ((...args: unknown[]) => unknown) & ProviderMetadata;
type ConfigWithProviders = { providers?: unknown };

const PERSISTED_PROVIDER_KEYS = ['label', 'transform', 'delay', 'inputs', 'config'] as const;

const LEGACY_PROVIDER_SUMMARY_KEYS = new Set<string>([
  'label',
  'transform',
  'delay',
  'inputs',
  'config',
]);

function getProviderMetadata(provider: Partial<ProviderMetadata>): ProviderMetadata {
  const metadata: ProviderMetadata = {};
  for (const key of PERSISTED_PROVIDER_KEYS) {
    const value = provider[key];
    if (value !== undefined) {
      (metadata as Record<string, unknown>)[key] = value;
    }
  }
  return metadata;
}

function isApiProviderLike(provider: unknown): provider is ApiProviderLike {
  if (typeof provider !== 'object' || provider === null) {
    return false;
  }

  const candidate = provider as Record<string, unknown>;
  return typeof candidate.id === 'function' && typeof candidate.callApi === 'function';
}

function normalizeProviderForPersistence(provider: unknown): unknown {
  if (isApiProviderLike(provider)) {
    return {
      id: provider.id(),
      ...getProviderMetadata(provider),
    };
  }

  if (typeof provider === 'function') {
    const providerFn = provider as ProviderFunctionWithMetadata;
    if (typeof providerFn.label === 'string' && providerFn.label.length > 0) {
      return {
        id: providerFn.label,
        ...getProviderMetadata(providerFn),
      };
    }
  }

  return provider;
}

function normalizeProvidersForPersistence(providers: unknown): unknown {
  if (!Array.isArray(providers)) {
    return normalizeProviderForPersistence(providers);
  }
  return providers.map(normalizeProviderForPersistence);
}

/**
 * Store eval configs in a replayable shape. Instantiated ApiProvider objects have
 * function-valued `id` and `callApi` fields that JSON persistence drops, leaving
 * only display metadata such as `{ label, delay }`.
 */
export function normalizeConfigForPersistence<T extends object>(config: T): T {
  if (!('providers' in config)) {
    return config;
  }

  return {
    ...config,
    providers: normalizeProvidersForPersistence((config as ConfigWithProviders).providers),
  } as T;
}

type ResultProviderLookup = Map<string, ReplayableProvider[]>;

function addResultProvider(
  lookup: ResultProviderLookup,
  key: string,
  resultProvider: ReplayableProvider,
) {
  const providers = lookup.get(key) ?? [];
  if (!providers.some((provider) => provider.id === resultProvider.id)) {
    providers.push(resultProvider);
    lookup.set(key, providers);
  }
}

function buildResultProviderLookup(resultProviders: ReplayableProvider[] = []) {
  const lookup: ResultProviderLookup = new Map();
  for (const resultProvider of resultProviders) {
    if (typeof resultProvider.id === 'string' && resultProvider.id.length > 0) {
      addResultProvider(lookup, resultProvider.id, resultProvider);
      if (typeof resultProvider.label === 'string' && resultProvider.label.length > 0) {
        addResultProvider(lookup, resultProvider.label, resultProvider);
      }
    }
  }
  return lookup;
}

function isLegacyProviderSummary(
  provider: unknown,
): provider is { label: string; config?: unknown } {
  if (
    typeof provider !== 'object' ||
    provider === null ||
    Array.isArray(provider) ||
    'id' in provider
  ) {
    return false;
  }

  const providerObject = provider as { label?: unknown };
  const keys = Object.keys(providerObject);
  return (
    typeof providerObject.label === 'string' &&
    providerObject.label.length > 0 &&
    keys.length > 0 &&
    keys.every((key) => LEGACY_PROVIDER_SUMMARY_KEYS.has(key))
  );
}

function normalizeLegacyProviderSummary(
  provider: unknown,
  resultProviderLookup: ResultProviderLookup,
): unknown {
  if (!isLegacyProviderSummary(provider)) {
    return provider;
  }

  const candidates = resultProviderLookup.get(provider.label) ?? [];
  const configMatches = candidates.filter((candidate) =>
    isDeepStrictEqual(candidate.config, provider.config),
  );
  const resultProvider =
    candidates.length === 1
      ? candidates[0]
      : configMatches.length === 1
        ? configMatches[0]
        : undefined;
  return {
    ...resultProvider,
    ...provider,
    id: resultProvider?.id ?? provider.label,
  };
}

function normalizeLegacyProviders(
  providers: unknown,
  resultProviderLookup: ResultProviderLookup,
): unknown {
  if (!Array.isArray(providers)) {
    return normalizeLegacyProviderSummary(providers, resultProviderLookup);
  }
  return providers.map((provider) =>
    normalizeLegacyProviderSummary(provider, resultProviderLookup),
  );
}

/**
 * Compatibility shim for eval rows saved before provider configs were normalized.
 * It is intentionally scoped to persisted eval replay; fresh config validation
 * should still reject label-only providers.
 */
export async function normalizePersistedConfigForResume<T extends object>(
  config: T,
  loadResultProviders?: () => Promise<ReplayableProvider[]>,
): Promise<T> {
  if (!('providers' in config)) {
    return config;
  }

  const configWithProviders = config as ConfigWithProviders;
  const providers = Array.isArray(configWithProviders.providers)
    ? configWithProviders.providers
    : [configWithProviders.providers];
  if (!providers.some(isLegacyProviderSummary)) {
    return config;
  }

  const resultProviders = loadResultProviders ? await loadResultProviders() : [];
  return {
    ...config,
    providers: normalizeLegacyProviders(
      configWithProviders.providers,
      buildResultProviderLookup(resultProviders),
    ),
  } as T;
}
