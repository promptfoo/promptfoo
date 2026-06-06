import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { createApp } from '../../src/server/server';
import { STRIPPED_TABLE_CELL_PROMPT } from '../../src/util/eval/evalTableUtils';
import invariant from '../../src/util/invariant';
import EvalFactory from '../factories/evalFactory';

// Mock getUserEmail and setUserEmail to prevent side effects from polluting global state
vi.mock('../../src/globalConfig/accounts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/globalConfig/accounts')>();
  return {
    ...original,
    getUserEmail: vi.fn().mockReturnValue(null),
    setUserEmail: vi.fn(),
  };
});

vi.mock('../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: vi.fn(),
  },
}));

const mockedGetUserEmail = vi.mocked(getUserEmail);
const mockedCloudConfig = vi.mocked(cloudConfig);

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

  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetUserEmail.mockReturnValue(null);
    mockedCloudConfig.isEnabled.mockReturnValue(false);
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

    it('persists the rated result before notifying through the eval save', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result.id, 'Result ID is required');
      const resultSaveSpy = vi.spyOn(EvalResult.prototype, 'save');
      const evalSaveSpy = vi.spyOn(Eval.prototype, 'save');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(result, true));

      expect(res.status).toBe(200);
      expect(resultSaveSpy).toHaveBeenCalledTimes(1);
      expect(evalSaveSpy).toHaveBeenCalledTimes(1);
      expect(resultSaveSpy.mock.invocationCallOrder[0]).toBeLessThan(
        evalSaveSpy.mock.invocationCallOrder[0],
      );
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

  describe('PATCH /:id/author', () => {
    it('should update author with a valid email', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await api
        .patch(`/api/eval/${eval_.id}/author`)
        .send({ author: 'newauthor@example.com' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Author updated successfully');

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.author).toBe('newauthor@example.com');
    });

    it('should clear author when empty string is sent', async () => {
      // First create an eval with an author
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      // Set an author first
      await api.patch(`/api/eval/${eval_.id}/author`).send({ author: 'existing@example.com' });

      // Verify author was set
      let updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.author).toBe('existing@example.com');

      // Now clear the author with empty string
      const res = await api.patch(`/api/eval/${eval_.id}/author`).send({ author: '' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Author cleared successfully');

      updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.author).toBeNull();
    });

    it('should return 404 for non-existent eval', async () => {
      const res = await api
        .patch('/api/eval/non-existent-id/author')
        .send({ author: 'test@example.com' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Eval not found');
    });

    it('should return 400 for invalid email format', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await api
        .patch(`/api/eval/${eval_.id}/author`)
        .send({ author: 'not-a-valid-email' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when author field is missing', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await api.patch(`/api/eval/${eval_.id}/author`).send({});

      expect(res.status).toBe(400);
    });

    it('should preserve other eval fields when updating author', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const originalDescription = eval_.config?.description;
      const originalPromptCount = eval_.prompts.length;

      const res = await api
        .patch(`/api/eval/${eval_.id}/author`)
        .send({ author: 'newauthor@example.com' });

      expect(res.status).toBe(200);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.author).toBe('newauthor@example.com');
      expect(updatedEval.config?.description).toBe(originalDescription);
      expect(updatedEval.prompts.length).toBe(originalPromptCount);
    });

    it('should allow a cloud user to claim an unassigned eval as themselves', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);
      mockedGetUserEmail.mockReturnValue('cloud-user@example.com');

      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await api
        .patch(`/api/eval/${eval_.id}/author`)
        .send({ author: 'cloud-user@example.com' });

      expect(res.status).toBe(200);

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.author).toBe('cloud-user@example.com');
    });

    it('should reject claiming a cloud eval for a different email', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);
      mockedGetUserEmail.mockReturnValue('cloud-user@example.com');

      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);

      const res = await api
        .patch(`/api/eval/${eval_.id}/author`)
        .send({ author: 'other-user@example.com' });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty(
        'error',
        'Cloud evals can only be claimed by the current user',
      );

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.author).toBeNull();
    });

    it('should reject changing an existing cloud eval author', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);
      mockedGetUserEmail.mockReturnValue('cloud-user@example.com');

      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      eval_.author = 'existing@example.com';
      await eval_.save();

      const res = await api
        .patch(`/api/eval/${eval_.id}/author`)
        .send({ author: 'cloud-user@example.com' });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty(
        'error',
        'Cloud eval authors cannot be changed once assigned',
      );

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.author).toBe('existing@example.com');
    });

    it('should reject clearing an existing cloud eval author', async () => {
      mockedCloudConfig.isEnabled.mockReturnValue(true);
      mockedGetUserEmail.mockReturnValue('cloud-user@example.com');

      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      eval_.author = 'cloud-user@example.com';
      await eval_.save();

      const res = await api.patch(`/api/eval/${eval_.id}/author`).send({ author: '' });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty(
        'error',
        'Cloud eval authors cannot be changed once assigned',
      );

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.author).toBe('cloud-user@example.com');
    });
  });
});
