import invariant from './invariant';

interface ParsedField {
  field: string;
  nextIndex: number;
}

/**
 * Advance over separators between parsed fields.
 *
 * Contains-any values allow whitespace around comma delimiters, and historical
 * parsing ignored repeated commas rather than producing empty fields.
 */
function skipWhitespaceAndCommas(value: string, startIndex: number): number {
  let i = startIndex;
  while (i < value.length) {
    i = skipWhitespace(value, i);
    if (value[i] !== ',') {
      break;
    }
    i++;
  }
  return i;
}

/**
 * Advance over whitespace while preserving comma delimiter handling for callers.
 */
function skipWhitespace(value: string, startIndex: number): number {
  let i = startIndex;
  while (i < value.length && /\s/.test(value[i])) {
    i++;
  }
  return i;
}

/**
 * Parse a quoted field using the assertion parser's CSV-like escape rules.
 *
 * Supports backslash-escaped quotes/backslashes and doubled quotes, and rejects
 * unterminated fields so malformed assertion values do not silently pass.
 */
function parseQuotedField(value: string, startIndex: number): ParsedField {
  let i = startIndex + 1;
  let field = '';
  let terminated = false;

  while (i < value.length) {
    if (value[i] === '\\' && i + 1 < value.length && ['"', '\\'].includes(value[i + 1])) {
      field += value[i + 1];
      i += 2;
    } else if (value[i] === '"' && i + 1 < value.length && value[i + 1] === '"') {
      field += '"';
      i += 2;
    } else if (value[i] === '"') {
      i++;
      terminated = true;
      break;
    } else {
      field += value[i];
      i++;
    }
  }

  invariant(terminated, 'Unterminated quoted field in contains assertion value');
  return { field, nextIndex: i };
}

/**
 * Parse an unquoted field up to the next comma, trimming surrounding whitespace.
 */
function parseUnquotedField(value: string, startIndex: number): ParsedField {
  let i = startIndex;
  while (i < value.length && value[i] !== ',') {
    i++;
  }
  return { field: value.substring(startIndex, i).trim(), nextIndex: i };
}

/**
 * Split a contains-any string into fields while preserving quoted commas.
 *
 * A browser-safe helper shared by CSV imports and runtime assertions.
 */
export function parseCommaSeparatedValues(value: string): string[] {
  const results: string[] = [];
  let i = 0;
  while (i < value.length) {
    i = skipWhitespaceAndCommas(value, i);
    if (i >= value.length) {
      break;
    }

    const isQuotedField = value[i] === '"';
    const parsed = isQuotedField ? parseQuotedField(value, i) : parseUnquotedField(value, i);
    results.push(parsed.field);
    i = isQuotedField ? skipWhitespace(value, parsed.nextIndex) : parsed.nextIndex;
    invariant(
      !isQuotedField || i >= value.length || value[i] === ',',
      'Expected comma after quoted field in contains assertion value',
    );
  }
  return results;
}
