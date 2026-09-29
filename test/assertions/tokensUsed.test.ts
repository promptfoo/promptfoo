import { describe, expect, it } from 'vitest';
import { assertionUsesTrace } from '../../src/assertions/index';
import { handleTokensUsed } from '../../src/assertions/tokensUsed';

import type { AssertionParams, TokenUsage } from '../../src/types/index';

function check(value: unknown, tokenUsage?: TokenUsage, inverse = false) {
  return handleTokensUsed({
    assertion: { type: inverse ? 'not-tokens-used' : 'tokens-used', value },
    renderedValue: value,
    providerResponse: { output: 'ordinary response', tokenUsage },
    inverse,
  } as AssertionParams);
}

describe('tokens-used', () => {
  it.each([
    [{ min: 0, max: 0 }, { total: 0 }, true],
    [{ min: 4, max: 4 }, { total: 4 }, true],
    [{ max: 3 }, { total: 4 }, false],
    [{ min: 5 }, { total: 4 }, false],
    [{ max: 5 }, { prompt: 3, completion: 2 }, true],
    [{ max: 5 }, { total: 8, prompt: 1, completion: 1 }, false],
  ] as const)('checks inclusive budget %j against response usage %j', (budget, usage, pass) => {
    expect(check(budget, usage)).toMatchObject({ pass, score: pass ? 1 : 0 });
    expect(check(budget, usage, true)).toMatchObject({ pass: !pass, score: pass ? 0 : 1 });
  });

  it.each([
    undefined,
    {},
    { prompt: 3 },
    { completion: 2 },
    { prompt: -1, completion: 3 },
    { total: -1 },
    { total: Infinity },
    { total: NaN },
    { total: 0.5 },
  ])('rejects missing or invalid usage %j even for inverse assertions', (usage) => {
    expect(() => check({ max: 10 }, usage, true)).toThrow('requires');
  });

  it.each([
    null,
    [],
    {},
    5,
    '10',
    { max: -1 },
    { min: 1.5 },
    { min: 5, max: 2 },
    { max: 10, source: 'trace' },
    { max: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid budget %j', (budget) => {
    expect(() => check(budget, { total: 0 })).toThrow();
  });

  it('uses the response footprint and does not add cached, grader, or incurred usage', () => {
    expect(
      check(
        { max: 8 },
        { total: 8, cached: 5, assertions: { total: 100 }, incurredTokenUsage: { total: 3 } },
      ),
    ).toMatchObject({ pass: true });
    expect(assertionUsesTrace({ type: 'tokens-used', value: { max: 8 } })).toBe(false);
    expect(assertionUsesTrace({ type: 'not-tokens-used', value: { max: 8 } })).toBe(false);
  });
});
