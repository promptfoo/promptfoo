import type { AssertionParams, GradingResult } from '../types';

export function handlePerplexity({ logProbs, assertion }: AssertionParams): GradingResult {
  if (!logProbs || logProbs.length === 0) {
    throw new Error('Perplexity assertion does not support providers that do not return logProbs');
  }
  const sumLogProbs = logProbs.reduce((acc, logProb) => acc + logProb, 0);
  const avgLogProb = sumLogProbs / logProbs.length;
  const perplexity = Math.exp(-avgLogProb);

  const pass = assertion.threshold ? perplexity <= assertion.threshold : true;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Perplexity ${perplexity.toFixed(2)} is greater than threshold ${assertion.threshold}`,
    assertion,
  };
}

export function handlePerplexityScore({ logProbs, assertion }: AssertionParams): GradingResult {
  if (!logProbs || logProbs.length === 0) {
    throw new Error(
      'perplexity-score assertion does not support providers that do not return logProbs',
    );
  }
  const sumLogProbs = logProbs.reduce((acc, logProb) => acc + logProb, 0);
  const avgLogProb = sumLogProbs / logProbs.length;
  const perplexity = Math.exp(-avgLogProb);
  const perplexityNorm = 1 / (1 + perplexity);

  const pass = assertion.threshold ? perplexityNorm >= assertion.threshold : true;
  return {
    pass,
    score: perplexityNorm,
    reason: pass
      ? 'Assertion passed'
      : `Perplexity score ${perplexityNorm.toFixed(2)} is less than threshold ${
          assertion.threshold
        }`,
    assertion,
  };
}
