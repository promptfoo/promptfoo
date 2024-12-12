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
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

/**
 * Generates n-grams from an array of words
 *
 * @param words - Array of words to generate n-grams from
 * @param n - Length of each n-gram
 * @returns Array of n-grams as strings
 * @internal
 */
function getNGrams(words: string[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Calculates the brevity penalty for BLEU score.
 * Penalizes translations that are shorter than the reference.
 *
 * @param candidateLength - Length of candidate translation
 * @param referenceLength - Length of reference translation
 * @returns Brevity penalty score between 0 and 1
 * @internal
 */
function calculateBrevityPenalty(candidateLength: number, referenceLength: number): number {
  if (candidateLength > referenceLength) {
    return 1;
  }
  return Math.exp(1 - candidateLength / referenceLength);
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

  const candidateWords = candidate.toLowerCase().trim().split(/\s+/);

  // Find reference with closest length to candidate
  const refLengths = references.map((ref) => ref.toLowerCase().trim().split(/\s+/).length);
  const closestRefLength = refLengths.reduce((prev, curr) =>
    Math.abs(curr - candidateWords.length) < Math.abs(prev - candidateWords.length) ? curr : prev,
  );

  const maxN = 4;
  const precisions: number[] = [];

  for (let n = 1; n <= maxN; n++) {
    const candidateNGrams = getNGrams(candidateWords, n);
    let maxClippedCount = 0;
    const totalCount = candidateNGrams.length;

    // Calculate n-gram matches against each reference
    for (const reference of references) {
      const referenceWords = reference.toLowerCase().trim().split(/\s+/);
      const referenceNGrams = getNGrams(referenceWords, n);

      const candidateNGramCounts = new Map<string, number>();
      const referenceNGramCounts = new Map<string, number>();

      for (const gram of referenceNGrams) {
        referenceNGramCounts.set(gram, (referenceNGramCounts.get(gram) || 0) + 1);
      }

      for (const gram of candidateNGrams) {
        candidateNGramCounts.set(gram, (candidateNGramCounts.get(gram) || 0) + 1);
      }

      let clippedCount = 0;

      for (const [gram, count] of candidateNGramCounts.entries()) {
        const refCount = referenceNGramCounts.get(gram) || 0;
        clippedCount += Math.min(count, refCount);
      }

      // Take the maximum clipped count across all references
      maxClippedCount = Math.max(maxClippedCount, clippedCount);
    }

    const precision = totalCount > 0 ? maxClippedCount / totalCount : 0;
    precisions.push(precision);
  }

  const bp = calculateBrevityPenalty(candidateWords.length, closestRefLength);

  // Apply weights and calculate final score
  const weightedScore = precisions.reduce((acc, p, i) => {
    const smoothedP = p === 0 ? 1e-7 : p; // smoothing
    return acc + weights[i] * Math.log(smoothedP);
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

  const threshold = assertion.threshold ?? 0.5;
  const references = Array.isArray(renderedValue) ? renderedValue : [renderedValue];
  const score = calculateBleuScore(outputString, references);
  const pass = score >= threshold !== inverse;

  return {
    pass,
    score: inverse ? 1 - score : score,
    reason: pass
      ? 'Assertion passed'
      : `BLEU score ${score.toFixed(2)} is ${inverse ? 'greater' : 'less'} than threshold ${threshold}`,
    assertion,
  };
}
