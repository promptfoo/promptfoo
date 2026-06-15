import { describe, expect, it } from 'vitest';
import { handleLatency } from '../../src/assertions/latency';

import type { AssertionParams } from '../../src/types';

const params = (overrides: Partial<AssertionParams>): AssertionParams =>
  ({
    assertion: { type: 'latency', threshold: 1000 },
    baseType: 'latency',
    assertionValueContext: {} as any,
    inverse: false,
    output: '',
    outputString: '',
    providerResponse: { output: '' },
    test: {},
    ...overrides,
  }) as AssertionParams;

describe('handleLatency', () => {
  it('passes when latency is within threshold', () => {
    expect(handleLatency(params({ latencyMs: 500 })).pass).toBe(true);
  });

  it('fails when latency exceeds threshold', () => {
    expect(handleLatency(params({ latencyMs: 1500 })).pass).toBe(false);
  });

  it('throws when threshold is missing', () => {
    expect(() => handleLatency(params({ assertion: { type: 'latency' }, latencyMs: 100 }))).toThrow(
      'Latency assertion must have a threshold',
    );
  });

  it('throws when latencyMs is not provided', () => {
    expect(() => handleLatency(params({ latencyMs: undefined }))).toThrow(
      'does not support cached results',
    );
  });

  describe('inverse (not-latency)', () => {
    it('fails when latency is within threshold', () => {
      const result = handleLatency(params({ latencyMs: 500, inverse: true }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('less than or equal to');
    });

    it('passes when latency exceeds threshold', () => {
      const result = handleLatency(params({ latencyMs: 1500, inverse: true }));
      expect(result.pass).toBe(true);
    });
  });
});
