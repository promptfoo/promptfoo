import { describe, expect, it } from 'vitest';
import { splitIntoSentences, splitTextIntoSentences } from '../../src/matchers/shared';

describe('splitIntoSentences', () => {
  it('splits on newlines and drops blank lines', () => {
    expect(splitIntoSentences('a\n\nb\n  \nc')).toEqual(['a', 'b', 'c']);
  });

  it('treats a single prose paragraph as one unit (newline-only behavior)', () => {
    expect(splitIntoSentences('One. Two. Three.')).toEqual(['One. Two. Three.']);
  });

  it('does not sentence-split a numbered list (markers stay attached to their line)', () => {
    expect(splitIntoSentences('1. Paris is the capital.\n2. France is in Europe.')).toEqual([
      '1. Paris is the capital.',
      '2. France is in Europe.',
    ]);
  });
});

describe('splitTextIntoSentences', () => {
  it('segments a single prose paragraph on sentence boundaries', () => {
    expect(
      splitTextIntoSentences('Paris is the capital of France. France is in Europe. Nice weather.'),
    ).toEqual(['Paris is the capital of France.', 'France is in Europe.', 'Nice weather.']);
  });

  it('is unaffected by an incidental leading/trailing newline (regression for the prose fix)', () => {
    const expected = ['Paris is the capital of France.', 'France is in Europe.'];
    expect(
      splitTextIntoSentences('Paris is the capital of France. France is in Europe.\n'),
    ).toEqual(expected);
    expect(
      splitTextIntoSentences('\nParis is the capital of France. France is in Europe.'),
    ).toEqual(expected);
    expect(
      splitTextIntoSentences('Paris is the capital of France. France is in Europe.\r\n'),
    ).toEqual(expected);
  });

  it('splits ! and ? boundaries', () => {
    expect(splitTextIntoSentences('Really? Yes! Absolutely.')).toEqual([
      'Really?',
      'Yes!',
      'Absolutely.',
    ]);
  });

  it('trims leading/trailing whitespace on a single-line prose input before splitting', () => {
    expect(
      splitTextIntoSentences('   Paris is the capital of France. France is in Europe.   '),
    ).toEqual(['Paris is the capital of France.', 'France is in Europe.']);
  });

  it('does not split decimals', () => {
    expect(splitTextIntoSentences('Pi is about 3.14 in value. It is irrational.')).toEqual([
      'Pi is about 3.14 in value.',
      'It is irrational.',
    ]);
  });

  it('does not split when a decimal appears at the end of text', () => {
    expect(splitTextIntoSentences('The value is 3.14.')).toEqual(['The value is 3.14.']);
  });

  it('treats text with two or more non-empty lines as pre-segmented (one unit per line)', () => {
    // No abbreviation mis-splits ("i.e.") and no collapsing of multi-sentence lines.
    expect(splitTextIntoSentences('All employees i.e. engineers.\nThey get leave.')).toEqual([
      'All employees i.e. engineers.',
      'They get leave.',
    ]);
    expect(splitTextIntoSentences('Line one.\n\n\nLine two.')).toEqual(['Line one.', 'Line two.']);
  });

  it('returns an empty array for empty or whitespace-only text', () => {
    expect(splitTextIntoSentences('')).toEqual([]);
    expect(splitTextIntoSentences('   \n  \n ')).toEqual([]);
  });
});
