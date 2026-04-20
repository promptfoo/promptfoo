import type { AssertionParams, GradingResult } from '../types/index';

export const handleTtft = ({ assertion, providerResponse }: AssertionParams): GradingResult => {
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
    // Reached either when (a) the stream closed without emitting any
    // non-whitespace content, or (b) a configured streamFormat /
    // streamFirstTokenPattern never matched in the stream. Mention both
    // so the user can narrow the cause from their config.
    throw new Error(
      'TTFT could not be measured: no matching content was detected in the stream. ' +
        'If streamFormat or streamFirstTokenPattern is configured, verify the pattern matches your endpoint. ' +
        'Otherwise confirm that the endpoint returns SSE/chunked output when stream: true is set.',
    );
  }

  const pass = ttft <= threshold;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `TTFT assertion passed: ${ttft}ms <= ${threshold}ms`
      : `Time to first token ${ttft}ms exceeds threshold ${threshold}ms`,
    assertion,
    namedScores: { ttft_ms: ttft },
  };
};
