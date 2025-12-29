const NON_BASE_MODEL_PROVIDERS = ['http', 'ws', 'mcp', 'https', 'webhook', 'file', 'exec'];

export const isFoundationModelProvider = (providerId: string) => {
  return !NON_BASE_MODEL_PROVIDERS.some((provider) => providerId.startsWith(provider));
};

// Browser-safe constant - also exported from src/constants.ts for Node.js code
export const FILE_METADATA_KEY = '_promptfooFileMetadata';
