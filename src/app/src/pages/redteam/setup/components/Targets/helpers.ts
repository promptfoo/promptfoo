export function getProviderType(providerId?: string): string | undefined {
  if (!providerId) return undefined;
  
  // Handle provider formats like 'openrouter:openai/gpt-4o' or 'azure:chat:'
  if (providerId.includes(':')) {
    return providerId.split(':')[0];
  }
  
  // Handle file paths
  if (providerId.startsWith('file://')) {
    if (providerId.endsWith('.js') || providerId.endsWith('.ts')) {
      return 'javascript';
    }
    if (providerId.endsWith('.py')) {
      return 'python';
    }
  }
  
  // Direct provider types
  return providerId;
}