import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

function parseCommaSeparatedValues(value: string): string[] {
  const results: string[] = [];
  let i = 0;
  while (i < value.length) {
    // Skip whitespace (spaces, tabs, newlines, etc.)
    while (i < value.length && /\s/.test(value[i])) {
      i++;
    }
    if (i >= value.length) {
      break;
    }
    // Skip comma separators
    if (value[i] === ',') {
      i++;
      continue;
    }
    if (value[i] === '"') {
      // Quoted field: consume until unescaped closing quote
      i++; // skip opening quote
      let field = '';
      while (i < value.length) {
        if (
          value[i] === '\\' &&
          i + 1 < value.length &&
          (value[i + 1] === '"' || value[i + 1] === '\\')
        ) {
          // Escaped quote or backslash: include only the escaped character
          field += value[i + 1];
          i += 2;
        } else if (value[i] === '"' && i + 1 < value.length && value[i + 1] === '"') {
          // CSV-style doubled quote: "" becomes a literal "
          field += '"';
          i += 2;
        } else if (value[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += value[i];
          i++;
        }
      }
      results.push(field);
    } else {
      // Unquoted field: consume until comma
      const start = i;
      while (i < value.length && value[i] !== ',') {
        i++;
      }
      results.push(value.substring(start, i).trim());
    }
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
