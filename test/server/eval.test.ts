import request from 'supertest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { createApp } from '../../src/server/server';
import invariant from '../../src/util/invariant';
import EvalFactory from '../factories/evalFactory';

describe('eval routes', () => {
  const app = createApp();

  beforeAll(async () => {
    await runDbMigrations();
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
    it('Passing test and the user marked it as passing (no change)', async () => {
      const eval_ = await EvalFactory.create();
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

      const res = await request(app)
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
      const res = await request(app)
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

      const res = await request(app)
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
      const res = await request(app)
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

  describe('get("/:id/metadata-keys")', () => {
    it('should return all unique metadata keys and their counts', async () => {
      // Create an eval with metadata in results
      const eval_ = await EvalFactory.create({ numResults: 0 });
      
      // Add results with metadata manually
      await eval_.addResult({
        description: 'test-1',
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { state: 'colorado' } },
        promptId: 'test-prompt',
        provider: { id: 'test-provider', label: 'test-label' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { state: 'colorado' },
        response: { output: 'test output' },
        error: null,
        failureReason: 0,
        success: true,
        score: 1,
        latencyMs: 100,
        gradingResult: { pass: true, score: 1, reason: 'Test' },
        namedScores: {},
        cost: 0,
        metadata: { model: 'gpt-4', temperature: 0.7 },
      });
      
      await eval_.addResult({
        description: 'test-2',
        promptIdx: 0,
        testIdx: 1,
        testCase: { vars: { state: 'california' } },
        promptId: 'test-prompt',
        provider: { id: 'test-provider', label: 'test-label' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { state: 'california' },
        response: { output: 'test output' },
        error: null,
        failureReason: 0,
        success: true,
        score: 1,
        latencyMs: 100,
        gradingResult: { pass: true, score: 1, reason: 'Test' },
        namedScores: {},
        cost: 0,
        metadata: { model: 'gpt-3.5', temperature: 0.5, max_tokens: 100 },
      });
      
      await eval_.addResult({
        description: 'test-3',
        promptIdx: 1,
        testIdx: 0,
        testCase: { vars: { state: 'colorado' } },
        promptId: 'test-prompt',
        provider: { id: 'test-provider', label: 'test-label' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { state: 'colorado' },
        response: { output: 'test output' },
        error: null,
        failureReason: 0,
        success: true,
        score: 1,
        latencyMs: 100,
        gradingResult: { pass: true, score: 1, reason: 'Test' },
        namedScores: {},
        cost: 0,
        metadata: { model: 'gpt-4', version: '1.0' },
      });

      const res = await request(app).get(`/api/eval/${eval_.id}/metadata-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        keys: ['max_tokens', 'model', 'temperature', 'version'],
        counts: {
          model: 3,
          temperature: 2,
          max_tokens: 1,
          version: 1,
        },
      });
    });

    it('should return empty arrays when no metadata exists', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });
      
      await eval_.addResult({
        description: 'test-no-metadata',
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { state: 'colorado' } },
        promptId: 'test-prompt',
        provider: { id: 'test-provider', label: 'test-label' },
        prompt: { raw: 'Test prompt', label: 'Test prompt' },
        vars: { state: 'colorado' },
        response: { output: 'test output' },
        error: null,
        failureReason: 0,
        success: true,
        score: 1,
        latencyMs: 100,
        gradingResult: { pass: true, score: 1, reason: 'Test' },
        namedScores: {},
        cost: 0,
        metadata: {},
      });

      const res = await request(app).get(`/api/eval/${eval_.id}/metadata-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        keys: [],
        counts: {},
      });
    });

    it('should return 404 when eval does not exist', async () => {
      const res = await request(app).get('/api/eval/non-existent-id/metadata-keys');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Eval not found' });
    });
  });
});
