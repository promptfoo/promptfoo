import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions/index';
import * as cache from '../../src/cache';
import cliState from '../../src/cliState';
import * as remoteGeneration from '../../src/redteam/remoteGeneration';
import * as remoteGrading from '../../src/remoteGrading';
import { createMockProvider } from '../factories/provider';
import { createMockFetchResponse } from '../providers/mockProviderResponses';

import type { TokenUsage } from '../../src/types/index';

beforeEach(() => {
  cliState.config = {};
});

afterEach(() => {
  vi.restoreAllMocks();
  cliState.config = {};
});

describe('similarity array token usage', () => {
  it.each([
    { type: 'similar' as const, scores: [0.1, 0.9, 0.8], pass: true, score: 0.9 },
    { type: 'similar' as const, scores: [0.1, 0.2], pass: false, score: 0.2 },
    { type: 'not-similar' as const, scores: [0.1, 0.2], pass: true, score: 0.8 },
    { type: 'not-similar' as const, scores: [0.1, 0.9, 0.8], pass: false, score: 0.1 },
  ])('counts visited references for $type with scores $scores', async (testCase) => {
    const callSimilarityApi = vi.fn(async (expected: string) => {
      const index = Number(expected);
      const tokens = index === 0 ? 7 : 11;
      return {
        similarity: testCase.scores[index],
        tokenUsage: {
          prompt: tokens,
          numRequests: 1,
          completionDetails: { reasoning: index + 1 },
        },
      };
    });
    const provider = Object.assign(createMockProvider(), { callSimilarityApi });
    const result = await runAssertions({
      test: {
        options: { provider },
        assert: [
          {
            type: testCase.type,
            value: testCase.scores.map((_, index) => String(index)),
            threshold: 0.8,
          },
        ],
      },
      providerResponse: { output: 'output' },
    });

    expect(result.pass).toBe(testCase.pass);
    expect(result.score).toBeCloseTo(testCase.score);
    expect(callSimilarityApi).toHaveBeenCalledTimes(2);
    expect(result.tokensUsed).toMatchObject({
      total: 18,
      prompt: 18,
      numRequests: 2,
      completionDetails: { reasoning: 3 },
    });
    expect(result.componentResults?.[0].tokensUsed).toMatchObject({ total: 18, numRequests: 2 });
  });

  it.each([
    ['fresh', 'cached'],
    ['cached', 'fresh'],
    ['cached', 'cached'],
  ])('preserves accounting when references are %s then %s', async (first, second) => {
    cliState.config = { redteam: {} };
    vi.spyOn(remoteGeneration, 'shouldGenerateRemote').mockReturnValue(true);
    const remote = vi.spyOn(remoteGrading, 'doRemoteGrading');
    for (const [index, kind] of [first, second].entries()) {
      remote.mockResolvedValueOnce({
        pass: index === 1,
        score: index === 1 ? 0.9 : 0.1,
        reason: 'Remote grading result',
        tokensUsed:
          kind === 'cached'
            ? { total: 0, cached: 11, numRequests: 0 }
            : { total: 7, prompt: 7, numRequests: 1 },
        ...(kind === 'cached' && { metadata: { cachedResponse: true } }),
      });
    }
    const result = await runAssertions({
      test: { assert: [{ type: 'similar', value: ['first', 'second'], threshold: 0.8 }] },
      providerResponse: { output: 'output' },
    });

    const allCached = first === 'cached' && second === 'cached';
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.9);
    expect(remote).toHaveBeenCalledTimes(2);
    expect(result.tokensUsed).toMatchObject({
      total: allCached ? 22 : 18,
      cached: allCached ? 22 : 11,
      numRequests: 2,
      incurredTokenUsage: { total: allCached ? 0 : 7, numRequests: allCached ? 0 : 1 },
    });
    expect(result.metadata?.cachedResponse === true).toBe(allCached);
  });

  it.each([
    { name: 'absent usage', usage: undefined, cached: false },
    {
      name: 'partial usage',
      usage: { prompt: 3, completion: 2, completionDetails: { reasoning: 1 } },
      cached: false,
    },
    {
      name: 'partial incurred usage',
      usage: {
        prompt: 3,
        completion: 2,
        incurredTokenUsage: { prompt: 1, completion: 1, numRequests: 1 },
      },
      cached: false,
    },
    { name: 'cached partial usage', usage: { prompt: 3, completion: 2 }, cached: true },
  ] satisfies Array<{ name: string; usage: TokenUsage | undefined; cached: boolean }>)(
    'uses scalar assertion accounting for remote $name',
    async ({ usage, cached }) => {
      cliState.config = { redteam: {} };
      vi.spyOn(remoteGeneration, 'shouldGenerateRemote').mockReturnValue(true);
      const fetch = vi.spyOn(cache, 'fetchWithCache').mockResolvedValue(
        createMockFetchResponse(
          {
            result: {
              pass: false,
              score: 0.1,
              reason: 'Below threshold',
              tokensUsed: usage,
            },
          },
          { cached },
        ),
      );
      const values = ['first', 'second'];
      const arrayResult = await runAssertions({
        test: { assert: [{ type: 'similar', value: values, threshold: 0.8 }] },
        providerResponse: { output: 'output' },
      });
      const scalarResults = await runAssertions({
        test: {
          assert: values.map((value) => ({ type: 'similar', value, threshold: 0.8 })),
        },
        providerResponse: { output: 'output' },
      });

      expect(fetch).toHaveBeenCalledTimes(4);
      expect(arrayResult.pass).toBe(false);
      expect(arrayResult.tokensUsed).toEqual(scalarResults.tokensUsed);
    },
  );
});
