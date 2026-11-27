import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { recalculatePromptMetrics, replaceRetryResults } from '../../src/node/retry';
import { createApp } from '../../src/server/server';
import { ResultFailureReason } from '../../src/types/results';
import EvalFactory from '../factories/evalFactory';
import { setupTestServer } from '../util/testServer';
import { createDeferred } from '../util/utils';

describe('rating and retry transactions', () => {
  const api = setupTestServer(createApp, runDbMigrations);
  const evaluations: Eval[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const evaluation of evaluations.splice(0)) {
      await evaluation.delete();
    }
  });

  async function createErrors(count: number) {
    const evaluation = await EvalFactory.create({ numResults: count, resultTypes: ['error'] });
    evaluations.push(evaluation);
    await recalculatePromptMetrics(evaluation);
    const originals = await evaluation.getResults();
    return {
      evaluation,
      originals: originals.map((row) => {
        if (!(row instanceof EvalResult)) {
          throw new Error('Expected a saved v4 result');
        }
        return row;
      }),
    };
  }

  async function stageFailure(evaluation: Eval, original: EvalResult) {
    const replacement = await EvalResult.createFromEvaluateResult(
      evaluation.id,
      {
        ...original.toEvaluateResult(),
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ASSERT,
        error: 'Retried assertion failed',
        gradingResult: { pass: false, score: 0, reason: 'Retried assertion failed' },
        response: { output: 'Retry response' },
      },
      { persist: false, deferMedia: true },
    );
    return { originalIds: new Set([original.id]), rows: [replacement] };
  }

  function rate(original: EvalResult) {
    return api
      .post(`/api/eval/${original.evalId}/results/${original.id}/rating`)
      .send({ action: 'rate', pass: true, score: 1, comment: 'Reviewed' })
      .then((response) => response);
  }

  // Suspend a real rating immediately after reading its saved prompt metrics.
  function pauseRatingRead() {
    const resume = createDeferred<void>();
    const didRead = vi.fn();
    const load = Eval.findById.bind(Eval);
    vi.spyOn(Eval, 'findById').mockImplementationOnce(async (...args) => {
      const record = await load(...args);
      didRead();
      await resume.promise;
      return record;
    });
    return {
      wait: () => vi.waitFor(() => expect(didRead).toHaveBeenCalledOnce()),
      resume: () => resume.resolve(),
    };
  }

  it('keeps a committed manual rating when its retry is queued behind the rating', async () => {
    const {
      evaluation,
      originals: [original],
    } = await createErrors(1);
    const stage = await stageFailure(evaluation, original);
    const db = await getDb();
    const read = pauseRatingRead();
    const rating = rate(original);
    try {
      await read.wait();
      const queued = vi.spyOn(db, 'transaction');
      const refused = expect(replaceRetryResults(evaluation, stage)).rejects.toThrow(
        'manual rating or comment',
      );
      await vi.waitFor(() => expect(queued).toHaveBeenCalledOnce());
      read.resume();
      expect((await rating).status).toBe(200);
      await refused;
      const [saved] = await evaluation.getResults();
      expect(saved).toMatchObject({
        id: original.id,
        success: true,
        gradingResult: { comment: 'Reviewed' },
      });
      expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
      });
    } finally {
      read.resume();
      await rating;
    }
  });

  it('rejects a rating queued before its transaction when retry has already replaced the row', async () => {
    const {
      evaluation,
      originals: [original],
    } = await createErrors(1);
    const stage = await stageFailure(evaluation, original);
    const db = await getDb();
    const resume = createDeferred<void>();
    const transaction = db.transaction.bind(db);
    const queued = vi.spyOn(db, 'transaction').mockImplementationOnce(async (...args) => {
      await resume.promise;
      return transaction(...args);
    });
    const rating = rate(original);
    try {
      await vi.waitFor(() => expect(queued).toHaveBeenCalledOnce());
      expect(await replaceRetryResults(evaluation, stage)).toBe(true);
      await recalculatePromptMetrics(evaluation);
      const metrics = (await Eval.findById(evaluation.id))?.prompts[0].metrics;
      expect(metrics).toMatchObject({ testPassCount: 0, testFailCount: 1, testErrorCount: 0 });
      resume.resolve();
      expect((await rating).status).toBe(404);
      expect(await EvalResult.findById(original.id)).toBeNull();
      expect(await evaluation.getResults()).toMatchObject([
        { id: stage.rows[0].id, success: false, response: { output: 'Retry response' } },
      ]);
      expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toEqual(metrics);
    } finally {
      resume.resolve();
      await rating;
    }
  });

  it('accumulates overlapping ratings on separate rows in the same prompt', async () => {
    const { evaluation, originals } = await createErrors(2);
    const db = await getDb();
    const read = pauseRatingRead();
    const first = rate(originals[0]);
    try {
      await read.wait();
      const queued = vi.spyOn(db, 'transaction');
      const second = rate(originals[1]);
      await vi.waitFor(() => expect(queued).toHaveBeenCalledOnce());
      read.resume();
      expect((await first).status).toBe(200);
      expect((await second).status).toBe(200);
      for (const row of await evaluation.getResults()) {
        expect(row).toMatchObject({ success: true, gradingResult: { comment: 'Reviewed' } });
      }
      expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
        score: 2,
        testPassCount: 2,
        testFailCount: 0,
        testErrorCount: 0,
      });
    } finally {
      read.resume();
      await first;
    }
  });
});
