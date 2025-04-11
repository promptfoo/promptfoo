import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';
import { getNGrams } from './ngrams';


/**
 * Calculates the Google-BLEU (GLEU) score for a candidate string against reference strings.
 * 
 * GLEU is a variant of BLEU that shows better correlation with human judgments on sentence-level
 * evaluation. It calculates n-gram matches between the candidate and reference texts.
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
  maxN: number = 4
): number {
  if (!candidate || references.length === 0) {
    throw new Error('Invalid inputs');
  }

  const candidateWords = candidate.toLowerCase().trim().split(/\s+/).map(word => word.replace(/\.+$/, ''));
  
  // For each reference, calculate a GLEU score and later take the maximum
  const referenceScores = references.map(reference => {
    const referenceWords = reference.toLowerCase().trim().split(/\s+/).map(word => word.replace(/\.+$/, ''));
    
    // Initialize counters for all n-grams
    let matchCount = 0;
    let candidateTotal = 0;
    let referenceTotal = 0;
    
    // Consider all n-gram orders from 1 to maxN
    for (let n = minN; n <= maxN; n++) {
      
      // Get n-grams from both texts
      const candidateNGrams = getNGrams(candidateWords, n); // calculate the n-gram for candidate words list. 
      const referenceNGrams = getNGrams(referenceWords, n); // calculate the n-gram for this specific list generated reference words.   
      
      // Count occurrences of each n-gram
      const candidateNGramCounts = new Map<string, number>();
      const referenceNGramCounts = new Map<string, number>();
      
      for (const gram of candidateNGrams) { // Calculate the count of each element in the candidate n-gram string. 
        candidateNGramCounts.set(gram, (candidateNGramCounts.get(gram) || 0) + 1);
      }
      
      for (const gram of referenceNGrams) { // Calculate the count of each element in the reference n-gram string
          referenceNGramCounts.set(gram, (referenceNGramCounts.get(gram) || 0) + 1);
      }
      
      // Calculate matching n-grams 
      for (const [gram, candidateCount] of candidateNGramCounts.entries()) { //
        const referenceCount = referenceNGramCounts.get(gram) || 0; // calculate the count of matching elements from the candidate n-gram string & the reference n-gram string. 
        matchCount += Math.min(candidateCount, referenceCount);  
      }
      
      // Update totals elements.
      candidateTotal += candidateNGrams.length;
      referenceTotal += referenceNGrams.length;
    }
    
    // Calculate GLEU as (matches) / max(candidate_total, reference_total) to reduce the number of division operations. 
    const denominator = Math.max(candidateTotal, referenceTotal);
    return denominator > 0 ? matchCount / denominator : 0;
  });
  
  // Return the maximum score across all references
  return Math.max(...referenceScores);
}

/**
 * Handles GLEU (Google-BLEU) score calculation and evaluation for assertions.
 * GLEU is a variant of BLEU that correlates better with human judgments on sentence-level evaluation.
 * 
 * @param {Object} params - The parameters for GLEU score evaluation
 * @param {Object} params.assertion - The assertion configuration object
 * @param {boolean} params.inverse - Whether to invert the pass condition
 * @param {string} params.outputString - The candidate string to evaluate
 * @param {string|string[]} params.renderedValue - The reference string(s) to compare against
 * @param {string} params.provider - The provider name (unused)
 * @param {Object} params.test - The test case data (unused)
 * @returns {GradingResult} Object containing:
 *   - pass: boolean indicating if assertion passed
 *   - score: normalized GLEU score (0-1)
 *   - reason: explanation of the result
 *   - assertion: original assertion config
 * @throws {Error} If renderedValue is not a string or array of strings
 */

export function handleGleuScore({
  assertion,
  inverse,
  outputString,
  renderedValue,
  provider, // Use if your assertion needs provider-specific logic
  test,     // Access to test case data
}: AssertionParams): GradingResult {
  // Validate inputs
  invariant(
    typeof renderedValue === 'string' ||
    (Array.isArray(renderedValue) && renderedValue.every((v) => typeof v === 'string')),
    '"gleu" assertion must have a string or array of strings value'
  );

  const threshold = assertion.threshold ?? 0.5;
  const references = Array.isArray(renderedValue) ? renderedValue : [renderedValue];
  const score = calculateGleuScore(outputString, references);
  const pass = (score >= threshold) !== inverse;

  return {
    pass,
    score: inverse ? 1 - score : score,
    reason: pass
      ? 'Assertion passed'
      : `GLEU score ${score.toFixed(2)} is ${inverse ? 'greater' : 'less'} than threshold ${threshold}`,
    assertion,
  };
}