import * as rouge from 'js-rouge';
import invariant from '../util/invariant';
import { countNGrams } from './ngrams';

import type { AssertionParams, GradingResult } from '../types/index';

// Keep ROUGE-N's whole-text tokenization. js-rouge's scorers split sentences first,
// which changes punctuation tokens in existing rouge-n assertions.
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

  // js-rouge rejects blank text, including NEXT LINE (which trim does not remove).
  let score = 0;
  if (!/^[\s\u0085]*$/u.test(outputString) && !/^[\s\u0085]*$/u.test(renderedValue)) {
    // Segment L/S text before folding case to preserve sentence boundaries.
    score =
      fnName === 'n'
        ? rougeNScore(outputString.toLowerCase(), renderedValue.toLowerCase())
        : rouge[fnName](outputString, renderedValue, { caseSensitive: false });
  }

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
