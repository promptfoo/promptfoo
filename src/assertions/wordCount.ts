import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Counts words in a string by splitting on whitespace and filtering empty strings
 */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

function makeResult(
  pass: boolean,
  reason: string,
  assertion: AssertionParams['assertion'],
): GradingResult {
  return { pass, score: pass ? 1 : 0, reason, assertion };
}

function checkRange(
  wordCount: number,
  min: number,
  max: number,
  inverse: boolean,
): { pass: boolean; score: number; reason: string } {
  const basePass = wordCount >= min && wordCount <= max;
  const pass = inverse ? !basePass : basePass;
  if (pass) {
    return { pass, score: 1, reason: 'Assertion passed' };
  }
  const reason = inverse
    ? `Expected word count to not be between ${min} and ${max}, but got ${wordCount}`
    : `Word count ${wordCount} is not between ${min} and ${max}`;
  return { pass, score: 0, reason };
}

function checkMin(
  wordCount: number,
  min: number,
  inverse: boolean,
): { pass: boolean; score: number; reason: string } {
  const basePass = wordCount >= min;
  const pass = inverse ? !basePass : basePass;
  if (pass) {
    return { pass, score: 1, reason: 'Assertion passed' };
  }
  const reason = inverse
    ? `Expected word count to be less than ${min}, but got ${wordCount}`
    : `Word count ${wordCount} is less than minimum ${min}`;
  return { pass, score: 0, reason };
}

function checkMax(
  wordCount: number,
  max: number,
  inverse: boolean,
): { pass: boolean; score: number; reason: string } {
  const basePass = wordCount <= max;
  const pass = inverse ? !basePass : basePass;
  if (pass) {
    return { pass, score: 1, reason: 'Assertion passed' };
  }
  const reason = inverse
    ? `Expected word count to be greater than ${max}, but got ${wordCount}`
    : `Word count ${wordCount} is greater than maximum ${max}`;
  return { pass, score: 0, reason };
}

function checkObjectValue(
  wordCount: number,
  value: { min?: number; max?: number },
  inverse: boolean,
): { pass: boolean; score: number; reason: string } {
  const { min, max } = value;
  invariant(
    min !== undefined || max !== undefined,
    '"word-count" assertion object must have "min" and/or "max" properties',
  );

  if (min !== undefined && max !== undefined) {
    invariant(
      min <= max,
      `"word-count" assertion: min (${min}) must be less than or equal to max (${max})`,
    );
    return checkRange(wordCount, min, max, inverse);
  }

  if (min !== undefined) {
    return checkMin(wordCount, min, inverse);
  }

  return checkMax(wordCount, max!, inverse);
}

function checkExactCount(
  wordCount: number,
  value: unknown,
  inverse: boolean,
): { pass: boolean; score: number; reason: string } {
  invariant(
    typeof value === 'number' || (typeof value === 'string' && !Number.isNaN(Number(value))),
    '"word-count" assertion value must be a number or an object with min/max properties',
  );
  const expectedCount = typeof value === 'number' ? value : Number(value);
  const basePass = wordCount === expectedCount;
  const pass = inverse ? !basePass : basePass;
  if (pass) {
    return { pass, score: 1, reason: 'Assertion passed' };
  }
  const reason = inverse
    ? `Expected word count to not equal ${expectedCount}, but got ${wordCount}`
    : `Word count ${wordCount} does not equal expected ${expectedCount}`;
  return { pass, score: 0, reason };
}

/**
 * Handles word-count assertion
 *
 * Supports the following formats:
 * 1. Exact count: value: 50
 * 2. Range: value: { min: 20, max: 50 }
 * 3. Min only: value: { min: 10 }
 * 4. Max only: value: { max: 100 }
 */
export const handleWordCount = ({
  assertion,
  renderedValue,
  valueFromScript,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  const value = valueFromScript ?? renderedValue;

  invariant(value != null, '"word-count" assertion must have a value');

  const wordCount = countWords(outputString);

  const partial =
    typeof value === 'object' && !Array.isArray(value)
      ? checkObjectValue(wordCount, value as { min?: number; max?: number }, inverse)
      : checkExactCount(wordCount, value, inverse);

  return makeResult(partial.pass, partial.reason, assertion);
};
