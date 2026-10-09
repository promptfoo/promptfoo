import type { AssertionParams, GradingResult } from '../types/index';

export const handleCost = ({ cost, assertion, inverse }: AssertionParams): GradingResult => {
  if (assertion.threshold === undefined) {
    if (assertion.metric && assertion.weight === 0 && !inverse) {
      if (cost === undefined || !Number.isFinite(cost) || cost < 0) {
        throw new Error('Cost metric requires a finite, non-negative provider cost');
      }
      return { pass: true, score: cost, reason: `Cost: $${cost}`, assertion };
    }
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
