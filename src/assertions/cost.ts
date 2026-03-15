import type { AssertionParams, GradingResult } from '../types/index';

export const handleCost = ({ cost, assertion, inverse }: AssertionParams): GradingResult => {
  if (typeof cost === 'undefined') {
    throw new Error('Cost assertion does not support providers that do not return cost');
  }

  if (assertion.threshold === undefined) {
    if (inverse) {
      throw new Error('Cost assertion requires a threshold when using not-cost');
    }
    if (!assertion.metric) {
      throw new Error(
        'Cost assertion without a threshold must set `metric` to record as a named metric',
      );
    }
    return {
      pass: true,
      score: cost,
      reason: 'Assertion passed',
      assertion,
    };
  }

  const pass = inverse ? cost > assertion.threshold : cost <= assertion.threshold;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : inverse
        ? `Cost ${cost.toPrecision(2)} is less than or equal to threshold ${assertion.threshold}`
        : `Cost ${cost.toPrecision(2)} is greater than threshold ${assertion.threshold}`,
    assertion,
  };
};
