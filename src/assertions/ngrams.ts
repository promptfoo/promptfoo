/**
 * Utility function to generate contiguous n-grams from an array of words.
 *
 * @param words - Array of words.
 * @param n - The n-gram length.
 * @returns An array of n-grams, each represented as a string.
 */

export function getNGrams(words: string[], n: number): string[] {
  // Return empty array for invalid n values
  if (n <= 0 || n > words.length) {
    return [];
  }

  const ngrams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}
