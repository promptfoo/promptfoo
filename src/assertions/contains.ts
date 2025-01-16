import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handleContains = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(renderedValue, '"contains" assertion type must have a string or number value');
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'number',
    '"contains" assertion type must have a string or number value',
  );
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

export const handleIContains = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(renderedValue, '"icontains" assertion type must have a string or number value');
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'number',
    '"icontains" assertion type must have a string or number value',
  );
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

export const handleContainsAny = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(renderedValue, '"contains-any" assertion type must have a value');
  if (typeof renderedValue === 'string') {
    // Handle quoted values and escaped commas
    renderedValue =
      renderedValue
        .match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)
        ?.map((v) => v.trim().replace(/^"|"$/g, '')) ?? [];
  }
  invariant(Array.isArray(renderedValue), '"contains-any" assertion type must have an array value');
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

export const handleIContainsAny = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(renderedValue, '"icontains-any" assertion type must have a value');
  if (typeof renderedValue === 'string') {
    renderedValue = renderedValue.split(',').map((v) => v.trim());
  }
  invariant(
    Array.isArray(renderedValue),
    '"icontains-any" assertion type must have an array value',
  );
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

export const handleContainsAll = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(renderedValue, '"contains-all" assertion type must have a value');
  if (typeof renderedValue === 'string') {
    renderedValue = renderedValue.split(',').map((v) => v.trim());
  }
  invariant(Array.isArray(renderedValue), '"contains-all" assertion type must have an array value');
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

export const handleIContainsAll = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(renderedValue, '"icontains-all" assertion type must have a value');
  if (typeof renderedValue === 'string') {
    renderedValue = renderedValue.split(',').map((v) => v.trim());
  }
  invariant(
    Array.isArray(renderedValue),
    '"icontains-all" assertion type must have an array value',
  );
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
