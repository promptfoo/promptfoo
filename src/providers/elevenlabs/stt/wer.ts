/**
 * Word Error Rate (WER) Calculation
 *
 * WER is a common metric for evaluating the accuracy of speech recognition systems.
 * It measures the minimum number of word-level edits (substitutions, deletions, insertions)
 * needed to transform the hypothesis (transcription) into the reference (ground truth).
 *
 * WER = (S + D + I) / N
 * where:
 *   S = number of substitutions
 *   D = number of deletions
 *   I = number of insertions
 *   N = total number of words in reference
 *
 * Lower WER is better (0 = perfect transcription, 1+ = very poor)
 */

import type { WERResult } from './types';

/**
 * Calculate Word Error Rate between reference and hypothesis
 */
export function calculateWER(reference: string, hypothesis: string): WERResult {
  // Normalize text: lowercase, trim, split into words
  const refWords = normalizeText(reference);
  const hypWords = normalizeText(hypothesis);

  const { distance, substitutions, deletions, insertions, correct, alignment } = alignWords(
    refWords,
    hypWords,
  );

  const totalWords = refWords.length;
  const wer = totalWords > 0 ? distance / totalWords : 0;

  return {
    wer,
    substitutions,
    deletions,
    insertions,
    correct,
    totalWords,
    details: {
      reference: refWords.join(' '),
      hypothesis: hypWords.join(' '),
      alignment,
    },
  };
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\s_]/gu, '') // Remove punctuation, keeping non-ASCII letters
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/** Minimum word edits for each pair of reference and hypothesis prefixes. */
function getEditDistances(ref: string[], hyp: string[]): number[][] {
  const distances = [Array.from({ length: hyp.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= ref.length; i++) {
    const previous = distances[i - 1];
    const row = new Array<number>(hyp.length + 1);
    row[0] = i;
    for (let j = 1; j <= hyp.length; j++) {
      row[j] =
        ref[i - 1] === hyp[j - 1]
          ? previous[j - 1]
          : 1 + Math.min(previous[j - 1], previous[j], row[j - 1]);
    }
    distances.push(row);
  }
  return distances;
}

function alignWords(ref: string[], hyp: string[]) {
  const distances = getEditDistances(ref, hyp);
  const counts = { C: 0, S: 0, D: 0, I: 0 };
  const refLine: string[] = [];
  const hypLine: string[] = [];
  const opLine: string[] = [];
  let i = ref.length;
  let j = hyp.length;

  // Trace backwards. On ties, prefer substitution to deletion, then insertion.
  while (i > 0 || j > 0) {
    const match = ref[i - 1] === hyp[j - 1];
    let op: keyof typeof counts;
    if (i > 0 && j > 0 && (match || distances[i][j] === distances[i - 1][j - 1] + 1)) {
      op = match ? 'C' : 'S';
    } else if (i > 0 && distances[i][j] === distances[i - 1][j] + 1) {
      op = 'D';
    } else {
      op = 'I';
    }

    counts[op]++;
    const refWord = op === 'I' ? '' : ref[--i];
    const hypWord = op === 'D' ? '' : hyp[--j];
    const width = Math.max(refWord.length, hypWord.length);
    refLine.push(op === 'I' ? '*'.repeat(width) : refWord.padEnd(width));
    hypLine.push(op === 'D' ? '*'.repeat(width) : hypWord.padEnd(width));
    opLine.push((op === 'C' ? ' ' : op).repeat(width));
  }

  return {
    distance: distances[ref.length][hyp.length],
    substitutions: counts.S,
    deletions: counts.D,
    insertions: counts.I,
    correct: counts.C,
    alignment: [
      `REF: ${refLine.reverse().join(' ')}`,
      `HYP: ${hypLine.reverse().join(' ')}`,
      `OPS: ${opLine.reverse().join(' ')}`,
    ].join('\n'),
  };
}
