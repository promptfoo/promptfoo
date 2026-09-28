import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { updateSignalFile } from '../../src/database/signal';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { createApp } from '../../src/server/server';
import { deleteEval, deleteEvalResult } from '../../src/util/database';
import EvalFactory from '../factories/evalFactory';
import { createDeferred } from '../util/utils';

vi.mock('../../src/database/signal', async (importOriginal) => ({
  ...(await importOriginal()),
  updateSignalFile: vi.fn(),
}));

describe('rating and result deletion', () => {
  const ids: string[] = [];
  beforeAll(async () => {
    await runDbMigrations();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const id of ids.splice(0)) {
      await deleteEval(id);
    }
  });

  async function fixture() {
    const evaluation = await EvalFactory.create();
    ids.push(evaluation.id);
    evaluation.prompts[0].metrics!.cost = 0.014;
    evaluation.prompts[0].metrics!.tokenUsage = {
      total: 20,
      prompt: 10,
      completion: 10,
      cached: 0,
      numRequests: 2,
      assertions: { total: 20, prompt: 10, completion: 10, cached: 0, numRequests: 2 },
    };
    await evaluation.addPrompts(evaluation.prompts);
    const results = await EvalResult.findManyByEvalId(evaluation.id);
    const target = results.find((result) => !result.success)!;
    const sibling = results.find((result) => result.success)!;
    const grade = {
      ...target.gradingResult!,
      pass: true,
      score: 1,
      reason: 'Manual result (overrides all other grading results)',
      componentResults: [
        ...target.gradingResult!.componentResults!,
        { pass: true, score: 1, reason: 'Manual pass', assertion: { type: 'human' } },
      ],
    };
    return { evaluation, target, sibling, grade };
  }

  it.each([true, false])(
    'preserves deletion when the rating target is deleted=%s',
    async (deleteTarget) => {
      const { evaluation, target, sibling, grade } = await fixture();
      const db = await getDb();
      const deleted = createDeferred<void>();
      const releaseDelete = createDeferred<void>();
      const deleting = db.transaction(async () => {
        await deleteEvalResult(evaluation.id, deleteTarget ? target.id : sibling.id);
        deleted.resolve();
        await releaseDelete.promise;
      });
      await deleted.promise;
      const ratingStarted = createDeferred<void>();
      const submit = EvalResult.submitRating.bind(EvalResult);
      vi.spyOn(EvalResult, 'submitRating').mockImplementation((...args) => {
        ratingStarted.resolve();
        return submit(...args);
      });
      const rating = request(createApp())
        .post(`/api/eval/${evaluation.id}/results/${target.id}/rating`)
        .send(grade)
        .then((res) => res);
      try {
        await ratingStarted.promise;
      } finally {
        releaseDelete.resolve();
        await deleting;
      }
      const response = await rating;
      expect(response.status).toBe(deleteTarget ? 404 : 200);
      const remaining = await EvalResult.findManyByEvalId(evaluation.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(deleteTarget ? sibling.id : target.id);
      expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
        testPassCount: 1,
        testFailCount: 0,
        score: 1,
        cost: 0.007,
        assertPassCount: 1,
        assertFailCount: deleteTarget ? 0 : 1,
        tokenUsage: { total: 10, numRequests: 1, assertions: { total: 10, numRequests: 1 } },
      });
    },
  );

  it('lets a queued deletion observe the committed rating and preserves unrelated row fields', async () => {
    const { evaluation, target, sibling, grade } = await fixture();
    const db = await getDb();
    const transact = db.transaction.bind(db);
    const written = createDeferred<void>();
    const releaseRating = createDeferred<void>();
    let held = false;
    vi.spyOn(db, 'transaction').mockImplementation((callback, config) =>
      transact(async (tx) => {
        const result = await callback(tx);
        if (!held) {
          held = true;
          written.resolve();
          await releaseRating.promise;
        }
        return result;
      }, config),
    );
    vi.mocked(updateSignalFile).mockClear();
    const rating = request(createApp())
      .post(`/api/eval/${evaluation.id}/results/${target.id}/rating`)
      .send(grade)
      .then((res) => res);
    await written.promise;
    let deleting: ReturnType<typeof deleteEvalResult> | undefined;
    try {
      expect(updateSignalFile).not.toHaveBeenCalled();
      deleting = deleteEvalResult(evaluation.id, sibling.id);
    } finally {
      releaseRating.resolve();
    }
    const [response] = await Promise.all([rating, deleting]);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: target.id, score: 1, success: true });
    const updated = (await EvalResult.findById(target.id))!;
    expect(updated.response).toEqual(target.response);
    expect(updated.metadata).toEqual(target.metadata);
    expect(updated.testCase).toEqual(target.testCase);
    expect(updated.provider).toEqual(target.provider);
    expect(updated.failureReason).toBe(target.failureReason);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      testPassCount: 1,
      testFailCount: 0,
      score: 1,
      cost: 0.007,
      tokenUsage: { total: 10, numRequests: 1, assertions: { total: 10, numRequests: 1 } },
    });
    expect(updateSignalFile).toHaveBeenCalledTimes(2);
  });

  it('rolls back the rated row when the header update fails, without a mutation signal', async () => {
    const { evaluation, target, grade } = await fixture();
    const db = await getDb();
    const before = (await Eval.findById(evaluation.id))!.prompts;
    await db.run(`CREATE TRIGGER reject_rating_prompt_update BEFORE UPDATE OF prompts ON evals
      BEGIN SELECT RAISE(ABORT, 'forced prompt failure'); END`);
    vi.mocked(updateSignalFile).mockClear();
    try {
      const response = await request(createApp())
        .post(`/api/eval/${evaluation.id}/results/${target.id}/rating`)
        .send(grade);
      expect(response.status).toBe(500);
      expect((await EvalResult.findById(target.id))!.toEvaluateResult()).toEqual(
        target.toEvaluateResult(),
      );
      expect((await Eval.findById(evaluation.id))!.prompts).toEqual(before);
      expect(updateSignalFile).not.toHaveBeenCalled();
    } finally {
      await db.run('DROP TRIGGER reject_rating_prompt_update');
    }
  });
});
