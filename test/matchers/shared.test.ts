import { describe, expect, it } from 'vitest';
import {
  detectSentenceSegmentMode,
  splitIntoSentences,
  splitTextIntoSentences,
} from '../../src/matchers/shared';

describe('splitIntoSentences', () => {
  it('splits on newlines and drops blank lines', () => {
    expect(splitIntoSentences('a\n\nb\n  \nc')).toEqual(['a', 'b', 'c']);
  });

  it('treats a single prose paragraph as one unit (newline-only behavior)', () => {
    expect(splitIntoSentences('One. Two. Three.')).toEqual(['One. Two. Three.']);
  });
});

describe('detectSentenceSegmentMode', () => {
  it('treats a single prose line as prose', () => {
    expect(detectSentenceSegmentMode('One. Two. Three.')).toBe('prose');
  });

  it('treats prose with only an incidental trailing newline as prose', () => {
    expect(detectSentenceSegmentMode('One. Two. Three.\n')).toBe('prose');
    expect(detectSentenceSegmentMode('\nOne. Two. Three.')).toBe('prose');
    expect(detectSentenceSegmentMode('One. Two. Three.\r\n')).toBe('prose');
  });

  it('treats text with two or more non-empty lines as pre-segmented', () => {
    expect(detectSentenceSegmentMode('Line one.\nLine two.')).toBe('lines');
    expect(detectSentenceSegmentMode('Line one.\n\n\nLine two.')).toBe('lines');
  });

  it('treats empty/whitespace-only text as prose', () => {
    expect(detectSentenceSegmentMode('')).toBe('prose');
    expect(detectSentenceSegmentMode('   \n  ')).toBe('prose');
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

  it('treats multi-line text as pre-segmented (one unit per line, no abbreviation mis-splits)', () => {
    expect(splitTextIntoSentences('All employees i.e. engineers.\nThey get leave.')).toEqual([
      'All employees i.e. engineers.',
      'They get leave.',
    ]);
  });

  it('returns an empty array for empty or whitespace-only text', () => {
    expect(splitTextIntoSentences('')).toEqual([]);
    expect(splitTextIntoSentences('   \n  \n ')).toEqual([]);
  });

  it('honors an explicit mode override', () => {
    // Forcing prose mode on multi-line text splits each line on sentence boundaries.
    expect(splitTextIntoSentences('A. B.\nC. D.', 'prose')).toEqual(['A.', 'B.', 'C.', 'D.']);
    // Forcing lines mode on a single prose block keeps it as one unit.
    expect(splitTextIntoSentences('A. B. C.', 'lines')).toEqual(['A. B. C.']);
  });
});
