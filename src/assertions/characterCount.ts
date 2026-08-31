import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
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
    (min === undefined || isNonNegativeFiniteNumber(min)) &&
      (max === undefined || isNonNegativeFiniteNumber(max)),
    '"character-count" assertion min/max must be non-negative finite numbers',
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

  invariant(isNonNegativeFiniteNumber(min), '"character-count" assertion min must be a number');
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
    isNonNegativeFiniteNumber(expectedCount),
    '"character-count" assertion count must be a non-negative finite number',
  );
  return {
    matches: characterCount === expectedCount,
    failureReason: `Character count ${characterCount} does not equal expected ${expectedCount}`,
    inverseFailureReason: `Expected character count to not equal ${expectedCount}, but got ${characterCount}`,
  };
}

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
