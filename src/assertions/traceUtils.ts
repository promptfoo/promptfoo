/**
 * Shared utilities for trace assertions
 */

/**
 * Match a span name against a glob-like pattern.
 * Supports * (any characters) and ? (single character) wildcards.
 *
 * @param spanName - The span name to match
 * @param pattern - The glob pattern to match against
 * @returns true if the span name matches the pattern
 */
export function matchesPattern(spanName: string, pattern: string): boolean {
  // Convert glob-like pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*/g, '.*') // Convert * to .*
    .replace(/\?/g, '.'); // Convert ? to .

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(spanName);
}

export function assertFiniteNonNegativeNumber(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isFinite(value) || (value as number) < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

export function assertFiniteNonNegativeInteger(
  value: unknown,
  label: string,
): asserts value is number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a finite non-negative integer`);
  }
}

export function assertValidRange(
  min: number | undefined,
  max: number | undefined,
  label: string,
): void {
  if (min !== undefined && max !== undefined && max < min) {
    throw new Error(`${label} max must be greater than or equal to min`);
  }
}
