import type { AssertionParams, GradingResult } from '../types/index';

export const handleLatency = ({ assertion, latencyMs }: AssertionParams): GradingResult => {
  if (assertion.threshold === undefined) {
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

export const handleTtft = ({
  assertion,
  inverse = false,
  providerResponse,
}: AssertionParams): GradingResult => {
  const { threshold } = assertion;
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0) {
    throw new Error('TTFT assertion must specify a non-negative number threshold in milliseconds');
  }

  const streamingMetrics = providerResponse?.streamingMetrics;
  if (!streamingMetrics) {
    throw new Error(
      'TTFT assertion requires streaming metrics. Enable streaming with stream: true in your request body',
    );
  }

  const ttft = streamingMetrics.timeToFirstToken;
  if (typeof ttft !== 'number') {
    // This covers streams with no content and configured detectors that never match.
    throw new Error(
      'TTFT could not be measured: no matching content was detected in the stream. ' +
        'If streamFormat or streamFirstTokenPattern is configured, verify the pattern matches your endpoint. ' +
        'Otherwise confirm that the endpoint returns SSE/chunked output when stream: true is set.',
    );
  }
  if (!Number.isFinite(ttft) || ttft < 0) {
    throw new Error(
      'TTFT could not be measured: timeToFirstToken must be a non-negative finite number in milliseconds',
    );
  }

  const withinThreshold = ttft <= threshold;
  const pass = withinThreshold !== inverse;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? inverse
        ? `TTFT assertion passed: ${ttft}ms > ${threshold}ms`
        : `TTFT assertion passed: ${ttft}ms <= ${threshold}ms`
      : inverse
        ? `Time to first token ${ttft}ms must exceed threshold ${threshold}ms`
        : `Time to first token ${ttft}ms exceeds threshold ${threshold}ms`,
    assertion,
    namedScores: { ttft_ms: ttft },
  };
};
