import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate, runEval } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { mockApiProvider, mockGradingApiProviderPasses, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator token usage', () => {
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
        numRequests: 1,
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

  it('preserves separate target, attacker, and grading usage through eval persistence', async () => {
    const providerWithAttackerUsage: ApiProvider = {
      id: vi.fn().mockReturnValue('redteam-provider-with-attacker-usage'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: {
          total: 100,
          prompt: 60,
          completion: 40,
          cached: 10,
          numRequests: 1,
          attacker: {
            total: 48,
            prompt: 32,
            completion: 16,
            cached: 4,
            numRequests: 3,
          },
        },
      }),
    };
    const gradingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('grading-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'Test passed' }),
        tokenUsage: {
          total: 25,
          prompt: 15,
          completion: 10,
          numRequests: 1,
          completionDetails: { reasoning: 7 },
        },
      }),
    };
    const testSuite: TestSuite = {
      providers: [providerWithAttackerUsage],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'Output should be valid',
              provider: gradingProvider,
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.tokenUsage).toMatchObject({
      total: 100,
      prompt: 60,
      completion: 40,
      numRequests: 1,
      attacker: { total: 48, prompt: 32, completion: 16, cached: 4, numRequests: 3 },
      assertions: {
        total: 25,
        prompt: 15,
        completion: 10,
        numRequests: 1,
        completionDetails: { reasoning: 7 },
      },
    });
  });

  it('combines internal judge calls with all stored red-team grading turns exactly once', async () => {
    const redteamProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('redteam-provider-with-stored-grades'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Target response',
        metadata: {
          storedGraderResult: {
            pass: true,
            score: 1,
            reason: 'Final grading turn passed',
            tokensUsed: {
              total: 60,
              prompt: 36,
              completion: 24,
              numRequests: 3,
              completionDetails: { reasoning: 9 },
            },
          },
        },
        tokenUsage: {
          total: 100,
          prompt: 60,
          completion: 40,
          numRequests: 1,
          assertions: {
            total: 14,
            prompt: 9,
            completion: 5,
            numRequests: 2,
            completionDetails: { reasoning: 3 },
          },
        },
      }),
    };
    const testSuite: TestSuite = {
      providers: [redteamProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [{ type: 'promptfoo:redteam:harmful:hate' }],
          metadata: { pluginId: 'harmful:hate', strategyId: 'jailbreak:hydra' },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.tokenUsage).toMatchObject({
      total: 100,
      numRequests: 1,
      assertions: {
        total: 74,
        prompt: 45,
        completion: 29,
        numRequests: 5,
        completionDetails: { reasoning: 12 },
      },
    });
  });

  it('retains attacker usage when the strategy returns an error before probing the target', async () => {
    const failingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('failing-redteam-provider'),
      callApi: vi.fn().mockResolvedValue({
        error: 'Attack generation failed',
        tokenUsage: {
          total: 0,
          numRequests: 0,
          attacker: { total: 73, prompt: 45, completion: 28, numRequests: 3 },
        },
      }),
    };

    const results = await runEval({
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: true,
      provider: failingProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
    });

    expect(results[0]).toMatchObject({
      error: 'Attack generation failed',
      success: false,
      tokenUsage: {
        total: 0,
        numRequests: 0,
        attacker: { total: 73, prompt: 45, completion: 28, numRequests: 3 },
      },
    });
  });
});
