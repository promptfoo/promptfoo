import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

import type { AssertionParams } from '../../src/types/index';

vi.mock('natural', () => ({
  PorterStemmer: {
    stem(word: string) {
      const stems: Record<string, string> = { cats: 'cat', running: 'run' };
      return stems[word] ?? word;
    },
  },
  WordNet: class {
    lookup(word: string, callback: (records: { synonyms: string[] }[]) => void) {
      const synonyms: Record<string, string[]> = {
        feline: ['cat', 'house_cat'],
        canine: ['dog'],
      };
      callback(synonyms[word] ? [{ synonyms: synonyms[word] }] : []);
    }
  },
}));

function score(outputString: string, renderedValue: string | string[], inverse = false) {
  return handleMeteorAssertion({
    assertion: { type: 'meteor', threshold: 0.5 },
    outputString,
    renderedValue,
    inverse,
  } as AssertionParams);
}

describe('METEOR matching with the real handler', () => {
  // Prime the lazy mock before the multiple-reference case can import it concurrently.
  beforeAll(() => score('cat', 'cat'));

  it.each([
    ['exact', 'cat dog cat'],
    ['stem', 'cats dog cats'],
    ['synonym', 'feline dog feline'],
  ])('consumes each reference once and retains reverse %s matching order', async (_, output) => {
    const result = await score(output, 'cat dog');

    // Two matches in separate chunks: F-mean 20/21, fragmentation penalty 1/2.
    expect(result.score).toBeCloseTo(10 / 21, 12);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('METEOR score 0.4762 did not meet threshold 0.5');
  });

  it('combines stem and synonym matches using the original token positions', async () => {
    const result = await score('cats running canine', 'cat run dog');

    // Three consecutive matches form one chunk: score = 1 - 0.5 * (1/3)^3.
    expect(result.score).toBeCloseTo(53 / 54, 12);
    expect(result.pass).toBe(true);
  });

  it('excludes multiword WordNet synonyms containing underscores', async () => {
    const result = await score('feline', 'house_cat');

    expect(result.score).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('chooses the best reference after all matching stages', async () => {
    const result = await score('cats running canine', ['unrelated', 'cat run dog']);

    expect(result.score).toBeCloseTo(53 / 54, 12);
    expect(result.pass).toBe(true);
  });

  it('inverts the computed score and threshold result', async () => {
    const result = await score('feline dog feline', 'cat dog', true);

    expect(result.score).toBeCloseTo(11 / 21, 12);
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('METEOR assertion passed');
  });
});
