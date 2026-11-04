/**
 * Shared utilities for trace assertions
 */

export type TraceSpanAttributeFilter = Record<string, string | number | boolean>;

export function withTraceAttributeFilterContext(
  reason: string,
  attributes?: TraceSpanAttributeFilter,
): string {
  const keys = Object.keys(attributes ?? {});
  return keys.length > 0
    ? `${reason}. Attribute filters applied to keys: ${JSON.stringify(keys)}.`
    : reason;
}

export function filterTraceSpans<T extends { name: string; attributes?: Record<string, unknown> }>(
  spans: T[],
  pattern: string,
  attributes?: unknown,
): T[] {
  if (attributes !== undefined) {
    if (
      attributes === null ||
      typeof attributes !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(attributes)) ||
      Object.values(attributes).some(
        (value) =>
          typeof value !== 'string' &&
          typeof value !== 'boolean' &&
          !(typeof value === 'number' && Number.isFinite(value)),
      )
    ) {
      throw new Error(
        'Trace assertion attributes must be an object with string, boolean, or finite number values',
      );
    }
  }

  const entries = Object.entries(attributes ?? {});
  return spans.filter(
    (span) =>
      matchesPattern(span.name, pattern) &&
      entries.every(
        ([key, value]) =>
          span.attributes !== undefined &&
          span.attributes !== null &&
          Object.prototype.hasOwnProperty.call(span.attributes, key) &&
          span.attributes[key] === value,
      ),
  );
}

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
