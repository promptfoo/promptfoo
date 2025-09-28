/**
 * Metadata keys filtered out from general display:
 * - 'citations': Handled separately in UI components
 * - '_promptfooFileMetadata': Internal metadata not displayed to users
 */
export const FILTERED_METADATA_KEYS = ['citations', '_promptfooFileMetadata'] as const;

// Individual key constants for specific access
export const [CITATIONS_METADATA_KEY, PROMPTFOO_FILE_METADATA_KEY] = FILTERED_METADATA_KEYS;

// Utility functions
export const isFilteredMetadataKey = (key: string) => FILTERED_METADATA_KEYS.includes(key as any);

export const hasDisplayableMetadata = (metadata?: Record<string, any>) =>
  !!metadata && Object.keys(metadata).some((key) => !isFilteredMetadataKey(key));
