import type { AssertionParams, GradingResult } from '../types/index';

export const handleLatency = ({
  assertion,
  latencyMs,
  inverse,
}: AssertionParams): GradingResult => {
  if (assertion.threshold === undefined) {
    throw new Error('Latency assertion must have a threshold in milliseconds');
  }
  if (latencyMs === undefined) {
    throw new Error(
      'Latency assertion does not support cached results. Rerun the eval with --no-cache',
    );
  }
  const pass = latencyMs <= assertion.threshold !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Latency ${latencyMs}ms is ${
          inverse ? 'less than or equal to' : 'greater than'
        } threshold ${assertion.threshold}ms`,
    assertion,
  };
};
