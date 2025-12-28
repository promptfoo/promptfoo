import invariant from '../util/invariant';
import { defineAssertions } from './assertionDefinition';

import type { AssertionParams, GradingResult } from '../types/index';

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
    // Handle quoted values and escaped commas
    value =
      value.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map((v) => v.trim().replace(/^"|"$/g, '')) ?? [];
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
    value = value.split(',').map((v) => v.trim());
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
    value = value.split(',').map((v) => v.trim());
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
    value = value.split(',').map((v) => v.trim());
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

/**
 * Assertion definitions for text containment checks.
 * Includes metadata and handler references for each assertion type.
 */
export const containsDefinitions = defineAssertions({
  contains: {
    label: 'Contains',
    description: 'Output contains the specified text (case-sensitive)',
    tags: ['text-matching'],
    valueType: 'string',
    handler: handleContains,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs#contains',
  },
  icontains: {
    label: 'Contains (Case-Insensitive)',
    description: 'Output contains the specified text (case-insensitive)',
    tags: ['text-matching'],
    valueType: 'string',
    handler: handleIContains,
  },
  'contains-all': {
    label: 'Contains All',
    description: 'Output contains all specified strings',
    tags: ['text-matching'],
    valueType: 'array',
    handler: handleContainsAll,
  },
  'contains-any': {
    label: 'Contains Any',
    description: 'Output contains at least one of the specified strings',
    tags: ['text-matching'],
    valueType: 'array',
    handler: handleContainsAny,
  },
  'icontains-all': {
    label: 'Contains All (Case-Insensitive)',
    description: 'Output contains all specified strings (case-insensitive)',
    tags: ['text-matching'],
    valueType: 'array',
    handler: handleIContainsAll,
  },
  'icontains-any': {
    label: 'Contains Any (Case-Insensitive)',
    description: 'Output contains at least one of the specified strings (case-insensitive)',
    tags: ['text-matching'],
    valueType: 'array',
    handler: handleIContainsAny,
  },
});
