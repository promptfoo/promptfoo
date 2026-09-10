import { normalizeProviderRef } from '../../util/providerRef';

import type { ApiProvider, CommandLineOptions, TestSuiteConfig } from '../../types/index';
import type { ProviderOptions, ProviderOptionsMap } from '../../types/providers';

/**
 * Converts an untrusted persisted provider filter into the CLI option shape used by config
 * resolution. Older evaluations legitimately omit this value, so undefined/null mean "no
 * filter". Anything else that is not a non-empty string can only come from tampered or
 * corrupted persisted data (the writer never produces it); fail closed rather than silently
 * running the eval unfiltered.
 */
export function getPersistedProviderFilterOptions(
  providerFilter: unknown,
): Partial<Pick<CommandLineOptions, 'filterProviders'>> {
  if (providerFilter === undefined || providerFilter === null) {
    return {};
  }
  if (typeof providerFilter === 'string' && providerFilter.length > 0) {
    return { filterProviders: providerFilter };
  }
  throw new Error(
    `Stored provider filter is invalid (expected a non-empty string, got ${JSON.stringify(providerFilter)}). Refusing to run without the original provider selection.`,
  );
}

/**
 * Returns the reason a provider filter cannot be compiled as a regular expression, or
 * undefined when it is valid. Lets replay paths attribute regex failures to the stored
 * filter without blaming it for unrelated config resolution errors.
 */
export function getProviderFilterRegexError(filter: string): string | undefined {
  try {
    new RegExp(filter);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Extracts the id and label from a raw provider config without instantiating it.
 * Handles all provider config formats: string, function, ProviderOptions, ProviderOptionsMap.
 */
export function getProviderIdAndLabel(
  provider: string | ProviderOptions | ProviderOptionsMap | ((...args: unknown[]) => unknown),
  index: number,
): { id: string; label?: string } {
  return normalizeProviderRef(provider, { index });
}

/**
 * Filters raw provider configs BEFORE instantiation.
 * This prevents providers from being loaded if they don't match the filter,
 * which is important when providers validate env vars or other resources on construction.
 */
export function filterProviderConfigs(
  providers: TestSuiteConfig['providers'],
  filterOption?: string,
): TestSuiteConfig['providers'] {
  if (!filterOption) {
    return providers;
  }

  // Handle non-array cases
  if (typeof providers === 'string') {
    const filterRegex = new RegExp(filterOption);
    return filterRegex.test(providers) ? providers : [];
  }

  if (typeof providers === 'function') {
    const filterRegex = new RegExp(filterOption);
    const label = (providers as { label?: string }).label;
    const id = label ?? 'custom-function';
    if (filterRegex.test(id) || (label && filterRegex.test(label))) {
      return providers;
    }
    return [];
  }

  if (!Array.isArray(providers)) {
    return providers;
  }

  const filterRegex = new RegExp(filterOption);

  return providers.filter((provider, index) => {
    const { id, label } = getProviderIdAndLabel(provider, index);
    return filterRegex.test(id) || (label && filterRegex.test(label));
  });
}

/**
 * Filters instantiated providers by id or label.
 * This is kept for backwards compatibility and as a safety net.
 */
export function filterProviders(
  providers: ApiProvider[],
  filterProvidersOption?: string,
): ApiProvider[] {
  if (!filterProvidersOption) {
    return providers;
  }

  const filterRegex = new RegExp(filterProvidersOption);

  return providers.filter((provider) => {
    const providerId = provider.id();
    const providerLabel = provider.label;

    return filterRegex.test(providerId) || (providerLabel && filterRegex.test(providerLabel));
  });
}
