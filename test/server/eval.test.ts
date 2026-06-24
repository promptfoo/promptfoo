import type { Server } from 'node:http';

import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database';
import { updateSignalFile } from '../../src/database/signal';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { createApp } from '../../src/server/server';
import { ResultFailureReason } from '../../src/types';
import { STRIPPED_TABLE_CELL_PROMPT } from '../../src/util/eval/evalTableUtils';
import invariant from '../../src/util/invariant';
import EvalFactory from '../factories/evalFactory';

vi.mock('../../src/database/signal', async () => {
  const actual = await vi.importActual('../../src/database/signal');
  return {
    ...actual,
    updateSignalFile: vi.fn(),
  };
});

describe('eval routes', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;
  const testEvalIds = new Set<string>();

  beforeAll(async () => {
    await runDbMigrations();
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    // More robust cleanup with proper error handling
    const cleanupPromises = Array.from(testEvalIds).map(async (evalId) => {
      try {
        const eval_ = await Eval.findById(evalId);
        if (eval_) {
          await eval_.delete();
        }
      } catch (error) {
        // Log the error instead of silently ignoring it
        console.error(`Failed to cleanup eval ${evalId}:`, error);
      }
    });

    // Wait for all cleanups to complete
    await Promise.allSettled(cleanupPromises);
    testEvalIds.clear();
    vi.resetAllMocks();
  });

  function mockTablePayloadRangeError(shouldThrow: (attempt: number) => boolean) {
    const originalStringify = JSON.stringify;
    let tablePayloadAttempts = 0;

    return vi
      .spyOn(JSON, 'stringify')
      .mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
        const value = args[0];
        if (value && typeof value === 'object' && 'table' in value && 'totalCount' in value) {
          tablePayloadAttempts += 1;
          if (shouldThrow(tablePayloadAttempts)) {
            throw new RangeError('Invalid string length');
          }
        }
        return originalStringify.apply(JSON, args);
      });
  }

  async function setResultPromptRaws(eval_: Eval, raws: string[]) {
    const results = await eval_.getResults();
    await Promise.all(
      raws.map(async (raw, index) => {
        const result = results[index];
        invariant(result instanceof EvalResult, 'EvalResult is required');
        result.prompt = { ...result.prompt, raw };
        await result.save();
      }),
    );
  }

  function createManualRatingPayload(originalResult: any, pass: boolean, score = pass ? 1 : 0) {
    const payload = structuredClone(originalResult.gradingResult ?? {});
    const componentResults = payload.componentResults ?? [];
    const humanRating = {
      pass,
      score,
      reason: 'Manual result (overrides all other grading results)',
      assertion: { type: 'human' },
    };
    const humanRatingIndex = componentResults.findIndex(
      (result: any) => result.assertion?.type === 'human',
    );
    if (humanRatingIndex === -1) {
      componentResults.push(humanRating);
    } else {
      componentResults[humanRatingIndex] = humanRating;
    }
    payload.componentResults = componentResults;
    payload.reason = 'Manual result (overrides all other grading results)';
    payload.pass = pass;
    payload.score = score;
    return payload;
  }

  function createScoreOnlyRatingPayload(originalResult: any, score: number) {
    const payload = structuredClone(originalResult.gradingResult ?? {});
    payload.pass = originalResult.success;
    payload.score = score;
    payload.reason = 'Manual score override';
    return payload;
  }

  function createClearManualRatingPayload(originalResult: any) {
    const payload = structuredClone(originalResult.gradingResult ?? {});
    const componentResults = (payload.componentResults ?? []).filter(
      (result: any) => result.assertion?.type !== 'human',
    );
    payload.componentResults = componentResults;
    if (componentResults.length > 0) {
      payload.pass = componentResults.every((result: any) => result.pass);
      const scores = componentResults
        .map((result: any) => result.score)
        .filter((score: unknown): score is number => typeof score === 'number');
      payload.score =
        scores.length > 0
          ? scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length
          : payload.score;
      payload.reason = componentResults[0].reason;
    }
    return payload;
  }

  async function markResultAsError(eval_: Eval, result: EvalResult) {
    result.failureReason = ResultFailureReason.ERROR;
    await result.save();
    const prompt = eval_.prompts[result.promptIdx];
    invariant(prompt.metrics, 'Prompt metrics are required');
    prompt.metrics.testFailCount -= 1;
    prompt.metrics.testErrorCount += 1;
    await eval_.save();
  }

  describe('POST /', () => {
    it('returns 500 when v4 prompt persistence fails', async () => {
      const createSpy = vi.spyOn(Eval, 'create');
      vi.spyOn(Eval.prototype, 'addPrompts').mockRejectedValueOnce(
        new Error('prompt persistence failed'),
      );

      const res = await api.post('/api/eval').send({
        config: {
          description: 'v4 save test',
          tests: [],
        },
        prompts: [{ raw: 'hello', label: 'hello' }],
        results: [],
      });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to write eval to database' });

      const createdEval = await createSpy.mock.results[0]?.value;
      if (createdEval) {
        testEvalIds.add(createdEval.id);
      }
    });
  });

  describe('post("/:evalId/results/:id/rating")', () => {
    it('rejects result ratings when the URL eval does not own the result', async () => {
      const evalA = await EvalFactory.create();
      const evalB = await EvalFactory.create();
      testEvalIds.add(evalA.id);
      testEvalIds.add(evalB.id);

      const resultsB = await evalB.getResults();
      const resultB = resultsB[0];
      invariant(resultB.id, 'Result ID is required');
      const originalResultB = {
        gradingResult: structuredClone(resultB.gradingResult),
        score: resultB.score,
        success: resultB.success,
      };
      const originalEvalAMetrics = structuredClone(evalA.prompts[resultB.promptIdx].metrics);
      const originalEvalBMetrics = structuredClone(evalB.prompts[resultB.promptIdx].metrics);

      const res = await api
        .post(`/api/eval/${evalA.id}/results/${resultB.id}/rating`)
        .send(createManualRatingPayload(resultB, false));

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Result not found');

      const updatedResultB = await EvalResult.findById(resultB.id);
      expect(updatedResultB?.gradingResult).toEqual(originalResultB.gradingResult);
      expect(updatedResultB?.score).toBe(originalResultB.score);
      expect(updatedResultB?.success).toBe(originalResultB.success);

      const updatedEvalA = await Eval.findById(evalA.id);
      const updatedEvalB = await Eval.findById(evalB.id);
      invariant(updatedEvalA, 'Eval A is required');
      invariant(updatedEvalB, 'Eval B is required');
      expect(updatedEvalA.prompts[resultB.promptIdx].metrics).toEqual(originalEvalAMetrics);
      expect(updatedEvalB.prompts[resultB.promptIdx].metrics).toEqual(originalEvalBMetrics);
    });

    it('treats an explicit clear with no manual rating as an idempotent no-op', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result.id, 'Result ID is required');
      const originalResult = {
        failureReason: result.failureReason,
        gradingResult: structuredClone(result.gradingResult),
        score: result.score,
        success: result.success,
      };
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: true, score: 1, ratingAction: 'clear' });

      expect(res.status).toBe(200);
      expect(await EvalResult.findById(result.id)).toMatchObject(originalResult);
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        originalMetrics,
      );
    });

    it('rolls back the result and metrics and skips notification when eval persistence fails', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result.id, 'Result ID is required');
      const originalResult = {
        gradingResult: structuredClone(result.gradingResult),
        failureReason: result.failureReason,
        score: result.score,
        success: result.success,
      };
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      const db = await getDb();

      await db.run(sql.raw('DROP TRIGGER IF EXISTS fail_rating_eval_update'));
      await db.run(
        sql.raw(`
          CREATE TRIGGER fail_rating_eval_update
          BEFORE UPDATE OF prompts ON evals
          BEGIN
            SELECT RAISE(ABORT, 'forced eval update failure');
          END
        `),
      );
      vi.mocked(updateSignalFile).mockClear();

      try {
        const res = await api
          .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
          .send(createManualRatingPayload(result, true));

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to submit rating' });

        const persistedResult = await EvalResult.findById(result.id);
        expect(persistedResult?.gradingResult).toEqual(originalResult.gradingResult);
        expect(persistedResult?.failureReason).toBe(originalResult.failureReason);
        expect(persistedResult?.score).toBe(originalResult.score);
        expect(persistedResult?.success).toBe(originalResult.success);

        const persistedEval = await Eval.findById(eval_.id);
        expect(persistedEval?.prompts[result.promptIdx].metrics).toEqual(originalMetrics);
        expect(updateSignalFile).not.toHaveBeenCalled();
      } finally {
        await db.run(sql.raw('DROP TRIGGER IF EXISTS fail_rating_eval_update'));
      }
    });

    it('returns the persisted result row so SDK clients see refreshed metrics', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      // Pick the failing result so flipping `pass=true` produces a real
      // state transition. With `results[0]` (already passing), every numeric
      // field would be unchanged and the test couldn't distinguish a fresh
      // post-rating row from a pre-rating snapshot.
      const result = results[1];
      invariant(result.id, 'Result ID is required');
      expect(result.gradingResult?.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.success).toBe(false);

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));

      expect(res.status).toBe(200);
      // The body must reflect the *post-rating* state, not just include the
      // row's id — external SDK consumers depend on reading refreshed
      // grading state without a follow-up GET. If the route ever regressed
      // to returning a pre-save snapshot or a generic `{message}` envelope,
      // the strict equality on flipped fields below would catch it.
      expect(res.body.id).toBe(result.id);
      expect(res.body.success).toBe(true);
      expect(res.body.score).toBe(1);
      expect(res.body.gradingResult?.pass).toBe(true);
      expect(res.body.gradingResult?.score).toBe(1);
      expect(res.body.gradingResult?.reason).toContain('Manual result');
    });

    it('should update prompt score if a passing result keeps pass status with a new score', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[0];
      invariant(result.id, 'Result ID is required');
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      invariant(originalMetrics, 'Prompt metrics are required');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createScoreOnlyRatingPayload(result, 0.25));

      expect(res.status).toBe(200);
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.success).toBe(true);
      expect(updatedResult?.score).toBe(0.25);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      const updatedMetrics = updatedEval.prompts[result.promptIdx].metrics;
      expect(updatedMetrics?.score).toBeCloseTo(originalMetrics.score - 0.75);
      expect(updatedMetrics?.assertPassCount).toBe(originalMetrics.assertPassCount);
      expect(updatedMetrics?.assertFailCount).toBe(originalMetrics.assertFailCount);
      expect(updatedMetrics?.testPassCount).toBe(originalMetrics.testPassCount);
      expect(updatedMetrics?.testFailCount).toBe(originalMetrics.testFailCount);
      expect(updatedMetrics?.testErrorCount).toBe(originalMetrics.testErrorCount);
    });

    it('preserves an error category when updating only its comment', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      await markResultAsError(eval_, result);
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...result.gradingResult, comment: 'Investigating', ratingAction: 'update' });

      expect(res.status).toBe(200);
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.failureReason).toBe(ResultFailureReason.ERROR);
      expect(updatedResult?.gradingResult?.comment).toBe('Investigating');
      expect(updatedResult?.gradingResult?.componentResults).not.toContainEqual(
        expect.objectContaining({ assertion: { type: 'human' } }),
      );
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        originalMetrics,
      );
    });

    it('should update prompt score if a failing result keeps fail status with a new score', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      invariant(originalMetrics, 'Prompt metrics are required');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: result.success, score: 0.4 });

      expect(res.status).toBe(200);
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.success).toBe(false);
      expect(updatedResult?.score).toBe(0.4);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      const updatedMetrics = updatedEval.prompts[result.promptIdx].metrics;
      expect(updatedMetrics?.score).toBeCloseTo(originalMetrics.score + 0.4);
      expect(updatedMetrics?.assertPassCount).toBe(originalMetrics.assertPassCount);
      expect(updatedMetrics?.assertFailCount).toBe(originalMetrics.assertFailCount);
      expect(updatedMetrics?.testPassCount).toBe(originalMetrics.testPassCount);
      expect(updatedMetrics?.testFailCount).toBe(originalMetrics.testFailCount);
      expect(updatedMetrics?.testErrorCount).toBe(originalMetrics.testErrorCount);
    });

    it('should preserve assertion counts if an existing manual pass rating changes only score', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[0];
      invariant(result.id, 'Result ID is required');
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      invariant(originalMetrics, 'Prompt metrics are required');

      const firstRes = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));
      expect(firstRes.status).toBe(200);

      const manuallyRatedResult = await EvalResult.findById(result.id);
      invariant(manuallyRatedResult, 'Updated result is required');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(manuallyRatedResult, true, 0.4));

      expect(res.status).toBe(200);
      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      const updatedMetrics = updatedEval.prompts[result.promptIdx].metrics;
      expect(updatedMetrics?.score).toBeCloseTo(originalMetrics.score - 0.6);
      expect(updatedMetrics?.assertPassCount).toBe(originalMetrics.assertPassCount + 1);
      expect(updatedMetrics?.assertFailCount).toBe(originalMetrics.assertFailCount);
      expect(updatedMetrics?.testPassCount).toBe(originalMetrics.testPassCount);
      expect(updatedMetrics?.testFailCount).toBe(originalMetrics.testFailCount);
    });

    it('should decrement assertion counts if an existing manual rating is cleared', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[0];
      invariant(result.id, 'Result ID is required');
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      invariant(originalMetrics, 'Prompt metrics are required');

      const firstRes = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));
      expect(firstRes.status).toBe(200);

      const manuallyRatedResult = await EvalResult.findById(result.id);
      invariant(manuallyRatedResult, 'Updated result is required');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createClearManualRatingPayload(manuallyRatedResult));

      expect(res.status).toBe(200);
      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      const updatedMetrics = updatedEval.prompts[result.promptIdx].metrics;
      expect(updatedMetrics?.score).toBe(originalMetrics.score);
      expect(updatedMetrics?.assertPassCount).toBe(originalMetrics.assertPassCount);
      expect(updatedMetrics?.assertFailCount).toBe(originalMetrics.assertFailCount);
      expect(updatedMetrics?.testPassCount).toBe(originalMetrics.testPassCount);
      expect(updatedMetrics?.testFailCount).toBe(originalMetrics.testFailCount);
    });

    it('should ignore malformed component result entries if updating assertion metrics', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[0];
      invariant(result.id, 'Result ID is required');
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      invariant(originalMetrics, 'Prompt metrics are required');

      const ratingPayload = structuredClone(result.gradingResult ?? {}) as any;
      ratingPayload.pass = true;
      ratingPayload.score = 0.5;
      ratingPayload.componentResults = [
        null,
        'bad component',
        { pass: 'false', score: 0 },
        { pass: 1, score: 1 },
        { pass: true, score: 1 },
        { pass: false, score: 0 },
      ];

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(ratingPayload);

      expect(res.status).toBe(200);
      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      const updatedMetrics = updatedEval.prompts[result.promptIdx].metrics;
      expect(updatedMetrics?.score).toBeCloseTo(originalMetrics.score - 0.5);
      expect(updatedMetrics?.assertPassCount).toBe(originalMetrics.assertPassCount);
      expect(updatedMetrics?.assertFailCount).toBe(originalMetrics.assertFailCount);
      expect(updatedMetrics?.testPassCount).toBe(originalMetrics.testPassCount);
      expect(updatedMetrics?.testFailCount).toBe(originalMetrics.testFailCount);
    });

    it('should count a manual fail as a failure if an error result was previously rated as passing', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');

      await markResultAsError(eval_, result);

      const passRes = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));
      expect(passRes.status).toBe(200);

      const passedResult = await EvalResult.findById(result.id);
      invariant(passedResult, 'Passed result is required');
      expect(passedResult.failureReason).toBe(ResultFailureReason.NONE);

      const failRes = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(passedResult, false));
      expect(failRes.status).toBe(200);

      const failedResult = await EvalResult.findById(result.id);
      invariant(failedResult, 'Failed result is required');
      expect(failedResult.failureReason).toBe(ResultFailureReason.ASSERT);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      const updatedMetrics = updatedEval.prompts[result.promptIdx].metrics;
      expect(updatedMetrics?.testPassCount).toBe(1);
      expect(updatedMetrics?.testFailCount).toBe(1);
      expect(updatedMetrics?.testErrorCount).toBe(0);
    });

    it('should classify a direct manual fail rating on an error result as a failure', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');

      await markResultAsError(eval_, result);

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, false));

      expect(res.status).toBe(200);
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.failureReason).toBe(ResultFailureReason.ASSERT);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      const updatedMetrics = updatedEval.prompts[result.promptIdx].metrics;
      expect(updatedMetrics?.testPassCount).toBe(1);
      expect(updatedMetrics?.testFailCount).toBe(1);
      expect(updatedMetrics?.testErrorCount).toBe(0);
    });

    it('should preserve an error category when a rating submission only adds a comment', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');

      await markResultAsError(eval_, result);

      const commentPayload = {
        ...structuredClone(result.gradingResult ?? {}),
        pass: result.success,
        score: result.score,
        comment: 'Reviewed as an execution error',
      };
      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(commentPayload);

      expect(res.status).toBe(200);
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.failureReason).toBe(ResultFailureReason.ERROR);
      expect(updatedResult?.gradingResult?.comment).toBe('Reviewed as an execution error');

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      const updatedMetrics = updatedEval.prompts[result.promptIdx].metrics;
      expect(updatedMetrics?.testPassCount).toBe(1);
      expect(updatedMetrics?.testFailCount).toBe(0);
      expect(updatedMetrics?.testErrorCount).toBe(1);
    });

    it('should preserve an error category when a rating submission changes only the score', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');

      await markResultAsError(eval_, result);
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      invariant(originalMetrics, 'Prompt metrics are required');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: result.success, score: 0.4 });

      expect(res.status).toBe(200);
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.failureReason).toBe(ResultFailureReason.ERROR);
      expect(updatedResult?.score).toBe(0.4);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      const updatedMetrics = updatedEval.prompts[result.promptIdx].metrics;
      expect(updatedMetrics?.score).toBeCloseTo(originalMetrics.score + 0.4);
      expect(updatedMetrics?.testPassCount).toBe(1);
      expect(updatedMetrics?.testFailCount).toBe(0);
      expect(updatedMetrics?.testErrorCount).toBe(1);
    });

    it('notifies once after committing the result and aggregate metrics', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result.id, 'Result ID is required');
      const resultSaveSpy = vi.spyOn(EvalResult.prototype, 'save');
      const evalSaveSpy = vi.spyOn(Eval.prototype, 'save');
      vi.mocked(updateSignalFile).mockClear();

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));

      expect(res.status).toBe(200);
      expect(resultSaveSpy).not.toHaveBeenCalled();
      expect(evalSaveSpy).not.toHaveBeenCalled();
      expect(updateSignalFile).toHaveBeenCalledTimes(1);
      expect(updateSignalFile).toHaveBeenCalledWith(eval_.id);

      const persistedResult = await EvalResult.findById(result.id);
      const persistedEval = await Eval.findById(eval_.id);
      expect(persistedResult?.success).toBe(true);
      expect(persistedEval?.prompts[result.promptIdx].metrics?.testPassCount).toBe(2);
      expect(persistedEval?.prompts[result.promptIdx].metrics?.testFailCount).toBe(0);
    });

    it('keeps metrics consistent for concurrent and repeated ratings', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const passingResult = results[0];
      const failingResult = results[1];
      invariant(passingResult.id, 'Passing result ID is required');
      invariant(failingResult.id, 'Failing result ID is required');
      const passingPayload = createManualRatingPayload(passingResult, false);
      const failingPayload = createManualRatingPayload(failingResult, true);

      const responses = await Promise.all([
        api.post(`/api/eval/${eval_.id}/results/${passingResult.id}/rating`).send(passingPayload),
        api.post(`/api/eval/${eval_.id}/results/${failingResult.id}/rating`).send(failingPayload),
        api.post(`/api/eval/${eval_.id}/results/${passingResult.id}/rating`).send(passingPayload),
        api.post(`/api/eval/${eval_.id}/results/${failingResult.id}/rating`).send(failingPayload),
      ]);

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
      const persistedEval = await Eval.findById(eval_.id);
      invariant(persistedEval, 'Eval is required');
      const metrics = persistedEval.prompts[0].metrics;
      expect(metrics).toMatchObject({
        score: 1,
        testPassCount: 1,
        testFailCount: 1,
        testErrorCount: 0,
        assertPassCount: 2,
        assertFailCount: 2,
      });

      const metricsBeforeRepeat = structuredClone(metrics);
      const repeatedResponse = await api
        .post(`/api/eval/${eval_.id}/results/${passingResult.id}/rating`)
        .send(passingPayload);
      expect(repeatedResponse.status).toBe(200);
      const evalAfterRepeat = await Eval.findById(eval_.id);
      expect(evalAfterRepeat?.prompts[0].metrics).toEqual(metricsBeforeRepeat);
    });

    it('canonicalizes a minimal outcome flip as one manual component', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result.id, 'Result ID is required');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: true, score: 0.75 });

      expect(res.status).toBe(200);
      const persistedResult = await EvalResult.findById(result.id);
      const components = persistedResult?.gradingResult?.componentResults ?? [];
      expect(components).toHaveLength(2);
      expect(components.filter((component) => component.assertion?.type === 'human')).toHaveLength(
        1,
      );
      expect(components[0].assertion?.type).toBe('equals');
      expect(persistedResult?.success).toBe(true);
      expect(persistedResult?.score).toBe(0.75);
      expect(persistedResult?.failureReason).toBe(ResultFailureReason.NONE);

      const persistedEval = await Eval.findById(eval_.id);
      expect(persistedEval?.prompts[0].metrics).toMatchObject({
        score: 1.75,
        testPassCount: 2,
        testFailCount: 0,
        assertPassCount: 2,
        assertFailCount: 1,
      });
    });

    it('canonicalizes an exact minimal same-outcome rating as one manual component', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: result.success, score: result.score });

      expect(res.status).toBe(200);
      const persistedResult = await EvalResult.findById(result.id);
      expect(
        persistedResult?.gradingResult?.componentResults?.filter(
          (component) => component.assertion?.type === 'human',
        ),
      ).toHaveLength(1);
      expect((await Eval.findById(eval_.id))?.prompts[0].metrics).toMatchObject({
        score: 1,
        assertPassCount: 2,
        assertFailCount: 1,
        testPassCount: 1,
        testFailCount: 1,
      });
    });

    it('canonicalizes a top-level human assertion without double counting it', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[0];
      invariant(result.id, 'Result ID is required');

      const res = await api.post(`/api/eval/${eval_.id}/results/${result.id}/rating`).send({
        pass: true,
        score: 0.6,
        reason: 'Reviewed manually',
        assertion: { type: 'human' },
      });

      expect(res.status).toBe(200);
      const persistedResult = await EvalResult.findById(result.id);
      expect(persistedResult?.gradingResult?.assertion).toBeUndefined();
      expect(
        persistedResult?.gradingResult?.componentResults?.filter(
          (component) => component.assertion?.type === 'human',
        ),
      ).toHaveLength(1);
      const persistedEval = await Eval.findById(eval_.id);
      expect(persistedEval?.prompts[0].metrics).toMatchObject({
        score: 0.6,
        assertPassCount: 2,
        assertFailCount: 1,
        testPassCount: 1,
        testFailCount: 1,
      });
    });

    it('restores an error with zero components and a custom score on repeated clear', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      result.success = false;
      result.score = 0.35;
      result.failureReason = ResultFailureReason.ERROR;
      result.gradingResult = {
        pass: false,
        score: 0.35,
        reason: 'Original execution error',
        componentResults: [],
      };
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      prompt.metrics.score += 0.35;
      prompt.metrics.testFailCount -= 1;
      prompt.metrics.testErrorCount += 1;
      prompt.metrics.assertFailCount -= 1;
      await eval_.save();
      const originalMetrics = structuredClone(prompt.metrics);

      const rateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));
      expect(rateResponse.status).toBe(200);
      const manuallyRatedResult = await EvalResult.findById(result.id);
      invariant(manuallyRatedResult, 'Manually rated result is required');
      const clearPayload = createClearManualRatingPayload(manuallyRatedResult);

      const firstClear = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(clearPayload);
      const freshlyRestoredResult = await EvalResult.findById(result.id);
      invariant(freshlyRestoredResult, 'Freshly restored result is required');
      const equivalentFreshClear = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createClearManualRatingPayload(freshlyRestoredResult));
      const repeatedClear = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...clearPayload, ignoredPassthroughField: { order: ['does', 'not', 'matter'] } });

      expect(firstClear.status).toBe(200);
      expect(equivalentFreshClear.status).toBe(200);
      expect(repeatedClear.status).toBe(200);
      const restoredResult = await EvalResult.findById(result.id);
      expect(restoredResult?.success).toBe(false);
      expect(restoredResult?.score).toBe(0.35);
      expect(restoredResult?.failureReason).toBe(ResultFailureReason.ERROR);
      expect(restoredResult?.gradingResult).toMatchObject({
        pass: false,
        score: 0.35,
        reason: 'Original execution error',
        componentResults: [],
      });
      const restoredEval = await Eval.findById(eval_.id);
      expect(restoredEval?.prompts[result.promptIdx].metrics).toEqual(originalMetrics);
    });

    it('applies a score update after a manual rating is cleared', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[0];
      invariant(result.id, 'Result ID is required');

      const rateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, false));
      expect(rateResponse.status).toBe(200);

      const manuallyRatedResult = await EvalResult.findById(result.id);
      invariant(manuallyRatedResult, 'Manually rated result is required');
      const legacyClearPayload = createClearManualRatingPayload(manuallyRatedResult);
      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...legacyClearPayload, ratingAction: 'clear' });
      expect(clearResponse.status).toBe(200);

      const restoredResult = await EvalResult.findById(result.id);
      invariant(restoredResult, 'Restored result is required');
      const scoreResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...createScoreOnlyRatingPayload(restoredResult, 0.4), ratingAction: 'update' });

      expect(scoreResponse.status).toBe(200);
      expect(scoreResponse.body.score).toBe(0.4);
      expect(scoreResponse.body.gradingResult?.score).toBe(0.4);
      expect(scoreResponse.body.gradingResult).not.toHaveProperty('ratingAction');
      const delayedClearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(legacyClearPayload);
      expect(delayedClearResponse.status).toBe(200);
      const persistedResult = await EvalResult.findById(result.id);
      expect(persistedResult?.score).toBe(0.4);
      expect(persistedResult?.gradingResult?.componentResults).not.toContainEqual(
        expect.objectContaining({ assertion: { type: 'human' } }),
      );
      const persistedEval = await Eval.findById(eval_.id);
      expect(persistedEval?.prompts[result.promptIdx].metrics?.score).toBeCloseTo(0.4);
    });

    it('preserves a recoverable ERROR category when clearing a legacy rating', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      await markResultAsError(eval_, result);
      const errorMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      invariant(errorMetrics, 'Original error metrics are required');

      // Emulate a rating written before provenance existed. The legacy route retained the
      // ERROR failure reason even while the manual pass overrode the visible outcome.
      result.gradingResult = createManualRatingPayload(result, true);
      result.success = true;
      result.score = 1;
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      prompt.metrics.score += 1;
      prompt.metrics.testErrorCount -= 1;
      prompt.metrics.testPassCount += 1;
      prompt.metrics.assertPassCount += 1;
      await eval_.save();

      const legacyRating = await EvalResult.findById(result.id);
      invariant(legacyRating, 'Legacy rating is required');
      const updateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(legacyRating, true, 0.4));
      expect(updateResponse.status).toBe(200);
      const updatedLegacyRating = await EvalResult.findById(result.id);
      invariant(updatedLegacyRating, 'Updated legacy rating is required');
      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createClearManualRatingPayload(updatedLegacyRating));

      expect(res.status).toBe(200);
      const restoredResult = await EvalResult.findById(result.id);
      expect(restoredResult?.success).toBe(false);
      expect(restoredResult?.failureReason).toBe(ResultFailureReason.ERROR);
      const restoredMetrics = (await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics;
      expect(restoredMetrics).toMatchObject({
        ...errorMetrics,
        score: expect.closeTo(errorMetrics.score, 10),
      });
    });

    it('restores server-owned automated components when a clear payload mutates them', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result.id, 'Result ID is required');
      const originalGradingResult = structuredClone(result.gradingResult);
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);

      const rateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));
      expect(rateResponse.status).toBe(200);
      const manualResult = await EvalResult.findById(result.id);
      invariant(manualResult, 'Manual result is required');
      const clearPayload = createClearManualRatingPayload(manualResult);
      invariant(clearPayload.componentResults[0], 'Automated component is required');
      clearPayload.componentResults[0].pass = true;
      clearPayload.componentResults[0].score = 1;

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(clearPayload);

      expect(clearResponse.status).toBe(200);
      const restoredResult = await EvalResult.findById(result.id);
      expect(restoredResult?.gradingResult).toEqual(originalGradingResult);
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        originalMetrics,
      );
    });

    it('restores a grading result that originally omitted reason', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      result.gradingResult = null;
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      prompt.metrics.assertPassCount -= 1;
      await eval_.save();

      const scoreResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: true, score: 0.4 });
      expect(scoreResponse.status).toBe(200);
      const scoredResult = await EvalResult.findById(result.id);
      invariant(scoredResult, 'Scored result is required');
      expect(scoredResult.gradingResult).toEqual({ pass: true, score: 0.4 });

      const rateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(scoredResult, false));
      expect(rateResponse.status).toBe(200);
      const manualResult = await EvalResult.findById(result.id);
      invariant(manualResult, 'Manual result is required');

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createClearManualRatingPayload(manualResult));

      expect(clearResponse.status).toBe(200);
      const restoredResult = await EvalResult.findById(result.id);
      expect(restoredResult?.success).toBe(true);
      expect(restoredResult?.score).toBe(0.4);
      expect(restoredResult?.failureReason).toBe(ResultFailureReason.NONE);
      expect(restoredResult?.gradingResult).toEqual({ pass: true, score: 0.4 });
    });

    it('restores an originally missing grading result', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      result.gradingResult = null;
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      prompt.metrics.assertPassCount -= 1;
      await eval_.save();
      const originalMetrics = structuredClone(prompt.metrics);

      const rateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: false, score: 0 });
      expect(rateResponse.status).toBe(200);
      const manualResult = await EvalResult.findById(result.id);
      invariant(manualResult, 'Manual result is required');

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createClearManualRatingPayload(manualResult));

      expect(clearResponse.status).toBe(200);
      const restoredResult = await EvalResult.findById(result.id);
      expect(restoredResult?.success).toBe(true);
      expect(restoredResult?.score).toBe(1);
      expect(restoredResult?.failureReason).toBe(ResultFailureReason.NONE);
      expect(restoredResult?.gradingResult).toBeNull();
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        originalMetrics,
      );
    });

    it('keeps edited comments when clearing a manual rating', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');

      await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, false));
      const manualResult = await EvalResult.findById(result.id);
      invariant(manualResult?.gradingResult, 'Manual grading result is required');
      await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...manualResult.gradingResult, comment: 'Keep this reviewer note' });
      const commentedResult = await EvalResult.findById(result.id);
      invariant(commentedResult, 'Commented result is required');

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createClearManualRatingPayload(commentedResult));

      expect(clearResponse.status).toBe(200);
      expect((await EvalResult.findById(result.id))?.gradingResult?.comment).toBe(
        'Keep this reviewer note',
      );
    });

    it('keeps manual-rating provenance private and preserves it across model saves', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result.id, 'Result ID is required');
      const originalResult = {
        success: result.success,
        score: result.score,
        failureReason: result.failureReason,
        gradingResult: structuredClone(result.gradingResult),
      };

      const rateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));
      expect(rateResponse.status).toBe(200);
      expect(rateResponse.body.metadata?.__promptfoo?.manualRating).toBeUndefined();

      const manualResult = await EvalResult.findById(result.id);
      invariant(manualResult, 'Manual result is required');
      expect(manualResult.metadata?.__promptfoo?.manualRating).toBeUndefined();
      expect(manualResult.toEvaluateResult().metadata?.__promptfoo?.manualRating).toBeUndefined();
      manualResult.metadata = { ...manualResult.metadata, reviewer: 'retained' };
      await manualResult.save();

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createClearManualRatingPayload(manualResult));
      expect(clearResponse.status).toBe(200);
      const restoredResult = await EvalResult.findById(result.id);
      expect(restoredResult).toMatchObject(originalResult);
      expect(restoredResult?.metadata).toEqual({ reviewer: 'retained' });
    });

    it('strips externally supplied manual-rating provenance before persistence', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      result.metadata = {
        source: 'provider',
        __promptfoo: {
          manualRating: {
            version: 1,
            status: 'cleared',
            original: {
              success: true,
              score: 0.777,
              failureReason: ResultFailureReason.NONE,
              gradingResult: null,
            },
          },
        },
      };
      await result.save();

      const response = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: false, score: 0.123, componentResults: [] });

      expect(response.status).toBe(200);
      const persistedResult = await EvalResult.findById(result.id);
      expect(persistedResult?.success).toBe(false);
      expect(persistedResult?.score).toBe(0.123);
      expect(persistedResult?.metadata).toEqual({ source: 'provider' });
    });

    it('rejects deeply nested passthrough data without recursively hashing it', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');
      const depth = 10_000;
      const rawPayload = `{"pass":true,"score":0.5,"ignored":${'{"nested":'.repeat(depth)}null${'}'.repeat(depth)}}`;

      const response = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .set('Content-Type', 'application/json')
        .send(rawPayload);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('must not exceed 100 nested levels');
      expect((await EvalResult.findById(result.id))?.score).toBe(result.score);
    });

    it('Passing test and the user marked it as passing (no change)', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[0];
      expect(eval_.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.score).toBe(1);

      expect(result.gradingResult?.pass).toBe(true);
      expect(result.gradingResult?.score).toBe(1);
      const ratingPayload = createManualRatingPayload(result, true);

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(ratingPayload);

      expect(res.status).toBe(200);
      invariant(result.id, 'Result ID is required');
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.gradingResult?.pass).toBe(true);
      expect(updatedResult?.gradingResult?.score).toBe(1);
      expect(updatedResult?.gradingResult?.componentResults).toHaveLength(2);
      expect(updatedResult?.gradingResult?.reason).toBe(
        'Manual result (overrides all other grading results)',
      );

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.prompts[result.promptIdx].metrics?.score).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertPassCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
    });

    it('Passing test and the user changed it to failing', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[0];
      expect(eval_.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.score).toBe(1);

      expect(result.gradingResult?.pass).toBe(true);
      expect(result.gradingResult?.score).toBe(1);
      const ratingPayload = createManualRatingPayload(result, false);
      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(ratingPayload);

      expect(res.status).toBe(200);
      invariant(result.id, 'Result ID is required');
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.gradingResult?.pass).toBe(false);
      expect(updatedResult?.gradingResult?.score).toBe(0);
      expect(updatedResult?.gradingResult?.componentResults).toHaveLength(2);
      expect(updatedResult?.gradingResult?.reason).toBe(
        'Manual result (overrides all other grading results)',
      );
      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertFailCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.score).toBe(0);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testPassCount).toBe(0);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testFailCount).toBe(2);
    });

    it('Failing test and the user changed it to passing', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[1];
      expect(eval_.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.score).toBe(1);

      expect(result.gradingResult?.pass).toBe(false);
      expect(result.gradingResult?.score).toBe(0);

      const ratingPayload = createManualRatingPayload(result, true);

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(ratingPayload);

      expect(res.status).toBe(200);

      invariant(result.id, 'Result ID is required');

      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.gradingResult?.pass).toBe(true);
      expect(updatedResult?.gradingResult?.score).toBe(1);
      expect(updatedResult?.gradingResult?.componentResults).toHaveLength(2);
      expect(updatedResult?.gradingResult?.reason).toBe(
        'Manual result (overrides all other grading results)',
      );

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.prompts[result.promptIdx].metrics?.score).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertPassCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testPassCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testFailCount).toBe(0);
    });

    it('Failing test and the user marked it as failing (no change)', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[1];
      expect(eval_.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.assertFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
      expect(eval_.prompts[result.promptIdx].metrics?.score).toBe(1);

      expect(result.gradingResult?.pass).toBe(false);
      expect(result.gradingResult?.score).toBe(0);
      const ratingPayload = createManualRatingPayload(result, false);
      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(ratingPayload);

      expect(res.status).toBe(200);
      invariant(result.id, 'Result ID is required');
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.gradingResult?.pass).toBe(false);
      expect(updatedResult?.gradingResult?.score).toBe(0);
      expect(updatedResult?.gradingResult?.componentResults).toHaveLength(2);
      expect(updatedResult?.gradingResult?.reason).toBe(
        'Manual result (overrides all other grading results)',
      );
      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertPassCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.assertFailCount).toBe(2);
      expect(updatedEval.prompts[result.promptIdx].metrics?.score).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testPassCount).toBe(1);
      expect(updatedEval.prompts[result.promptIdx].metrics?.testFailCount).toBe(1);
    });
  });

  describe('GET /:id/table - large payload handling', () => {
    it('preserves config tests returned from the table endpoint when saved back', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body.config.tests).toHaveLength(2);

      const patchRes = await api
        .patch(`/api/eval/${eval_.id}`)
        .send({ config: { ...res.body.config, description: 'renamed eval' } });

      expect(patchRes.status).toBe(200);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.config.tests).toHaveLength(2);
    });

    it('preserves Azure Blob SAS tokens when a redacted table config is saved back', async () => {
      const sasUri =
        'az://{{ account }}/container/{{ suite }}.yaml?sp=r&sig=azure-secret&sv={{ version }}';
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      eval_.config.tests = sasUri;
      await eval_.save();

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body.config.tests).toBe(
        'az://{{ account }}/container/{{ suite }}.yaml?sp=r&sig=%5BREDACTED%5D&sv={{ version }}',
      );

      const patchRes = await api
        .patch(`/api/eval/${eval_.id}`)
        .send({ config: { ...res.body.config, description: 'renamed eval' } });

      expect(patchRes.status).toBe(200);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.config.tests).toBe(sasUri);
      expect(updatedEval.config.description).toBe('renamed eval');
    });

    it('returns table data with only the largest per-cell prompt stripped when possible', async () => {
      const eval_ = await EvalFactory.create({ numResults: 3 });
      testEvalIds.add(eval_.id);
      await setResultPromptRaws(eval_, ['small prompt', 'x'.repeat(100), 'x'.repeat(50)]);

      mockTablePayloadRangeError((attempt) => attempt === 1);

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('table');
      expect(res.body.table.body.length).toBeGreaterThan(0);
      expect(res.body.config.tests).toHaveLength(2);

      const prompts: Array<string | undefined> = res.body.table.body.flatMap(
        (row: { outputs: Array<{ prompt?: string }> }) =>
          row.outputs.map((output) => output?.prompt),
      );
      expect(prompts.filter((prompt) => prompt === STRIPPED_TABLE_CELL_PROMPT)).toHaveLength(1);
      expect(prompts).toContain('small prompt');
      expect(prompts).toContain('x'.repeat(50));
    });

    it('strips per-cell prompts largest first until the response serializes', async () => {
      const eval_ = await EvalFactory.create({ numResults: 3 });
      testEvalIds.add(eval_.id);
      await setResultPromptRaws(eval_, ['small prompt', 'x'.repeat(100), 'x'.repeat(50)]);

      mockTablePayloadRangeError((attempt) => attempt <= 2);

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('table');
      expect(res.body.config.tests).toHaveLength(2);

      const prompts: Array<string | undefined> = res.body.table.body.flatMap(
        (row: { outputs: Array<{ prompt?: string }> }) =>
          row.outputs.map((output) => output?.prompt),
      );
      expect(prompts.filter((prompt) => prompt === STRIPPED_TABLE_CELL_PROMPT)).toHaveLength(2);
      expect(prompts).toContain('small prompt');
    });

    it('returns 413 when the table response is still too large after stripping prompts', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      mockTablePayloadRangeError(() => true);

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(413);
      expect(res.body).toEqual({
        error: 'Eval too large to display. Try reducing the page size.',
      });
    });
  });

  describe('GET /:id/metadata-keys', () => {
    it('should return metadata keys for valid eval', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      // Add eval results with metadata using direct database insert
      const { getDb } = await import('../../src/database');
      const db = await getDb();
      await db.run(
        `INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, metadata
        ) VALUES
        ('result1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0, '{"key1": "value1", "key2": "value2"}'),
        ('result2', '${eval_.id}', 0, 1, '{}', '{}', '{}', 1, 1.0, '{"key2": "value3", "key3": "value4"}')`,
      );

      const res = await api.get(`/api/eval/${eval_.id}/metadata-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keys');
      expect(res.body.keys).toEqual(expect.arrayContaining(['key1', 'key2', 'key3']));
    });

    it('should return 404 for non-existent eval', async () => {
      const res = await api.get('/api/eval/non-existent-id/metadata-keys');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Eval not found');
    });

    it('should return empty keys array for eval with no metadata', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await api.get(`/api/eval/${eval_.id}/metadata-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keys');
      expect(res.body.keys).toEqual([]);
    });
  });
});
