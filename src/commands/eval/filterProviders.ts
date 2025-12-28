import type { ApiProvider, TestSuiteConfig } from '../../types/index';
import type { ProviderOptions, ProviderOptionsMap } from '../../types/providers';

/**
 * Extracts the id and label from a raw provider config without instantiating it.
 * Handles all provider config formats: string, function, ProviderOptions, ProviderOptionsMap.
 */
function getProviderIdAndLabel(
  provider: string | ProviderOptions | ProviderOptionsMap | ((...args: unknown[]) => unknown),
  index: number,
): { id: string; label?: string } {
  if (typeof provider === 'string') {
    return { id: provider };
  }

  if (typeof provider === 'function') {
    const label = (provider as { label?: string }).label;
    return {
      id: label ?? `custom-function-${index}`,
      label,
    };
  }

  // Check if it's a ProviderOptions object (has 'id' field)
  if ('id' in provider && typeof (provider as ProviderOptions).id === 'string') {
    const opts = provider as ProviderOptions;
    return {
      id: opts.id!,
      label: opts.label,
    };
  }

  // It's a ProviderOptionsMap: { "provider-id": { label: "..." } }
  const keys = Object.keys(provider);
  if (keys.length > 0) {
    const id = keys[0];
    const opts = (provider as ProviderOptionsMap)[id];
    return {
      id: opts.id || id,
      label: opts.label,
    };
  }

  return { id: `unknown-${index}` };
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
