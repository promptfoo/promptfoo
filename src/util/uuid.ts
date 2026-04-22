/**
 * UUID validation regex pattern.
 * Matches UUID v1-v5 format: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
 * where M is the version (1-5) and N is the variant (8, 9, a, or b).
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a string is a valid UUID (v1-v5).
 * @param value - The string to validate
 * @returns true if the string is a valid UUID, false otherwise
 */
export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}
