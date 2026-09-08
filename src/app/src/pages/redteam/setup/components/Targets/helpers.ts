export function getProviderType(providerId?: string): string | undefined {
  if (!providerId) {
    return undefined;
  }

  if (providerId === 'openai:codex-security' || providerId.startsWith('openai:codex-security:')) {
    return 'codex-security';
  }

  if (providerId.startsWith('bedrock:agents:')) {
    return 'bedrock-agent';
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

  // Runtime provider prefixes can differ from the target selector's UI types.
  if (providerType === 'togetherai') {
    return 'together';
  }
  if (providerType === 'llama') {
    return 'llama.cpp';
  }

  return providerType;
}
