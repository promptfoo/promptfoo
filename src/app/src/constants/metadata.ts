/**
 * Constants for metadata keys that should be filtered out from display
 */

/** Metadata key for citations - handled separately in UI */
export const CITATIONS_METADATA_KEY = 'citations';

/** Internal metadata key for promptfoo file metadata - not displayed to users */
export const PROMPTFOO_FILE_METADATA_KEY = '_promptfooFileMetadata';

/**
 * Checks if a metadata key should be filtered out from general metadata display
 * @param key - The metadata key to check
 * @returns true if the key should be filtered out
 */
export const isFilteredMetadataKey = (key: string): boolean => {
  return key === CITATIONS_METADATA_KEY || key === PROMPTFOO_FILE_METADATA_KEY;
};

/**
 * Checks if metadata has any displayable entries after filtering
 * @param metadata - The metadata object to check
 * @returns true if there are displayable metadata entries
 */
export const hasDisplayableMetadata = (metadata: Record<string, any> | undefined): boolean => {
  if (!metadata) return false;
  return Object.keys(metadata).some(key => !isFilteredMetadataKey(key));
};