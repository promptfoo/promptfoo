import invariant from './invariant';

interface ParsedField {
  field: string;
  nextIndex: number;
}

// Ignore whitespace and repeated commas between fields. Quoted empty fields
// are preserved by parseQuotedField.
function skipWhitespaceAndCommas(value: string, startIndex: number): number {
  let i = startIndex;
  while (i < value.length && (value[i] === ',' || /\s/.test(value[i]))) {
    i++;
  }
  return i;
}

function skipWhitespace(value: string, startIndex: number): number {
  let i = startIndex;
  while (i < value.length && /\s/.test(value[i])) {
    i++;
  }
  return i;
}

// Quoted fields support escaped quotes/backslashes and doubled quotes.
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

function parseUnquotedField(value: string, startIndex: number): ParsedField {
  let i = startIndex;
  while (i < value.length && value[i] !== ',') {
    i++;
  }
  return { field: value.substring(startIndex, i).trim(), nextIndex: i };
}

/**
 * Parse comma-separated assertion values, preserving commas and empty strings inside quotes.
 * Shared by CSV imports and runtime assertions without backend dependencies.
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
