import type { AssertionParams, GradingResult } from '../types';

export const handleCost = ({ cost, assertion }: AssertionParams): GradingResult => {
  if (!assertion.threshold) {
    throw new Error('Cost assertion must have a threshold');
  }
  if (typeof cost === 'undefined') {
    throw new Error('Cost assertion does not support providers that do not return cost');
  }

  const pass = cost <= assertion.threshold;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Cost ${cost.toPrecision(2)} is greater than threshold ${assertion.threshold}`,
    assertion,
  };
};
