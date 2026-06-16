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

  it('does not split decimals', () => {
    expect(splitTextIntoSentences('Pi is about 3.14 in value. It is irrational.')).toEqual([
      'Pi is about 3.14 in value.',
      'It is irrational.',
    ]);
  });

  it('treats text with two or more non-empty lines as pre-segmented (one unit per line)', () => {
    // No abbreviation mis-splits ("i.e.") and no collapsing of multi-sentence lines.
    expect(splitTextIntoSentences('All employees i.e. engineers.\nThey get leave.')).toEqual([
      'All employees i.e. engineers.',
      'They get leave.',
    ]);
    expect(splitTextIntoSentences('Line one.\n\n\nLine two.')).toEqual(['Line one.', 'Line two.']);
  });

  it('drops bare enumeration markers stranded from an inline numbered list', () => {
    // Sentence-splitting "1. Paris ... 2. France ..." strands the "1." / "2."
    // markers as their own segments; counting them would inflate sentence-level
    // metrics (e.g. the RAGAS context-relevance numerator). Only real units remain.
    expect(splitTextIntoSentences('1. Paris is the capital. 2. France is in Europe.')).toEqual([
      'Paris is the capital.',
      'France is in Europe.',
    ]);
    // A `)`-style marker on a sentence boundary is likewise dropped when stranded.
    expect(splitTextIntoSentences('1. First fact. 2. Second fact.')).toEqual([
      'First fact.',
      'Second fact.',
    ]);
  });

  it('keeps numbers that are part of a sentence, not bare markers', () => {
    // A decimal or a number embedded in prose is content, never a stray marker.
    expect(splitTextIntoSentences('Pi is 3.14 here. There are 42 items.')).toEqual([
      'Pi is 3.14 here.',
      'There are 42 items.',
    ]);
  });

  it('returns an empty array for empty or whitespace-only text', () => {
    expect(splitTextIntoSentences('')).toEqual([]);
    expect(splitTextIntoSentences('   \n  \n ')).toEqual([]);
  });
});
