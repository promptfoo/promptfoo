import type { ApiProvider, ProviderOptions } from '../types/providers';

/**
 * Check if a provider is an HTTP provider
 */
export function isHttpProvider(provider: ApiProvider | ProviderOptions): boolean {
  // Check if the provider has an HTTP-based id or url property
  const providerId = typeof provider.id === 'function' ? provider.id() : provider.id || '';

  // Check if id is a full HTTP URL or just the protocol name
  if (
    providerId.startsWith('http:') ||
    providerId.startsWith('https:') ||
    providerId === 'http' ||
    providerId === 'https'
  ) {
    return true;
  }

  // Also check if config.url is an HTTP URL (cloud providers may have the URL in config)
  const configUrl = (provider as ProviderOptions).config?.url;
  if (typeof configUrl === 'string') {
    return configUrl.startsWith('http:') || configUrl.startsWith('https:');
  }

  return false;
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
