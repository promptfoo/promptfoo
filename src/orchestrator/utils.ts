import type { ApiProvider } from '../types/providers';

export function getProviderKey(provider: ApiProvider): string {
  if (typeof provider.getRateLimitKey === 'function') {
    return provider.getRateLimitKey();
  }
  // Use label if available as it's the most specific user-defined identifier
  if (provider.label) {
    return `${provider.id()}:${provider.label}`;
  }
  return provider.id();
}
