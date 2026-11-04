import invariant from '../util/invariant';
import { parseCommaSeparatedValues as parseValues } from '../validation/parseCommaSeparatedValues';
import { normalizeForComparison } from './normalize';

import type { AssertionParams, GradingResult } from '../types/index';

export function parseCommaSeparatedValues(value: string): string[] {
  return parseValues(value);
}

function isContainsValue(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value !== '') ||
    (typeof value === 'number' && !Number.isNaN(value))
  );
}

function handleContainsValue(
  { assertion, renderedValue, valueFromScript, outputString, inverse }: AssertionParams,
  mode: 'single' | 'any' | 'all',
  ignoreCase = false,
): GradingResult {
  const type = `${ignoreCase ? 'i' : ''}contains${mode === 'single' ? '' : `-${mode}`}`;
  let value = valueFromScript ?? renderedValue;
  const normalization = mode === 'single' && !ignoreCase ? assertion.normalizeUnicode : undefined;
  const normalizedOutput = normalizeForComparison(outputString, normalization);
  const includes = (item: unknown) =>
    ignoreCase
      ? outputString.toLowerCase().includes(String(item).toLowerCase())
      : normalizedOutput.includes(normalizeForComparison(String(item), normalization));
  let matches: boolean;
  let expectation: () => string;
  if (mode === 'single') {
    invariant(
      isContainsValue(value),
      `"${type}" assertion type must have a string or number value`,
    );
    matches = includes(value);
    expectation = () => `"${value}"`;
  } else {
    invariant(value, `"${type}" assertion type must have a value`);
    if (typeof value === 'string') {
      value = parseCommaSeparatedValues(value);
    }
    invariant(Array.isArray(value), `"${type}" assertion type must have an array value`);
    const values = value;
    if (mode === 'any') {
      matches = values.some(includes);
      expectation = () => `one of "${values.join(', ')}"`;
    } else {
      const missing = values.filter((item) => !includes(item));
      matches = missing.length === 0;
      expectation = () => `all of [${values.join(', ')}]. Missing: [${missing.join(', ')}]`;
    }
  }
  const pass = matches !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain ${expectation()}`,
    assertion,
  };
}

export const handleContains = (params: AssertionParams) => handleContainsValue(params, 'single');
export const handleIContains = (params: AssertionParams) =>
  handleContainsValue(params, 'single', true);
export const handleContainsAny = (params: AssertionParams) => handleContainsValue(params, 'any');
export const handleIContainsAny = (params: AssertionParams) =>
  handleContainsValue(params, 'any', true);
export const handleContainsAll = (params: AssertionParams) => handleContainsValue(params, 'all');
export const handleIContainsAll = (params: AssertionParams) =>
  handleContainsValue(params, 'all', true);
