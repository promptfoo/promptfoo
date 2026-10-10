import { describe, expect, it, vi } from 'vitest';
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

  it('preserves cache provenance and logical token usage for cached comparison responses', async () => {
    const provider = createMockProvider({
      id: 'cached-select-best-provider',
      response: {
        output: '0',
        cached: true,
        tokenUsage: { total: 30, prompt: 18, completion: 12, numRequests: 1 },
      },
    });

    const result = await matchesSelectBest('choose the best output', ['A', 'B'], { provider });

    for (const gradingResult of result) {
      expect(gradingResult).toMatchObject({
        metadata: { cachedResponse: true },
        tokensUsed: { total: 30, prompt: 18, completion: 12, cached: 30, numRequests: 1 },
      });
    }
  });

  it('preserves cache provenance when a cached comparison response is malformed', async () => {
    const provider = createMockProvider({
      id: 'cached-invalid-select-best-provider',
      response: {
        output: 'not a verdict',
        cached: true,
        tokenUsage: { total: 30, prompt: 18, completion: 12, numRequests: 1 },
      },
    });

    const result = await matchesSelectBest('choose the best output', ['A', 'B'], { provider });

    for (const gradingResult of result) {
      expect(gradingResult).toMatchObject({
        pass: false,
        metadata: { cachedResponse: true },
        tokensUsed: { total: 30, cached: 30 },
      });
    }
  });

  it.each([
    { label: 'valid verdict', response: { output: '0' } },
    { label: 'invalid verdict', response: { output: 'not a verdict' } },
    { label: 'provider error', response: { error: 'comparison provider failed', output: '' } },
  ])('preserves mixed cached and incurred comparison usage for a $label', async ({ response }) => {
    const provider = createMockProvider({
      id: 'mixed-cache-select-best-provider',
      response: {
        ...response,
        tokenUsage: {
          total: 100,
          prompt: 70,
          completion: 30,
          cached: 70,
          numRequests: 2,
          completionDetails: { reasoning: 9 },
          incurredTokenUsage: {
            total: 30,
            prompt: 20,
            completion: 10,
            numRequests: 1,
            completionDetails: { reasoning: 4 },
          },
        },
      },
    });

    const result = await matchesSelectBest('choose the best output', ['A', 'B'], { provider });

    for (const gradingResult of result) {
      expect(gradingResult.tokensUsed).toMatchObject({
        total: 100,
        prompt: 70,
        completion: 30,
        cached: 70,
        numRequests: 2,
        completionDetails: { reasoning: 9 },
        incurredTokenUsage: {
          total: 30,
          prompt: 20,
          completion: 10,
          numRequests: 1,
          completionDetails: { reasoning: 4 },
        },
      });
    }
  });

  it('should keep reserved criteria and outputs vars ahead of user vars', async () => {
    const provider = createSelectBestProvider('0');
    const grading: GradingConfig = {
      provider,
      rubricPrompt: 'criteria={{ criteria }}\noutputs={{ outputs }}\nextra={{ extra }}',
    };

    await matchesSelectBest('criteria from assertion', ['first output', 'second output'], grading, {
      criteria: 'vars criteria sentinel',
      outputs: 'vars outputs sentinel',
      extra: 'kept user var',
    });

    const [prompt, callApiContext] = vi.mocked(provider.callApi).mock.calls[0];
    expect(prompt).toContain('criteria=criteria from assertion');
    expect(prompt).toContain('first output');
    expect(prompt).toContain('extra=kept user var');
    expect(prompt).not.toContain('vars criteria sentinel');
    expect(prompt).not.toContain('vars outputs sentinel');
    expect(callApiContext?.vars).toMatchObject({
      criteria: 'criteria from assertion',
      extra: 'kept user var',
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
