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

/**
 * Return-string validators for assertion config bounds. They are the single source of
 * truth for these messages: `traceAssertionConfig.ts` composes them into per-assertion
 * validators that both the runtime handlers (throwing on the returned message) and the
 * Eval Creator UI (surfacing it at save time) use, so the two surfaces cannot drift.
 * Keep them error-returning (not throwing) so both call sites can share the logic.
 */
export function finiteNonNegativeNumberError(value: unknown, label: string): string | undefined {
  return Number.isFinite(value) && (value as number) >= 0
    ? undefined
    : `${label} must be a finite non-negative number`;
}

export function finiteNonNegativeIntegerError(value: unknown, label: string): string | undefined {
  return Number.isFinite(value) && Number.isInteger(value) && (value as number) >= 0
    ? undefined
    : `${label} must be a finite non-negative integer`;
}

export function validRangeError(
  min: number | undefined,
  max: number | undefined,
  label: string,
): string | undefined {
  return min !== undefined && max !== undefined && max < min
    ? `${label} max must be greater than or equal to min`
    : undefined;
}
