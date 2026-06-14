import { describe, expect, it } from 'vitest';
import { handleCost } from '../../src/assertions/cost';

import type { AssertionParams } from '../../src/types';

const params = (overrides: Partial<AssertionParams>): AssertionParams =>
  ({
    assertion: { type: 'cost', threshold: 0.01 },
    baseType: 'cost',
    assertionValueContext: {} as any,
    inverse: false,
    output: '',
    outputString: '',
    providerResponse: { output: '' },
    test: {},
    ...overrides,
  }) as AssertionParams;

describe('handleCost', () => {
  it('passes when cost is within threshold', () => {
    expect(handleCost(params({ cost: 0.005 })).pass).toBe(true);
  });

  it('fails when cost exceeds threshold', () => {
    expect(handleCost(params({ cost: 0.02 })).pass).toBe(false);
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
  });
});
