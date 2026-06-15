import type { AssertionParams, GradingResult } from '../types/index';

export function handlePerplexity({ logProbs, assertion, inverse }: AssertionParams): GradingResult {
  if (!logProbs || logProbs.length === 0) {
    throw new Error('Perplexity assertion does not support providers that do not return logProbs');
  }
  const sumLogProbs = logProbs.reduce((acc, logProb) => acc + logProb, 0);
  const avgLogProb = sumLogProbs / logProbs.length;
  const perplexity = Math.exp(-avgLogProb);

  const pass =
    assertion.threshold === undefined ? true : perplexity <= assertion.threshold !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Perplexity ${perplexity.toFixed(2)} is ${
          inverse ? 'less than or equal to' : 'greater than'
        } threshold ${assertion.threshold}`,
    assertion,
  };
}

export function handlePerplexityScore({
  logProbs,
  assertion,
  inverse,
}: AssertionParams): GradingResult {
  if (!logProbs || logProbs.length === 0) {
    throw new Error(
      'perplexity-score assertion does not support providers that do not return logProbs',
    );
  }
  const sumLogProbs = logProbs.reduce((acc, logProb) => acc + logProb, 0);
  const avgLogProb = sumLogProbs / logProbs.length;
  const perplexity = Math.exp(-avgLogProb);
  const perplexityNorm = 1 / (1 + perplexity);

  const pass =
    assertion.threshold === undefined ? true : perplexityNorm >= assertion.threshold !== inverse;
  return {
    pass,
    // Invert the graded score under `not-` so a passing inverse assertion contributes a high
    // score and a failing one a low score, matching the sibling graded assertions (bleu/gleu/
    // rouge/similarity) and keeping `perplexity-score` aggregate-friendly ("higher is better").
    score: inverse ? 1 - perplexityNorm : perplexityNorm,
    reason: pass
      ? 'Assertion passed'
      : `Perplexity score ${perplexityNorm.toFixed(2)} is ${
          inverse ? 'greater than or equal to' : 'less than'
        } threshold ${assertion.threshold}`,
    assertion,
  };
}
