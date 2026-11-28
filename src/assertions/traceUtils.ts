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

/** Case-insensitive trace glob matching; * and ? do not consume line terminators. */

export function matchesPattern(spanName: string, pattern: string): boolean {
  const parts = pattern.split('*');
  let cursor = 0;

  // Consume fixed-width segments in order, without backtracking across earlier stars.
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\?/g, '.');
    const regex = new RegExp(
      `${index === 0 ? '^' : ''}${part}${index === parts.length - 1 ? '$' : ''}`,
      'gi',
    );
    regex.lastIndex = cursor;
    const match = regex.exec(spanName);
    if (!match || /[\r\n\u2028\u2029]/.test(spanName.slice(cursor, match.index))) {
      return false;
    }
    cursor = match.index + match[0].length;
  }
  return true;
}
