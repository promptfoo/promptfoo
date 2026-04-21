import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { createApp } from '../../src/server/server';
import invariant from '../../src/util/invariant';
import EvalFactory from '../factories/evalFactory';

import type { EvaluateTableOutput } from '../../src/types/index';

describe('eval routes', () => {
  let app: ReturnType<typeof createApp>;
  const testEvalIds = new Set<string>();

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    app = createApp();
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

      const res = await request(app)
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

      const res = await request(app)
        .post('/api/eval/eval-1/results/result-1/rating')
        .send({ pass: true, score: 1 });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to submit rating' });
      expect(findByIdSpy).toHaveBeenCalledWith('result-1');
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

  describe('GET /:id/table - large payload handling', () => {
    it('preserves existing config tests when table config is saved back without tests', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await request(app).get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body.config).not.toHaveProperty('tests');

      const patchRes = await request(app)
        .patch(`/api/eval/${eval_.id}`)
        .send({ config: { ...res.body.config, description: 'renamed eval' } });

      expect(patchRes.status).toBe(200);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.config.tests).toHaveLength(2);
    });

    it('trims per-cell prompts before sending table payloads', async () => {
      const eval_ = await EvalFactory.create({ numResults: 3 });
      testEvalIds.add(eval_.id);
      await setResultPromptRaws(eval_, ['small prompt', 'x'.repeat(100), 'x'.repeat(50)]);

      const res = await request(app).get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('table');
      expect(res.body.table.body.length).toBeGreaterThan(0);
      expect(res.body.config).not.toHaveProperty('tests');

      const outputs: EvaluateTableOutput[] = res.body.table.body.flatMap(
        (row: { outputs: EvaluateTableOutput[] }) => row.outputs,
      );
      expect(outputs).toHaveLength(3);
      expect(outputs.every((output) => output.prompt === '')).toBe(true);
      expect(outputs.every((output) => output.isTruncated)).toBe(true);
    });

    it('returns 413 when the table response is still too large after stripping prompts', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      mockTablePayloadRangeError(() => true);

      const res = await request(app).get(`/api/eval/${eval_.id}/table`);

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
      const db = getDb();
      await db.run(
        `INSERT INTO eval_results (
          id, eval_id, prompt_idx, test_idx, test_case, prompt, provider,
          success, score, metadata
        ) VALUES
        ('result1', '${eval_.id}', 0, 0, '{}', '{}', '{}', 1, 1.0, '{"key1": "value1", "key2": "value2"}'),
        ('result2', '${eval_.id}', 0, 1, '{}', '{}', '{}', 1, 1.0, '{"key2": "value3", "key3": "value4"}')`,
      );

      const res = await request(app).get(`/api/eval/${eval_.id}/metadata-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keys');
      expect(res.body.keys).toEqual(expect.arrayContaining(['key1', 'key2', 'key3']));
    });

    it('should return 404 for non-existent eval', async () => {
      const res = await request(app).get('/api/eval/non-existent-id/metadata-keys');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Eval not found');
    });

    it('should return empty keys array for eval with no metadata', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await request(app).get(`/api/eval/${eval_.id}/metadata-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keys');
      expect(res.body.keys).toEqual([]);
    });
  });

  describe('GET /:id/table - trimmed payload', () => {
    it('should strip redundant fields from table cell outputs', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await request(app).get(`/api/eval/${eval_.id}/table`);
      expect(res.status).toBe(200);

      const cell: EvaluateTableOutput = res.body.table.body[0].outputs[0];

      // Prompt should be stripped (empty string)
      expect(cell.prompt).toBe('');

      // evalId is preserved (needed for detail endpoint in comparison mode)
      expect(cell).toHaveProperty('evalId');
      expect(cell.isTruncated).toBe(true);

      // Other fields from ...result spread should NOT be present
      expect(cell).not.toHaveProperty('promptIdx');
      expect(cell).not.toHaveProperty('testIdx');
      expect(cell).not.toHaveProperty('promptId');
      expect(cell).not.toHaveProperty('persisted');
      expect(cell).not.toHaveProperty('pluginId');
      expect(cell).not.toHaveProperty('description');

      // Essential fields should be present
      expect(cell).toHaveProperty('id');
      expect(cell).toHaveProperty('text');
      expect(cell).toHaveProperty('pass');
      expect(cell).toHaveProperty('score');
      expect(cell).toHaveProperty('latencyMs');
      expect(cell).toHaveProperty('namedScores');
    });

    it('should trim response to only essential fields', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await request(app).get(`/api/eval/${eval_.id}/table`);
      expect(res.status).toBe(200);

      const cell: EvaluateTableOutput = res.body.table.body[0].outputs[0];

      // Response should be trimmed — no raw, output, error, or prompt fields
      if (cell.response) {
        expect(cell.response).not.toHaveProperty('raw');
        expect(cell.response).not.toHaveProperty('output');
        expect(cell.response).not.toHaveProperty('error');
        expect(cell.response).not.toHaveProperty('prompt');
        // tokenUsage should be preserved
        expect(cell.response).toHaveProperty('tokenUsage');
      }
    });

    it('should strip config.tests from table response', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await request(app).get(`/api/eval/${eval_.id}/table`);
      expect(res.status).toBe(200);

      expect(res.body.config).not.toHaveProperty('tests');
      // Other config fields should remain
      expect(res.body.config).toHaveProperty('providers');
      expect(res.body.config).toHaveProperty('prompts');
    });
  });

  describe('GET /:evalId/results/:resultId/detail', () => {
    it('should return full cell detail for a valid result', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const results = await eval_.getResults();
      const result = results[0];
      invariant(result.id, 'Result ID is required');

      const res = await request(app).get(`/api/eval/${eval_.id}/results/${result.id}/detail`);
      expect(res.status).toBe(200);

      // Should have the full prompt
      expect(res.body).toHaveProperty('prompt');
      expect(typeof res.body.prompt).toBe('string');
      expect(res.body.prompt.length).toBeGreaterThan(0);

      // Should have testCase
      expect(res.body).toHaveProperty('testCase');
      expect(res.body.testCase).toHaveProperty('vars');

      // Should have response
      expect(res.body).toHaveProperty('response');
      expect(res.body.response).toHaveProperty('output');
    });

    it('should return 404 for non-existent result', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await request(app).get(`/api/eval/${eval_.id}/results/non-existent-id/detail`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Result not found');
    });

    it('should return 404 when result belongs to a different eval', async () => {
      const eval1 = await EvalFactory.create();
      const eval2 = await EvalFactory.create();
      testEvalIds.add(eval1.id);
      testEvalIds.add(eval2.id);

      const results = await eval1.getResults();
      const result = results[0];
      invariant(result.id, 'Result ID is required');

      // The endpoint enforces eval ownership — a result from eval1 cannot
      // be fetched via eval2's URL. The frontend passes the cell's own evalId
      // (preserved through trimming) to handle comparison mode correctly.
      const res = await request(app).get(`/api/eval/${eval2.id}/results/${result.id}/detail`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Result not found');
    });
  });
});
