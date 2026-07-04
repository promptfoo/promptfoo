import { describe, expect, it } from 'vitest';
import { selectMetric } from '../../src/matchers/comparison';
import { createEvaluateResult } from '../factories/eval';
import { createProviderResponse } from '../factories/provider';

import type { Assertion, EvaluateResult } from '../../src/types/index';

const costAssertion: Assertion = { type: 'select-lowest-cost' };
const latencyAssertion: Assertion = { type: 'select-lowest-latency' };
const passingCostAssertion: Assertion = {
  type: 'select-lowest-cost',
  value: { onlyPassing: true },
};

function result({
  cached = false,
  cost,
  latencyMs = 100,
  persistedCost,
  promptIdx,
  success = true,
}: {
  cached?: boolean;
  cost?: number;
  latencyMs?: number;
  persistedCost?: number;
  promptIdx: number;
  success?: boolean;
}): EvaluateResult {
  return createEvaluateResult({
    promptIdx,
    success,
    latencyMs,
    cost: persistedCost,
    response: createProviderResponse({ cached, cost }),
  });
}

describe('selectMetric', () => {
  it('selects the lowest eligible cost and breaks ties by prompt index', async () => {
    const grading = await selectMetric(
      [
        result({ promptIdx: 1, cost: 0, success: false }),
        result({ promptIdx: 9, cost: 0 }),
        result({ promptIdx: 2, cost: 0 }),
      ],
      passingCostAssertion,
    );

    expect(grading.map(({ pass }) => pass)).toEqual([false, false, true]);
    expect(grading[0].reason).toContain('failed another assertion');
  });

  it('selects the cheapest output by default, even when another assertion failed', async () => {
    const grading = await selectMetric(
      [result({ promptIdx: 0, cost: 0.01, success: false }), result({ promptIdx: 1, cost: 0.1 })],
      costAssertion,
    );

    expect(grading.map(({ pass }) => pass)).toEqual([true, false]);
  });

  it('uses response cost, not normalized top-level cost', async () => {
    const grading = await selectMetric(
      [result({ promptIdx: 0, persistedCost: 0 }), result({ promptIdx: 1, cost: 1 })],
      costAssertion,
    );

    expect(grading.every(({ pass }) => !pass)).toBe(true);
    expect(grading[0].reason).toContain('missing or invalid cost for prompt indexes: 0');
  });

  it('selects the lowest latency', async () => {
    const grading = await selectMetric(
      [result({ promptIdx: 0, latencyMs: 250 }), result({ promptIdx: 1, latencyMs: 75 })],
      latencyAssertion,
    );

    expect(grading.map(({ pass }) => pass)).toEqual([false, true]);
  });

  it('honors onlyPassing false for latency', async () => {
    const grading = await selectMetric(
      [
        result({ promptIdx: 0, latencyMs: 25, success: false }),
        result({ promptIdx: 1, latencyMs: 100 }),
      ],
      { type: 'select-lowest-latency', value: { onlyPassing: false } },
    );

    expect(grading.map(({ pass }) => pass)).toEqual([true, false]);
  });

  it('excludes provider errors without invalidating healthy outputs', async () => {
    const failed = {
      ...result({ promptIdx: 0, cost: 0.001 }),
      error: 'provider failed',
      response: undefined,
    };
    const grading = await selectMetric(
      [failed, result({ promptIdx: 1, cost: 0.1 })],
      costAssertion,
    );

    expect(grading.map(({ pass }) => pass)).toEqual([false, true]);
    expect(grading[0].reason).toContain('did not produce an output');
  });

  it.each([
    [costAssertion, result({ promptIdx: 0, cost: 0, cached: true })],
    [latencyAssertion, result({ promptIdx: 0, latencyMs: 1, cached: true })],
  ])('rejects cached outputs for $type', async (assertion, cachedResult) => {
    const grading = await selectMetric(
      [cachedResult, result({ promptIdx: 1, cost: 0.1, latencyMs: 100 })],
      assertion,
    );

    expect(grading.every(({ pass }) => !pass)).toBe(true);
    expect(grading[0].reason).toContain('--no-cache');
  });

  it.each([
    [costAssertion, result({ promptIdx: 0, cost: Number.NaN }), 'cost'],
    [latencyAssertion, result({ promptIdx: 0, latencyMs: -1 }), 'latency'],
  ])('rejects invalid metrics for $type', async (assertion, invalidResult, label) => {
    const grading = await selectMetric(
      [invalidResult, result({ promptIdx: 1, cost: 0.1, latencyMs: 100 })],
      assertion,
    );

    expect(grading.every(({ pass }) => !pass)).toBe(true);
    expect(grading[0].reason).toContain(`finite, non-negative ${label}`);
  });

  it.each([
    passingCostAssertion,
    latencyAssertion,
  ])('requires eligible outputs for $type', async (assertion) => {
    const grading = await selectMetric(
      [result({ promptIdx: 0, success: false }), result({ promptIdx: 1, success: false })],
      assertion,
    );
    expect(grading.every(({ pass }) => !pass)).toBe(true);
    expect(grading[0].reason).toContain('all outputs failed other assertions');
  });

  it.each([
    costAssertion,
    latencyAssertion,
  ])('fails gracefully with fewer than two outputs for $type', async (assertion) => {
    const grading = await selectMetric([result({ promptIdx: 0, cost: 0.1 })], assertion);
    expect(grading).toEqual([
      expect.objectContaining({
        pass: false,
        reason: expect.stringContaining('at least two outputs'),
      }),
    ]);
  });
});
