import type { AssertionParams, GradingResult } from '../types';

export const handleLatency = ({ assertion, latencyMs }: AssertionParams): GradingResult => {
  if (!assertion.threshold) {
    throw new Error('Latency assertion must have a threshold in milliseconds');
  }
  if (latencyMs === undefined) {
    throw new Error(
      'Latency assertion does not support cached results. Rerun the eval with --no-cache',
    );
  }
  const pass = latencyMs <= assertion.threshold;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Latency ${latencyMs}ms is greater than threshold ${assertion.threshold}ms`,
    assertion,
  };
};
