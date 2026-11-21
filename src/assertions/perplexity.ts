import type { AssertionParams, GradingResult } from '../types/index';

function perplexityFrom(logProbs: number[] | undefined, assertionName: string): number {
  if (!Array.isArray(logProbs) || logProbs.length === 0) {
    throw new Error(
      `${assertionName} assertion does not support providers that do not return logProbs`,
    );
  }
  let sum = 0;
  for (const logProb of logProbs) {
    if (typeof logProb !== 'number' || Number.isNaN(logProb) || logProb > 0) {
      throw new Error('Perplexity logProbs must contain only non-positive numbers');
    }
    sum += logProb;
  }
  return Math.exp(-sum / logProbs.length);
}

export function handlePerplexity({ logProbs, assertion, inverse }: AssertionParams): GradingResult {
  const perplexity = perplexityFrom(logProbs, 'Perplexity');
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
  const perplexityNorm = 1 / (1 + perplexityFrom(logProbs, 'perplexity-score'));

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
