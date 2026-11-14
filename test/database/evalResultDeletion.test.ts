import { randomUUID } from 'node:crypto';

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
});
