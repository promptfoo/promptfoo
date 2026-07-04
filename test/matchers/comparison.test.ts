import { describe, expect, it } from 'vitest';
import { matchesSelectBest, selectMetric } from '../../src/matchers/comparison';
import { ResultFailureReason } from '../../src/types/index';
import { createMockProvider } from '../factories/provider';

import type { ApiProvider, GradingConfig } from '../../src/types/index';

function createSelectBestProvider(output: string): ApiProvider {
  return createMockProvider({
    id: 'select-best-test-provider',
    response: {
      output,
      tokenUsage: { total: 7, prompt: 3, completion: 4 },
    },
  });
}

describe('matchesSelectBest', () => {
  it('should parse multi-digit verdict indexes', async () => {
    const provider = createSelectBestProvider('10');
    const outputs = Array.from({ length: 12 }, (_value, index) => `Output ${index}`);
    const grading: GradingConfig = { provider };

    const result = await matchesSelectBest('choose the best output', outputs, grading);

    expect(result[10]).toMatchObject({
      pass: true,
      score: 1,
      reason: 'Output selected as the best: choose the best output',
    });
    expect(result.filter((item) => item.pass)).toHaveLength(1);
  });

  it('should return independent failure results for invalid verdicts', async () => {
    const provider = createSelectBestProvider('no verdict');
    const grading: GradingConfig = { provider };

    const result = await matchesSelectBest('choose the best output', ['A', 'B'], grading);

    expect(result).toHaveLength(2);
    expect(result[0]).not.toBe(result[1]);
    expect(result[0]).toMatchObject({
      pass: false,
      reason: 'Invalid select-best verdict: NaN',
      tokensUsed: {
        total: 7,
        prompt: 3,
        completion: 4,
      },
    });
  });
});

describe('selectMetric', () => {
  it('keeps assertion-failed outputs eligible when onlyPassing is false', async () => {
    const results = await selectMetric(
      [
        {
          error: 'Expected output to contain hello',
          failureReason: ResultFailureReason.ASSERT,
          promptIdx: 0,
          response: { cost: 0.001 },
          success: false,
        },
        {
          failureReason: ResultFailureReason.NONE,
          promptIdx: 1,
          response: { cost: 0.01 },
          success: true,
        },
      ],
      { type: 'select-lowest-cost' },
    );

    expect(results[0]).toMatchObject({ pass: true, score: 1 });
    expect(results[1]).toMatchObject({ pass: false, score: 0 });
  });

  it('bounds invalid-metric prompt index diagnostics', async () => {
    const candidates = Array.from({ length: 10_000 }, (_value, promptIdx) => ({
      failureReason: ResultFailureReason.NONE,
      promptIdx,
      response: {},
      success: true,
    }));

    const results = await selectMetric(candidates, { type: 'select-lowest-cost' });

    expect(results[0].reason.length).toBeLessThan(500);
    expect(results[0].reason).toContain('and 9980 more');
    expect(new Set(results.map((result) => result.reason))).toHaveLength(1);
  });
});
