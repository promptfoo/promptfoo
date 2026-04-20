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
    throw new Error(
      'TTFT assertion could not measure time to first token. This may indicate an issue with the streaming response or network timing.',
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
