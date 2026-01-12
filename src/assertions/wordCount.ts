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

  let pass: boolean;
  let reason: string;

  // Handle object format: { min: X, max: Y }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const { min, max } = value as { min?: number; max?: number };

    invariant(
      min !== undefined || max !== undefined,
      '"word-count" assertion object must have "min" and/or "max" properties',
    );

    if (min !== undefined && max !== undefined) {
      invariant(
        min <= max,
        `"word-count" assertion: min (${min}) must be less than or equal to max (${max})`,
      );
      // Range check
      const basePass = wordCount >= min && wordCount <= max;
      pass = inverse ? !basePass : basePass;
      if (pass) {
        reason = 'Assertion passed';
      } else if (inverse) {
        reason = `Expected word count to not be between ${min} and ${max}, but got ${wordCount}`;
      } else {
        reason = `Word count ${wordCount} is not between ${min} and ${max}`;
      }
    } else if (min !== undefined) {
      // Min only
      const basePass = wordCount >= min;
      pass = inverse ? !basePass : basePass;
      if (pass) {
        reason = 'Assertion passed';
      } else if (inverse) {
        reason = `Expected word count to be less than ${min}, but got ${wordCount}`;
      } else {
        reason = `Word count ${wordCount} is less than minimum ${min}`;
      }
    } else {
      // Max only
      const basePass = wordCount <= max!;
      pass = inverse ? !basePass : basePass;
      if (pass) {
        reason = 'Assertion passed';
      } else if (inverse) {
        reason = `Expected word count to be greater than ${max}, but got ${wordCount}`;
      } else {
        reason = `Word count ${wordCount} is greater than maximum ${max}`;
      }
    }
  } else {
    // Handle number format: exact count
    invariant(
      typeof value === 'number' || (typeof value === 'string' && !Number.isNaN(Number(value))),
      '"word-count" assertion value must be a number or an object with min/max properties',
    );

    const expectedCount = typeof value === 'number' ? value : Number(value);
    const basePass = wordCount === expectedCount;
    pass = inverse ? !basePass : basePass;
    if (pass) {
      reason = 'Assertion passed';
    } else if (inverse) {
      reason = `Expected word count to not equal ${expectedCount}, but got ${wordCount}`;
    } else {
      reason = `Word count ${wordCount} does not equal expected ${expectedCount}`;
    }
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion,
  };
};
