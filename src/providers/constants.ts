const NON_BASE_MODEL_PROVIDERS = ['http', 'ws', 'mcp', 'https', 'webhook', 'file', 'exec'];

export const isNotABaseModelProvider = (providerId: string) => {
  for (const provider of NON_BASE_MODEL_PROVIDERS) {
    if (providerId.startsWith(provider)) {
      return true;
    }
  }
  return false;
};
