import type { AssertionParams, GradingResult } from '../types/index';

export const handleLatency = ({
  assertion,
  inverse,
  latencyMs,
}: AssertionParams): GradingResult => {
  if (latencyMs === undefined) {
    throw new Error(
      'Latency assertion does not support cached results. Rerun the eval with --no-cache',
    );
  }

  if (assertion.threshold === undefined) {
    if (inverse) {
      throw new Error('Latency assertion requires a threshold when using not-latency');
    }
    if (!assertion.metric) {
      throw new Error(
        'Latency assertion without a threshold must set `metric` to record as a named metric',
      );
    }
    return {
      pass: true,
      score: latencyMs,
      reason: 'Assertion passed',
      assertion,
    };
  }

  const pass = inverse ? latencyMs > assertion.threshold : latencyMs <= assertion.threshold;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : inverse
        ? `Latency ${latencyMs}ms is less than or equal to threshold ${assertion.threshold}ms`
        : `Latency ${latencyMs}ms is greater than threshold ${assertion.threshold}ms`,
    assertion,
  };
};
