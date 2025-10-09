import type { ApiProvider, ProviderOptions } from '../types/providers';

/**
 * Check if a provider is an HTTP provider
 */
export function isHttpProvider(provider: ApiProvider | ProviderOptions): boolean {
  // Check if the provider has the HttpProvider class name or url property
  const providerId = typeof provider.id === 'function' ? provider.id() : provider.id || '';
  return providerId.startsWith('http:') || providerId.startsWith('https:');
}

/**
 * Patch HTTP provider config for validation.
 * We need to set maxRetries to 1 and add a silent header to avoid excessive logging of the request and response.
 */
export function patchHttpConfigForValidation(providerOptions: any): any {
  return {
    ...providerOptions,
    config: {
      ...providerOptions.config,
      maxRetries: 1,
      headers: {
        ...providerOptions.config?.headers,
        'x-promptfoo-silent': 'true',
      },
    },
  };
}
