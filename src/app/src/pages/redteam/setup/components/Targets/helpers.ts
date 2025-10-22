export function getProviderType(providerId?: string): string | undefined {
  if (!providerId) {
    return undefined;
  }

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
    if (providerId.endsWith('.go')) {
      return 'go';
    }
    if (
      providerId.endsWith('.sh') ||
      providerId.endsWith('.bat') ||
      providerId.endsWith('.cmd') ||
      providerId.endsWith('.ps1')
    ) {
      return 'shell';
    }
  }

  // Direct provider types
  return providerId;
}

/**
 * Creates a default name for a (legacy) text-only inline custom policy.
 */
export function makeDefaultPolicyName(index: number): string {
  return `Custom Policy ${index + 1}`;
}
