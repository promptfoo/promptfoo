/**
 * Metadata filter utilities
 */

/**
 * Validates if a metadata key is safe to use in JSON path expressions
 * Only allows alphanumeric characters, underscores, hyphens, and dots
 */
export function isValidMetadataKey(key: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(key);
}

/**
 * Sanitizes a metadata key by removing invalid characters
 * This is a fallback - ideally we should reject invalid keys
 */
export function sanitizeMetadataKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_.-]/g, '');
}

/**
 * Validates if a metadata value contains valid wildcard patterns
 */
export function isValidWildcardPattern(value: string): boolean {
  // Check for invalid wildcard patterns like "**" or "***"
  return !/\*{2,}/.test(value);
}

/**
 * Converts a wildcard pattern to SQL LIKE pattern
 */
export function wildcardToSqlPattern(value: string): string {
  return value.replace(/\*/g, '%');
}

/**
 * Formats a metadata filter for display
 */
export function formatMetadataFilter(filter: string): string {
  if (!filter.includes(':')) {
    return `${filter} (any value)`;
  }
  return filter;
}

/**
 * Parses a metadata filter string into key and value components
 */
export function parseMetadataFilter(filter: string): { key: string; value?: string } {
  const colonIndex = filter.indexOf(':');
  if (colonIndex === -1) {
    return { key: filter };
  }

  return {
    key: filter.substring(0, colonIndex),
    value: filter.substring(colonIndex + 1),
  };
}

/**
 * Checks if a metadata filter matches a given metadata object
 * Used for client-side filtering preview
 */
export function matchesMetadataFilter(metadata: Record<string, any>, filter: string): boolean {
  const { key, value } = parseMetadataFilter(filter);

  if (!(key in metadata)) {
    return false;
  }

  if (!value) {
    return true; // Key-only filter
  }

  const metadataValue = String(metadata[key]);

  // Handle wildcard patterns
  if (value.includes('*')) {
    const regex = new RegExp(
      '^' + value.replace(/\*/g, '.*') + '$',
      'i', // Case-insensitive for client-side preview
    );
    return regex.test(metadataValue);
  }

  return metadataValue === value;
}
