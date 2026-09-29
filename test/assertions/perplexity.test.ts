import { describe, expect, it } from 'vitest';
import { handlePerplexity, handlePerplexityScore } from '../../src/assertions/perplexity';

import type { AssertionParams } from '../../src/types';

const params = (overrides: Partial<AssertionParams>): AssertionParams =>
  ({
    assertion: { type: 'perplexity', threshold: 5 },
    baseType: 'perplexity',
    assertionValueContext: {} as any,
    inverse: false,
    output: '',
    outputString: '',
    providerResponse: { output: '' },
    test: {},
    ...overrides,
  }) as AssertionParams;

// logProbs [0, 0] => perplexity = exp(0) = 1 (within threshold 5)
// logProbs [-2]   => perplexity = exp(2) ≈ 7.39 (exceeds threshold 5)

describe('handlePerplexity', () => {
  it('passes when perplexity is within threshold', () => {
    expect(handlePerplexity(params({ logProbs: [0, 0] })).pass).toBe(true);
  });

  it('fails when perplexity exceeds threshold', () => {
    expect(handlePerplexity(params({ logProbs: [-2] })).pass).toBe(false);
  });

  it('passes when no threshold is set', () => {
    expect(
      handlePerplexity(params({ assertion: { type: 'perplexity' }, logProbs: [-2] })).pass,
    ).toBe(true);
  });

  it('throws when logProbs are not provided', () => {
    expect(() => handlePerplexity(params({ logProbs: undefined }))).toThrow(
      'does not support providers that do not return logProbs',
    );
  });

  describe('inverse (not-perplexity)', () => {
    it('fails when perplexity is within threshold', () => {
      const result = handlePerplexity(params({ logProbs: [0, 0], inverse: true }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('less than or equal to');
    });

    it('passes when perplexity exceeds threshold', () => {
      expect(handlePerplexity(params({ logProbs: [-2], inverse: true })).pass).toBe(true);
    });

    it('fails at the threshold boundary (perplexity === threshold is "within")', () => {
      // logProbs [-ln(5)] => perplexity = exp(ln(5)) = 5, exactly the threshold
      const result = handlePerplexity(params({ logProbs: [-Math.log(5)], inverse: true }));
      expect(result.pass).toBe(false);
    });
  });
});

describe('handlePerplexityScore inverse (not-perplexity-score)', () => {
  // Use an asymmetric input so the score inversion is actually exercised: logProbs [-2] =>
  // perplexity = exp(2) ≈ 7.39 => perplexityNorm = 1 / (1 + 7.39) ≈ 0.1192, and 1 - 0.1192 ≈
  // 0.8808. A symmetric input like logProbs [0, 0] (norm 0.5, its own complement) would yield the
  // same value whether or not the score is inverted, so it cannot catch a regression here.
  it('inverts the normalized score under not- (1 - perplexityNorm)', () => {
    const base = handlePerplexityScore(
      params({ assertion: { type: 'perplexity-score', threshold: 0.5 }, logProbs: [-2] }),
    );
    expect(base.score).toBeCloseTo(0.1192, 4);

    const inverted = handlePerplexityScore(
      params({
        assertion: { type: 'perplexity-score', threshold: 0.5 },
        logProbs: [-2],
        inverse: true,
      }),
    );
    // Inverting the graded score keeps perplexity-score aggregate-friendly ("higher is better")
    // under negation: high perplexity (low norm) yields a high score for not-perplexity-score.
    // This matters because assertionsResult overrides pass/fail with the aggregate score when a
    // test/assertion-set threshold is configured.
    expect(inverted.score).toBeCloseTo(0.8808, 4);
  });

  it('passes and contributes a high score when perplexity exceeds the normalized threshold', () => {
    // norm ≈ 0.1192 < threshold 0.5 => base fails, so not- passes; inverted score ≈ 0.8808
    const inverted = handlePerplexityScore(
      params({
        assertion: { type: 'perplexity-score', threshold: 0.5 },
        logProbs: [-2],
        inverse: true,
      }),
    );
    expect(inverted.pass).toBe(true);
    expect(inverted.score).toBeCloseTo(0.8808, 4);
  });

  it('fails when score is below threshold', () => {
    // perplexityNorm = 0.5, threshold 0.9 => below => fail
    const result = handlePerplexityScore(
      params({ assertion: { type: 'perplexity-score', threshold: 0.9 }, logProbs: [0, 0] }),
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('less than');
  });

  it('throws when logProbs are not provided', () => {
    expect(() =>
      handlePerplexityScore(
        params({ assertion: { type: 'perplexity-score' }, logProbs: undefined }),
      ),
    ).toThrow('does not support providers that do not return logProbs');
  });
});
