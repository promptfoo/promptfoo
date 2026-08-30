import { describe, expect, it } from 'vitest';
import { normalizeForComparison } from '../../src/assertions/normalize';

describe('normalizeForComparison', () => {
  it('leaves text untouched when the option is off', () => {
    // Default behaviour must be byte-for-byte unchanged.
    const nfd = 'café';
    expect(normalizeForComparison(nfd)).toBe(nfd);
    expect(normalizeForComparison(nfd, false)).toBe(nfd);
  });

  it('folds NFC and NFD to the same string', () => {
    const nfc = 'café'; // café, precomposed
    const nfd = 'café'; // café, e + combining acute
    expect(nfc).not.toBe(nfd);
    expect(normalizeForComparison(nfc, true)).toBe(normalizeForComparison(nfd, true));
  });

  it('expands ligatures', () => {
    // U+FB01 appears routinely in text extracted from PDFs.
    expect(normalizeForComparison('ﬁle', true)).toBe('file');
  });

  it('folds a non-breaking space to an ordinary space', () => {
    expect(normalizeForComparison('2 items', true)).toBe('2 items');
  });

  it('never relaxes wording', () => {
    // The point of an exact assertion survives: normalization changes form, not
    // meaning. A changed digit is still a different string.
    expect(normalizeForComparison('$8.540', true)).not.toBe(normalizeForComparison('$9.540', true));
    expect(normalizeForComparison('Paris', true)).not.toBe(normalizeForComparison('paris', true));
  });
});
