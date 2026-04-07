export function getProviderType(providerId?: string): string | undefined {
  if (!providerId) {
    return undefined;
  }

  if (providerId.startsWith('file://')) {
    if (/\.(js|ts)(?::[^/\\]+)?$/i.test(providerId)) {
      return 'javascript';
    }
    if (/\.py(?::[^/\\]+)?$/i.test(providerId)) {
      return 'python';
    }
    if (/\.go(?::[^/\\]+)?$/i.test(providerId)) {
      return 'go';
    }
    if (/\.(sh|bat|cmd|ps1)(?::[^/\\]+)?$/i.test(providerId)) {
      return 'shell';
    }
    return 'file';
  }

  // Handle provider formats like 'openrouter:openai/gpt-4o' or 'azure:chat:'
  if (providerId.includes(':')) {
    return providerId.split(':')[0];
  }

  // Direct provider types
  return providerId;
}
