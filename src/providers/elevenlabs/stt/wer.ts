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

  // Calculate edit distance with traceback
  const { distance, operations } = levenshteinDistance(refWords, hypWords);

  // Count operation types
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let correct = 0;

  for (const op of operations) {
    switch (op) {
      case 'S':
        substitutions++;
        break;
      case 'D':
        deletions++;
        break;
      case 'I':
        insertions++;
        break;
      case 'C':
        correct++;
        break;
    }
  }

  const totalWords = refWords.length;
  const wer = totalWords > 0 ? distance / totalWords : 0;

  // Generate alignment visualization
  const alignment = generateAlignment(refWords, hypWords, operations);

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
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Calculate Levenshtein distance with operation traceback
 */
function levenshteinDistance(
  ref: string[],
  hyp: string[],
): { distance: number; operations: string[] } {
  const m = ref.length;
  const n = hyp.length;

  // Create DP matrix
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  // Create traceback matrix
  const traceback: string[][] = Array(m + 1)
    .fill('')
    .map(() => Array(n + 1).fill(''));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
    traceback[i][0] = 'D'; // Deletion
  }

  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
    traceback[0][j] = 'I'; // Insertion
  }

  traceback[0][0] = 'C'; // Start

  // Fill DP matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        // Match (correct)
        dp[i][j] = dp[i - 1][j - 1];
        traceback[i][j] = 'C';
      } else {
        // Find minimum cost operation
        const substitution = dp[i - 1][j - 1] + 1;
        const deletion = dp[i - 1][j] + 1;
        const insertion = dp[i][j - 1] + 1;

        const minCost = Math.min(substitution, deletion, insertion);
        dp[i][j] = minCost;

        if (minCost === substitution) {
          traceback[i][j] = 'S'; // Substitution
        } else if (minCost === deletion) {
          traceback[i][j] = 'D'; // Deletion
        } else {
          traceback[i][j] = 'I'; // Insertion
        }
      }
    }
  }

  // Reconstruct operations from traceback
  const operations: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    const op = traceback[i][j];
    operations.unshift(op);

    if (op === 'C' || op === 'S') {
      i--;
      j--;
    } else if (op === 'D') {
      i--;
    } else if (op === 'I') {
      j--;
    } else {
      break;
    }
  }

  return {
    distance: dp[m][n],
    operations,
  };
}

/**
 * Generate alignment visualization
 */
function generateAlignment(ref: string[], hyp: string[], operations: string[]): string {
  const refLine: string[] = [];
  const hypLine: string[] = [];
  const opLine: string[] = [];

  let refIdx = 0;
  let hypIdx = 0;

  for (const op of operations) {
    switch (op) {
      case 'C': {
        // Correct
        const word = ref[refIdx];
        const maxLen = Math.max(word.length, hyp[hypIdx].length);
        refLine.push(word.padEnd(maxLen));
        hypLine.push(hyp[hypIdx].padEnd(maxLen));
        opLine.push(' '.repeat(maxLen));
        refIdx++;
        hypIdx++;
        break;
      }

      case 'S': {
        // Substitution
        const refWord = ref[refIdx];
        const hypWord = hyp[hypIdx];
        const maxLen = Math.max(refWord.length, hypWord.length);
        refLine.push(refWord.padEnd(maxLen));
        hypLine.push(hypWord.padEnd(maxLen));
        opLine.push('S'.repeat(maxLen));
        refIdx++;
        hypIdx++;
        break;
      }

      case 'D': {
        // Deletion
        const word = ref[refIdx];
        refLine.push(word);
        hypLine.push('*'.repeat(word.length));
        opLine.push('D'.repeat(word.length));
        refIdx++;
        break;
      }

      case 'I': {
        // Insertion
        const word = hyp[hypIdx];
        refLine.push('*'.repeat(word.length));
        hypLine.push(word);
        opLine.push('I'.repeat(word.length));
        hypIdx++;
        break;
      }
    }
  }

  return [
    `REF: ${refLine.join(' ')}`,
    `HYP: ${hypLine.join(' ')}`,
    `OPS: ${opLine.join(' ')}`,
  ].join('\n');
}
