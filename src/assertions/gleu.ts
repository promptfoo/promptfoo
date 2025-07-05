import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';
import { getNGrams } from './ngrams';

/**
 * Calculates the Google-BLEU (GLEU) score for a candidate string against reference strings.
 *
 * GLEU is a variant of BLEU that shows better correlation with human judgments on sentence-level
 * evaluation. It calculates n-gram matches between the candidate and reference texts.
 *
 * For the GLEU score, we record all sub-sequences of 1, 2, 3 or 4 tokens in output and target sequence.
 * We then compute:
 * - Precision: the ratio of matching n-grams to total n-grams in the generated output sequence
 * - Recall: the ratio of matching n-grams to total n-grams in the target (ground truth) sequence
 *
 * The GLEU score is the minimum of precision and recall.
 *
 * For multiple references, we calculate the GLEU score against each reference and return the maximum score.
 * This reflects the intuition that if the candidate matches well with any of the valid references,
 * it should be considered a good translation.
 *
 * Implementation details:
 * - n-grams from n=1 to n=4 are considered by default
 * - The calculation is case-insensitive
 * - Identical strings will always receive a score of 1
 * - If there are no n-grams in common, the score will be 0
 *
 * @param candidate - The string to evaluate
 * @param references - Array of reference strings to compare against
 * @param minN - Minimum n-gram length to consider (default: 1)
 * @param maxN - Maximum n-gram length to consider (default: 4)
 * @returns GLEU score between 0 and 1, where higher scores indicate better matches
 * @throws When candidate or references are invalid
 */
export function calculateGleuScore(
  candidate: string,
  references: string[],
  minN: number = 1,
  maxN: number = 4,
): number {
  if (!candidate || references.length === 0) {
    throw new Error('Invalid inputs');
  }

  const candidateWords = candidate
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/\.+$/, ''));

  // For each reference, calculate a GLEU score and later take the maximum
  const referenceScores = references.map((reference) => {
    const referenceWords = reference
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/\.+$/, ''));

    // For identical strings, return 1 directly
    if (
      candidateWords.length === referenceWords.length &&
      candidateWords.every((word, idx) => word === referenceWords[idx])
    ) {
      return 1;
    }

    // Initialize counters for all n-grams
    let matchCount = 0;
    let candidateTotal = 0;
    let referenceTotal = 0;

    // Consider all n-gram orders from minN to maxN
    for (let n = minN; n <= maxN; n++) {
      // Get n-grams from both texts
      const candidateNGrams = getNGrams(candidateWords, n);
      const referenceNGrams = getNGrams(referenceWords, n);

      // For brevity in calculations, we'll process based on the unique n-grams
      // and their occurrence counts in each text
      const candidateNGramCounts = new Map<string, number>();
      const referenceNGramCounts = new Map<string, number>();

      // Count occurrences of each n-gram in candidate
      for (const gram of candidateNGrams) {
        candidateNGramCounts.set(gram, (candidateNGramCounts.get(gram) || 0) + 1);
      }

      // Count occurrences of each n-gram in reference
      for (const gram of referenceNGrams) {
        referenceNGramCounts.set(gram, (referenceNGramCounts.get(gram) || 0) + 1);
      }

      // Calculate matching n-grams - we'll count each n-gram match the minimum number
      // of times it appears in both the candidate and reference
      for (const [gram, candidateCount] of candidateNGramCounts.entries()) {
        const referenceCount = referenceNGramCounts.get(gram) || 0;
        // Only count the minimum number of times the n-gram appears in both texts
        matchCount += Math.min(candidateCount, referenceCount);
      }

      // Update total n-gram counts
      candidateTotal += candidateNGrams.length;
      referenceTotal += referenceNGrams.length;
    }

    // If either text has no n-grams of the specified lengths, return 0
    if (candidateTotal === 0 || referenceTotal === 0) {
      return 0;
    }

    // Calculate precision and recall
    const precision = matchCount / candidateTotal;
    const recall = matchCount / referenceTotal;

    // GLEU is the minimum of precision and recall
    return Math.min(precision, recall);
  });

  // Return the maximum score across all references
  return Math.max(...referenceScores);
}

/**
 * Handles GLEU (Google-BLEU) score calculation and evaluation for assertions.
 * GLEU is a variant of BLEU that correlates better with human judgments on sentence-level evaluation.
 *
 * Use cases for GLEU:
 * - For sentence-level evaluation where BLEU might give unintuitive results
 * - When you want to balance both precision and recall in your evaluation
 * - When working with multiple valid references
 * - When human correlation is particularly important
 *
 * @param {AssertionParams} params - The parameters for GLEU score evaluation
 * @param {Object} params.assertion - The assertion configuration object
 * @param {boolean} params.inverse - Whether to invert the pass condition
 * @param {string} params.outputString - The candidate string to evaluate
 * @param {string|string[]} params.renderedValue - The reference string(s) to compare against
 * @param {string} params.provider - The provider name (unused)
 * @param {Object} params.test - The test case data (unused)
 * @returns {GradingResult} Object containing:
 *   - pass: boolean indicating if assertion passed
 *   - score: GLEU score (0-1)
 *   - reason: explanation of the result
 *   - assertion: original assertion config
 * @throws {Error} If renderedValue is not a string or array of strings
 */
export function handleGleuScore({
  assertion,
  inverse,
  outputString,
  renderedValue,
  provider,
  test,
}: AssertionParams): GradingResult {
  // Validate inputs
  invariant(
    typeof renderedValue === 'string' ||
      (Array.isArray(renderedValue) && renderedValue.every((v) => typeof v === 'string')),
    '"gleu" assertion must have a string or array of strings value',
  );

  const threshold = assertion.threshold ?? 0.5;
  const references = Array.isArray(renderedValue) ? renderedValue : [renderedValue];
  const score = calculateGleuScore(outputString, references);
  const pass = score >= threshold !== inverse;

  return {
    pass,
    score: inverse ? 1 - score : score,
    reason: pass
      ? 'Assertion passed'
      : `GLEU score ${score.toFixed(4)} is ${inverse ? 'greater' : 'less'} than threshold ${threshold}`,
    assertion,
  };
}
