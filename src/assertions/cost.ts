import type { AssertionParams, GradingResult } from '../types/index';

export const handleCost = ({ cost, assertion }: AssertionParams): GradingResult => {
  if (typeof cost === 'undefined') {
    throw new Error('Cost assertion does not support providers that do not return cost');
  }

  if (assertion.threshold === undefined) {
    return {
      pass: true,
      score: cost,
      reason: 'Assertion passed',
      assertion,
    };
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
