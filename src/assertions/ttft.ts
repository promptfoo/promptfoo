import type { AssertionParams, GradingResult } from '../types/index';

export const handleTtft = ({ assertion, providerResponse }: AssertionParams): GradingResult => {
  if (assertion.threshold === undefined) {
    throw new Error('TTFT assertion must have a threshold in milliseconds');
  }

  const streamingMetrics = providerResponse?.streamingMetrics;

  if (!streamingMetrics) {
    throw new Error(
      'TTFT assertion requires streaming metrics. Enable streaming with enableStreamingMetrics: true in your provider config',
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
  };
};