import JSON5 from 'json5';

const MAX_EXPRESSION_LENGTH = 512;
const MAX_NUMERIC_ARGUMENT = 1_000_000;
const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);
const JSON_PATH_SEGMENT =
  /(?:\.([$_\p{ID_Start}][$_\u200C\u200D\p{ID_Continue}]*)|\[(\d+)\]|\[((?:"(?:\\[\s\S]|[^"\\\r\n\u2028\u2029])*")|(?:'(?:\\[\s\S]|[^'\\\r\n\u2028\u2029])*'))\])/guy;

function parseBoundedInteger(value: string): number | undefined {
  if (!/^-?\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || Math.abs(parsed) > MAX_NUMERIC_ARGUMENT) {
    return undefined;
  }

  return Object.is(parsed, -0) ? 0 : parsed;
}

function canonicalizeJsonPath(expression: string): string | undefined {
  if (!expression.startsWith('json')) {
    return undefined;
  }

  JSON_PATH_SEGMENT.lastIndex = 4;
  let canonical = 'json';

  while (JSON_PATH_SEGMENT.lastIndex < expression.length) {
    const segment = JSON_PATH_SEGMENT.exec(expression);
    if (!segment) {
      return undefined;
    }

    const [, identifier, numericIndex, quotedProperty] = segment;
    if (numericIndex !== undefined) {
      const index = parseBoundedInteger(numericIndex);
      if (index === undefined) {
        return undefined;
      }
      canonical += `[${index}]`;
      continue;
    }

    let property: unknown = identifier;
    if (quotedProperty !== undefined) {
      try {
        property = JSON5.parse(quotedProperty);
      } catch {
        return undefined;
      }
    }

    if (
      typeof property !== 'string' ||
      property.length > 128 ||
      FORBIDDEN_PROPERTIES.has(property)
    ) {
      return undefined;
    }

    canonical += identifier === undefined ? `[${JSON.stringify(property)}]` : `.${property}`;
  }

  return canonical;
}

function canonicalizeTextExpression(expression: string): string | undefined {
  if (expression === 'text' || expression === 'text.trim()') {
    return expression;
  }

  const sliceMatch = expression.match(/^text\.slice\( *(-?\d+) *(?:, *(-?\d+) *)?\)$/);
  if (!sliceMatch) {
    return undefined;
  }

  const start = parseBoundedInteger(sliceMatch[1]);
  const end = sliceMatch[2] === undefined ? undefined : parseBoundedInteger(sliceMatch[2]);
  if (start === undefined || (sliceMatch[2] !== undefined && end === undefined)) {
    return undefined;
  }

  return end === undefined ? `text.slice(${start})` : `text.slice(${start}, ${end})`;
}

/**
 * Restricts remote one-click suggestions to non-executable response accessors.
 * Manually authored HTTP transforms remain unrestricted.
 */
export function canonicalizeResponseTransformSuggestion(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_EXPRESSION_LENGTH) {
    return undefined;
  }

  const expression = value.trim();
  if (expression.length === 0) {
    return undefined;
  }

  return canonicalizeJsonPath(expression) ?? canonicalizeTextExpression(expression);
}

export function parseConfigurationChangeSuggestion(
  value: unknown,
): { transformResponse: string } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, 'transformResponse');
  if (!descriptor || !('value' in descriptor)) {
    return undefined;
  }

  const transformResponse = canonicalizeResponseTransformSuggestion(descriptor.value);
  return transformResponse ? { transformResponse } : undefined;
}
