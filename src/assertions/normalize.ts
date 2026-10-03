/**
 * Unicode normalization for string assertions.
 *
 * `equals`, `contains` and their variants compare raw strings, so an output that
 * is *correct* but differs from the expected value only in Unicode form scores 0:
 *
 *   - "café" in NFC vs the same word in NFD (e + combining acute) — visually identical
 *   - "ﬁle" with a U+FB01 ligature vs "file" — common in text extracted from PDFs
 *   - a non-breaking space (U+00A0) vs an ordinary space
 *
 * All three are false negatives. But the two families of normalization form are
 * not equally safe, and the difference matters more here than almost anywhere
 * else:
 *
 * **Canonical (NFC/NFD) is meaning-preserving.** It only composes or decomposes
 * sequences that Unicode defines as the same character. "café" written either way
 * is the same word.
 *
 * **Compatibility (NFKC/NFKD) is not.** It folds characters that merely *look*
 * related, and several of those distinctions are the answer:
 *
 * | Input | NFKC | What is lost |
 * |---|---|---|
 * | `x²`  | `x2`  | the exponent |
 * | `½`   | `1⁄2` | a single character becomes three |
 * | `Ⅳ`   | `IV`  | a Roman numeral |
 * | `①`   | `1`   | an enumeration marker |
 * | `Ａ`   | `A`   | full-width form |
 *
 * In an assertion library that asymmetry decides the default. A missed match is
 * a false negative: the run is marked failed, someone looks, and the truth comes
 * out. **A wrong answer folded into a right one is a false positive, and nobody
 * ever looks again.** `equals` with NFKC would score "x2" as a correct answer to
 * a question whose answer is "x²".
 *
 * So `normalizeUnicode: true` means **NFC** — safe, and it fixes the composition
 * case that motivated this. The compatibility forms remain available and must be
 * asked for by name, which is the point: `normalizeUnicode: 'NFKC'` is a
 * deliberate statement that in *this* comparison, a superscript two and a two are
 * the same answer.
 *
 * Normalization changes form, never wording. "$8.540" and "$9.540" are different
 * strings under every setting.
 */

/** Unicode normalization forms, as accepted by `String.prototype.normalize`. */
export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

/**
 * What an assertion's `normalizeUnicode` may be set to.
 *
 * `true` is a synonym for `'NFC'` rather than for `'NFKC'`: see above.
 */
export type NormalizeUnicodeOption = boolean | NormalizationForm;

export const DEFAULT_NORMALIZATION_FORM: NormalizationForm = 'NFC';

export function normalizeForComparison(
  text: string,
  normalizeUnicode?: NormalizeUnicodeOption,
): string {
  if (!normalizeUnicode) {
    return text;
  }
  const form = normalizeUnicode === true ? DEFAULT_NORMALIZATION_FORM : normalizeUnicode;
  return text.normalize(form);
}
