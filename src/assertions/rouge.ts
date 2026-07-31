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

/**
 * Computes a ROUGE-L F-score from the length of the longest common subsequence.
 *
 * js-rouge collects the LCS *tokens* into a `Set` before counting them, so a token
 * that appears more than once in the LCS is counted once — "the cat sat on the mat"
 * against itself has a 6-token LCS but scores 5/6 = 0.83. Lin (2004) defines the
 * statistic as the LCS *length*; there is no deduplication step. Taking the length
 * directly restores that.
 *
 * Scored at the sentence level over the whole token sequence, which is what a single
 * output string compared against a single reference string means. (Lin's ROUGE-Lsum,
 * the union-LCS over segmented sentences, is a different statistic and is not what
 * this assertion has ever exposed.)
 *
 * @internal
 */
function rougeLScore(candidate: string, reference: string, beta = 1): number {
  const candidateTokens = rouge.treeBankTokenize(candidate);
  const referenceTokens = rouge.treeBankTokenize(reference);
  if (candidateTokens.length === 0 || referenceTokens.length === 0) {
    return 0;
  }

  // Standard LCS dynamic program, keeping only the two rows we need.
  let previous = new Array<number>(referenceTokens.length + 1).fill(0);
  let current = new Array<number>(referenceTokens.length + 1).fill(0);
  for (let i = 1; i <= candidateTokens.length; i++) {
    for (let j = 1; j <= referenceTokens.length; j++) {
      current[j] =
        candidateTokens[i - 1] === referenceTokens[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous];
    current.fill(0);
  }
  const lcsLength = previous[referenceTokens.length];
  if (lcsLength === 0) {
    return 0;
  }

  const precision = lcsLength / candidateTokens.length;
  const recall = lcsLength / referenceTokens.length;
  return rouge.fMeasure(precision, recall, beta);
}

/**
 * Computes a ROUGE-S F-score using clipped skip-bigram counts.
 *
 * Same defect as ROUGE-L, one level up: js-rouge intersects the skip-bigram lists as
 * `Set`s, so a skip-bigram occurring twice contributes once. "the cat sat on the mat"
 * against itself yields 15 skip-bigrams of which "the mat" occurs twice, scoring
 * 14/15 = 0.93. Clipping — `min(count in candidate, count in reference)`, the same
 * treatment `rougeNScore` uses — counts each occurrence at most as often as the
 * reference supports it, so a perfect match scores 1.0.
 *
 * @internal
 */
function rougeSScore(candidate: string, reference: string, beta = 1): number {
  const candidateTokens = rouge.treeBankTokenize(candidate);
  const referenceTokens = rouge.treeBankTokenize(reference);
  // js-rouge's skipBigram throws on fewer than two tokens; no skip-bigram can exist,
  // so there is no overlap to score.
  if (candidateTokens.length < 2 || referenceTokens.length < 2) {
    return 0;
  }

  const candidateBigrams = rouge.skipBigram(candidateTokens);
  const referenceBigrams = rouge.skipBigram(referenceTokens);
  const referenceCounts = countNGrams(referenceBigrams);

  let overlap = 0;
  for (const [bigram, count] of countNGrams(candidateBigrams)) {
    overlap += Math.min(count, referenceCounts.get(bigram) ?? 0);
  }
  if (overlap === 0) {
    return 0;
  }

  const precision = overlap / candidateBigrams.length;
  const recall = overlap / referenceBigrams.length;
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

  // All three variants are computed in-house. js-rouge deduplicates matches before
  // counting them — via `Set` for the ROUGE-L LCS tokens and via a set intersection
  // for ROUGE-N/S n-grams — so a repeated token drops a perfect match below 1.0. Each
  // scorer here counts occurrences instead, per Lin (2004), and an empty input scores
  // 0 rather than throwing (js-rouge rejects empty strings, which turns a refused or
  // truncated model response into a crashed eval).
  const scorers = { n: rougeNScore, l: rougeLScore, s: rougeSScore } as const;
  const score = scorers[fnName](candidate, reference);

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
