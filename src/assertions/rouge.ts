import * as rouge from 'js-rouge';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Counts how many times each n-gram occurs.
 */
function countNGrams(ngrams: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ngram of ngrams) {
    counts.set(ngram, (counts.get(ngram) ?? 0) + 1);
  }
  return counts;
}

/**
 * Computes a ROUGE-N F-score using clipped n-gram counts.
 *
 * js-rouge's own ROUGE-N counts the overlap of *deduplicated* n-grams but divides
 * by the *total* n-gram counts, so identical text that contains a repeated token
 * scores below 1.0 — e.g. "the cat sat on the mat" vs itself scores 0.83, and a
 * sentence-initial "The" recurring as lowercase "the" triggers the same drop once
 * inputs are lowercased. We instead use clipped counts — `min(count in candidate,
 * count in reference)`, the standard Lin (2004) definition, matching BLEU — so a
 * perfect match scores 1.0 regardless of repeated tokens.
 *
 * Reuses js-rouge's tokenizer / n-gram / f-measure helpers, so the result is
 * identical to js-rouge for inputs without repeated n-grams. The caller is
 * responsible for any case normalization.
 *
 * @internal
 */
function rougeNScore(candidate: string, reference: string, n = 1, beta = 1): number {
  const candidateTokens = rouge.treeBankTokenize(candidate);
  const referenceTokens = rouge.treeBankTokenize(reference);
  // js-rouge's nGram throws when the token count is smaller than n; an n-gram of
  // this order cannot exist, so there is no overlap to score.
  if (candidateTokens.length < n || referenceTokens.length < n) {
    return 0;
  }

  const candidateNGrams = rouge.nGram(candidateTokens, n);
  const referenceNGrams = rouge.nGram(referenceTokens, n);
  const referenceCounts = countNGrams(referenceNGrams);

  let overlap = 0;
  for (const [ngram, count] of countNGrams(candidateNGrams)) {
    overlap += Math.min(count, referenceCounts.get(ngram) ?? 0);
  }
  if (overlap === 0) {
    return 0;
  }

  const precision = overlap / candidateNGrams.length;
  const recall = overlap / referenceNGrams.length;
  return rouge.fMeasure(precision, recall, beta);
}

export function handleRougeScore({
  baseType,
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult {
  invariant(typeof renderedValue === 'string', '"rouge" assertion type must be a string value');
  const fnName = baseType[baseType.length - 1] as 'n' | 'l' | 's';

  // Score case-insensitively, matching the other text-overlap metrics
  // (bleu/gleu/meteor all lowercase their inputs). A difference in capitalization
  // should not crater the score.
  const candidate = outputString.toLowerCase();
  const reference = renderedValue.toLowerCase();

  // ROUGE-N (the only registered rouge assertion type) is computed in-house with
  // clipped counts so repeated tokens score correctly. ROUGE-L/S remain delegated
  // to js-rouge on the lowercased inputs.
  const score =
    fnName === 'n' ? rougeNScore(candidate, reference) : rouge[fnName](candidate, reference, {});

  const threshold = assertion.threshold ?? 0.75;
  const pass = score >= threshold !== inverse;
  return {
    pass,
    score: inverse ? 1 - score : score,
    reason: `${baseType.toUpperCase()} score ${score.toFixed(2)} is ${
      score >= threshold ? 'greater than or equal to' : 'less than'
    } threshold ${threshold}`,
    assertion,
  };
}
