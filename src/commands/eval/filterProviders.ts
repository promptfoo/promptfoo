import type { ApiProvider } from '../../types';

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
