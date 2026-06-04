import { isApiProvider } from '../../types/providers';

import type { UnifiedConfig } from '../../types/index';
import type {
  ApiProvider,
  ProviderFunction,
  ProviderOptions,
  ProvidersConfig,
} from '../../types/providers';

type ProviderFunctionWithMetadata = ProviderFunction &
  Pick<ApiProvider, 'label' | 'transform' | 'delay' | 'inputs' | 'config'>;

const PERSISTED_PROVIDER_KEYS = ['label', 'transform', 'delay', 'inputs', 'config'] as const;

const LEGACY_PROVIDER_SUMMARY_KEYS = new Set<string>([
  'label',
  'transform',
  'delay',
  'inputs',
  'config',
]);

function getProviderMetadata(
  provider: Partial<ProviderFunctionWithMetadata>,
): Partial<ProviderOptions> {
  const metadata: Partial<ProviderOptions> = {};
  for (const key of PERSISTED_PROVIDER_KEYS) {
    const value = provider[key];
    if (value !== undefined) {
      (metadata as Record<string, unknown>)[key] = value;
    }
  }
  return metadata;
}

function normalizeProviderForPersistence(provider: unknown): unknown {
  if (isApiProvider(provider)) {
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

function normalizeProvidersForPersistence(
  providers: ProvidersConfig | undefined,
): ProvidersConfig | undefined {
  if (!Array.isArray(providers)) {
    return normalizeProviderForPersistence(providers) as ProvidersConfig | undefined;
  }
  return providers.map(normalizeProviderForPersistence) as ProvidersConfig;
}

/**
 * Store eval configs in a replayable shape. Instantiated ApiProvider objects have
 * function-valued `id` and `callApi` fields that JSON persistence drops, leaving
 * only display metadata such as `{ label, delay }`.
 */
export function normalizeConfigForPersistence<T extends Partial<UnifiedConfig>>(config: T): T {
  if (!('providers' in config)) {
    return config;
  }

  return {
    ...config,
    providers: normalizeProvidersForPersistence(config.providers),
  };
}

function buildResultProviderLookup(resultProviders: ProviderOptions[] = []) {
  const lookup = new Map<string, ProviderOptions>();
  for (const resultProvider of resultProviders) {
    if (typeof resultProvider.id === 'string' && resultProvider.id.length > 0) {
      lookup.set(resultProvider.id, resultProvider);
      if (typeof resultProvider.label === 'string' && resultProvider.label.length > 0) {
        lookup.set(resultProvider.label, resultProvider);
      }
    }
  }
  return lookup;
}

function normalizeLegacyProviderSummary(
  provider: unknown,
  resultProviderLookup: Map<string, ProviderOptions>,
): unknown {
  if (
    typeof provider !== 'object' ||
    provider === null ||
    Array.isArray(provider) ||
    'id' in provider
  ) {
    return provider;
  }

  const providerObject = provider as { label?: unknown };
  const keys = Object.keys(providerObject);
  if (
    typeof providerObject.label === 'string' &&
    providerObject.label.length > 0 &&
    keys.length > 0 &&
    keys.every((key) => LEGACY_PROVIDER_SUMMARY_KEYS.has(key))
  ) {
    const resultProvider = resultProviderLookup.get(providerObject.label);
    return {
      ...resultProvider,
      ...providerObject,
      id: resultProvider?.id ?? providerObject.label,
    };
  }

  return provider;
}

function normalizeLegacyProviders(
  providers: ProvidersConfig | undefined,
  resultProviderLookup: Map<string, ProviderOptions>,
): ProvidersConfig | undefined {
  if (!Array.isArray(providers)) {
    return normalizeLegacyProviderSummary(providers, resultProviderLookup) as
      | ProvidersConfig
      | undefined;
  }
  return providers.map((provider) =>
    normalizeLegacyProviderSummary(provider, resultProviderLookup),
  ) as ProvidersConfig;
}

/**
 * Compatibility shim for eval rows saved before provider configs were normalized.
 * It is intentionally scoped to persisted eval replay; fresh config validation
 * should still reject label-only providers.
 */
export function normalizePersistedConfigForResume<T extends Partial<UnifiedConfig>>(
  config: T,
  resultProviders?: ProviderOptions[],
): T {
  if (!('providers' in config)) {
    return config;
  }

  return {
    ...config,
    providers: normalizeLegacyProviders(
      config.providers,
      buildResultProviderLookup(resultProviders),
    ),
  };
}
