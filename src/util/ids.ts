/**
 * Centralized ID validation utilities
 */

// Standard UUID v4 regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// More permissive regex that allows UUIDs and other alphanumeric IDs
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Check if a string is a valid UUID v4
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Check if an ID is safe for use in file paths (prevents path traversal)
 * Allows alphanumeric characters, hyphens, and underscores
 */
export function isSafeId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  
  // Check basic pattern
  if (!SAFE_ID_REGEX.test(id)) {
    return false;
  }
  
  // Prevent special directory references
  if (id === '.' || id === '..' || id.includes('/') || id.includes('\\')) {
    return false;
  }
  
  // Reasonable length limit
  if (id.length > 255) {
    return false;
  }
  
  return true;
}

/**
 * Validate eval, result, and asset IDs
 * These should be UUIDs in production but we allow other formats for compatibility
 */
export function isValidEvalId(id: string): boolean {
  return isSafeId(id);
}

export function isValidResultId(id: string): boolean {
  return isSafeId(id);
}

export function isValidAssetId(id: string): boolean {
  return isSafeId(id);
}