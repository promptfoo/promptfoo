import { randomUUID } from 'node:crypto';

import { parse as parseCsv } from 'csv-parse/sync';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteEvalResult, EvalResultNotFoundError } from '../../src/database/evalResultDeletion';
import {
  EvalResultDeletionConflict,
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
