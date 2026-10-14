/** Normalize string comparisons only when requested; true selects canonical NFC. */
export function normalizeForComparison(
  text: string,
  normalizeUnicode?: boolean | 'NFC' | 'NFD' | 'NFKC' | 'NFKD',
): string {
  if (!normalizeUnicode) {
    return text;
  }
  return text.normalize(normalizeUnicode === true ? 'NFC' : normalizeUnicode);
}
