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

  // Handle provider formats like 'openrouter:openai/gpt-5.4' or 'azure:chat:'
  const providerType = providerId.includes(':') ? providerId.split(':')[0] : providerId;
  if (providerType === 'https') {
    return 'http';
  }
  if (providerType === 'ws' || providerType === 'wss') {
    return 'websocket';
  }

  return providerType;
}
