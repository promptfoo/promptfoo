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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

interface CountEvaluation {
  matches: boolean;
  failureReason: string;
  inverseFailureReason: string;
}

function evaluateBounds(value: Record<string, unknown>, characterCount: number): CountEvaluation {
  const { min, max } = value;
  invariant(
    min !== undefined || max !== undefined,
    '"character-count" assertion object must have "min" and/or "max" properties',
  );
  invariant(
    (min === undefined || isNonNegativeInteger(min)) &&
      (max === undefined || isNonNegativeInteger(max)),
    '"character-count" assertion min/max must be non-negative integers',
  );

  if (min !== undefined && max !== undefined) {
    invariant(
      min <= max,
      `"character-count" assertion: min (${min}) must be less than or equal to max (${max})`,
    );
    return {
      matches: characterCount >= min && characterCount <= max,
      failureReason: `Character count ${characterCount} is not between ${min} and ${max}`,
      inverseFailureReason: `Expected character count to not be between ${min} and ${max}, but got ${characterCount}`,
    };
  }

  if (max !== undefined) {
    return {
      matches: characterCount <= max,
      failureReason: `Character count ${characterCount} is greater than maximum ${max}`,
      inverseFailureReason: `Expected character count to be greater than ${max}, but got ${characterCount}`,
    };
  }

  invariant(isNonNegativeInteger(min), '"character-count" assertion min must be an integer');
  return {
    matches: characterCount >= min,
    failureReason: `Character count ${characterCount} is less than minimum ${min}`,
    inverseFailureReason: `Expected character count to be less than ${min}, but got ${characterCount}`,
  };
}

function evaluateCount(value: unknown, characterCount: number): CountEvaluation {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return evaluateBounds(value as Record<string, unknown>, characterCount);
  }

  const expectedCount =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  invariant(
    isNonNegativeInteger(expectedCount),
    '"character-count" assertion count must be a non-negative integer',
  );
  return {
    matches: characterCount === expectedCount,
    failureReason: `Character count ${characterCount} does not equal expected ${expectedCount}`,
    inverseFailureReason: `Expected character count to not equal ${expectedCount}, but got ${characterCount}`,
  };
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
    } else if (min === undefined) {
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
    } else {
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

/**
 * Handles character-count assertions. JavaScript string iteration counts Unicode code points,
 * so astral characters such as emoji count once instead of as two UTF-16 code units.
 */
export const handleCharacterCount = ({
  assertion,
  renderedValue,
  valueFromScript,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  const value = valueFromScript ?? renderedValue;

  invariant(value != null, '"character-count" assertion must have a value');

  const characterCount = Array.from(outputString).length;
  const evaluation = evaluateCount(value, characterCount);
  const pass = inverse ? !evaluation.matches : evaluation.matches;
  const reason = pass
    ? 'Assertion passed'
    : inverse
      ? evaluation.inverseFailureReason
      : evaluation.failureReason;

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion,
  };
};
