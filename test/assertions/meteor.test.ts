import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('natural', () => {
  const stems: Record<string, string> = {
    sat: 'sit',
    sitting: 'sit',
  };

  return {
    PorterStemmer: {
      stem: (token: string) => stems[token] ?? token,
    },
    WordNet: class {
      lookup(_word: string, callback: (results: { synonyms: string[] }[]) => void) {
        callback([]);
      }
    },
  };
});

import { handleMeteorAssertion } from '../../src/assertions/meteor';

// Exercise the real handler while mocking only its external NLP boundary. The focused
// natural-package integration test lives in meteor.integration.test.ts so the full behavior
// matrix does not repeatedly load WordNet's dictionary on every supported platform.
function meteor(opts: {
  output: string;
  value: string | string[];
  threshold?: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
  inverse?: boolean;
}) {
  const { output, value, inverse = false, threshold, alpha, beta, gamma } = opts;
  const type: 'meteor' | 'not-meteor' = inverse ? 'not-meteor' : 'meteor';
  const assertion = { type, value, threshold, alpha, beta, gamma };

  return handleMeteorAssertion({
    assertion,
    renderedValue: value,
    outputString: output,
    inverse,
  });
}

describe('handleMeteorAssertion', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('scoring', () => {
    it('scores case-only differences near 1 and passes', async () => {
      const result = await meteor({
        output: 'THE CAT SAT ON THE MAT',
        value: 'the cat sat on the mat',
      });
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0.95);
      expect(result.reason).toBe('METEOR assertion passed');
    });

    it('ignores trailing punctuation', async () => {
      const result = await meteor({
        output: 'The cat sat on the mat.',
        value: 'The cat sat on the mat',
      });
      expect(result.score).toBeGreaterThan(0.95);
      expect(result.pass).toBe(true);
    });

    it('scores stem-similar text moderately high', async () => {
      const result = await meteor({
        output: 'The cat is sitting on the mat',
        value: 'The cat sat on the mat',
      });
      expect(result.score).toBeGreaterThan(0.6);
      expect(result.score).toBeLessThan(1);
      expect(result.pass).toBe(true);
    });

    it('scores fully disjoint text at 0', async () => {
      const result = await meteor({
        output: 'a feline walks slowly',
        value: 'the dog ran quickly',
      });
      expect(result.score).toBe(0);
      expect(result.pass).toBe(false);
    });
  });

  describe('multiple references', () => {
    it('uses the best-matching reference', async () => {
      const result = await meteor({
        output: 'The cat sat on the mat',
        value: ['nothing in common here', 'The cat sat on the mat'],
      });
      expect(result.score).toBeGreaterThan(0.95);
      expect(result.pass).toBe(true);
    });
  });

  describe('parameters', () => {
    it('respects a custom threshold', async () => {
      const input = {
        output: 'The cat is sitting on the mat',
        value: 'The cat sat on the mat',
      };
      const defaultResult = await meteor(input);
      expect(defaultResult.pass).toBe(true);
      expect(defaultResult.score).toBeLessThan(1);

      const threshold = (defaultResult.score + 1) / 2;
      const result = await meteor({ ...input, threshold });
      expect(result.pass).toBe(false);
      expect(result.score).toBe(defaultResult.score);
      expect(result.reason).toBe(
        `METEOR score ${result.score.toFixed(4)} did not meet threshold ${threshold}`,
      );
    });

    it('accepts custom alpha, beta, and gamma', async () => {
      const input = {
        output: 'The cat is sitting on the mat',
        value: 'The cat sat on the mat',
      };
      const defaultResult = await meteor(input);
      const customResult = await meteor({
        ...input,
        alpha: 0.85,
        beta: 2.0,
        gamma: 0.4,
      });

      expect(customResult.score).not.toBe(defaultResult.score);
    });
  });

  describe('inverse (not-meteor)', () => {
    it('fails with an inverse-aware reason when the score meets the threshold', async () => {
      const result = await meteor({
        output: 'the cat sat on the mat',
        value: 'the cat sat on the mat',
        inverse: true,
      });
      expect(result.pass).toBe(false);
      expect(result.score).toBeLessThan(0.05);
      expect(result.reason).toMatch(
        /^METEOR score \d\.\d{4} met threshold 0\.5 \(expected it not to\)$/,
      );
    });

    it('complements the positive score and passes when the score is below the threshold', async () => {
      const input = {
        output: 'The dog ran in the park',
        value: 'The cat sat on the mat',
      };
      const positiveResult = await meteor(input);
      const result = await meteor({
        ...input,
        inverse: true,
      });
      expect(positiveResult.pass).toBe(false);
      expect(positiveResult.score).toBeLessThan(0.5);
      expect(positiveResult.reason).toMatch(/^METEOR score \d\.\d{4} did not meet threshold 0\.5$/);
      expect(result.pass).toBe(true);
      expect(result.score).toBeCloseTo(1 - positiveResult.score, 12);
      expect(result.reason).toBe('METEOR assertion passed');
    });
  });

  describe('invalid inputs', () => {
    it('throws when the candidate is empty', async () => {
      await expect(meteor({ output: '', value: 'the cat sat on the mat' })).rejects.toThrow(
        'Invalid inputs',
      );
    });

    it('throws when no references are provided', async () => {
      await expect(meteor({ output: 'some output', value: [] })).rejects.toThrow('Invalid inputs');
    });

    it('throws when the value is not a string or array of strings', async () => {
      await expect(
        handleMeteorAssertion({
          assertion: { type: 'meteor' },
          renderedValue: 123,
          outputString: 'some output',
          inverse: false,
        }),
      ).rejects.toThrow('"meteor" assertion must have a string or array of strings value');
    });
  });
});
