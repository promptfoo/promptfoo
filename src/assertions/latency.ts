import type { AssertionParams, GradingResult } from '../types/index';

export const handleLatency = ({
  assertion,
  latencyMs,
  inverse,
  providerResponse,
}: AssertionParams): GradingResult => {
  if (assertion.threshold === undefined) {
    throw new Error('Latency assertion must have a threshold in milliseconds');
  }
  // Live coalesced calls can be marked cached for billing but still have current latency.
  // Fall back to cached for providers that do not supply explicit replay provenance.
  if ((providerResponse?.cacheHit ?? providerResponse?.cached) || latencyMs === undefined) {
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
