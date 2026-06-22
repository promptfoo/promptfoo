import { describe, expect, it } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

import type { AssertionParams } from '../../src/types/index';

// These tests exercise the REAL handler (and the optional `natural` package) rather
// than a re-implementation, so `src/assertions/meteor.ts` gets genuine coverage.
// METEOR is deterministic, so the scores below are stable; assertions use ranges where
// a tighter bound would be brittle across `natural` versions.
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
  return handleMeteorAssertion({
    assertion: { type: inverse ? 'not-meteor' : 'meteor', threshold, alpha, beta, gamma },
    renderedValue: value,
    outputString: output,
    inverse,
  } as unknown as AssertionParams);
}

describe('handleMeteorAssertion', () => {
  describe('scoring', () => {
    it('scores identical text near 1 and passes', async () => {
      const result = await meteor({
        output: 'the cat sat on the mat',
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

    it('handles the NLTK reference example', async () => {
      const result = await meteor({
        output:
          'It is a guide to action that ensures the military will forever heed Party commands',
        value:
          'It is a guide to action which ensures that the military always obeys the commands of the party',
      });
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.pass).toBe(true);
    });

    it('scores unrelated text low and fails with a directional reason', async () => {
      const result = await meteor({
        output: 'The dog ran in the park',
        value: 'The cat sat on the mat',
      });
      expect(result.pass).toBe(false);
      expect(result.score).toBeLessThan(0.5);
      expect(result.reason).toMatch(/^METEOR score \d\.\d{4} did not meet threshold 0\.5$/);
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
      const result = await meteor({
        output: 'The cat is sitting on the mat',
        value: 'The cat sat on the mat',
        threshold: 0.95,
      });
      // Stem-similar score (~0.79) is below the raised threshold.
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/did not meet threshold 0\.95/);
    });

    it('accepts custom alpha, beta, and gamma', async () => {
      const result = await meteor({
        output: 'The cat is sitting on the mat',
        value: 'The cat sat on the mat',
        alpha: 0.85,
        beta: 2.0,
        gamma: 0.4,
      });
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.pass).toBe(true);
    });

    it('defaults the threshold to 0.5', async () => {
      const result = await meteor({
        output: 'The dog ran in the park',
        value: 'The cat sat on the mat',
      });
      expect(result.pass).toBe(false);
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

    it('passes when the score does not meet the threshold', async () => {
      const result = await meteor({
        output: 'The dog ran in the park',
        value: 'The cat sat on the mat',
        inverse: true,
      });
      expect(result.pass).toBe(true);
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
          renderedValue: 123 as never,
          outputString: 'some output',
          inverse: false,
        } as unknown as AssertionParams),
      ).rejects.toThrow('"meteor" assertion must have a string or array of strings value');
    });
  });
});
