/**
 * Helper function to get provider path from ApiProvider
 */
export function getProviderPath(provider: { id: unknown }): string | null {
  // Try to get the provider ID/path - this might vary depending on how providers store their identifier
  if (typeof provider.id === 'function') {
    return provider.id();
  }
  if (typeof provider.id === 'string') {
    return provider.id;
  }
  return null;
}
