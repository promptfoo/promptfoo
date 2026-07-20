import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate, runEval } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { mockApiProvider, mockGradingApiProviderPasses, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator token usage', () => {
  it('preserves unknown provider usage and cost through persistence and export', async () => {
    const providerWithoutUsage: ApiProvider = {
      id: vi.fn().mockReturnValue('provider-without-usage'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Generated output',
        tokenUsage: { numRequests: 1 },
      }),
    };
    const testSuite: TestSuite = {
      providers: [providerWithoutUsage],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    evalRecord.clearResults();
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.version).toBe(3);
    if (!('prompts' in summary)) {
      throw new Error('Expected a persisted v3 evaluation summary');
    }

    const result = summary.results[0];
    expect(result.cost).toBeUndefined();
    expect(result.response?.tokenUsage).toEqual({ numRequests: 1 });
    expect(result.tokenUsage).toMatchObject({ numRequests: 1 });
    expect(result.tokenUsage).not.toHaveProperty('prompt');
    expect(result.tokenUsage).not.toHaveProperty('completion');
    expect(result.tokenUsage).not.toHaveProperty('cached');
    expect(result.tokenUsage).not.toHaveProperty('total');

    expect(summary.prompts[0].metrics?.cost).toBeUndefined();
    expect(summary.prompts[0].metrics?.tokenUsage).not.toHaveProperty('prompt');
    expect(summary.prompts[0].metrics?.tokenUsage).not.toHaveProperty('completion');
    expect(summary.prompts[0].metrics?.tokenUsage).not.toHaveProperty('cached');
    expect(summary.prompts[0].metrics?.tokenUsage).not.toHaveProperty('total');
    expect(summary.stats.tokenUsage).not.toHaveProperty('prompt');
    expect(summary.stats.tokenUsage).not.toHaveProperty('completion');
    expect(summary.stats.tokenUsage).not.toHaveProperty('cached');
    expect(summary.stats.tokenUsage).not.toHaveProperty('total');
    expect(JSON.parse(JSON.stringify(summary.prompts[0].metrics))).not.toHaveProperty('cost');
  });

  it('should accumulate token usage correctly', async () => {
    const mockOptions = {
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
    };

    const results = await runEval({
      ...mockOptions,
      provider: mockApiProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {
        assert: [
          {
            type: 'llm-rubric',
            value: 'Test output',
          },
        ],
        options: { provider: mockGradingApiProviderPasses },
      },
      conversations: {},
      registers: {},
    });

    expect(results[0].tokenUsage).toEqual({
      total: 10, // Only provider tokens, NOT assertion tokens
      prompt: 5, // Only provider tokens
      completion: 5, // Only provider tokens
      cached: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      numRequests: 1, // Only provider requests
      assertions: {
        total: 10, // Assertion tokens tracked separately
        prompt: 5,
        completion: 5,
        cached: 0,
        numRequests: 1, // Assertion requests tracked separately
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
  });

  it('should NOT include assertion tokens in main token totals', async () => {
    // Mock provider that returns fixed token usage
    const providerWithTokens: ApiProvider = {
      id: vi.fn().mockReturnValue('provider-with-tokens'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: {
          total: 100,
          prompt: 60,
          completion: 40,
          cached: 10,
          numRequests: 1,
        },
      }),
    };

    // Mock grading provider that also returns token usage
    const gradingProviderWithTokens: ApiProvider = {
      id: vi.fn().mockReturnValue('grading-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          pass: true,
          score: 1,
          reason: 'Test passed',
        }),
        tokenUsage: {
          total: 50,
          prompt: 30,
          completion: 20,
          cached: 5,
          numRequests: 1,
        },
      }),
    };

    const testSuite: TestSuite = {
      providers: [providerWithTokens],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'Output should be valid',
              provider: gradingProviderWithTokens,
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // Verify main totals only include provider tokens, NOT assertion tokens
    expect(summary.stats.tokenUsage).toEqual({
      total: 100, // Only provider tokens
      prompt: 60,
      completion: 40,
      cached: 10,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 50, // Assertion tokens tracked separately
        prompt: 30,
        completion: 20,
        cached: 5,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });

    // Also verify at the result level - the result should pass
    const result = summary.results[0];
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('score', 1);

    // The main verification is at the stats level (already done above)
    // Individual results may not always have tokenUsage populated in the summary
  });
});
