/**
 * BLEU (Bilingual Evaluation Understudy) Score Implementation
 *
 * Implementation based on:
 * Papineni, K., Roukos, S., Ward, T., & Zhu, W. J. (2002).
 * "BLEU: a method for automatic evaluation of machine translation."
 * In Proceedings of the 40th Annual Meeting of the ACL, pp. 311-318.
 *
 * {@link https://doi.org/10.3115/1073083.1073135}
 */

import invariant from '../util/invariant';
import { getNGrams } from './ngrams';

import type { AssertionParams, GradingResult } from '../types/index';

/**
 * Calculates the brevity penalty for BLEU score.
 * Penalizes translations that are shorter than the reference.
 *
 * @param candidateLength - Length of candidate translation
 * @param referenceLength - Length of reference translation
 * @returns Brevity penalty in (0, 1] (1 when the candidate is at least as long as the reference)
 * @internal
 */
function calculateBrevityPenalty(candidateLength: number, referenceLength: number): number {
  if (candidateLength > referenceLength) {
    return 1;
  }
  return Math.exp(1 - referenceLength / candidateLength);
}

/**
 * Tokenizes text into lowercased, whitespace-delimited words.
 *
 * @internal
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().trim().split(/\s+/);
}

/**
 * Counts how many times each n-gram occurs.
 *
 * @internal
 */
function countNGrams(ngrams: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const gram of ngrams) {
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/**
 * Calculates BLEU score for a candidate string against reference strings.
 *
 * @param candidate - The string to evaluate
 * @param references - Array of reference strings to compare against
 * @param weights - Weights for each n-gram precision (1-gram to 4-gram)
 * @returns BLEU score between 0 and 1
 * @throws When inputs are invalid or weights don't sum to 1
 */
export function calculateBleuScore(
  candidate: string,
  references: string[],
  weights: number[] = [0.25, 0.25, 0.25, 0.25],
): number {
  if (!candidate || references.length === 0 || weights.length !== 4) {
    throw new Error('Invalid inputs');
  }
  if (Math.abs(weights.reduce((a, b) => a + b) - 1) > 1e-4) {
    throw new Error('Weights must sum to 1');
  }

  const candidateWords = tokenize(candidate);
  const referenceWordsList = references.map(tokenize);

  // Find reference length closest to the candidate length for the brevity penalty.
  // On ties, prefer the shorter reference (BLEU / NLTK `closest_ref_length`
  // convention) so the score does not depend on the order references are provided in.
  const refLengths = referenceWordsList.map((words) => words.length);
  const closestRefLength = refLengths.reduce((prev, curr) => {
    const distCurr = Math.abs(curr - candidateWords.length);
    const distPrev = Math.abs(prev - candidateWords.length);
    return distCurr < distPrev || (distCurr === distPrev && curr < prev) ? curr : prev;
  });

  const maxN = 4;
  const precisions: number[] = [];
  const usableWeights: number[] = [];

  for (let n = 1; n <= maxN; n++) {
    const candidateNGrams = getNGrams(candidateWords, n);
    const totalCount = candidateNGrams.length;

    // If the candidate is shorter than n tokens, no n-grams of this order can
    // exist. Skip the order and renormalize the weights over the remaining
    // orders, rather than recording precision 0 — that would be smoothed to a
    // tiny value and collapse the whole score (e.g. a perfect 1-3 word match
    // scoring ~0). This mirrors NLTK's opt-in `auto_reweigh` option, which
    // renormalizes the weights when higher-order n-grams are unavailable.
    // (NLTK's default instead returns 0 for such short hypotheses; reweighting
    // is the more useful behavior for a thresholded assertion.) A genuine
    // zero-overlap precision (n-grams exist but none match) is still kept and
    // smoothed below.
    if (totalCount === 0) {
      continue;
    }

    const candidateNGramCounts = countNGrams(candidateNGrams);

    // Clipped n-gram count against the best-matching reference
    let maxClippedCount = 0;
    for (const referenceWords of referenceWordsList) {
      const referenceNGramCounts = countNGrams(getNGrams(referenceWords, n));

      let clippedCount = 0;
      for (const [gram, count] of candidateNGramCounts) {
        clippedCount += Math.min(count, referenceNGramCounts.get(gram) ?? 0);
      }

      maxClippedCount = Math.max(maxClippedCount, clippedCount);
    }

    precisions.push(maxClippedCount / totalCount);
    usableWeights.push(weights[n - 1]);
  }

  const bp = calculateBrevityPenalty(candidateWords.length, closestRefLength);

  // Renormalize the usable weights to sum to 1 so dropping unavailable higher
  // orders does not shrink the geometric mean.
  const weightSum = usableWeights.reduce((acc, w) => acc + w, 0);

  // Apply weights and calculate final score
  const weightedScore = precisions.reduce((acc, p, i) => {
    const smoothedP = p === 0 ? 1e-7 : p; // smoothing
    return acc + (usableWeights[i] / weightSum) * Math.log(smoothedP);
  }, 0);

  return bp * Math.exp(weightedScore);
}

/**
 * Handles BLEU score assertion for promptfoo.
 * Compares output against reference(s) using BLEU metric.
 *
 * @param assertion - The assertion configuration
 * @param inverse - Whether to invert the comparison
 * @param outputString - Actual output to evaluate
 * @param renderedValue - Expected output(s)
 * @returns Result of the BLEU score comparison
 */
export function handleBleuScore({
  assertion,
  inverse,
  outputString,
  renderedValue,
}: Pick<
  AssertionParams,
  'assertion' | 'renderedValue' | 'outputString' | 'inverse'
>): GradingResult {
  invariant(
    typeof renderedValue === 'string' ||
      (Array.isArray(renderedValue) && renderedValue.every((v) => typeof v === 'string')),
    '"bleu" assertion type must have a string or array of strings value',
  );

  const threshold: number = (assertion.threshold as number) ?? 0.5;
  const references = Array.isArray(renderedValue) ? renderedValue : [renderedValue];
  const score = calculateBleuScore(outputString, references);
  const pass = score >= threshold !== inverse;

  return {
    pass,
    score: inverse ? 1 - score : score,
    reason: pass
      ? 'Assertion passed'
      : `BLEU score ${score.toFixed(4)} is ${inverse ? 'greater' : 'less'} than threshold ${threshold}`,
    assertion,
  };
}
