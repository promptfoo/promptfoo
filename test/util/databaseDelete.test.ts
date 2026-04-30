import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { spansTable, tracesTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { TraceStore } from '../../src/tracing/store';
import { deleteAllEvals, deleteEval, deleteEvals } from '../../src/util/database';
import EvalFactory from '../factories/evalFactory';

describe('database eval deletion', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM spans');
    await db.run('DELETE FROM traces');
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

    const db = getDb();
    expect(await Eval.findById(eval_.id)).toBeUndefined();
    expect(db.select().from(tracesTable).all()).toHaveLength(0);
    expect(db.select().from(spansTable).all()).toHaveLength(0);
  });

  it('deletes only traces and spans for selected evals', async () => {
    const eval1 = await EvalFactory.create();
    const eval2 = await EvalFactory.create();
    const eval3 = await EvalFactory.create();
    await addTrace(eval1.id, 'trace-bulk-1');
    await addTrace(eval2.id, 'trace-bulk-2');
    await addTrace(eval3.id, 'trace-retained');

    deleteEvals([eval1.id, eval2.id]);

    const db = getDb();
    expect(await Eval.findById(eval1.id)).toBeUndefined();
    expect(await Eval.findById(eval2.id)).toBeUndefined();
    expect(await Eval.findById(eval3.id)).toBeDefined();
    expect(db.select({ traceId: tracesTable.traceId }).from(tracesTable).all()).toEqual([
      { traceId: 'trace-retained' },
    ]);
    expect(db.select({ traceId: spansTable.traceId }).from(spansTable).all()).toEqual([
      { traceId: 'trace-retained' },
    ]);
  });

  it('deletes traces and spans when deleting all evals', async () => {
    const eval1 = await EvalFactory.create();
    const eval2 = await EvalFactory.create();
    await addTrace(eval1.id, 'trace-all-1');
    await addTrace(eval2.id, 'trace-all-2');

    await deleteAllEvals();

    const db = getDb();
    expect(await Eval.getMany()).toHaveLength(0);
    expect(db.select().from(tracesTable).all()).toHaveLength(0);
    expect(db.select().from(spansTable).all()).toHaveLength(0);
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

    const db = getDb();
    expect(db.select().from(spansTable).all()).toHaveLength(0);
  });
});
