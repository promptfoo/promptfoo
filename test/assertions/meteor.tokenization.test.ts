import { describe, expect, it } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

import type { AssertionParams } from '../../src/types/index';

// Calls the REAL handleMeteorAssertion (meteor.test.ts mocks it, so the actual
// tokenization is not covered there).
const meteor = (overrides: Partial<AssertionParams>) =>
  handleMeteorAssertion({
    assertion: { type: 'meteor' },
    renderedValue: 'the cat sat on the mat',
    outputString: 'the cat sat on the mat',
    inverse: false,
    ...overrides,
  } as AssertionParams);

describe('handleMeteorAssertion tokenization (real implementation)', () => {
  it('is unaffected by leading/trailing/duplicate whitespace', async () => {
    const clean = (await meteor({})).score;
    expect(clean).toBeGreaterThan(0.9);

    // Before the fix, a single trailing space on the reference split into a
    // phantom empty token and dropped the score to ~0.8675.
    expect((await meteor({ renderedValue: 'the cat sat on the mat ' })).score).toBeCloseTo(
      clean,
      10,
    );
    expect((await meteor({ outputString: ' the cat sat on the mat' })).score).toBeCloseTo(
      clean,
      10,
    );
    expect((await meteor({ outputString: 'the  cat   sat on the mat' })).score).toBeCloseTo(
      clean,
      10,
    );
  });

  it('uses the best score from multiple references', async () => {
    const result = await meteor({
      renderedValue: ['a dog ran through the park', 'the cat sat on the mat'],
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.reason).toBe('METEOR assertion passed');
  });

  it('fails when the score is below the threshold', async () => {
    const result = await meteor({
      assertion: { type: 'meteor', threshold: 0.9 },
      renderedValue: 'completely different reference',
      outputString: 'the cat sat on the mat',
    });

    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.9);
    expect(result.reason).toContain('did not meet threshold 0.9');
  });

  it('inverts the threshold comparison and score for not-meteor', async () => {
    const result = await meteor({
      assertion: { type: 'meteor', threshold: 0.5 },
      inverse: true,
      renderedValue: 'completely different reference',
      outputString: 'the cat sat on the mat',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
  });

  it('rejects empty reference arrays', async () => {
    await expect(meteor({ renderedValue: [] })).rejects.toThrow('Invalid inputs');
  });

  it('accepts custom METEOR parameters', async () => {
    const result = await meteor({
      assertion: { type: 'meteor', alpha: 0.85, beta: 2, gamma: 0.4 },
      renderedValue: 'the cat sat on the mat.',
      outputString: 'the cat sat on the mat',
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.9);
  });
});
