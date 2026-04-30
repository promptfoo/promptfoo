import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { createApp } from '../../src/server/server';
import invariant from '../../src/util/invariant';
import EvalFactory from '../factories/evalFactory';

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
  });

  function createManualRatingPayload(originalResult: any, pass: boolean) {
    const payload = { ...originalResult.gradingResult };
    const score = pass ? 1 : 0;
    payload.componentResults?.push({
      pass,
      score,
      reason: 'Manual result (overrides all other grading results)',
      assertion: { type: 'human' },
    });
    payload.reason = 'Manual result (overrides all other grading results)';
    payload.pass = pass;
    payload.score = score;
    return payload;
  }

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

    it('returns a JSON 500 response when rating storage fails', async () => {
      const findByIdSpy = vi
        .spyOn(EvalResult, 'findById')
        .mockRejectedValueOnce(new Error('database unavailable'));

      const res = await api
        .post('/api/eval/eval-1/results/result-1/rating')
        .send({ pass: true, score: 1 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to submit rating' });
      expect(findByIdSpy).toHaveBeenCalledWith('result-1');
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
    it('preserves full stored config when applying a lightweight config patch', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const originalTests = structuredClone(eval_.config.tests);

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body.config.tests).toBeUndefined();
      expect(res.body.configDetail).toEqual(
        expect.objectContaining({
          available: true,
          omittedFields: expect.arrayContaining(['tests']),
        }),
      );

      const patchRes = await api
        .patch(`/api/eval/${eval_.id}`)
        .send({ configPatch: { description: 'renamed eval' } });

      expect(patchRes.status).toBe(200);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.config.description).toBe('renamed eval');
      expect(updatedEval.config.tests).toEqual(originalTests);
    });
  });

  describe('GET /:id/metadata-keys', () => {
    it('should return metadata keys for valid eval', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      // Add eval results with metadata using direct database insert
      const { getDb } = await import('../../src/database');
      const db = getDb();
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
