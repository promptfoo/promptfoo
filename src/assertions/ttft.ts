import type { AssertionParams, GradingResult } from '../types/index';

export const handleTtft = ({ assertion, providerResponse }: AssertionParams): GradingResult => {
  // Validate threshold is a finite, non-negative number
  if (
    assertion.threshold === undefined ||
    typeof assertion.threshold !== 'number' ||
    !Number.isFinite(assertion.threshold) ||
    assertion.threshold < 0
  ) {
    throw new Error('TTFT assertion must specify a non-negative number threshold in milliseconds');
  }

  const streamingMetrics = providerResponse?.streamingMetrics;

  if (!streamingMetrics) {
    throw new Error(
      'TTFT assertion requires streaming metrics. Enable streaming with stream: true in your request body',
    );
  }

  if (typeof streamingMetrics.timeToFirstToken !== 'number') {
    throw new Error(
      'TTFT assertion could not measure time to first token. This may indicate an issue with the streaming response or network timing.',
    );
  }

  const ttft = streamingMetrics.timeToFirstToken;
  const pass = ttft <= assertion.threshold;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `TTFT assertion passed: ${ttft}ms <= ${assertion.threshold}ms`
      : `Time to first token ${ttft}ms exceeds threshold ${assertion.threshold}ms`,
    assertion,
    namedScores: { ttft_ms: ttft },
  };
};
