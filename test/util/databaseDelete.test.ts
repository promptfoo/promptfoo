import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvalResultDeletionError } from '../../src/database/evalRun';
import { getDb } from '../../src/database/index';
import { updateSignalFile, updateSignalFileForDeletedEvals } from '../../src/database/signal';
import {
  blobAssetsTable,
  blobReferencesTable,
  evalResultsTable,
  spansTable,
  tracesTable,
} from '../../src/database/tables';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { TraceStore } from '../../src/tracing/store';
import {
  deleteAllEvals,
  deleteEval,
  deleteEvalResult,
  deleteEvals,
  EvalResultNotFoundError,
} from '../../src/util/database';
import { accumulateNamedMetric } from '../../src/util/namedMetrics';
import {
  accumulateGradingTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../../src/util/tokenUsageUtils';
import EvalFactory from '../factories/evalFactory';

import type { GradingResult, PromptMetrics, ProviderResponse } from '../../src/types/index';

vi.mock('../../src/database/signal', async () => {
  const actual = await vi.importActual('../../src/database/signal');
  return {
    ...actual,
    updateSignalFile: vi.fn(),
    updateSignalFileForDeletedEvals: vi.fn(),
  };
});

describe('database eval deletion', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.run('DELETE FROM spans');
    await db.run('DELETE FROM traces');
    await db.run('DELETE FROM blob_references');
    await db.run('DELETE FROM blob_assets');
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
  });

  async function addTrace(evalId: string, traceId: string) {
    const traceStore = new TraceStore();
    await traceStore.createTrace({
      traceId,
      evaluationId: evalId,
      testCaseId: 'test-case-id',
    });
    await traceStore.addSpans(traceId, [
      {
        spanId: `${traceId}-span`,
        name: 'test-span',
        startTime: 1,
      },
    ]);
  }

  it('deletes traces and spans for a single eval', async () => {
    const eval_ = await EvalFactory.create();
    await addTrace(eval_.id, 'trace-single');

    await deleteEval(eval_.id);

    const db = await getDb();
    expect(await Eval.findById(eval_.id)).toBeUndefined();
    expect(await db.select().from(tracesTable).all()).toHaveLength(0);
    expect(await db.select().from(spansTable).all()).toHaveLength(0);
    expect(updateSignalFileForDeletedEvals).toHaveBeenCalledWith([eval_.id]);
  });

  it('deletes only traces and spans for selected evals', async () => {
    const eval1 = await EvalFactory.create();
    const eval2 = await EvalFactory.create();
    const eval3 = await EvalFactory.create();
    await addTrace(eval1.id, 'trace-bulk-1');
    await addTrace(eval2.id, 'trace-bulk-2');
    await addTrace(eval3.id, 'trace-retained');

    await deleteEvals([eval1.id, eval2.id]);

    const db = await getDb();
    expect(await Eval.findById(eval1.id)).toBeUndefined();
    expect(await Eval.findById(eval2.id)).toBeUndefined();
    expect(await Eval.findById(eval3.id)).toBeDefined();
    expect(await db.select({ traceId: tracesTable.traceId }).from(tracesTable).all()).toEqual([
      { traceId: 'trace-retained' },
    ]);
    expect(await db.select({ traceId: spansTable.traceId }).from(spansTable).all()).toEqual([
      { traceId: 'trace-retained' },
    ]);
    expect(updateSignalFileForDeletedEvals).toHaveBeenCalledWith([eval1.id, eval2.id]);
  });

  it('does not emit a delete signal when called with an empty id list', async () => {
    // An empty deletedEvalIds list is indistinguishable from "all evals deleted" on the
    // client, so deleting zero evals must be a no-op rather than a spurious clear.
    await deleteEvals([]);

    expect(updateSignalFileForDeletedEvals).not.toHaveBeenCalled();
  });

  it('deletes traces and spans when deleting all evals', async () => {
    const eval1 = await EvalFactory.create();
    const eval2 = await EvalFactory.create();
    await addTrace(eval1.id, 'trace-all-1');
    await addTrace(eval2.id, 'trace-all-2');

    await deleteAllEvals();

    const db = await getDb();
    expect(await Eval.getMany()).toHaveLength(0);
    expect(await db.select().from(tracesTable).all()).toHaveLength(0);
    expect(await db.select().from(spansTable).all()).toHaveLength(0);
    expect(updateSignalFileForDeletedEvals).toHaveBeenCalledWith(undefined);
  });

  it('handles evals with no traces without error', async () => {
    const eval_ = await EvalFactory.create();

    await deleteEval(eval_.id);

    expect(await Eval.findById(eval_.id)).toBeUndefined();
  });

  it('deletes every span when a trace has multiple spans', async () => {
    const eval_ = await EvalFactory.create();
    await addTrace(eval_.id, 'trace-multi-span');
    await new TraceStore().addSpans('trace-multi-span', [
      { spanId: 'extra-span', name: 'extra', startTime: 2 },
    ]);

    await deleteEval(eval_.id);

    const db = await getDb();
    expect(await db.select().from(spansTable).all()).toHaveLength(0);
  });

  describe('deleteEvalResult', () => {
    it('keeps deletion metrics when an older eval instance saves metadata', async () => {
      const evaluation = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const stale = await Eval.findById(evaluation.id);
      const [target] = await EvalResult.findManyByEvalId(evaluation.id);
      await deleteEvalResult(evaluation.id, target.id);
      const afterDelete = await Eval.findById(evaluation.id);

      stale!.author = 'updated@example.com';
      stale!.setGenerationDurationMs(25);
      await stale!.save({ updatePrompts: false });

      const afterSave = await Eval.findById(evaluation.id);
      expect(afterSave?.author).toBe('updated@example.com');
      expect(afterSave?.generationDurationMs).toBe(25);
      expect(afterSave?.prompts).toEqual(afterDelete?.prompts);
      expect(await EvalResult.findManyByEvalId(evaluation.id)).toHaveLength(1);
    });

    it.each([
      {
        name: 'cached and incurred buckets',
        response: {
          cached: true,
          cost: 1,
          incurredCost: 0.2,
          tokenUsage: {
            total: 0,
            cached: 100,
            numRequests: 0,
            attacker: { total: 7, numRequests: 2 },
            generation: { total: 6, numRequests: 1 },
            incurredTokenUsage: {
              total: 0,
              numRequests: 0,
              attacker: { total: 3, numRequests: 1 },
              generation: { total: 2, numRequests: 1 },
            },
          },
        },
      },
      {
        name: 'omitted totals',
        response: { cost: 1, tokenUsage: { prompt: 6, completion: 4 } },
      },
      {
        name: 'uncached usage before incurred accounting begins',
        response: { cost: 1, tokenUsage: { total: 10, numRequests: 1 } },
      },
    ])('removes the forward contribution of $name', async ({ response }) => {
      const eval_ = await EvalFactory.create({ numResults: 2 });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const survivorResponse: ProviderResponse = {
        output: 'survivor',
        cached: true,
        cost: 2,
        incurredCost: 0.5,
        tokenUsage: {
          total: 20,
          numRequests: 1,
          attacker: { total: 5, numRequests: 1 },
          incurredTokenUsage: { total: 10, numRequests: 1, attacker: { total: 2, numRequests: 1 } },
        },
      };
      const targetGrade: GradingResult = {
        pass: true,
        score: 1,
        reason: 'multiple grading requests',
        tokensUsed: { total: 9, numRequests: 3 },
      };
      const survivorGrade: GradingResult = {
        pass: true,
        score: 1,
        reason: 'surviving grader',
        tokensUsed: { total: 4, numRequests: 1 },
      };
      const tokenUsage = createEmptyTokenUsage();
      for (const [providerResponse, gradingResult] of [
        [response, targetGrade],
        [survivorResponse, survivorGrade],
      ] as const) {
        accumulateResponseTokenUsage(tokenUsage, providerResponse);
        accumulateGradingTokenUsage(tokenUsage, gradingResult.tokensUsed);
      }
      const metrics = eval_.prompts[0].metrics!;
      Object.assign(metrics, {
        tokenUsage,
        cost: 3,
        incurredCost: (response.incurredCost ?? 1) + 0.5,
      });
      await eval_.addPrompts(eval_.prompts);
      await dbUpdateResult(target.id, { response, gradingResult: targetGrade, cost: 1 });
      await dbUpdateResult(survivor.id, {
        response: survivorResponse,
        gradingResult: survivorGrade,
        cost: 2,
      });

      await deleteEvalResult(eval_.id, target.id);

      const expectedUsage = createEmptyTokenUsage();
      expectedUsage.incurredTokenUsage = {};
      accumulateResponseTokenUsage(expectedUsage, survivorResponse);
      accumulateGradingTokenUsage(expectedUsage, survivorGrade.tokensUsed);
      const after = (await Eval.findById(eval_.id))!.prompts[0].metrics!;
      expect(after.tokenUsage).toMatchObject(expectedUsage);
      expect(after.tokenUsage.generation?.total ?? 0).toBe(0);
      expect(after.tokenUsage.incurredTokenUsage?.generation?.total ?? 0).toBe(0);
      expect(after.cost).toBe(2);
      expect(after.incurredCost).toBeCloseTo(0.5);
    });

    it.each([
      {},
      { pass: 'bad' },
      { pass: 1 },
      { componentResults: [{ pass: 'bad' }, []] },
      'bad',
      [],
    ])('does not debit surviving assertions for malformed grading %j', async (gradingResult) => {
      const eval_ = await EvalFactory.create({ numResults: 2 });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const metrics = eval_.prompts[0].metrics!;
      Object.assign(metrics, { assertPassCount: 1, assertFailCount: 1 });
      metrics.tokenUsage.assertions = { total: 8, numRequests: 2 };
      await eval_.addPrompts(eval_.prompts);
      await dbUpdateResult(target.id, { gradingResult: gradingResult as unknown as GradingResult });
      await dbUpdateResult(survivor.id, {
        gradingResult: {
          pass: false,
          score: 0,
          reason: 'survivor',
          tokensUsed: { total: 8, numRequests: 2 },
          componentResults: [
            { pass: true, score: 1, reason: 'pass' },
            { pass: false, score: 0, reason: 'fail' },
          ],
        },
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = (await Eval.findById(eval_.id))!.prompts[0].metrics!;
      expect(after).toMatchObject({ assertPassCount: 1, assertFailCount: 1 });
      expect(after.tokenUsage.assertions).toMatchObject({ total: 8, numRequests: 2 });
    });

    it('only subtracts completion detail fields tracked by the aggregate', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1 });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      eval_.prompts[0].metrics!.tokenUsage.completionDetails = { reasoning: 5 };
      await eval_.addPrompts(eval_.prompts);
      await dbUpdateResult(target.id, {
        response: { tokenUsage: { completionDetails: { reasoning: 2, acceptedPrediction: 3 } } },
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(
        (await Eval.findById(eval_.id))!.prompts[0].metrics!.tokenUsage.completionDetails,
      ).toEqual({ reasoning: 3 });
    });

    it('keeps response-side grading when reconstructing stripped assertion usage', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2 });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      eval_.prompts[0].metrics!.tokenUsage.assertions = { total: 25, numRequests: 5 };
      await eval_.addPrompts(eval_.prompts);
      await dbUpdateResult(target.id, { gradingResult: null });
      await dbUpdateResult(survivor.id, {
        response: { tokenUsage: { assertions: { total: 9, numRequests: 2 } } },
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'survivor',
          tokensUsed: { total: 4, numRequests: 1 },
        },
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(
        (await Eval.findById(eval_.id))!.prompts[0].metrics!.tokenUsage.assertions,
      ).toMatchObject({ total: 13, numRequests: 3 });
    });

    it('reserves the derived __count for surviving rows', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2 });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      eval_.config.derivedMetrics = [{ name: 'Rows', value: '__count' }];
      Object.assign(eval_.prompts[0].metrics!, {
        namedScores: { __count: 1, Rows: 2 },
        namedScoresCount: { __count: 2 },
      });
      await eval_.save();
      for (const result of [target, survivor]) {
        await dbUpdateResult(result.id, { namedScores: { __count: 0.5 } });
      }

      await deleteEvalResult(eval_.id, target.id);

      expect((await Eval.findById(eval_.id))!.prompts[0].metrics!.namedScores.Rows).toBe(1);
    });

    it.each([
      {
        name: 'component arrays',
        grade: { componentResults: [{ pass: true, score: 1, reason: 'survivor' }] },
        expected: 1,
      },
      { name: 'explicit human assertions', grade: { assertion: { type: 'human' } }, expected: 1 },
      {
        name: 'explicit select-best assertions',
        grade: { assertion: { type: 'select-best' } },
        expected: 1,
      },
      {
        name: 'explicit max-score assertions',
        grade: { assertion: { type: 'max-score' } },
        expected: 1,
      },
      { name: 'stripped survivors', grade: null, expected: 5 },
      { name: 'legacy componentless survivors', grade: {}, expected: 5 },
      {
        name: 'arbitrary top-level assertions',
        grade: { assertion: { type: 'javascript' } },
        expected: 5,
      },
      { name: 'no survivors', grade: undefined, expected: 0 },
    ])(
      'recounts historical componentless targets conservatively with $name',
      async ({ grade, expected }) => {
        const eval_ = await EvalFactory.create({ numResults: grade === undefined ? 1 : 2 });
        const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
        eval_.prompts[0].metrics!.testPassCount = grade === undefined ? 1 : 2;
        eval_.prompts[0].metrics!.testFailCount = 0;
        eval_.prompts[0].metrics!.assertPassCount = 5;
        eval_.prompts[0].metrics!.assertFailCount = 0;
        await eval_.addPrompts(eval_.prompts);
        await dbUpdateResult(target.id, {
          gradingResult: { pass: true, score: 1, reason: 'historical' },
        });
        if (survivor) {
          await dbUpdateResult(survivor.id, {
            gradingResult:
              grade === null
                ? null
                : ({ pass: true, score: 1, reason: 'survivor', ...grade } as GradingResult),
          });
        }

        await deleteEvalResult(eval_.id, target.id);

        expect((await Eval.findById(eval_.id))!.prompts[0].metrics!.assertPassCount).toBe(expected);
      },
    );

    it.each(['deleted', 'surviving'])(
      'keeps %s imported metric templates inert',
      async (location) => {
        const eval_ = await EvalFactory.create({ numResults: 2 });
        const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
        const marker = globalThis as typeof globalThis & {
          __promptfooMetricTemplateExecuted?: boolean;
        };
        Object.assign(eval_.prompts[0].metrics!, {
          namedScores: { accuracy: 2 },
          namedScoresCount: { accuracy: 2 },
          namedScoreWeights: { accuracy: 2 },
        });
        await eval_.addPrompts(eval_.prompts);
        await dbUpdateResult(target.id, {
          namedScores: { accuracy: 1 },
          gradingResult: location === 'surviving' ? null : target.gradingResult,
        });
        await dbUpdateResult(location === 'deleted' ? target.id : survivor.id, {
          namedScores: { accuracy: 1 },
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Imported metric',
            componentResults: [
              {
                pass: true,
                score: 1,
                reason: 'Imported component',
                assertion: {
                  type: 'contains',
                  value: 'ok',
                  metric: `{{ range.constructor("globalThis.__promptfooMetricTemplateExecuted = true; return 'accuracy'")() }}`,
                },
              },
            ],
          },
        });
        try {
          await deleteEvalResult(eval_.id, target.id);
          expect(marker.__promptfooMetricTemplateExecuted).toBeUndefined();
        } finally {
          delete marker.__promptfooMetricTemplateExecuted;
        }
      },
    );

    it('preserves unavailable assertion and weighted metric contributions from stripped survivors', async () => {
      const eval_ = await EvalFactory.create({ numResults: 3 });
      const rows = await EvalResult.findManyByEvalId(eval_.id);
      Object.assign(eval_.prompts[0].metrics!, {
        testPassCount: 3,
        testFailCount: 0,
        assertPassCount: 3,
        assertFailCount: 1,
        namedScores: { quality: 3 },
        namedScoresCount: { quality: 3 },
        namedScoreWeights: { quality: 5 },
      });
      await eval_.addPrompts(eval_.prompts);
      for (const [index, row] of rows.entries()) {
        await dbUpdateResult(row.id, {
          gradingResult: null,
          namedScores: { quality: index === 1 ? 1 : 0 },
        });
      }

      await deleteEvalResult(eval_.id, rows[0].id);

      expect((await Eval.findById(eval_.id))!.prompts[0].metrics).toMatchObject({
        assertPassCount: 3,
        assertFailCount: 1,
        namedScores: { quality: 3 },
        namedScoresCount: { quality: 3 },
        namedScoreWeights: { quality: 5 },
      });
    });

    it('debits retained metric weights without guessing historical template assertion counts', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2 });
      const rows = await EvalResult.findManyByEvalId(eval_.id);
      Object.assign(eval_.prompts[0].metrics!, {
        namedScores: { quality: 1 },
        namedScoresCount: { quality: 2 },
        namedScoreWeights: { quality: 4 },
      });
      await eval_.addPrompts(eval_.prompts);
      for (const [index, row] of rows.entries()) {
        await dbUpdateResult(row.id, {
          namedScores: { quality: index },
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Historical weighted metric',
            namedScoreWeights: { quality: index ? 1 : 3 },
            componentResults: [
              {
                pass: true,
                score: 1,
                reason: 'Historical metric name',
                assertion: { type: 'contains', metric: '{{ env.METRIC }}' },
              },
            ],
          },
        });
      }

      await deleteEvalResult(eval_.id, rows[0].id);

      expect((await Eval.findById(eval_.id))!.prompts[0].metrics).toMatchObject({
        namedScores: { quality: 1 },
        namedScoresCount: { quality: 2 },
        namedScoreWeights: { quality: 1 },
      });
    });

    it('does not debit asserted siblings for historical no-assertion rows', async () => {
      const eval_ = await EvalFactory.create({ numResults: 3 });
      const rows = await EvalResult.findManyByEvalId(eval_.id);
      eval_.prompts[0].metrics!.testPassCount = 3;
      eval_.prompts[0].metrics!.testFailCount = 0;
      eval_.prompts[0].metrics!.assertPassCount = 1;
      await eval_.addPrompts(eval_.prompts);
      for (const row of rows.slice(0, 2)) {
        await dbUpdateResult(row.id, {
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'No assertions',
            tokensUsed: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
          },
        });
      }

      await deleteEvalResult(eval_.id, rows[0].id);

      expect((await Eval.findById(eval_.id))!.prompts[0].metrics!.assertPassCount).toBe(1);
    });

    it('preserves grading usage when a survivor rating discarded its tokens', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2 });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      eval_.prompts[0].metrics!.tokenUsage.assertions = { total: 9, numRequests: 2 };
      await eval_.addPrompts(eval_.prompts);
      await dbUpdateResult(target.id, {
        gradingResult: null,
        success: false,
        failureReason: 2,
        error: 'Provider error',
      });
      await dbUpdateResult(survivor.id, {
        gradingResult: { pass: true, score: 1 } as GradingResult,
      });

      await deleteEvalResult(eval_.id, target.id);

      expect((await Eval.findById(eval_.id))!.prompts[0].metrics!.tokenUsage.assertions).toEqual({
        total: 9,
        numRequests: 2,
      });
    });

    it('carries incomplete survivor evidence across accounting batches', async () => {
      const eval_ = await EvalFactory.create({ numResults: 502 });
      const rows = await EvalResult.findManyByEvalId(eval_.id);
      const sorted = rows.slice().sort((a, b) => a.id.localeCompare(b.id));
      eval_.prompts[0].metrics!.testPassCount = 502;
      eval_.prompts[0].metrics!.testFailCount = 0;
      eval_.prompts[0].metrics!.assertPassCount = 502;
      await eval_.addPrompts(eval_.prompts);
      await dbUpdateResult(sorted[0].id, { gradingResult: null });
      await dbUpdateResult(sorted.at(-1)!.id, { gradingResult: null });

      await deleteEvalResult(eval_.id, sorted[0].id);

      expect((await Eval.findById(eval_.id))!.prompts[0].metrics!.assertPassCount).toBe(502);
    });

    it('deletes only the targeted result and leaves siblings + parent eval intact', async () => {
      const eval_ = await EvalFactory.create();
      const results = await EvalResult.findManyByEvalId(eval_.id);
      // EvalFactory.addDefaultResults seeds more than one row so we can prove
      // siblings survive — guard against silent regressions in the factory.
      expect(results.length).toBeGreaterThan(1);

      const [victim, ...survivors] = results;
      await deleteEvalResult(eval_.id, victim.id);

      const db = await getDb();
      expect(await EvalResult.findById(victim.id)).toBeNull();
      const remaining = await db.select().from(evalResultsTable).all();
      expect(remaining.map((r) => r.id).sort()).toEqual(survivors.map((s) => s.id).sort());
      // Parent eval row stays — single-result delete is not an eval delete.
      expect(await Eval.findById(eval_.id)).toBeDefined();
    });

    it('fires a per-eval change signal, not a delete signal', async () => {
      const eval_ = await EvalFactory.create();
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      // `EvalFactory.create` runs through `Eval.create` / `addPrompts` /
      // `addResults`, each of which fires its own `updateSignalFile` — clear
      // the mock here so the assertion only sees signals from our delete.
      vi.mocked(updateSignalFile).mockClear();
      vi.mocked(updateSignalFileForDeletedEvals).mockClear();

      await deleteEvalResult(eval_.id, target.id);

      // `updateSignalFile(evalId)` tells `promptfoo view` clients viewing this
      // eval to re-fetch; `updateSignalFileForDeletedEvals` would tell them to
      // navigate AWAY because the whole eval was deleted. Distinct semantics.
      expect(updateSignalFile).toHaveBeenCalledWith(eval_.id);
      expect(updateSignalFileForDeletedEvals).not.toHaveBeenCalled();
    });

    it('throws EvalResultNotFoundError when the resultId does not exist', async () => {
      const eval_ = await EvalFactory.create();
      vi.mocked(updateSignalFile).mockClear();

      await expect(deleteEvalResult(eval_.id, 'nonexistent-result-id')).rejects.toBeInstanceOf(
        EvalResultNotFoundError,
      );
      // No row was touched, so no signal fires for a miss.
      expect(updateSignalFile).not.toHaveBeenCalled();
    });

    it('refuses to delete a result that belongs to a different eval (cross-session guard)', async () => {
      const eval1 = await EvalFactory.create();
      const eval2 = await EvalFactory.create();
      const [resultInEval1] = await EvalResult.findManyByEvalId(eval1.id);

      // The result exists, but the (evalId, resultId) pair does not match.
      // A bare PK-only delete would silently succeed and corrupt eval1.
      await expect(deleteEvalResult(eval2.id, resultInEval1.id)).rejects.toBeInstanceOf(
        EvalResultNotFoundError,
      );
      expect(await EvalResult.findById(resultInEval1.id)).not.toBeNull();
    });

    it('debits the deleted row from prompts[].metrics so eval-list stats stay consistent', async () => {
      // `Eval.deserialize` (and the eval list page) derive pass/fail/score from the
      // `prompts[i].metrics` JSON on the evals row, NOT from a live COUNT of
      // eval_results. A delete that leaves those aggregates untouched surfaces as
      // phantom counts in the UI; this test pins the decrement to the same fields
      // the forward accumulation in `evaluator.ts` writes.
      const eval_ = await EvalFactory.create();
      const results = await EvalResult.findManyByEvalId(eval_.id);
      const passing = results.find((r) => r.success);
      const failing = results.find((r) => !r.success);
      if (!passing || !failing) {
        throw new Error('EvalFactory should seed one pass and one fail result');
      }

      const before = await Eval.findById(eval_.id);
      const baseline = before?.prompts[0]?.metrics;
      if (!baseline) {
        throw new Error('EvalFactory should seed prompts[0].metrics');
      }

      await deleteEvalResult(eval_.id, passing.id);

      const afterPass = await Eval.findById(eval_.id);
      const afterPassMetrics = afterPass?.prompts[0]?.metrics;
      expect(afterPassMetrics).toBeDefined();
      expect(afterPassMetrics?.testPassCount).toBe(baseline.testPassCount - 1);
      expect(afterPassMetrics?.testFailCount).toBe(baseline.testFailCount);
      expect(afterPassMetrics?.assertPassCount).toBe(baseline.assertPassCount - 1);
      expect(afterPassMetrics?.assertFailCount).toBe(baseline.assertFailCount);
      expect(afterPassMetrics?.score).toBeCloseTo(baseline.score - passing.score, 5);
      expect(afterPassMetrics?.totalLatencyMs).toBe(
        baseline.totalLatencyMs - (passing.latencyMs ?? 0),
      );
      expect(afterPassMetrics?.cost).toBeCloseTo(baseline.cost - (passing.cost ?? 0), 5);

      await deleteEvalResult(eval_.id, failing.id);

      const afterFail = await Eval.findById(eval_.id);
      const afterFailMetrics = afterFail?.prompts[0]?.metrics;
      expect(afterFailMetrics).toBeDefined();
      expect(afterFailMetrics?.testPassCount).toBe(baseline.testPassCount - 1);
      expect(afterFailMetrics?.testFailCount).toBe(baseline.testFailCount - 1);
      expect(afterFailMetrics?.assertPassCount).toBe(baseline.assertPassCount - 1);
      expect(afterFailMetrics?.assertFailCount).toBe(baseline.assertFailCount - 1);
    });

    it('debits namedScores and tokenUsage so FilterChips / EvalHeader stay consistent', async () => {
      // `FilterChips.tsx`, `CustomMetricsDialog.tsx`, and `EvalHeader.tsx` read
      // `prompt.metrics.namedScores` / `prompt.metrics.tokenUsage` directly. The
      // forward path accumulates per-row via `accumulateNamedMetric` /
      // `accumulateResponseTokenUsage`; the delete path must mirror that with
      // `subtractNamedMetric` / `subtractResponseTokenUsage` or the chips and
      // header stay inflated after a row is removed. Regression-pins both deltas.
      const eval_ = await EvalFactory.create({
        numResults: 1,
        resultTypes: ['success'],
        withNamedScores: true,
      });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      // Sanity-check the factory still seeds both surfaces, otherwise the assertions
      // below would silently pass on empty objects.
      expect(Object.keys(target.namedScores ?? {})).toContain('accuracy');
      expect(target.response?.tokenUsage?.total).toBeGreaterThan(0);

      // Seed the parent eval's prompt-level aggregates so they reflect *exactly* this one
      // row's contribution — that way "fully debit the row" is observable as "return to
      // the empty baseline". Uses the same forward functions the live evaluator uses, so
      // the test pins inverse symmetry rather than encoding hand-computed expectations.
      const seededMetrics: PromptMetrics = {
        score: 0,
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        assertPassCount: 0,
        assertFailCount: 0,
        totalLatencyMs: 0,
        tokenUsage: createEmptyTokenUsage(),
        namedScores: {},
        namedScoresCount: {},
        namedScoreWeights: {},
        cost: 0,
      };
      for (const [name, value] of Object.entries(target.namedScores ?? {})) {
        accumulateNamedMetric(seededMetrics, {
          metricName: name,
          metricValue: value,
          gradingResult: target.gradingResult ?? null,
        });
      }
      accumulateResponseTokenUsage(seededMetrics.tokenUsage, target.response);
      if (target.gradingResult?.tokensUsed) {
        accumulateGradingTokenUsage(seededMetrics.tokenUsage, target.gradingResult.tokensUsed, {
          cached: target.gradingResult.metadata?.cachedResponse,
        });
      }
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [{ ...reloaded.prompts[0], metrics: seededMetrics }];
      await reloaded.save();

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      const metrics = after?.prompts[0]?.metrics;
      expect(metrics).toBeDefined();
      // Every namedScores bucket the row contributed to must net to zero.
      for (const key of Object.keys(target.namedScores ?? {})) {
        expect(metrics?.namedScores?.[key] ?? 0).toBeCloseTo(0, 5);
        expect(metrics?.namedScoresCount?.[key] ?? 0).toBe(0);
        expect(metrics?.namedScoreWeights?.[key] ?? 0).toBe(0);
      }
      // tokenUsage totals net to zero — header `numRequests` would otherwise lie.
      expect(metrics?.tokenUsage?.total ?? 0).toBe(0);
      expect(metrics?.tokenUsage?.prompt ?? 0).toBe(0);
      expect(metrics?.tokenUsage?.completion ?? 0).toBe(0);
      expect(metrics?.tokenUsage?.numRequests ?? 0).toBe(0);
      expect(metrics?.tokenUsage?.assertions?.total ?? 0).toBe(0);
    });

    it('removes weighted named metric keys when grading details were stripped', async () => {
      const eval_ = await EvalFactory.create({
        numResults: 1,
        resultTypes: ['success'],
        withNamedScores: true,
      });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            testPassCount: 1,
            testFailCount: 0,
            namedScores: { accuracy: 4 },
            namedScoresCount: { accuracy: 1 },
            namedScoreWeights: { accuracy: 4 },
          },
        },
      ];
      await reloaded.save();
      const db = await getDb();
      await db
        .update(evalResultsTable)
        .set({
          gradingResult: null,
          namedScores: { accuracy: 1 },
        })
        .where(eq(evalResultsTable.id, target.id))
        .run();

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      const metrics = after?.prompts[0]?.metrics;
      expect(metrics?.namedScores?.accuracy).toBeUndefined();
      expect(metrics?.namedScoresCount?.accuracy).toBeUndefined();
      expect(metrics?.namedScoreWeights?.accuracy).toBeUndefined();
    });

    it('routes a deleted error row to testErrorCount, not testFailCount', async () => {
      // updatePromptResultCounts splits non-success rows into testErrorCount
      // (failureReason === ERROR) vs testFailCount (assert/none). The decrement
      // must mirror that split so an error delete does not silently shrink the
      // fail bucket.
      const eval_ = await EvalFactory.create({
        numResults: 1,
        resultTypes: ['error'],
      });
      // The factory doesn't accumulate per-result metrics, so seed a baseline that
      // matches a single error row to exercise the error-branch decrement.
      const baseline = {
        score: 0,
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 1,
        assertPassCount: 0,
        assertFailCount: 0,
        totalLatencyMs: 100,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0 },
        namedScores: {},
        namedScoresCount: {},
        cost: 0,
      } as const;
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [{ ...reloaded.prompts[0], metrics: { ...baseline } }];
      await reloaded.save();

      const [errorRow] = await EvalResult.findManyByEvalId(eval_.id);
      await deleteEvalResult(eval_.id, errorRow.id);

      const after = await Eval.findById(eval_.id);
      const metrics = after?.prompts[0]?.metrics;
      expect(metrics?.testErrorCount).toBe(0);
      expect(metrics?.testFailCount).toBe(0);
      expect(metrics?.testPassCount).toBe(0);
    });

    it('removes blob references when no surviving result shares the same table cell', async () => {
      const eval_ = await EvalFactory.create();
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const db = await getDb();
      await db.insert(blobAssetsTable).values({
        hash: 'blob-for-deleted-result',
        sizeBytes: 123,
        mimeType: 'image/png',
        provider: 'test-provider',
      });
      await db.insert(blobReferencesTable).values({
        id: 'blob-ref-for-deleted-result',
        blobHash: 'blob-for-deleted-result',
        evalId: eval_.id,
        testIdx: target.testIdx,
        promptIdx: target.promptIdx,
        location: 'response.images[0]',
        kind: 'image',
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(await db.select().from(blobReferencesTable).all()).toHaveLength(0);
      expect(await db.select().from(blobAssetsTable).all()).toHaveLength(1);
    });

    it('keeps independently classified references for surviving media cells', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const db = await getDb();
      const blobHash = 'a'.repeat(64);
      await db.insert(blobAssetsTable).values({
        hash: blobHash,
        sizeBytes: 123,
        mimeType: 'image/png',
        provider: 'test-provider',
      });
      await db.insert(blobReferencesTable).values(
        [target, survivor].map((row) => ({
          id: `shared-blob-ref-${row.id}`,
          blobHash,
          evalId: eval_.id,
          testIdx: row.testIdx,
          promptIdx: row.promptIdx,
          location: 'response.images[0].blobRef',
          kind: 'image',
        })),
      );
      await dbUpdateResult(survivor.id, {
        response: {
          ...survivor.response,
          images: [
            {
              blobRef: {
                hash: blobHash,
                uri: `promptfoo://blob/${blobHash}`,
                mimeType: 'image/png',
                sizeBytes: 123,
                provider: 'test-provider',
              },
            },
          ],
        },
      });

      await deleteEvalResult(eval_.id, target.id);

      const refs = await db.select().from(blobReferencesTable).all();
      expect(refs).toEqual([
        expect.objectContaining({
          id: `shared-blob-ref-${survivor.id}`,
          blobHash,
          evalId: eval_.id,
          testIdx: survivor.testIdx,
          promptIdx: survivor.promptIdx,
        }),
      ]);
    });

    it('does not transfer trusted blob provenance to copied URI text', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const db = await getDb();
      const blobHash = 'e'.repeat(64);
      const blobRef = {
        hash: blobHash,
        uri: `promptfoo://blob/${blobHash}`,
        mimeType: 'image/png',
        sizeBytes: 123,
        provider: 'test-provider',
      };
      await db.insert(blobAssetsTable).values({
        hash: blobHash,
        sizeBytes: 123,
        mimeType: 'image/png',
        provider: 'test-provider',
      });
      await db.insert(blobReferencesTable).values({
        id: 'trusted-blob-ref',
        blobHash,
        evalId: eval_.id,
        testIdx: target.testIdx,
        promptIdx: target.promptIdx,
        location: 'response.images[0].blobRef',
        kind: 'image',
      });
      await dbUpdateResult(target.id, {
        response: {
          ...target.response,
          images: [{ blobRef }],
        },
      });
      await dbUpdateResult(survivor.id, {
        response: {
          ...survivor.response,
          output: `copied text: ${blobRef.uri}`,
        },
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(await db.select().from(blobReferencesTable).all()).toHaveLength(0);
    });

    it('removes same-cell blob references when the survivor does not use that blob', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const db = await getDb();
      const blobHash = 'b'.repeat(64);
      await db.insert(blobAssetsTable).values({
        hash: blobHash,
        sizeBytes: 123,
        mimeType: 'image/png',
        provider: 'test-provider',
      });
      await db.insert(blobReferencesTable).values({
        id: 'stale-same-cell-blob-ref',
        blobHash,
        evalId: eval_.id,
        testIdx: target.testIdx,
        promptIdx: target.promptIdx,
        location: 'response.images[0].blobRef',
        kind: 'image',
      });
      await dbUpdateResult(survivor.id, {
        testIdx: target.testIdx,
        promptIdx: target.promptIdx,
        response: {
          ...survivor.response,
          output: 'same cell but no blob uri',
        },
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(await db.select().from(blobReferencesTable).all()).toHaveLength(0);
    });

    it('removes imported eval-level blob references when the deleted result was the last use', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const db = await getDb();
      const blobHash = 'c'.repeat(64);
      await db.insert(blobAssetsTable).values({
        hash: blobHash,
        sizeBytes: 123,
        mimeType: 'image/png',
        provider: 'test-provider',
      });
      await db.insert(blobReferencesTable).values({
        id: 'imported-blob-ref',
        blobHash,
        evalId: eval_.id,
        location: 'import',
        kind: 'image',
      });
      await dbUpdateResult(target.id, {
        response: {
          ...target.response,
          output: `![imported](promptfoo://blob/${blobHash})`,
        },
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(await db.select().from(blobReferencesTable).all()).toHaveLength(0);
    });

    it('keeps imported blob references used by surviving traces', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const db = await getDb();
      const blobHash = 'f'.repeat(64);
      const blobUri = `promptfoo://blob/${blobHash}`;
      await db.insert(blobAssetsTable).values({
        hash: blobHash,
        sizeBytes: 123,
        mimeType: 'image/png',
        provider: 'test-provider',
      });
      await db.insert(blobReferencesTable).values({
        id: 'trace-imported-blob-ref',
        blobHash,
        evalId: eval_.id,
        location: 'import',
        kind: 'image',
      });
      await dbUpdateResult(target.id, {
        response: {
          ...target.response,
          output: `![imported](${blobUri})`,
        },
      });
      const traceStore = new TraceStore();
      await traceStore.createTrace({
        traceId: 'trace-with-imported-blob',
        evaluationId: eval_.id,
        testCaseId: 'trace-media-case',
        metadata: { attachment: blobUri },
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(await db.select().from(blobReferencesTable).all()).toEqual([
        expect.objectContaining({
          id: 'trace-imported-blob-ref',
          blobHash,
          evalId: eval_.id,
        }),
      ]);
    });

    it('scans surviving blob usage in bounded batches', async () => {
      vi.stubEnv('PROMPTFOO_ENABLE_DATABASE_LOGS', 'true');
      const debugSpy = vi.spyOn(logger, 'debug');
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const db = await getDb();
      const blobHash = 'd'.repeat(64);
      await db.insert(blobAssetsTable).values({
        hash: blobHash,
        sizeBytes: 123,
        mimeType: 'image/png',
        provider: 'test-provider',
      });
      await db.insert(blobReferencesTable).values({
        id: 'batched-blob-ref',
        blobHash,
        evalId: eval_.id,
        testIdx: target.testIdx,
        promptIdx: target.promptIdx,
        location: 'response.images[0].blobRef',
        kind: 'image',
      });

      await deleteEvalResult(eval_.id, target.id);

      const survivorSelectLogs = debugSpy.mock.calls
        .map(([message]) => String(message))
        .filter(
          (message) =>
            message.includes('from "eval_results"') &&
            message.includes('"response"') &&
            message.includes('"metadata"') &&
            message.includes('"id" <>'),
        );
      expect(survivorSelectLogs.length).toBeGreaterThan(0);
      expect(survivorSelectLogs.every((message) => message.toLowerCase().includes('limit'))).toBe(
        true,
      );
      debugSpy.mockRestore();
    });

    it('recomputes derived named metrics from surviving rows', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.config = {
        ...reloaded.config,
        derivedMetrics: [{ name: 'accuracy_avg', value: 'accuracy / __count' }],
      };
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            namedScores: { accuracy: 1.5, accuracy_avg: 0.75 },
            namedScoresCount: { accuracy: 2 },
            namedScoreWeights: { accuracy: 2 },
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, { namedScores: { accuracy: 0.8 } });
      await dbUpdateResult(survivor.id, { namedScores: { accuracy: 0.7 } });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.namedScores?.accuracy).toBeCloseTo(0.7, 5);
      expect(after?.prompts[0]?.metrics?.namedScores?.accuracy_avg).toBeCloseTo(0.7, 5);
    });

    it('preserves function-derived metrics that cannot round-trip through persisted config', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.config = {
        ...reloaded.config,
        derivedMetrics: [
          {
            name: 'runtime_only_metric',
            value: () => 42,
          },
        ],
      };
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            namedScores: {
              ...reloaded.prompts[0].metrics?.namedScores,
              runtime_only_metric: 42,
            },
          },
        },
      ];
      await reloaded.save();

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.namedScores?.runtime_only_metric).toBe(42);
    });

    it('preserves assertion debits when grading results were stripped before storage', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            testPassCount: 1,
            testFailCount: 0,
            assertPassCount: 1,
            assertFailCount: 0,
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, {
        gradingResult: null,
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      const metrics = after?.prompts[0]?.metrics;
      expect(metrics?.testPassCount).toBe(0);
      expect(metrics?.assertPassCount).toBe(0);
      expect(metrics?.assertFailCount).toBe(0);
    });

    it('recomputes assertion token usage when deleting rows with stripped grading results', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              assertions: {
                total: 21,
                prompt: 11,
                completion: 10,
                cached: 0,
              },
            },
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, {
        gradingResult: null,
      });
      await dbUpdateResult(survivor.id, {
        gradingResult: {
          ...survivor.gradingResult!,
          tokensUsed: {
            total: 9,
            prompt: 5,
            completion: 4,
            cached: 0,
          },
        },
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.tokenUsage?.assertions).toMatchObject({
        total: 9,
        prompt: 5,
        completion: 4,
        cached: 0,
        numRequests: 1,
      });
    });

    it('does not erase assertion token usage when every surviving grading result was stripped', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              assertions: {
                total: 21,
                prompt: 11,
                completion: 10,
                cached: 0,
                numRequests: 2,
              },
            },
          },
        },
      ];
      await reloaded.save();
      for (const result of [target, survivor]) {
        await dbUpdateResult(result.id, { gradingResult: null });
      }

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.tokenUsage?.assertions).toMatchObject({
        total: 21,
        prompt: 11,
        completion: 10,
        cached: 0,
        numRequests: 2,
      });
    });

    it('does not infer stripped failed assertion counts from row success', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['failure'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            testFailCount: 1,
            testPassCount: 0,
            assertPassCount: 1,
            assertFailCount: 1,
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, {
        testCase: {
          ...target.testCase,
          assert: [
            { type: 'contains', value: 'a' },
            { type: 'contains', value: 'b' },
          ],
        },
        gradingResult: null,
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      const metrics = after?.prompts[0]?.metrics;
      expect(metrics?.testFailCount).toBe(0);
      expect(metrics?.assertPassCount).toBe(0);
      expect(metrics?.assertFailCount).toBe(0);
    });

    it('defaults missing legacy cost before debiting error rows', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['error'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      const { cost: _cost, ...legacyMetrics } = reloaded.prompts[0].metrics!;
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...legacyMetrics,
            testPassCount: 0,
            testFailCount: 0,
            testErrorCount: 1,
          } as PromptMetrics,
        },
      ];
      await reloaded.save();

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      const metrics = after?.prompts[0]?.metrics;
      expect(metrics?.testErrorCount).toBe(0);
      expect(metrics?.cost).toBe(0);
    });

    it.each([
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ])(
      'refuses grading underflow atomically (incurred=%s, detail=%s)',
      async (incurred, detail) => {
        const evaluation = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
        const [target] = await EvalResult.findManyByEvalId(evaluation.id);
        const usage = { total: 3, numRequests: 1, completionDetails: { reasoning: 3 } };
        await dbUpdateResult(target.id, {
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'Retained paid grade',
            componentResults: [],
            tokensUsed: { ...usage, incurredTokenUsage: structuredClone(usage) },
          },
        });
        evaluation.prompts[0].metrics!.tokenUsage = {
          assertions: structuredClone(usage),
          incurredTokenUsage: { assertions: structuredClone(usage) },
        };
        const insufficient = incurred
          ? evaluation.prompts[0].metrics!.tokenUsage.incurredTokenUsage!.assertions!
          : evaluation.prompts[0].metrics!.tokenUsage.assertions!;
        if (detail) {
          insufficient.completionDetails!.reasoning = 1;
        } else {
          insufficient.total = 1;
        }
        await evaluation.addPrompts(evaluation.prompts);
        const db = await getDb();
        await db
          .insert(blobAssetsTable)
          .values({ hash: 'retained', sizeBytes: 1, mimeType: 'image/png', provider: 'test' });
        await db.insert(blobReferencesTable).values({
          id: 'retained-ref',
          blobHash: 'retained',
          evalId: evaluation.id,
          testIdx: target.testIdx,
          promptIdx: target.promptIdx,
        });
        const rows = await db.select().from(evalResultsTable).all();
        const refs = await db.select().from(blobReferencesTable).all();
        const prompts = structuredClone((await Eval.findById(evaluation.id))!.prompts);
        vi.mocked(updateSignalFile).mockClear();
        await expect(deleteEvalResult(evaluation.id, target.id)).rejects.toBeInstanceOf(
          EvalResultDeletionError,
        );
        expect(await db.select().from(evalResultsTable).all()).toEqual(rows);
        expect(await db.select().from(blobReferencesTable).all()).toEqual(refs);
        expect((await Eval.findById(evaluation.id))!.prompts).toEqual(prompts);
        expect(updateSignalFile).not.toHaveBeenCalled();
      },
    );

    it('allows exact survivor reconstruction after an intermediate grading underflow', async () => {
      const evaluation = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(evaluation.id);
      await dbUpdateResult(target.id, {
        gradingResult: null,
        response: { output: 'legacy', tokenUsage: { assertions: { total: 7, numRequests: 1 } } },
      });
      await dbUpdateResult(survivor.id, {
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Known survivor',
          componentResults: [],
          tokensUsed: { total: 3, numRequests: 1 },
        },
      });
      evaluation.prompts[0].metrics!.tokenUsage = { assertions: { total: 3, numRequests: 1 } };
      await evaluation.addPrompts(evaluation.prompts);
      await deleteEvalResult(evaluation.id, target.id);
      expect(
        (await Eval.findById(evaluation.id))!.prompts[0].metrics!.tokenUsage.assertions,
      ).toMatchObject({
        total: 3,
        numRequests: 1,
      });
    });

    it('does not create negative request counts for legacy token usage aggregates', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
          },
        },
      ];
      await reloaded.save();

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.tokenUsage?.numRequests).toBeUndefined();
    });

    it('recomputes assertion counts when a grading result has no components', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            testPassCount: 1,
            testFailCount: 0,
            assertPassCount: 1,
            assertFailCount: 0,
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, {
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'manual pass',
        } as any,
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      const metrics = after?.prompts[0]?.metrics;
      expect(metrics?.testPassCount).toBe(0);
      expect(metrics?.assertPassCount).toBe(0);
      expect(metrics?.assertFailCount).toBe(0);
    });

    it('preserves unavailable assertion counts after historical manual ratings replaced both grades', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            testPassCount: 2,
            assertPassCount: 2,
            assertFailCount: 0,
          },
        },
      ];
      await reloaded.save();
      for (const result of [target, survivor]) {
        await dbUpdateResult(result.id, {
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'manual pass',
          } as any,
        });
      }

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      const metrics = after?.prompts[0]?.metrics;
      expect(metrics?.testPassCount).toBe(1);
      expect(metrics?.assertPassCount).toBe(2);
      expect(metrics?.assertFailCount).toBe(0);
    });

    it('treats malformed componentResults as empty instead of blocking deletion', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      await dbUpdateResult(target.id, {
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'malformed imported grading result',
          componentResults: 'not-an-array',
        } as any,
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(await EvalResult.findById(target.id)).toBeNull();
    });

    it.each([
      ['a string', 'imported-grading-result'],
      ['an array', [{ pass: false }]],
    ])(
      'ignores non-object grading results (%s) when debiting assertion counts',
      async (_label, malformedGradingResult) => {
        // Imported/saved V4 rows accept result records as unknown, so
        // gradingResult can be a truthy non-object. It must not be read as a
        // componentless failed assertion, which would debit assertFailCount
        // owned by surviving rows.
        const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
        const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
        const reloaded = await Eval.findById(eval_.id);
        if (!reloaded) {
          throw new Error('expected eval to be findable');
        }
        reloaded.prompts = [
          {
            ...reloaded.prompts[0],
            metrics: {
              ...reloaded.prompts[0].metrics!,
              assertPassCount: 0,
              assertFailCount: 1,
            },
          },
        ];
        await reloaded.save();
        await dbUpdateResult(target.id, { gradingResult: malformedGradingResult as any });
        await dbUpdateResult(survivor.id, {
          gradingResult: { pass: false, score: 0, reason: 'manual fail' } as any,
        });

        await deleteEvalResult(eval_.id, target.id);

        const after = await Eval.findById(eval_.id);
        const metrics = after?.prompts[0]?.metrics;
        expect(metrics?.assertPassCount).toBe(0);
        expect(metrics?.assertFailCount).toBe(1);
      },
    );

    it('ignores non-numeric named scores when debiting imported rows', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            namedScores: { accuracy: 1 },
            namedScoresCount: { accuracy: 1 },
            namedScoreWeights: { accuracy: 1 },
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, {
        namedScores: { accuracy: 'bad' } as any,
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.namedScores?.accuracy).toBe(1);
      expect(after?.prompts[0]?.metrics?.namedScoresCount?.accuracy).toBe(1);
      expect(after?.prompts[0]?.metrics?.namedScoreWeights?.accuracy).toBe(1);
    });

    it('ignores non-finite numeric deltas when deleting imported rows', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            score: 10,
            totalLatencyMs: 20,
            cost: 30,
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, {
        score: 'not-a-score' as any,
        latencyMs: 'not-latency' as any,
        cost: 'not-cost' as any,
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.score).toBe(10);
      expect(after?.prompts[0]?.metrics?.totalLatencyMs).toBe(20);
      expect(after?.prompts[0]?.metrics?.cost).toBe(30);
    });

    it('debits assertions.numRequests when deleting a graded row', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            tokenUsage: {
              total: 0,
              prompt: 0,
              completion: 0,
              cached: 0,
              assertions: {
                total: 18,
                prompt: 10,
                completion: 8,
                cached: 0,
                numRequests: 2,
              },
            },
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, {
        gradingResult: {
          ...target.gradingResult!,
          tokensUsed: { total: 9, prompt: 5, completion: 4, cached: 0 },
        },
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.tokenUsage?.assertions).toMatchObject({
        total: 9,
        prompt: 5,
        completion: 4,
        cached: 0,
        numRequests: 1,
      });
    });

    it.each([undefined, 'bad', []])(
      'preserves assertion requests when grading usage is absent or malformed: %j',
      async (tokensUsed) => {
        const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
        const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
        const reloaded = await Eval.findById(eval_.id);
        if (!reloaded) {
          throw new Error('expected eval to be findable');
        }
        reloaded.prompts = [
          {
            ...reloaded.prompts[0],
            metrics: {
              ...reloaded.prompts[0].metrics!,
              tokenUsage: {
                total: 0,
                prompt: 0,
                completion: 0,
                cached: 0,
                assertions: {
                  total: 0,
                  prompt: 0,
                  completion: 0,
                  cached: 0,
                  numRequests: 2,
                },
              },
            },
          },
        ];
        await reloaded.save();
        await dbUpdateResult(target.id, {
          gradingResult: {
            ...target.gradingResult!,
            tokensUsed: tokensUsed as unknown as GradingResult['tokensUsed'],
          },
        });

        await dbUpdateResult(survivor.id, {
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'surviving requests',
            tokensUsed: { total: 0, numRequests: 2 },
          },
        });
        await deleteEvalResult(eval_.id, target.id);

        const after = await Eval.findById(eval_.id);
        expect(after?.prompts[0]?.metrics?.tokenUsage?.assertions?.numRequests).toBe(2);
      },
    );

    it('preserves zero-weight named metrics during recompute after delete', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            namedScores: { accuracy: 0 },
            namedScoresCount: { accuracy: 2 },
            namedScoreWeights: { accuracy: 0 },
          },
        },
      ];
      await reloaded.save();
      // Force the recompute branch by stripping the deleted row's gradingResult.
      await dbUpdateResult(target.id, { gradingResult: null });
      await dbUpdateResult(survivor.id, {
        namedScores: { accuracy: 0 },
        gradingResult: {
          ...survivor.gradingResult!,
          namedScores: { accuracy: 0 },
          assertion: { type: 'javascript', metric: 'accuracy', weight: 0 },
        } as any,
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.namedScoreWeights).toHaveProperty('accuracy', 0);
    });

    it('treats null entries inside componentResults as absent instead of throwing', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      await dbUpdateResult(target.id, {
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'imported grading result with malformed component entries',
          componentResults: [null, { pass: true }, 'bad', { pass: false }] as any,
        } as any,
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(await EvalResult.findById(target.id)).toBeNull();
    });

    it('preserves imported eval-level blob references when a URI-only survivor still uses them', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target, survivor] = await EvalResult.findManyByEvalId(eval_.id);
      const db = await getDb();
      const blobHash = 'a'.repeat(64);
      const blobUri = `promptfoo://blob/${blobHash}`;
      await db.insert(blobAssetsTable).values({
        hash: blobHash,
        sizeBytes: 123,
        mimeType: 'image/png',
        provider: 'test-provider',
      });
      await db.insert(blobReferencesTable).values({
        id: 'imported-shared-blob-ref',
        blobHash,
        evalId: eval_.id,
        location: 'import',
        kind: 'image',
      });
      // Imported evals only carry the URI as text — no structured envelope.
      await dbUpdateResult(target.id, {
        response: { ...target.response, output: `![t](${blobUri})` },
      });
      await dbUpdateResult(survivor.id, {
        response: { ...survivor.response, output: `![s](${blobUri})` },
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(await db.select().from(blobReferencesTable).all()).toHaveLength(1);
    });

    it('tolerates malformed componentResults when debiting named metrics', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            namedScores: { accuracy: 1 },
            namedScoresCount: { accuracy: 1 },
            namedScoreWeights: { accuracy: 1 },
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, {
        namedScores: { accuracy: 1 },
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'imported grading result with malformed components',
          componentResults: [null, { pass: true }, 'bad'] as any,
        } as any,
      });

      await deleteEvalResult(eval_.id, target.id);

      expect(await EvalResult.findById(target.id)).toBeNull();
    });

    it.each([
      { resultType: 'success' as const, touched: ['testPassCount', 'assertPassCount'] as const },
      { resultType: 'failure' as const, touched: ['testFailCount', 'assertFailCount'] as const },
      { resultType: 'error' as const, touched: ['testErrorCount'] as const },
    ])(
      'requires repair before deleting a $resultType row from an under-credited legacy aggregate',
      async ({ resultType, touched }) => {
        const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: [resultType] });
        const [target] = await EvalResult.findManyByEvalId(eval_.id);
        const reloaded = await Eval.findById(eval_.id);
        if (!reloaded) {
          throw new Error('expected eval to be findable');
        }
        reloaded.prompts = [
          {
            ...reloaded.prompts[0],
            metrics: {
              ...reloaded.prompts[0].metrics!,
              testPassCount: 0,
              testFailCount: 0,
              testErrorCount: 0,
              assertPassCount: 0,
              assertFailCount: 0,
            },
          },
        ];
        await reloaded.save();

        await expect(deleteEvalResult(eval_.id, target.id)).rejects.toThrow(/Resume/);
        expect(await EvalResult.findById(target.id)).not.toBeNull();

        const metrics = (await Eval.findById(eval_.id))?.prompts[0]?.metrics;
        for (const bucket of touched) {
          expect(metrics?.[bucket]).toBe(0);
        }
      },
    );

    it('does not create negative named metrics when the aggregate never tracked one', async () => {
      const eval_ = await EvalFactory.create({ numResults: 2, resultTypes: ['success'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      // Legacy aggregate: named-metric buckets exist for other metrics but not
      // for `accuracy`, so subtracting the deleted row's `accuracy` contribution
      // must not introduce a negative value out of thin air.
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...reloaded.prompts[0].metrics!,
            namedScores: { fluency: 5 },
            namedScoresCount: { fluency: 1 },
            namedScoreWeights: { fluency: 1 },
          },
        },
      ];
      await reloaded.save();
      await dbUpdateResult(target.id, {
        namedScores: { accuracy: 1 },
        gradingResult: {
          ...target.gradingResult!,
          namedScores: { accuracy: 1 },
        } as any,
      });

      await deleteEvalResult(eval_.id, target.id);

      const after = await Eval.findById(eval_.id);
      expect(after?.prompts[0]?.metrics?.namedScores?.accuracy ?? 0).toBeGreaterThanOrEqual(0);
    });
  });
});

async function dbUpdateResult(
  id: string,
  values: Partial<typeof evalResultsTable.$inferInsert>,
): Promise<void> {
  const db = await getDb();
  await db.update(evalResultsTable).set(values).where(eq(evalResultsTable.id, id)).run();
}
