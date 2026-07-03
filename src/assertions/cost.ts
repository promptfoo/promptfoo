import type { AssertionParams, GradingResult } from '../types/index';

export const handleCost = ({ cost, assertion, inverse }: AssertionParams): GradingResult => {
  if (assertion.threshold === undefined) {
    throw new Error('Cost assertion must have a threshold');
  }
  if (typeof cost === 'undefined') {
    throw new Error('Cost assertion does not support providers that do not return cost');
  }

  const pass = cost <= assertion.threshold !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Cost ${cost.toPrecision(2)} is ${
          inverse ? 'less than or equal to' : 'greater than'
        } threshold ${assertion.threshold}`,
    assertion,
  };
};
