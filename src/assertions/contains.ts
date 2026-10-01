import invariant from '../util/invariant';
import { parseCommaSeparatedValues } from '../util/parseCommaSeparatedValues';

import type { AssertionParams, GradingResult } from '../types/index';

function isContainsValue(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value !== '') ||
    (typeof value === 'number' && !Number.isNaN(value))
  );
}

export const handleContains = ({
  assertion,
  renderedValue,
  valueFromScript,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  const value = valueFromScript ?? renderedValue;
  invariant(isContainsValue(value), '"contains" assertion type must have a string or number value');
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
  invariant(
    isContainsValue(value),
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
