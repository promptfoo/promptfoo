import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

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
 */
function parseCommaSeparatedValues(value: string): string[] {
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

export const handleContains = ({
  assertion,
  renderedValue,
  valueFromScript,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  const value = valueFromScript ?? renderedValue;
  invariant(value, '"contains" assertion type must have a string or number value');
  invariant(
    typeof value === 'string' || typeof value === 'number',
    '"contains" assertion type must have a string or number value',
  );
  const pass = outputString.includes(String(value)) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain "${value}"`,
    assertion,
  };
};

export const handleIContains = ({
  assertion,
  renderedValue,
  valueFromScript,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  const value = valueFromScript ?? renderedValue;
  invariant(value, '"icontains" assertion type must have a string or number value');
  invariant(
    typeof value === 'string' || typeof value === 'number',
    '"icontains" assertion type must have a string or number value',
  );
  const pass = outputString.toLowerCase().includes(String(value).toLowerCase()) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain "${value}"`,
    assertion,
  };
};

export const handleContainsAny = ({
  assertion,
  renderedValue,
  valueFromScript,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  let value = valueFromScript ?? renderedValue;
  invariant(value, '"contains-any" assertion type must have a value');
  if (typeof value === 'string') {
    value = parseCommaSeparatedValues(value);
  }
  invariant(Array.isArray(value), '"contains-any" assertion type must have an array value');
  const pass = value.some((v) => outputString.includes(String(v))) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain one of "${value.join(', ')}"`,
    assertion,
  };
};

export const handleIContainsAny = ({
  assertion,
  renderedValue,
  valueFromScript,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  let value = valueFromScript ?? renderedValue;
  invariant(value, '"icontains-any" assertion type must have a value');
  if (typeof value === 'string') {
    value = parseCommaSeparatedValues(value);
  }
  invariant(Array.isArray(value), '"icontains-any" assertion type must have an array value');
  const pass =
    value.some((v) => outputString.toLowerCase().includes(String(v).toLowerCase())) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain one of "${value.join(', ')}"`,
    assertion,
  };
};

export const handleContainsAll = ({
  assertion,
  renderedValue,
  valueFromScript,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  let value = valueFromScript ?? renderedValue;
  invariant(value, '"contains-all" assertion type must have a value');
  if (typeof value === 'string') {
    value = parseCommaSeparatedValues(value);
  }
  invariant(Array.isArray(value), '"contains-all" assertion type must have an array value');
  const missingStrings = value.filter((v) => !outputString.includes(String(v)));
  const pass = (missingStrings.length === 0) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain all of [${value.join(', ')}]. Missing: [${missingStrings.join(', ')}]`,
    assertion,
  };
};

export const handleIContainsAll = ({
  assertion,
  renderedValue,
  valueFromScript,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  let value = valueFromScript ?? renderedValue;
  invariant(value, '"icontains-all" assertion type must have a value');
  if (typeof value === 'string') {
    value = parseCommaSeparatedValues(value);
  }
  invariant(Array.isArray(value), '"icontains-all" assertion type must have an array value');
  const missingStrings = value.filter(
    (v) => !outputString.toLowerCase().includes(String(v).toLowerCase()),
  );
  const pass = (missingStrings.length === 0) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain all of [${value.join(', ')}]. Missing: [${missingStrings.join(', ')}]`,
    assertion,
  };
};
