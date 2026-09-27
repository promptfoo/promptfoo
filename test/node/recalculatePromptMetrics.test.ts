import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { beginEvalRun } from '../../src/database/evalRun';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { recalculatePromptMetrics } from '../../src/node/recalculatePromptMetrics';
import { deleteEval } from '../../src/util/database';
import {
  createCompletedPrompt,
  createEvaluateResult,
  createPromptMetrics,
} from '../factories/eval';

import type { EvaluateResult, PromptMetrics, UnifiedConfig } from '../../src/types/index';

describe('replaying retained prompt metrics', () => {
  const evalIds: string[] = [];

  beforeAll(async () => {
    await runDbMigrations();
  });
  afterEach(async () => {
    for (const id of evalIds.splice(0)) {
      await deleteEval(id);
    }
  });

  async function saved(
    metrics: Partial<PromptMetrics>,
    rows: Partial<EvaluateResult>[],
    config: Partial<UnifiedConfig> = {},
  ) {
    const prompt = createCompletedPrompt('test', { metrics: createPromptMetrics(metrics) });
    const evaluation = await Eval.create(config, [prompt], {
      id: randomUUID(),
      completedPrompts: [prompt],
    });
    evalIds.push(evaluation.id);
    for (const [testIdx, row] of rows.entries()) {
      await evaluation.addResult(createEvaluateResult({ prompt, testIdx, ...row }));
    }
    return (await Eval.findById(evaluation.id))!;
  }

  it.each([false, true])(
    'preserves only unknown legacy named buckets (weights=%s)',
    async (weighted) => {
      const evaluation = await saved(
        {
          namedScores: { quality: 99, fresh: 99 },
          namedScoresCount: { quality: 2, fresh: 99 },
          namedScoreWeights: { quality: 2, fresh: 99 },
        },
        [
          {
            namedScores: { quality: weighted ? 0.5 : 1 },
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'historical metric templates',
              namedScoreWeights: weighted ? { quality: 3 } : undefined,
              componentResults: [
                ...Array.from({ length: 2 }, () => ({
                  pass: true,
                  score: 0.5,
                  reason: 'legacy',
                  assertion: { type: 'contains' as const, metric: '{{ metricName }}' },
                })),
              ],
            },
          },
          {
            namedScores: { fresh: 0.25 },
            gradingResult: {
              pass: true,
              score: 0.25,
              reason: 'known',
              namedScoreWeights: { fresh: 2 },
              componentResults: [
                {
                  pass: true,
                  score: 0.25,
                  reason: 'known',
                  assertion: { type: 'contains', metric: 'fresh' },
                  metadata: { renderedMetric: 'fresh' },
                },
              ],
            },
          },
        ],
      );

      await recalculatePromptMetrics(evaluation);
      const metrics = (await Eval.findById(evaluation.id))!.prompts[0].metrics!;
      expect(metrics.namedScoresCount.quality).toBe(2);
      expect(metrics.namedScoresCount.fresh).toBe(1);
      expect(metrics.namedScores).toEqual({ quality: weighted ? 1.5 : 1, fresh: 0.5 });
      expect(metrics.namedScoreWeights).toEqual({ quality: weighted ? 3 : 2, fresh: 2 });
    },
  );

  it.each([null, { pass: true, score: 1, reason: 'componentless historical grade' }])(
    'keeps unavailable assertion history during interrupted recovery (%j)',
    async (gradingResult) => {
      const evaluation = await saved(
        {
          assertPassCount: 4,
          assertFailCount: 2,
          tokenUsage: {
            total: 99,
            numRequests: 9,
            assertions: { total: 17, numRequests: 3 },
            incurredTokenUsage: { total: 99, assertions: { total: 7, numRequests: 1 } },
          },
          namedScores: { quality: 6, Average: 3 },
          namedScoresCount: { quality: 4 },
          namedScoreWeights: { quality: 8 },
        },
        [
          {
            gradingResult,
            namedScores: { quality: 0.5 },
            response: {
              output: 'ok',
              tokenUsage: { total: 5, numRequests: 1, incurredTokenUsage: { total: 2 } },
            },
            cost: 2,
          },
        ],
        { derivedMetrics: [{ name: 'Average', value: 'quality / __count' }] },
      );
      const interrupted = await beginEvalRun(evaluation);
      await interrupted(false);
      const reloaded = (await Eval.findById(evaluation.id))!;
      const release = await beginEvalRun(reloaded, () => recalculatePromptMetrics(reloaded));
      await release();

      const metrics = (await Eval.findById(evaluation.id))!.prompts[0].metrics!;
      expect(metrics).toMatchObject({
        testPassCount: 1,
        cost: 2,
        assertPassCount: 4,
        assertFailCount: 2,
        namedScores: { quality: 6, Average: 6 },
        namedScoresCount: { quality: 4 },
        namedScoreWeights: { quality: 8 },
      });
      expect(metrics.tokenUsage).toMatchObject({
        total: 5,
        numRequests: 1,
        assertions: { total: 17, numRequests: 3 },
        incurredTokenUsage: { total: 2, assertions: { total: 7, numRequests: 1 } },
      });
    },
  );

  it('rebuilds explicit zero usage, assertion counts, and weights', async () => {
    const evaluation = await saved(
      {
        assertPassCount: 9,
        tokenUsage: { assertions: { total: 9 } },
        namedScores: { quality: 9 },
        namedScoresCount: { quality: 9 },
        namedScoreWeights: { quality: 9 },
      },
      [
        {
          namedScores: { quality: 0 },
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'known zeros',
            componentResults: [],
            tokensUsed: { total: 0, numRequests: 0 },
            namedScoreWeights: { quality: 0 },
          },
        },
      ],
    );
    await recalculatePromptMetrics(evaluation);
    const metrics = evaluation.prompts[0].metrics!;
    expect(metrics.assertPassCount).toBe(0);
    expect(metrics.assertFailCount).toBe(0);
    expect(metrics.tokenUsage.assertions?.total).toBe(0);
    expect(metrics.namedScoreWeights?.quality).toBe(0);
  });

  it('does not invent unavailable named counts, weights, or grading usage', async () => {
    const evaluation = await saved({ tokenUsage: {}, namedScores: {}, namedScoresCount: {} }, [
      { gradingResult: null, namedScores: { quality: 0.5 } },
    ]);
    await recalculatePromptMetrics(evaluation);
    const metrics = evaluation.prompts[0].metrics!;
    expect(metrics.namedScores).toEqual({});
    expect(metrics.namedScoresCount).toEqual({});
    expect(metrics.namedScoreWeights?.quality).toBeUndefined();
    expect(metrics.tokenUsage.assertions).toBeUndefined();
  });
});
