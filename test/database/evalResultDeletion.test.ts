import { randomUUID } from 'node:crypto';

import { parse as parseCsv } from 'csv-parse/sync';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteEvalResult,
  deleteEvalResultById,
  EvalResultNotFoundError,
} from '../../src/database/evalResultDeletion';
import {
  EvalResultDeletionConflict,
  RESULT_WRITER,
  withEvalResultWriter,
} from '../../src/database/evalResultWrite';
import { getDb } from '../../src/database/index';
import { evalResultsTable, evalsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { generateEvalCsv } from '../../src/util/eval/evalTableUtils';
import { createDefaultPromptMetrics } from '../../src/util/eval/promptMetrics';
import { clearEvalTables } from '../util/evalDb';

const prompt = { label: 'echo', raw: '{{message}}', provider: 'echo' };

async function seed() {
  const evaluation = await Eval.create({}, [], { id: randomUUID() });
  const metrics = { ...createDefaultPromptMetrics(), score: 1, testPassCount: 1, testFailCount: 1 };
  await evaluation.addPrompts([{ ...prompt, metrics }]);
  const removeId = randomUUID();
  const keepId = randomUUID();
  const db = await getDb();
  await db
    .insert(evalResultsTable)
    .values(
      [
        { id: removeId, testIdx: 3, score: 1, success: true },
        { id: keepId, testIdx: 7, score: 0, success: false },
      ].map((row) => ({
        ...row,
        evalId: evaluation.id,
        promptIdx: 0,
        prompt,
        testCase: { vars: {} },
        provider: { id: 'echo' },
      })),
    )
    .run();
  return { evaluation, removeId, keepId };
}

describe('individual eval result deletion', () => {
  beforeAll(() => runDbMigrations());
  beforeEach(() => clearEvalTables());

  it('updates saved metrics and keeps absolute sibling coordinates', async () => {
    const { evaluation, removeId, keepId } = await seed();
    await expect(deleteEvalResult('another-eval', removeId)).rejects.toBeInstanceOf(
      EvalResultNotFoundError,
    );
    await deleteEvalResult(evaluation.id, removeId);
    await expect(evaluation.save()).rejects.toBeInstanceOf(EvalResultDeletionConflict);
    await withEvalResultWriter(evaluation, async () => {
      expect(evaluation.prompts[0].metrics?.testPassCount).toBe(0);
    });
    await expect(deleteEvalResult(evaluation.id, removeId)).rejects.toBeInstanceOf(
      EvalResultNotFoundError,
    );
    expect(await EvalResult.findById(removeId)).toBeNull();
    expect(await EvalResult.findById(keepId)).toMatchObject({ testIdx: 7, promptIdx: 0 });
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      score: 0,
      testPassCount: 0,
      testFailCount: 1,
      testErrorCount: 0,
    });
  });

  it('fences a concurrent writer and releases the fence afterward', async () => {
    const { evaluation, removeId } = await seed();
    await withEvalResultWriter(evaluation, async () => {
      await expect(deleteEvalResult(evaluation.id, removeId)).rejects.toBeInstanceOf(
        EvalResultDeletionConflict,
      );
      expect(await EvalResult.findById(removeId)).toBeDefined();
    });
    await deleteEvalResult(evaluation.id, removeId);
  });

  it('blocks a second evaluator and releases the writer after a failed run', async () => {
    const { evaluation, removeId } = await seed();
    const failure = new Error('evaluation interrupted');
    await expect(
      withEvalResultWriter(evaluation, async () => {
        await expect(
          withEvalResultWriter(evaluation, async () => {
            throw new Error('the second evaluator must not run');
          }),
        ).rejects.toBeInstanceOf(EvalResultDeletionConflict);
        throw failure;
      }),
    ).rejects.toBe(failure);

    await deleteEvalResultById(removeId);
    await expect(deleteEvalResultById(removeId)).rejects.toBeInstanceOf(EvalResultNotFoundError);
  });

  it('recovers an abandoned writer and retains unrelated result metadata', async () => {
    const { evaluation } = await seed();
    const db = await getDb();
    const staleId = randomUUID();
    await db
      .update(evalsTable)
      .set({ results: sql`json_object(${RESULT_WRITER}, ${staleId}, 'marker', 'keep')` })
      .where(eq(evalsTable.id, evaluation.id))
      .run();

    await withEvalResultWriter(evaluation, async () => {
      const active = await db
        .select()
        .from(evalsTable)
        .where(eq(evalsTable.id, evaluation.id))
        .get();
      expect(active?.results).toHaveProperty(RESULT_WRITER, expect.any(String));
      expect(active?.results).not.toHaveProperty(RESULT_WRITER, staleId);
    });

    const released = await db
      .select()
      .from(evalsTable)
      .where(eq(evalsTable.id, evaluation.id))
      .get();
    expect(released?.results).toEqual({ marker: 'keep' });
  });

  it('preserves a writer marker it cannot identify', async () => {
    const { evaluation } = await seed();
    const db = await getDb();
    await db
      .update(evalsTable)
      .set({ results: sql`json_object(${RESULT_WRITER}, 'unknown-writer')` })
      .where(eq(evalsTable.id, evaluation.id))
      .run();

    await expect(withEvalResultWriter(evaluation, async () => 'unexpected')).rejects.toBeInstanceOf(
      EvalResultDeletionConflict,
    );
    const row = await db.select().from(evalsTable).where(eq(evalsTable.id, evaluation.id)).get();
    expect(row?.results).toHaveProperty(RESULT_WRITER, 'unknown-writer');
  });

  it('removes only the selected result contribution to assertion and cost accounting', async () => {
    const { evaluation, removeId, keepId } = await seed();
    const db = await getDb();
    const components = [
      {
        pass: true,
        score: 1,
        reason: 'matched',
        assertion: { type: 'equals' as const, metric: 'quality' },
      },
      { pass: false, score: 0, reason: 'missed', assertion: { type: 'contains' as const } },
    ];
    await db
      .update(evalResultsTable)
      .set({
        cost: 0.25,
        response: { output: 'cached', cached: true },
        gradingResult: { pass: false, score: 0, reason: 'partial', componentResults: components },
        namedScores: { quality: 1 },
      })
      .where(eq(evalResultsTable.id, keepId))
      .run();
    const metrics = evaluation.prompts[0].metrics!;
    metrics.tokenUsage.numRequests = 1;
    Object.assign(metrics, {
      cost: 0.25,
      incurredCost: 0,
      testCacheHitCount: 1,
      namedScores: { quality: 1 },
      namedScoresCount: { quality: 1 },
      namedScoreWeights: { quality: 1 },
      assertPassCount: 1,
      assertFailCount: 1,
    });
    await evaluation.addPrompts(evaluation.prompts);
    await deleteEvalResultById(removeId);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      cost: 0.25,
      incurredCost: 0,
      testCacheHitCount: 1,
      assertPassCount: 1,
      assertFailCount: 1,
      namedScores: { quality: 1 },
      namedScoresCount: { quality: 1 },
      namedScoreWeights: { quality: 1 },
      testPassCount: 0,
      testFailCount: 1,
    });
    await deleteEvalResultById(keepId);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      cost: 0,
      incurredCost: 0,
      testCacheHitCount: 0,
      assertPassCount: 0,
      assertFailCount: 0,
      namedScores: {},
      namedScoresCount: {},
      namedScoreWeights: {},
    });
  });

  it('leaves saved results untouched when metrics are incomplete', async () => {
    const { evaluation, removeId } = await seed();
    const db = await getDb();
    await db
      .update(evalsTable)
      .set({
        prompts: [{ ...prompt, metrics: createDefaultPromptMetrics() }],
      })
      .run();
    await expect(deleteEvalResult(evaluation.id, removeId)).rejects.toBeInstanceOf(
      EvalResultDeletionConflict,
    );
    expect(await EvalResult.findById(removeId)).not.toBeNull();
  });

  it('rejects a legacy prompt without saved result counts', async () => {
    const { evaluation, removeId } = await seed();
    const db = await getDb();
    await db
      .update(evalsTable)
      .set({
        prompts: sql`json_remove(${evalsTable.prompts}, '$[0].metrics.testFailCount')`,
      })
      .where(eq(evalsTable.id, evaluation.id))
      .run();

    await expect(deleteEvalResult(evaluation.id, removeId)).rejects.toBeInstanceOf(
      EvalResultDeletionConflict,
    );
    expect(await EvalResult.findById(removeId)).not.toBeNull();
  });

  it('refuses to discard historic incurred cost and usage absent from saved siblings', async () => {
    const { evaluation, removeId, keepId } = await seed();
    const metrics = evaluation.prompts[0].metrics!;
    metrics.cost = 0.25;
    metrics.tokenUsage.total = 100;
    metrics.tokenUsage.prompt = 100;
    await evaluation.addPrompts(evaluation.prompts);
    await expect(deleteEvalResult(evaluation.id, removeId)).rejects.toBeInstanceOf(
      EvalResultDeletionConflict,
    );
    expect(await EvalResult.findById(removeId)).not.toBeNull();
    expect(await EvalResult.findById(keepId)).not.toBeNull();
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics?.cost).toBe(0.25);
  });

  it('keeps a surviving second provider under the second header in CSV', async () => {
    const { evaluation, removeId, keepId } = await seed();
    const db = await getDb();
    await db
      .update(evalResultsTable)
      .set({ testIdx: 3, promptIdx: 1, response: { output: 'SECOND CELL' } })
      .where(eq(evalResultsTable.id, keepId))
      .run();
    await evaluation.addPrompts([
      {
        ...prompt,
        label: 'First',
        metrics: { ...createDefaultPromptMetrics(), score: 1, testPassCount: 1 },
      },
      {
        ...prompt,
        label: 'Second',
        metrics: { ...createDefaultPromptMetrics(), testFailCount: 1 },
      },
    ]);
    await deleteEvalResult(evaluation.id, removeId);
    const fresh = (await Eval.findById(evaluation.id))!;
    const csv = await generateEvalCsv(fresh);
    const [headers, data] = parseCsv(csv, { relax_column_count: true }) as string[][];
    expect(data.length).toBe(headers.length);
    expect(data[headers.findIndex((h) => h.includes('Second'))]).toBe('SECOND CELL');
  });
});
