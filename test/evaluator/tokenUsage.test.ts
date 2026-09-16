import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate, runEval } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { mockApiProvider, mockGradingApiProviderPasses, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator token usage', () => {
  it('does not count deterministic assertions as grading-provider requests', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ assert: [{ type: 'equals', value: 'Test output' }] }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.tokenUsage.assertions).toMatchObject({ total: 0, numRequests: 0 });
    expect(summary.results[0].tokenUsage?.assertions).toMatchObject({
      total: 0,
      numRequests: 0,
    });
  });

  it.each([1, 2])(
    'separates cached target footprint from fresh grading at concurrency %i',
    async (maxConcurrency) => {
      const cachedTargetProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('cached-target-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Cached target response',
          cached: true,
          cost: 0.29,
          tokenUsage: {
            total: 295,
            prompt: 201,
            completion: 94,
            cached: 12,
            numRequests: 1,
            completionDetails: { reasoning: 8 },
          },
        }),
      };
      const gradingProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('fresh-grading-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Fresh grading result' }),
          tokenUsage: { total: 37, prompt: 23, completion: 14, numRequests: 1 },
        }),
      };
      const testSuite: TestSuite = {
        providers: [cachedTargetProvider],
        prompts: [toPrompt('Test prompt')],
        tests: [
          {
            assert: [
              {
                type: 'llm-rubric',
                value: 'The response should be useful',
                provider: gradingProvider,
              },
            ],
          },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

      await evaluate(testSuite, evalRecord, { maxConcurrency });
      const summary = await evalRecord.toEvaluateSummary();

      for (const tokenUsage of [summary.stats.tokenUsage, summary.results[0].tokenUsage]) {
        expect(tokenUsage).toMatchObject({
          total: 295,
          prompt: 201,
          completion: 94,
          cached: 295,
          numRequests: 1,
          completionDetails: { reasoning: 8 },
          assertions: { total: 37, prompt: 23, completion: 14, numRequests: 1 },
          incurredTokenUsage: {
            total: 0,
            prompt: 0,
            completion: 0,
            numRequests: 0,
            assertions: { total: 37, prompt: 23, completion: 14, numRequests: 1 },
          },
        });
      }
      expect(summary.results[0].response).toMatchObject({
        cached: true,
        cost: 0.29,
        incurredCost: 0,
        tokenUsage: {
          total: 295,
          prompt: 201,
          completion: 94,
          cached: 295,
          numRequests: 1,
          completionDetails: { reasoning: 8 },
          incurredTokenUsage: { total: 0, numRequests: 0 },
        },
      });
      expect(summary.results[0]).toMatchObject({ cost: 0.29, incurredCost: 0 });
    },
  );

  it('preserves logical and incurred costs from mixed-cache composite target responses', async () => {
    const mixedTargetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('mixed-cache-target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Cached winning response after a fresh candidate',
        cost: 0.16,
        incurredCost: 0.06,
        tokenUsage: {
          total: 160,
          prompt: 105,
          completion: 55,
          cached: 100,
          numRequests: 2,
          incurredTokenUsage: { total: 60, prompt: 40, completion: 20, numRequests: 1 },
        },
      }),
    };
    const testSuite: TestSuite = {
      providers: [mixedTargetProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ assert: [{ type: 'contains', value: 'winning response' }] }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.results[0]).toMatchObject({
      cost: 0.16,
      incurredCost: 0.06,
      response: { cost: 0.16, incurredCost: 0.06 },
      tokenUsage: {
        total: 160,
        numRequests: 2,
        incurredTokenUsage: { total: 60, numRequests: 1 },
      },
    });
    expect(evalRecord.prompts[0].metrics).toMatchObject({ cost: 0.16, incurredCost: 0.06 });
  });

  it('preserves logical target and grading calls when both responses are cached', async () => {
    const cachedTargetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('cached-target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Cached target response',
        cached: true,
        tokenUsage: { total: 295, prompt: 201, completion: 94, numRequests: 1 },
      }),
    };
    const cachedGradingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('cached-grading-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'Cached grading result' }),
        cached: true,
        tokenUsage: { total: 37, prompt: 23, completion: 14, numRequests: 1 },
      }),
    };
    const testSuite: TestSuite = {
      providers: [cachedTargetProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'The response should be useful',
              provider: cachedGradingProvider,
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    for (const tokenUsage of [summary.stats.tokenUsage, summary.results[0].tokenUsage]) {
      expect(tokenUsage).toMatchObject({
        total: 295,
        cached: 295,
        numRequests: 1,
        assertions: { total: 37, cached: 37, numRequests: 1 },
        incurredTokenUsage: {
          total: 0,
          numRequests: 0,
          assertions: { total: 0, numRequests: 0 },
        },
      });
    }
    expect(summary.results[0].response?.tokenUsage).toMatchObject({
      total: 295,
      cached: 295,
      numRequests: 1,
      incurredTokenUsage: { total: 0, numRequests: 0 },
    });
  });

  it.each(['cached-first', 'fresh-first'] as const)(
    'preserves mixed cached and fresh grading in summaries and filtered metrics (%s)',
    async (ordering) => {
      const targetProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('fresh-target-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Fresh target response',
          tokenUsage: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
        }),
      };
      const cachedGradingProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('cached-grading-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Cached grading result' }),
          cached: true,
          tokenUsage: {
            total: 37,
            prompt: 23,
            completion: 14,
            numRequests: 1,
            completionDetails: { reasoning: 9 },
          },
        }),
      };
      const freshGradingProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('fresh-grading-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Fresh grading result' }),
          tokenUsage: {
            total: 23,
            prompt: 15,
            completion: 8,
            numRequests: 1,
            completionDetails: { reasoning: 4 },
          },
        }),
      };
      const gradingProviders =
        ordering === 'cached-first'
          ? [cachedGradingProvider, freshGradingProvider]
          : [freshGradingProvider, cachedGradingProvider];
      const testSuite: TestSuite = {
        providers: [targetProvider],
        prompts: [toPrompt('Test prompt')],
        tests: [
          {
            assert: gradingProviders.map((provider, index) => ({
              type: 'llm-rubric' as const,
              value: `Grading criterion ${index}`,
              provider,
            })),
          },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

      await evaluate(testSuite, evalRecord, {});
      const summary = await evalRecord.toEvaluateSummary();
      const [filteredMetrics] = await evalRecord.getFilteredMetrics({});

      for (const tokenUsage of [
        summary.stats.tokenUsage,
        summary.results[0].tokenUsage,
        evalRecord.prompts[0].metrics?.tokenUsage,
      ]) {
        expect(tokenUsage).toMatchObject({
          total: 100,
          numRequests: 1,
          assertions: {
            total: 60,
            prompt: 38,
            completion: 22,
            cached: 37,
            numRequests: 2,
            completionDetails: { reasoning: 13 },
          },
          incurredTokenUsage: {
            total: 100,
            numRequests: 1,
            assertions: {
              total: 23,
              prompt: 15,
              completion: 8,
              numRequests: 1,
              completionDetails: { reasoning: 4 },
            },
          },
        });
      }
      expect(summary.results[0].gradingResult?.tokensUsed).toMatchObject({
        total: 60,
        cached: 37,
        numRequests: 2,
        completionDetails: { reasoning: 13 },
        incurredTokenUsage: {
          total: 23,
          numRequests: 1,
          completionDetails: { reasoning: 4 },
        },
      });
      expect(filteredMetrics.tokenUsage).toMatchObject({
        total: 100,
        numRequests: 1,
        assertions: {
          total: 60,
          prompt: 38,
          completion: 22,
          cached: 37,
          numRequests: 2,
        },
        incurredTokenUsage: {
          total: 100,
          numRequests: 1,
          assertions: { total: 23, prompt: 15, completion: 8, numRequests: 1 },
        },
      });
    },
  );

  it('preserves mixed-cache grading provider usage through evaluation summaries', async () => {
    const targetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('fresh-target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Fresh target response',
        tokenUsage: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
      }),
    };
    const mixedCacheGradingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('mixed-cache-grading-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'Mixed grading result' }),
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
      }),
    };
    const testSuite: TestSuite = {
      providers: [targetProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'The response should be useful',
              provider: mixedCacheGradingProvider,
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    for (const tokenUsage of [
      summary.stats.tokenUsage,
      summary.results[0].tokenUsage,
      evalRecord.prompts[0].metrics?.tokenUsage,
    ]) {
      expect(tokenUsage).toMatchObject({
        total: 50,
        numRequests: 1,
        assertions: {
          total: 100,
          prompt: 70,
          completion: 30,
          cached: 70,
          numRequests: 2,
          completionDetails: { reasoning: 9 },
        },
        incurredTokenUsage: {
          total: 50,
          numRequests: 1,
          assertions: {
            total: 30,
            prompt: 20,
            completion: 10,
            numRequests: 1,
            completionDetails: { reasoning: 4 },
          },
        },
      });
    }
    expect(summary.results[0].gradingResult?.tokensUsed).toMatchObject({
      total: 100,
      numRequests: 2,
      incurredTokenUsage: { total: 30, numRequests: 1 },
    });
  });

  it('retains fresh attacker usage when a strategy reuses a cached target response', async () => {
    const strategyProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('cached-target-strategy-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Cached target response',
        cached: true,
        tokenUsage: {
          total: 0,
          cached: 295,
          numRequests: 0,
          attacker: {
            total: 28,
            prompt: 20,
            completion: 8,
            numRequests: 1,
            completionDetails: { reasoning: 3 },
          },
        },
      }),
    };
    const testSuite: TestSuite = {
      providers: [strategyProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{ assert: [{ type: 'contains', value: 'Cached' }] }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    for (const tokenUsage of [summary.stats.tokenUsage, summary.results[0].tokenUsage]) {
      expect(tokenUsage).toMatchObject({
        total: 295,
        cached: 295,
        numRequests: 1,
        attacker: { total: 28, prompt: 20, completion: 8, numRequests: 1 },
        incurredTokenUsage: {
          total: 0,
          numRequests: 0,
          attacker: { total: 28, numRequests: 1 },
        },
      });
    }
    expect(summary.results[0].response?.tokenUsage).toMatchObject({
      total: 295,
      cached: 295,
      attacker: { total: 28, numRequests: 1 },
    });
  });

  it('counts a fresh model grader without reported token usage as one probe', async () => {
    const cachedTargetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('cached-target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Cached target response',
        cached: true,
        tokenUsage: { total: 295, prompt: 201, completion: 94, numRequests: 1 },
      }),
    };
    const gradingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('fresh-grading-provider-without-usage'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'Fresh grading result' }),
      }),
    };
    const testSuite: TestSuite = {
      providers: [cachedTargetProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'The response should be useful',
              provider: gradingProvider,
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(gradingProvider.callApi).toHaveBeenCalledTimes(1);
    for (const tokenUsage of [summary.stats.tokenUsage, summary.results[0].tokenUsage]) {
      expect(tokenUsage).toMatchObject({
        total: 295,
        cached: 295,
        numRequests: 1,
        assertions: { total: 0, numRequests: 1 },
        incurredTokenUsage: {
          total: 0,
          numRequests: 0,
          assertions: { total: 0, numRequests: 1 },
        },
      });
    }
    expect(summary.results[0].response?.tokenUsage).toMatchObject({
      total: 295,
      cached: 295,
      numRequests: 1,
    });
  });

  it('counts cached target turns as probes when comparison grading runs afterward', async () => {
    const matchers = await import('../../src/matchers/comparison');
    const freshComparison = {
      pass: true,
      score: 1,
      reason: 'Fresh comparison grade',
      tokensUsed: { total: 13, prompt: 8, completion: 5, numRequests: 1 },
    };
    const matchesSelectBestSpy = vi
      .spyOn(matchers, 'matchesSelectBest')
      .mockResolvedValue([freshComparison, { ...freshComparison }]);
    const cachedTargetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('cached-target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Cached target response',
        cached: true,
        tokenUsage: { total: 295, prompt: 201, completion: 94, numRequests: 1 },
      }),
    };

    try {
      const testSuite: TestSuite = {
        providers: [cachedTargetProvider],
        prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
        tests: [
          {
            assert: [
              { type: 'contains', value: 'Cached' },
              { type: 'select-best', value: 'choose the best response' },
            ],
          },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

      await evaluate(testSuite, evalRecord, {});
      const summary = await evalRecord.toEvaluateSummary();

      expect(summary.stats.tokenUsage).toMatchObject({
        total: 590,
        cached: 590,
        numRequests: 2,
        assertions: { total: 26, numRequests: 2 },
        incurredTokenUsage: {
          total: 0,
          numRequests: 0,
          assertions: { total: 26, numRequests: 2 },
        },
      });
      for (const result of summary.results) {
        expect(result.tokenUsage).toMatchObject({
          total: 295,
          cached: 295,
          numRequests: 1,
          assertions: { total: 13, numRequests: 1 },
          incurredTokenUsage: {
            total: 0,
            numRequests: 0,
            assertions: { total: 13, numRequests: 1 },
          },
        });
        expect(result.response?.tokenUsage).toMatchObject({
          total: 295,
          cached: 295,
          numRequests: 1,
        });
      }
    } finally {
      matchesSelectBestSpy.mockRestore();
    }
  });

  it('preserves fresh grading when a cached comparison creates the first incurred-usage split', async () => {
    const freshTargetProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('fresh-target-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Fresh target response',
        tokenUsage: {
          total: 100,
          prompt: 60,
          completion: 40,
          numRequests: 1,
          completionDetails: { reasoning: 2 },
        },
      }),
    };
    const freshGradingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('fresh-grading-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'Fresh grading result' }),
        tokenUsage: {
          total: 20,
          prompt: 12,
          completion: 8,
          numRequests: 1,
          completionDetails: { reasoning: 3 },
        },
      }),
    };
    const cachedComparisonProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('cached-comparison-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: '0',
        cached: true,
        tokenUsage: {
          total: 30,
          prompt: 18,
          completion: 12,
          numRequests: 1,
          completionDetails: { reasoning: 4 },
        },
      }),
    };
    const matchers = await import('../../src/matchers/comparison');
    const matchComparison = matchers.matchesSelectBest;
    const matchesSelectBestSpy = vi
      .spyOn(matchers, 'matchesSelectBest')
      .mockImplementation((criteria, outputs, _grading, vars, context) =>
        matchComparison(criteria, outputs, { provider: cachedComparisonProvider }, vars, context),
      );
    const testSuite: TestSuite = {
      providers: [freshTargetProvider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'The response should be useful',
              provider: freshGradingProvider,
            },
            { type: 'select-best', value: 'choose the best response' },
          ],
        },
      ],
    };
    try {
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

      await evaluate(testSuite, evalRecord, {});
      const summary = await evalRecord.toEvaluateSummary();

      expect(cachedComparisonProvider.callApi).toHaveBeenCalledTimes(1);
      expect(summary.stats.tokenUsage).toMatchObject({
        total: 200,
        numRequests: 2,
        assertions: { total: 100, cached: 60, numRequests: 4 },
        incurredTokenUsage: {
          total: 200,
          numRequests: 2,
          assertions: { total: 40, numRequests: 2 },
        },
      });

      for (const prompt of evalRecord.prompts) {
        expect(prompt.metrics?.tokenUsage).toMatchObject({
          total: 100,
          numRequests: 1,
          assertions: {
            total: 50,
            cached: 30,
            numRequests: 2,
            completionDetails: { reasoning: 7 },
          },
          incurredTokenUsage: {
            total: 100,
            numRequests: 1,
            assertions: {
              total: 20,
              numRequests: 1,
              completionDetails: { reasoning: 3 },
            },
          },
        });
      }

      for (const result of summary.results) {
        expect(result.tokenUsage).toMatchObject({
          total: 100,
          numRequests: 1,
          assertions: { total: 50, cached: 30, numRequests: 2 },
          incurredTokenUsage: {
            total: 100,
            numRequests: 1,
            assertions: { total: 20, numRequests: 1 },
          },
        });
        expect(result.gradingResult?.tokensUsed).toMatchObject({
          total: 50,
          cached: 30,
          numRequests: 2,
          incurredTokenUsage: { total: 20, numRequests: 1 },
        });
      }
    } finally {
      matchesSelectBestSpy.mockRestore();
    }
  });

  it('does not treat untrusted provider metadata as a cached grading response', async () => {
    const gradingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('fresh-grading-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({ pass: true, score: 1, reason: 'Fresh grading result' }),
        metadata: { cachedResponse: true },
        tokenUsage: { total: 37, prompt: 23, completion: 14, numRequests: 1 },
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'The response should be useful',
              provider: gradingProvider,
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.tokenUsage.assertions).toMatchObject({ total: 37, numRequests: 1 });
    expect(summary.results[0].tokenUsage?.assertions).toMatchObject({
      total: 37,
      numRequests: 1,
    });
  });

  it('does not recharge historical usage from a cached malformed grading response', async () => {
    const gradingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('cached-failed-grading-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'This cached response does not contain JSON',
        cached: true,
        tokenUsage: { total: 37, prompt: 23, completion: 14, numRequests: 1 },
      }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'The response should be useful',
              provider: gradingProvider,
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    for (const tokenUsage of [summary.stats.tokenUsage, summary.results[0].tokenUsage]) {
      expect(tokenUsage).toMatchObject({
        assertions: { total: 37, cached: 37, numRequests: 1 },
        incurredTokenUsage: { assertions: { total: 0, numRequests: 0 } },
      });
    }
    expect(summary.results[0].gradingResult?.componentResults?.[0]?.metadata).toMatchObject({
      graderError: true,
      cachedResponse: true,
    });
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

    expect(results[0].tokenUsage).toMatchObject({
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
    expect(summary.stats.tokenUsage).toMatchObject({
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
