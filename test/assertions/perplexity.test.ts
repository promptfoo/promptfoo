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
  });
});

describe('handlePerplexityScore inverse (not-perplexity-score)', () => {
  it('inverts the pass decision while keeping the normalized score', () => {
    // perplexity 1 => perplexityNorm = 1 / (1 + 1) = 0.5, threshold 0.4 => base passes
    const base = handlePerplexityScore(
      params({ assertion: { type: 'perplexity-score', threshold: 0.4 }, logProbs: [0, 0] }),
    );
    expect(base.pass).toBe(true);

    const inverted = handlePerplexityScore(
      params({
        assertion: { type: 'perplexity-score', threshold: 0.4 },
        logProbs: [0, 0],
        inverse: true,
      }),
    );
    expect(inverted.pass).toBe(false);
    expect(inverted.score).toBeCloseTo(0.5);
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
