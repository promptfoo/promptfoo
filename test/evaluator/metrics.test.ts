import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { type ApiProvider, ResultFailureReason, type TestSuite } from '../../src/types/index';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator metrics and scoring', () => {
  it('evaluator should count named score assertions per metric', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt for namedScoresCount')],
      tests: [
        {
          vars: { var1: 'value1' },
          assert: [
            {
              type: 'equals',
              value: 'Test output',
              metric: 'Accuracy',
            },
            {
              type: 'contains',
              value: 'Test',
              metric: 'Accuracy',
            },
            {
              type: 'javascript',
              value: 'output.length > 0',
              metric: 'Completeness',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.results).toHaveLength(1);
    const result = summary.results[0];

    // Use toMatchObject pattern to avoid conditional expects
    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: result.provider.id,
          metrics: expect.objectContaining({
            namedScoresCount: expect.objectContaining({
              Accuracy: 2,
              Completeness: 1,
            }),
          }),
        }),
      ]),
    );
  });

  it('evaluator should count named scores with template metric variables per assertion', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt for template metrics')],
      tests: [
        {
          vars: { metricCategory: 'Accuracy' },
          assert: [
            {
              type: 'equals',
              value: 'Test output',
              metric: '{{metricCategory}}',
            },
            {
              type: 'contains',
              value: 'Test',
              metric: '{{metricCategory}}',
            },
          ],
        },
        {
          vars: { metricCategory: 'Accuracy' },
          assert: [
            {
              type: 'javascript',
              value: 'output.length > 0',
              metric: '{{metricCategory}}',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metrics: expect.objectContaining({
            namedScores: expect.objectContaining({
              Accuracy: expect.any(Number),
            }),
            namedScoresCount: expect.objectContaining({
              Accuracy: 3, // 2 assertions in the first test + 1 in the second
            }),
          }),
        }),
      ]),
    );
  });

  it('evaluator should preserve weighted named score totals alongside prompt denominators', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt for weighted metrics')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Test output',
              metric: 'Accuracy',
              weight: 3,
            },
            {
              type: 'contains',
              value: 'Missing output',
              metric: 'Accuracy',
              weight: 1,
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const results = await evalRecord.getResults();
    const promptMetrics = evalRecord.prompts[0]?.metrics;

    expect(results[0].namedScores?.Accuracy).toBeCloseTo(0.75, 10);
    expect(results[0].gradingResult?.namedScoreWeights?.Accuracy).toBe(4);
    expect(promptMetrics?.namedScores.Accuracy).toBeCloseTo(3, 10);
    expect(promptMetrics?.namedScoresCount.Accuracy).toBe(2);
    expect(promptMetrics?.namedScoreWeights?.Accuracy).toBe(4);
    expect(
      (promptMetrics?.namedScores.Accuracy ?? 0) /
        (promptMetrics?.namedScoreWeights?.Accuracy ?? 1),
    ).toBeCloseTo(0.75, 10);
  });

  it('evaluator should handle mixed static and template metrics correctly', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test mixed metrics')],
      tests: [
        {
          vars: { category: 'Dynamic' },
          assert: [
            {
              type: 'equals',
              value: 'Test output',
              metric: '{{category}}',
            },
            {
              type: 'contains',
              value: 'Test',
              metric: 'Static',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metrics: expect.objectContaining({
            namedScoresCount: expect.objectContaining({
              Dynamic: 1,
              Static: 1,
            }),
          }),
        }),
      ]),
    );
  });

  it('evaluator should calculate derived metrics with __count variable for averages', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt for derived metrics')],
      tests: [
        {
          vars: { errorValue: 0.1 },
          assert: [
            {
              type: 'javascript',
              value: 'context.vars.errorValue',
              metric: 'APE',
            },
          ],
        },
        {
          vars: { errorValue: 0.2 },
          assert: [
            {
              type: 'javascript',
              value: 'context.vars.errorValue',
              metric: 'APE',
            },
          ],
        },
        {
          vars: { errorValue: 0.3 },
          assert: [
            {
              type: 'javascript',
              value: 'context.vars.errorValue',
              metric: 'APE',
            },
          ],
        },
      ],
      derivedMetrics: [
        {
          name: 'APE_sum',
          value: 'APE', // Should be 0.1 + 0.2 + 0.3 = 0.6
        },
        {
          name: 'MAPE',
          value: 'APE / __count', // Should be 0.6 / 3 = 0.2
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    const metrics = evalRecord.prompts[0]?.metrics;
    expect(metrics).toBeDefined();
    expect(metrics!.namedScores.APE).toBeCloseTo(0.6, 10);
    expect(metrics!.namedScores.APE_sum).toBeCloseTo(0.6, 10);
    expect(metrics!.namedScores.MAPE).toBeCloseTo(0.2, 10);
  });

  it('evaluator should pass __count to JavaScript function derived metrics', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt for function derived metrics')],
      tests: [
        {
          vars: { score: 10 },
          assert: [{ type: 'javascript', value: 'context.vars.score', metric: 'Score' }],
        },
        {
          vars: { score: 20 },
          assert: [{ type: 'javascript', value: 'context.vars.score', metric: 'Score' }],
        },
      ],
      derivedMetrics: [
        {
          name: 'AverageScore',
          value: (namedScores: Record<string, number>) => {
            // __count should be available in namedScores
            const count = namedScores.__count || 1;
            return namedScores.Score / count;
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metrics: expect.objectContaining({
            namedScores: expect.objectContaining({
              Score: 30, // 10 + 20
              AverageScore: 15, // 30 / 2
            }),
          }),
        }),
      ]),
    );
  });

  it('evaluator should calculate __count per-prompt with multiple prompts', async () => {
    // With 2 prompts and 3 tests, each prompt should have __count = 3 (not 6)
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('First prompt'), toPrompt('Second prompt')],
      tests: [
        {
          vars: { errorValue: 0.1 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
        {
          vars: { errorValue: 0.2 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
        {
          vars: { errorValue: 0.3 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
      ],
      derivedMetrics: [
        {
          name: 'MAPE',
          value: 'APE / __count', // Should be 0.6 / 3 = 0.2 for each prompt
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // Both prompts should have the same MAPE since they each get 3 test evaluations
    const metrics0 = evalRecord.prompts[0]?.metrics;
    const metrics1 = evalRecord.prompts[1]?.metrics;
    expect(metrics0).toBeDefined();
    expect(metrics1).toBeDefined();
    expect(metrics0!.namedScores.APE).toBeCloseTo(0.6, 10);
    expect(metrics0!.namedScores.MAPE).toBeCloseTo(0.2, 10); // 0.6 / 3, not 0.6 / 6
    expect(metrics1!.namedScores.APE).toBeCloseTo(0.6, 10);
    expect(metrics1!.namedScores.MAPE).toBeCloseTo(0.2, 10); // 0.6 / 3, not 0.6 / 6
  });

  it('evaluator should calculate __count per-prompt with multiple providers', async () => {
    // With 1 prompt and 2 providers, there are 2 prompt entries (one per provider).
    // Each prompt entry gets 2 test evaluations, so __count = 2 for each.
    const mockProvider1: ApiProvider = {
      id: () => 'provider1',
      callApi: async () => ({ output: 'response1' }),
    };
    const mockProvider2: ApiProvider = {
      id: () => 'provider2',
      callApi: async () => ({ output: 'response2' }),
    };
    const testSuite: TestSuite = {
      providers: [mockProvider1, mockProvider2],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { errorValue: 0.1 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
        {
          vars: { errorValue: 0.2 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
      ],
      derivedMetrics: [
        {
          name: 'MAPE',
          value: 'APE / __count', // 0.3 / 2 = 0.15 for each provider's prompt
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // With 2 providers, there are 2 prompt entries (one per provider)
    expect(evalRecord.prompts).toHaveLength(2);

    // Each prompt entry has its own metrics from its 2 test evaluations
    const metrics0 = evalRecord.prompts[0]?.metrics;
    const metrics1 = evalRecord.prompts[1]?.metrics;
    expect(metrics0).toBeDefined();
    expect(metrics1).toBeDefined();
    // Each provider's prompt gets APE = 0.3 (0.1 + 0.2)
    expect(metrics0!.namedScores.APE).toBeCloseTo(0.3, 10);
    expect(metrics1!.namedScores.APE).toBeCloseTo(0.3, 10);
    // __count = 2 (tests per provider), so MAPE = 0.3 / 2 = 0.15
    expect(metrics0!.namedScores.MAPE).toBeCloseTo(0.15, 10);
    expect(metrics1!.namedScores.MAPE).toBeCloseTo(0.15, 10);
  });

  it('should apply max-score to overall pass/fail and stats', async () => {
    const maxScoreProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('max-score-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        tokenUsage: { total: 1, prompt: 1, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [maxScoreProvider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [
        {
          assert: [{ type: 'contains', value: 'hello' }, { type: 'max-score' }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    const results = summary.results
      .filter((result) => result.testIdx === 0)
      .sort((a, b) => a.promptIdx - b.promptIdx);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].failureReason).toBe(ResultFailureReason.ASSERT);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(1);
    expect(summary.stats.errors).toBe(0);
  });

  it('should apply select-best to overall pass/fail and stats', async () => {
    // Mock matchesSelectBest to return deterministic results (first wins, second loses)
    const matchers = await import('../../src/matchers/comparison');
    const matchesSelectBestSpy = vi.spyOn(matchers, 'matchesSelectBest').mockResolvedValue([
      { pass: true, score: 1, reason: 'Selected as best' },
      { pass: false, score: 0, reason: 'Not selected' },
    ]);

    try {
      const selectBestProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('select-best-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'hello world',
          tokenUsage: { total: 1, prompt: 1, completion: 0, cached: 0, numRequests: 1 },
        }),
      };

      const testSuite: TestSuite = {
        providers: [selectBestProvider],
        prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
        tests: [
          {
            assert: [
              { type: 'contains', value: 'hello' },
              { type: 'select-best', value: 'choose the best one' },
            ],
          },
        ],
      };

      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, {});
      const summary = await evalRecord.toEvaluateSummary();
      const results = summary.results
        .filter((result) => result.testIdx === 0)
        .sort((a, b) => a.promptIdx - b.promptIdx);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].failureReason).toBe(ResultFailureReason.ASSERT);
      expect(summary.stats.successes).toBe(1);
      expect(summary.stats.failures).toBe(1);
      expect(summary.stats.errors).toBe(0);
    } finally {
      matchesSelectBestSpy.mockRestore();
    }
  });

  it('evaluate with assertScoringFunction', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assertScoringFunction: 'file://path/to/scoring.js:customScore',
          assert: [
            {
              type: 'equals',
              value: 'Test output',
              metric: 'accuracy',
            },
            {
              type: 'contains',
              value: 'output',
              metric: 'relevance',
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].score).toBe(0.75);
  });
});
