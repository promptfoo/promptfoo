import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../../src/util/tokenUsageUtils';
import EvalFactory from '../factories/evalFactory';

import type { PromptMetrics } from '../../src/types/index';

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
        testPassCount: 0,
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
          testVars: target.testCase?.vars ?? {},
        });
      }
      accumulateResponseTokenUsage(seededMetrics.tokenUsage, target.response);
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

    it('keeps blob references when another result still uses the same blob', async () => {
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
      await db.insert(blobReferencesTable).values({
        id: 'shared-blob-ref',
        blobHash,
        evalId: eval_.id,
        testIdx: target.testIdx,
        promptIdx: target.promptIdx,
        location: 'response.images[0].blobRef',
        kind: 'image',
      });
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
          id: 'shared-blob-ref',
          blobHash,
          evalId: eval_.id,
          testIdx: survivor.testIdx,
          promptIdx: survivor.promptIdx,
        }),
      ]);
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

    it('defaults legacy aggregate fields before debiting error rows and cost', async () => {
      const eval_ = await EvalFactory.create({ numResults: 1, resultTypes: ['error'] });
      const [target] = await EvalResult.findManyByEvalId(eval_.id);
      const reloaded = await Eval.findById(eval_.id);
      if (!reloaded) {
        throw new Error('expected eval to be findable');
      }
      const {
        cost: _cost,
        testErrorCount: _testErrorCount,
        ...legacyMetrics
      } = reloaded.prompts[0].metrics!;
      reloaded.prompts = [
        {
          ...reloaded.prompts[0],
          metrics: {
            ...legacyMetrics,
            testPassCount: 0,
            testFailCount: 0,
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

    it('preserves surviving manual rating assertion counts when deleting a componentless row', async () => {
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
      expect(metrics?.assertPassCount).toBe(1);
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
  });
});

async function dbUpdateResult(
  id: string,
  values: Partial<typeof evalResultsTable.$inferInsert>,
): Promise<void> {
  const db = await getDb();
  await db.update(evalResultsTable).set(values).where(eq(evalResultsTable.id, id)).run();
}
