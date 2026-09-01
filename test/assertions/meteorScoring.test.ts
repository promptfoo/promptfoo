import { describe, expect, it } from 'vitest';
import { calculateMeteorScore, handleMeteorAssertion } from '../../src/assertions/meteor';

import type { AssertionParams } from '../../src/types/index';

// `meteor.test.ts` exercises a hand-written reimplementation of the assertion, so the
// module itself is only covered incidentally. These drive the real code. Every case but
// the no-alignment one resolves in the exact-match or Porter-stem stage, so the suite
// touches WordNet once and stays fast on every platform.

function params(overrides: Partial<AssertionParams>): AssertionParams {
  return {
    assertion: { type: 'meteor' },
    outputString: '',
    renderedValue: '',
    ...overrides,
  } as AssertionParams;
}

describe('calculateMeteorScore', () => {
  it('ignores surrounding whitespace like BLEU/GLEU do', async () => {
    const reference = 'the cat sat on the mat';

    const clean = await calculateMeteorScore(reference, [reference]);
    const padded = await calculateMeteorScore(`  ${reference}\n`, [reference]);

    // Leading/trailing whitespace previously injected empty tokens that inflated the
    // candidate length and dropped precision, so padding changed the score.
    expect(clean).toBeGreaterThan(0.99);
    expect(padded).toBeCloseTo(clean, 5);
  });

  it('does not spuriously match empty tokens on both sides', async () => {
    const withoutPadding = await calculateMeteorScore('hi there', ['hi there']);
    const withPadding = await calculateMeteorScore(' hi there ', [' hi there ']);

    expect(withPadding).toBeCloseTo(withoutPadding, 5);
  });

  it('matches inflected forms through the stemming stage', async () => {
    const stemmed = await calculateMeteorScore('cats running', ['cat runs']);

    expect(stemmed).toBeGreaterThan(0.9);
  });

  it('takes the best score across multiple references', async () => {
    const score = await calculateMeteorScore('the cat sat on the mat', [
      'the mat sat on the cat',
      'the cat sat on the mat',
    ]);

    expect(score).toBeGreaterThan(0.99);
  });

  it('scores 0 when nothing aligns in any stage', async () => {
    const score = await calculateMeteorScore('zebra', ['helicopter']);

    expect(score).toBe(0);
  });

  it('rejects an empty candidate or an empty reference list', async () => {
    await expect(calculateMeteorScore('', ['the cat sat'])).rejects.toThrow('Invalid inputs');
    await expect(calculateMeteorScore('the cat sat', [])).rejects.toThrow('Invalid inputs');
  });
});

describe('handleMeteorAssertion', () => {
  it('passes when the score clears the default threshold', async () => {
    const result = await handleMeteorAssertion(
      params({
        outputString: 'the cat sat on the mat',
        renderedValue: 'the cat sat on the mat',
      }),
    );

    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.99);
    expect(result.reason).toBe('METEOR assertion passed');
  });

  it('reports the score and threshold when it falls short', async () => {
    const result = await handleMeteorAssertion(
      params({
        assertion: { type: 'meteor', threshold: 0.99 },
        outputString: 'cats running',
        renderedValue: 'cat runs',
      }),
    );

    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^METEOR score 0\.\d{4} did not meet threshold 0\.99$/);
  });

  it('inverts the verdict and the score for not-meteor', async () => {
    const result = await handleMeteorAssertion(
      params({
        inverse: true,
        outputString: 'the cat sat on the mat',
        renderedValue: 'the cat sat on the mat',
      }),
    );

    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.01);
  });

  it('accepts an array of references', async () => {
    const result = await handleMeteorAssertion(
      params({
        outputString: 'the cat sat on the mat',
        renderedValue: ['the mat sat on the cat', 'the cat sat on the mat'],
      }),
    );

    expect(result.pass).toBe(true);
  });

  it('honors alpha, beta and gamma from the assertion', async () => {
    const tuned = { type: 'meteor' as const, alpha: 0.5, beta: 1.0, gamma: 0.1 };

    const defaults = await handleMeteorAssertion(
      params({ outputString: 'the cat sat', renderedValue: 'the cat sat on the mat' }),
    );
    const custom = await handleMeteorAssertion(
      params({
        assertion: tuned,
        outputString: 'the cat sat',
        renderedValue: 'the cat sat on the mat',
      }),
    );

    expect(custom.score).not.toBeCloseTo(defaults.score, 5);
  });

  it('rejects a non-string reference value', async () => {
    await expect(
      handleMeteorAssertion(params({ outputString: 'the cat sat', renderedValue: 42 as never })),
    ).rejects.toThrow('"meteor" assertion must have a string or array of strings value');
  });
});
