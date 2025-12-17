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
