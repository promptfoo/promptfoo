import { describe, expect, it } from 'vitest';
import {
  getCombinedTokenUsageTotal,
  getIncurredTokenAccounting,
  getPrimaryTokenUsageLabel,
} from './tokenUsage';

describe('token usage helpers', () => {
  it('includes each independent token category exactly once', () => {
    expect(
      getCombinedTokenUsageTotal({
        total: 100,
        attacker: { total: 50 },
        assertions: { total: 25 },
        generation: { total: 40 },
      }),
    ).toBe(215);
  });

  it('separates cached scan footprint from fresh grading work', () => {
    expect(
      getIncurredTokenAccounting({
        total: 295,
        numRequests: 1,
        assertions: { total: 37 },
        incurredTokenUsage: {
          total: 0,
          numRequests: 0,
          assertions: { total: 37 },
        },
      }),
    ).toEqual({ incurredTokens: 37, cachedSavings: 295, actualRequests: 0 });
  });

  it('omits redundant details when every provider request was fresh', () => {
    expect(
      getIncurredTokenAccounting({
        total: 100,
        numRequests: 1,
        incurredTokenUsage: { total: 100, numRequests: 1 },
      }),
    ).toBeUndefined();
  });

  it('uses target terminology only for red team scans', () => {
    expect(getPrimaryTokenUsageLabel(true)).toBe('Target');
    expect(getPrimaryTokenUsageLabel(false)).toBe('Provider');
  });
});
