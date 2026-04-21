const NON_BASE_MODEL_PROVIDERS = ['http', 'ws', 'mcp', 'https', 'webhook', 'file', 'exec'];

export const isFoundationModelProvider = (providerId: string) => {
  return !NON_BASE_MODEL_PROVIDERS.some((provider) => providerId.startsWith(provider));
};

export const FILE_METADATA_KEY = '_promptfooFileMetadata';

/**
 * Identifier for manual user ratings in componentResults.
 * Used to distinguish human ratings from automated assertions.
 */
export const HUMAN_ASSERTION_TYPE = 'human' as const;
export type HumanAssertionType = typeof HUMAN_ASSERTION_TYPE;
