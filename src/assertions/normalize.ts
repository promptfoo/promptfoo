/**
 * Unicode normalization for string assertions.
 *
 * `equals`, `contains` and their variants compare raw strings, so an output that
 * is *correct* but differs from the expected value only in Unicode form scores 0.
 * These are all false negatives:
 *
 *   - "café" in NFC vs the same word in NFD (e + combining acute) — visually identical
 *   - "ﬁle" with a U+FB01 ligature vs "file" — common in text extracted from PDFs
 *   - a non-breaking space (U+00A0) vs an ordinary space
 *
 * NFKC folds all three. It is deliberately *not* applied by default: changing the
 * meaning of an existing assertion silently would be worse than the bug.
 *
 * This normalizes form only — it never relaxes wording. "$8.540" and "$9.540"
 * remain different strings under every setting.
 */
export function normalizeForComparison(text: string, normalizeUnicode?: boolean): string {
  return normalizeUnicode ? text.normalize('NFKC') : text;
}
