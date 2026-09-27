import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { beginEvalRun } from '../../src/database/evalRun';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import * as evalMutation from '../../src/models/evalMutation';
import EvalResult from '../../src/models/evalResult';
import { recalculatePromptMetrics } from '../../src/node/recalculatePromptMetrics';
import { deleteErrorResults } from '../../src/node/retry';
import { ResultFailureReason } from '../../src/types/index';
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
    vi.restoreAllMocks();
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

  it('retains reconstructed target usage when restoring incurred grading totals', async () => {
    const evaluation = await saved(
      {
        tokenUsage: {
          total: 5,
          numRequests: 1,
          assertions: { total: 7, cached: 7, numRequests: 1 },
          incurredTokenUsage: {
            total: 5,
            numRequests: 1,
            assertions: { total: 0, numRequests: 0 },
          },
        },
      },
      [
        {
          gradingResult: null,
          response: { output: 'ok', tokenUsage: { total: 5, numRequests: 1 } },
        },
      ],
    );
    await recalculatePromptMetrics(evaluation);
    expect(evaluation.prompts[0].metrics!.tokenUsage.incurredTokenUsage).toMatchObject({
      total: 5,
      numRequests: 1,
      assertions: { total: 0, numRequests: 0 },
    });
  });

  it('preserves the whole header when saved rows omit accounted work', async () => {
    const evaluation = await saved(
      {
        testPassCount: 2,
        score: 2,
        assertPassCount: 2,
        cost: 11,
        tokenUsage: { total: 11, numRequests: 2 },
        namedScores: { quality: 2, Rows: 2 },
        namedScoresCount: { quality: 2 },
        namedScoreWeights: { quality: 2 },
      },
      [
        {
          cost: 1,
          response: { output: 'ok', tokenUsage: { total: 1, numRequests: 1 } },
          namedScores: { quality: 1 },
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Persisted row',
            componentResults: [
              {
                pass: true,
                score: 1,
                reason: 'Passed',
                assertion: { type: 'contains', metric: 'quality' },
              },
            ],
            tokensUsed: { total: 0, numRequests: 0 },
          },
        },
      ],
      { derivedMetrics: [{ name: 'Rows', value: '__count' }] },
    );
    const before = structuredClone(evaluation.prompts[0].metrics);
    const interrupted = await beginEvalRun(evaluation);
    await interrupted(false);
    const release = await beginEvalRun(evaluation, () => recalculatePromptMetrics(evaluation));
    await release();
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toEqual(before);
  });

  it.each([false, true])(
    'atomically debits retry rows before preserving unknown history (rollback=%s)',
    async (rollback) => {
      const evaluation = await saved(
        {
          testPassCount: 1,
          testErrorCount: 2,
          assertPassCount: 1,
          tokenUsage: { total: 3, numRequests: 3, assertions: { total: 19, numRequests: 3 } },
        },
        [
          ...[5, 3].map((total) => ({
            testIdx: 0,
            success: false,
            failureReason: ResultFailureReason.ERROR,
            gradingResult: null,
            response: {
              error: 'Retryable',
              tokenUsage: { total: 1, numRequests: 1, assertions: { total, numRequests: 1 } },
            },
          })),
          {
            testIdx: 1,
            success: true,
            failureReason: ResultFailureReason.NONE,
            gradingResult: null,
            response: {
              output: 'Imported stripped grade',
              tokenUsage: { total: 1, numRequests: 1 },
            },
          },
        ],
      );
      const rows = await EvalResult.findManyByEvalId(evaluation.id);
      const old = rows.find((row) => row.response?.tokenUsage?.assertions?.total === 5)!;
      const before = structuredClone(evaluation.prompts);
      const notify = vi.spyOn(evalMutation, 'notifyEvaluationChanged');
      if (rollback) {
        const db = await getDb();
        await db.run(
          sql`CREATE TRIGGER qa_retry_metric_rollback BEFORE UPDATE OF prompts ON evals BEGIN SELECT RAISE(FAIL, 'retry header rejected'); END`,
        );
        try {
          await expect(deleteErrorResults([old.id], evaluation)).rejects.toThrow();
          expect(
            (await EvalResult.findManyByEvalId(evaluation.id)).map((row) => row.id).sort(),
          ).toEqual(rows.map((row) => row.id).sort());
          expect((await Eval.findById(evaluation.id))!.prompts).toEqual(before);
          expect(evaluation.prompts).toEqual(before);
          expect(notify).not.toHaveBeenCalled();
        } finally {
          await db.run(sql`DROP TRIGGER qa_retry_metric_rollback`);
        }
      } else {
        await deleteErrorResults([old.id], evaluation);
        expect(evaluation.prompts[0].metrics!.tokenUsage.assertions!.total).toBe(14);
        expect(notify).toHaveBeenCalledOnce();
        notify.mockClear();
        await deleteErrorResults([old.id], evaluation);
        expect(notify).not.toHaveBeenCalled();
        await recalculatePromptMetrics(evaluation);
        expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
          testPassCount: 1,
          testErrorCount: 1,
          tokenUsage: { total: 2, numRequests: 2, assertions: { total: 14, numRequests: 2 } },
        });
      }
    },
  );
});
