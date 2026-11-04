import { describe, expect, it } from 'vitest';
import { handleCost } from '../../src/assertions/cost';
import { createNumericAssertionParams } from '../factories/assertionParams';

const params = createNumericAssertionParams('cost', 0.01);

describe('handleCost', () => {
  it('passes when cost is within threshold', () => {
    expect(handleCost(params({ cost: 0.005 })).pass).toBe(true);
  });

  it('fails when cost exceeds threshold', () => {
    expect(handleCost(params({ cost: 0.02 })).pass).toBe(false);
  });

  it('throws when threshold is missing', () => {
    expect(() => handleCost(params({ assertion: { type: 'cost' }, cost: 0.005 }))).toThrow(
      'Cost assertion must have a threshold',
    );
  });

  it('throws when cost is not provided', () => {
    expect(() => handleCost(params({ cost: undefined }))).toThrow(
      'does not support providers that do not return cost',
    );
  });

  describe('named cost metric', () => {
    const assertion = { type: 'cost' as const, metric: 'inference_cost', weight: 0 };

    it.each([0, 0.005, 2])('records cost %s without a threshold', (cost) => {
      expect(handleCost(params({ assertion, cost }))).toMatchObject({
        pass: true,
        score: cost,
        assertion,
      });
    });

    it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, -1])(
      'rejects unavailable or invalid cost %s',
      (cost) => {
        expect(() => handleCost(params({ assertion, cost }))).toThrow();
      },
    );

    it('still requires a threshold when the assertion affects the score', () => {
      expect(() =>
        handleCost(params({ assertion: { ...assertion, weight: 1 }, cost: 0.005 })),
      ).toThrow('Cost assertion must have a threshold');
    });

    it('requires a threshold for an inverted cost assertion', () => {
      expect(() => handleCost(params({ assertion, cost: 0.005, inverse: true }))).toThrow(
        'Cost assertion must have a threshold',
      );
    });
  });

  describe('inverse (not-cost)', () => {
    it('fails when cost is within threshold', () => {
      const result = handleCost(params({ cost: 0.005, inverse: true }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('less than or equal to');
    });

    it('passes when cost exceeds threshold', () => {
      const result = handleCost(params({ cost: 0.02, inverse: true }));
      expect(result.pass).toBe(true);
    });

    it('fails at the threshold boundary (cost === threshold is "within")', () => {
      const result = handleCost(params({ cost: 0.01, inverse: true }));
      expect(result.pass).toBe(false);
    });
  });
});
