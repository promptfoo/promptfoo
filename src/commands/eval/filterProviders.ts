import type { ApiProvider, TestSuiteConfig } from '../../types/index';
import type { ProviderOptions, ProviderOptionsMap } from '../../types/providers';

/**
 * Checks if a value is a valid provider ID (non-empty string).
 */
function isValidProviderId(id: unknown): id is string {
  return id !== null && id !== undefined && typeof id === 'string' && id !== '';
}

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

  // Check if it's a ProviderOptions object (has 'id' field that is a non-empty string)
  const providerId = (provider as ProviderOptions).id;
  if ('id' in provider && isValidProviderId(providerId)) {
    const opts = provider as ProviderOptions;
    return {
      id: providerId,
      label: opts.label,
    };
  }

  // It's a ProviderOptionsMap: { "provider-id": { label: "..." } }
  const keys = Object.keys(provider);
  if (keys.length > 0) {
    const id = keys[0];
    const value = (provider as ProviderOptionsMap)[id];

    // Check if the value is an object (indicating ProviderOptionsMap format)
    if (typeof value === 'object' && value !== null) {
      return {
        id: value.id || id,
        label: value.label,
      };
    }
  }

  // Fallback for malformed provider configs
  // Use label as id if it's a valid string, otherwise generate a descriptive unknown id
  const label = (provider as Partial<ProviderOptions>).label;
  if (isValidProviderId(label)) {
    return {
      id: label,
      label,
    };
  }

  return {
    id: `unknown-${index}`,
    label,
  };
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
