import { isApiProvider } from '../../types/providers';
import { normalizeProviderRef, type ProviderRefDescriptor } from '../../util/providerRef';

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

type RenderIdentity = (ref: ProviderRefDescriptor) => { id: string; label?: string };

/**
 * Extracts the id and label from a raw provider config without instantiating it.
 * Handles all provider config formats: string, function, ProviderOptions, ProviderOptionsMap.
 */
export function getProviderIdAndLabel(
  provider:
    | string
    | ApiProvider
    | ProviderOptions
    | ProviderOptionsMap
    | ((...args: unknown[]) => unknown),
  index?: number,
  renderIdentity?: RenderIdentity,
): { id: string; label?: string } {
  if (isApiProvider(provider)) {
    return { id: provider.id(), label: provider.label };
  }
  const ref = normalizeProviderRef(provider, { index });
  return renderIdentity ? renderIdentity(ref) : ref;
}

/**
 * Filters raw provider configs BEFORE instantiation.
 * This prevents providers from being loaded if they don't match the filter,
 * which is important when providers validate env vars or other resources on construction.
 */
export function filterProviderConfigs(
  providers: TestSuiteConfig['providers'],
  filterOption?: string,
  renderIdentity?: RenderIdentity,
): TestSuiteConfig['providers'] {
  if (!filterOption) {
    return providers;
  }
  const regex = new RegExp(filterOption);
  function matches({ id, label }: { id: string; label?: string }): boolean {
    return regex.test(id) || (label !== undefined && regex.test(label));
  }

  if (Array.isArray(providers)) {
    return providers.filter((provider, index) =>
      matches(getProviderIdAndLabel(provider, index, renderIdentity)),
    );
  }
  if (
    typeof providers === 'string' ||
    typeof providers === 'function' ||
    isApiProvider(providers)
  ) {
    return matches(getProviderIdAndLabel(providers, undefined, renderIdentity)) ? providers : [];
  }
  return providers;
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
