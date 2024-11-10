import invariant from 'tiny-invariant';
import type { Assertion, AssertionValue, GradingResult } from '../types';
import { coerceString } from './utils';

export const handleContains = (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): GradingResult => {
  invariant(renderedValue, '"contains" assertion type must have a string or number value');
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'number',
    '"contains" assertion type must have a string or number value',
  );
  const outputString = coerceString(output);
  const pass = outputString.includes(String(renderedValue)) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain "${renderedValue}"`,
    assertion,
  };
};

export const handleIContains = (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): GradingResult => {
  invariant(renderedValue, '"icontains" assertion type must have a string or number value');
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'number',
    '"icontains" assertion type must have a string or number value',
  );
  const outputString = coerceString(output);
  const pass = outputString.toLowerCase().includes(String(renderedValue).toLowerCase()) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain "${renderedValue}"`,
    assertion,
  };
};

export const handleContainsAny = (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): GradingResult => {
  invariant(renderedValue, '"contains-any" assertion type must have a value');
  if (typeof renderedValue === 'string') {
    renderedValue = renderedValue.split(',').map((v) => v.trim());
  }
  invariant(Array.isArray(renderedValue), '"contains-any" assertion type must have an array value');
  const outputString = coerceString(output);
  const pass = renderedValue.some((value) => outputString.includes(String(value))) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain one of "${renderedValue.join(', ')}"`,
    assertion,
  };
};

export const handleIContainsAny = (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): GradingResult => {
  invariant(renderedValue, '"icontains-any" assertion type must have a value');
  if (typeof renderedValue === 'string') {
    renderedValue = renderedValue.split(',').map((v) => v.trim());
  }
  invariant(
    Array.isArray(renderedValue),
    '"icontains-any" assertion type must have an array value',
  );
  const outputString = coerceString(output);
  const pass =
    renderedValue.some((value) =>
      outputString.toLowerCase().includes(String(value).toLowerCase()),
    ) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain one of "${renderedValue.join(', ')}"`,
    assertion,
  };
};

export const handleContainsAll = (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): GradingResult => {
  invariant(renderedValue, '"contains-all" assertion type must have a value');
  if (typeof renderedValue === 'string') {
    renderedValue = renderedValue.split(',').map((v) => v.trim());
  }
  invariant(Array.isArray(renderedValue), '"contains-all" assertion type must have an array value');
  const outputString = coerceString(output);
  const missingStrings = renderedValue.filter((value) => !outputString.includes(String(value)));
  const pass = (missingStrings.length === 0) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain all of [${renderedValue.join(', ')}]. Missing: [${missingStrings.join(', ')}]`,
    assertion,
  };
};

export const handleIContainsAll = (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): GradingResult => {
  invariant(renderedValue, '"icontains-all" assertion type must have a value');
  if (typeof renderedValue === 'string') {
    renderedValue = renderedValue.split(',').map((v) => v.trim());
  }
  invariant(
    Array.isArray(renderedValue),
    '"icontains-all" assertion type must have an array value',
  );
  const outputString = coerceString(output);
  const missingStrings = renderedValue.filter(
    (value) => !outputString.toLowerCase().includes(String(value).toLowerCase()),
  );
  const pass = (missingStrings.length === 0) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}contain all of [${renderedValue.join(', ')}]. Missing: [${missingStrings.join(', ')}]`,
    assertion,
  };
};
