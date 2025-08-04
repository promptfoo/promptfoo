/**
 * UUID validation utilities
 */

// Standard UUID v4 regex pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// More permissive UUID regex that accepts any version
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID v4
 */
export function isValidUUIDv4(uuid: string): boolean {
  return UUID_V4_REGEX.test(uuid);
}

/**
 * Validates if a string is a valid UUID (any version)
 */
export function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid);
}

/**
 * Validates evalId format (can be UUID or custom format)
 * Eval IDs can be:
 * - Standard UUIDs
 * - Custom format: eval-{timestamp}-{random}
 * - Legacy format: various alphanumeric formats
 */
export function isValidEvalId(evalId: string): boolean {
  // Check if it's a UUID first
  if (isValidUUID(evalId)) {
    return true;
  }
  
  // Check for eval- prefix format
  if (evalId.startsWith('eval-')) {
    return /^eval-\d+-[a-zA-Z0-9]+$/.test(evalId);
  }
  
  // Allow alphanumeric with hyphens and underscores
  // This is more permissive for backward compatibility
  return /^[a-zA-Z0-9_-]+$/.test(evalId) && evalId.length <= 100;
}

/**
 * Validates resultId format
 * Result IDs are typically UUIDs but can be custom formats
 */
export function isValidResultId(resultId: string): boolean {
  // Check if it's a UUID first
  if (isValidUUID(resultId)) {
    return true;
  }
  
  // Check for result- prefix format
  if (resultId.startsWith('result-')) {
    return /^result-[a-zA-Z0-9_-]+$/.test(resultId);
  }
  
  // Allow alphanumeric with hyphens and underscores
  return /^[a-zA-Z0-9_-]+$/.test(resultId) && resultId.length <= 100;
}

/**
 * Validates assetId format (should always be UUID v4)
 */
export function isValidAssetId(assetId: string): boolean {
  return isValidUUIDv4(assetId);
}