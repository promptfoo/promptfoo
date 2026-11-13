// Shared by CSV imports and assertion handlers; keep this module browser-safe.
/**
 * Split a contains-any string into fields while preserving quoted commas.
 */
export function parseCommaSeparatedValues(value: string): string[] {
  const results: string[] = [];
  let i = 0;
  while (i < value.length) {
    /**
     * Advance over separators between parsed fields.
     *
     * Contains-any values allow whitespace around comma delimiters, and historical
     * parsing ignored repeated commas rather than producing empty fields.
     */
    while (i < value.length) {
      /**
       * Advance over whitespace while preserving comma delimiter handling for callers.
       */
      while (i < value.length && /\s/.test(value[i])) {
        i++;
      }
      if (value[i] !== ',') {
        break;
      }
      i++;
    }
    if (i >= value.length) {
      break;
    }

    const isQuotedField = value[i] === '"';
    let field = '';
    if (isQuotedField) {
      /**
       * Parse a quoted field using the assertion parser's CSV-like escape rules.
       *
       * Supports backslash-escaped quotes/backslashes and doubled quotes, and rejects
       * unterminated fields so malformed assertion values do not silently pass.
       */
      i++;
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

      if (!terminated) {
        throw new Error('Invariant failed: Unterminated quoted field in contains assertion value');
      }
    } else {
      /**
       * Parse an unquoted field up to the next comma, trimming surrounding whitespace.
       */
      const startIndex = i;
      const commaIndex = value.indexOf(',', i);
      i = commaIndex === -1 ? value.length : commaIndex;
      field = value.substring(startIndex, i).trim();
    }
    results.push(field);
    while (i < value.length && /\s/.test(value[i])) {
      i++;
    }
    if (isQuotedField && i < value.length && value[i] !== ',') {
      throw new Error(
        'Invariant failed: Expected comma after quoted field in contains assertion value',
      );
    }
  }
  return results;
}
