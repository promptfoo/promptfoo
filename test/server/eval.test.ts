import { afterEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { EchoProvider } from '../../src/providers/echo';
import { createApp } from '../../src/server/server';
import { ResultFailureReason } from '../../src/types/results';
import { STRIPPED_TABLE_CELL_PROMPT } from '../../src/util/eval/evalTableUtils';
import invariant from '../../src/util/invariant';
import EvalFactory from '../factories/evalFactory';
import { setupTestServer } from '../util/testServer';

import type { TestSuite } from '../../src/types/index';

vi.mock('../../src/database/signal', async () => {
  const actual = await vi.importActual('../../src/database/signal');
  return {
    ...actual,
    updateSignalFile: vi.fn(),
  };
});

describe('eval routes', () => {
  const testEvalIds = new Set<string>();

  const api = setupTestServer(createApp, runDbMigrations);

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

    it.each([true, false])(
      'restores error categories after ratings (graderError=%s)',
      async (graderError) => {
        const eval_ = await EvalFactory.create();
        testEvalIds.add(eval_.id);
        const results = await eval_.getResults();
        invariant(results[1].id, 'Result ID is required');
        const result = await EvalResult.findById(results[1].id);
        invariant(result?.gradingResult, 'Persisted grading result is required');
        result.failureReason = ResultFailureReason.ERROR;
        result.gradingResult.metadata = graderError ? { graderError: true } : undefined;
        const originalGrade = structuredClone(result.gradingResult);
        await result.save();
        const metrics = eval_.prompts[result.promptIdx].metrics;
        invariant(metrics, 'Prompt metrics are required');
        metrics.testFailCount -= 1;
        metrics.testErrorCount += 1;
        await eval_.save();

        for (const [grade, reason] of [
          [
            { ...originalGrade, metadata: undefined, comment: 'Preserve an existing error' },
            ResultFailureReason.ERROR,
          ],
          [
            createManualRatingPayload({ gradingResult: structuredClone(originalGrade) }, true),
            ResultFailureReason.NONE,
          ],
          [
            createManualRatingPayload({ gradingResult: structuredClone(originalGrade) }, false),
            ResultFailureReason.ASSERT,
          ],
          [originalGrade, ResultFailureReason.ERROR],
          [
            createManualRatingPayload({ gradingResult: structuredClone(originalGrade) }, false),
            ResultFailureReason.ASSERT,
          ],
          [
            createManualRatingPayload({ gradingResult: structuredClone(originalGrade) }, true),
            ResultFailureReason.NONE,
          ],
          [originalGrade, ResultFailureReason.ERROR],
        ] as const) {
          const response = await api
            .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
            .send(grade);
          expect(response.status).toBe(200);
          const updated = await EvalResult.findById(result.id);
          expect(updated?.success).toBe(reason === ResultFailureReason.NONE);
          expect(updated?.failureReason).toBe(reason);
          const updatedEval = await Eval.findById(eval_.id);
          expect(updatedEval?.prompts[result.promptIdx].metrics).toMatchObject({
            testPassCount: metrics.testPassCount + Number(reason === ResultFailureReason.NONE),
            testFailCount: metrics.testFailCount + Number(reason === ResultFailureReason.ASSERT),
            testErrorCount: metrics.testErrorCount - Number(reason !== ResultFailureReason.ERROR),
          });
        }
      },
    );

    it.each(['Recovery comment', '!highlight Recovery comment', 'approve-clear recovery'])(
      'recovers a comparison error after annotation: %s',
      async (comment) => {
        let recovered = false;
        const suite: TestSuite = {
          providers: [new EchoProvider()],
          prompts: [
            { raw: 'candidate one', label: 'first' },
            { raw: 'candidate two', label: 'second' },
          ],
          tests: [
            {
              assert: [
                { type: 'contains', value: 'candidate' },
                {
                  type: 'select-best',
                  value: 'Choose the best',
                  provider: {
                    id: () => 'annotation-recovery-grader',
                    callApi: async () => {
                      if (!recovered) {
                        throw new Error('Comparison unavailable');
                      }
                      return { output: '0' };
                    },
                  },
                },
              ],
            },
          ],
        };
        const record = await Eval.create({}, suite.prompts);
        testEvalIds.add(record.id);
        const previousResume = cliState.resume;
        try {
          await evaluate(suite, record, { maxConcurrency: 1 });
          const rows = await record.getResults();
          const metrics = structuredClone(record.prompts.map((prompt) => prompt.metrics));
          for (const row of rows) {
            expect(row).toMatchObject({ success: false, failureReason: ResultFailureReason.ERROR });
            expect(row.gradingResult).toMatchObject({ pass: true, score: 1 });
            if (comment === 'approve-clear recovery') {
              const approved = await api
                .post(`/api/eval/${record.id}/results/${row.id}/rating`)
                .send(
                  createManualRatingPayload(
                    { gradingResult: structuredClone(row.gradingResult) },
                    true,
                  ),
                );
              expect(approved.status).toBe(200);
            }
            const response = await api
              .post(`/api/eval/${record.id}/results/${row.id}/rating`)
              .send({
                ...row.gradingResult,
                comment,
                action: comment === 'approve-clear recovery' ? 'clear' : 'annotate',
              });
            expect(response.status).toBe(200);
          }
          const saved = await Eval.findById(record.id);
          invariant(saved, 'Saved evaluation required');
          if (comment === 'approve-clear recovery') {
            for (const [index, prompt] of saved.prompts.entries()) {
              expect(prompt.metrics).toMatchObject({
                assertPassCount: metrics[index]?.assertPassCount,
                assertFailCount: metrics[index]?.assertFailCount,
                testPassCount: metrics[index]?.testPassCount,
                testFailCount: metrics[index]?.testFailCount,
                testErrorCount: metrics[index]?.testErrorCount,
              });
            }
          } else {
            expect(saved.prompts.map((prompt) => prompt.metrics)).toEqual(metrics);
          }
          for (const row of await saved.getResults()) {
            expect(row).toMatchObject({
              success: false,
              score: comment === 'approve-clear recovery' ? 1 : 0,
              failureReason: ResultFailureReason.ERROR,
            });
            if (comment !== 'approve-clear recovery') {
              expect(row.gradingResult).toMatchObject({ pass: true, score: 1, comment });
            }
            expect(row.gradingResult).not.toHaveProperty('action');
          }
          // Successful retry must combine with the preserved ordinary assertion verdict.
          recovered = true;
          cliState.resume = true;
          await evaluate(suite, saved, { maxConcurrency: 1 });
          const resumed = (await saved.getResults()).sort((a, b) => a.promptIdx - b.promptIdx);
          expect(resumed.map((row) => row.success)).toEqual([true, false]);
          expect(resumed.map((row) => row.failureReason)).toEqual([
            ResultFailureReason.NONE,
            ResultFailureReason.ASSERT,
          ]);
          expect(resumed.every((row) => row.gradingResult?.comment === comment)).toBe(true);
        } finally {
          cliState.resume = previousResume;
        }
      },
    );

    it.each(['error', 'legacy approval', 'manual failure', 'no grade'])(
      'updates only annotations on a saved %s',
      async (state) => {
        const record = await EvalFactory.create();
        testEvalIds.add(record.id);
        const result = (await record.getResults())[0];
        invariant(result instanceof EvalResult, 'Persisted result required');
        const metrics = record.prompts[result.promptIdx].metrics!;
        if (state === 'error') {
          result.success = false;
          result.score = 0;
          result.failureReason = ResultFailureReason.ERROR;
          metrics.testPassCount--;
          metrics.testErrorCount++;
        } else if (state === 'legacy approval' || state === 'manual failure') {
          result.success = state === 'legacy approval';
          result.score = result.success ? 1 : 0;
          result.failureReason = result.success
            ? ResultFailureReason.ERROR
            : ResultFailureReason.ASSERT;
          result.gradingResult = createManualRatingPayload(result, result.success);
          if (!result.success) {
            metrics.testPassCount--;
            metrics.testFailCount++;
          }
        } else {
          result.gradingResult = null;
        }
        await result.save();
        await record.save();
        const originalGrade = structuredClone(result.gradingResult);
        const originalMetrics = structuredClone(record.prompts.map((prompt) => prompt.metrics));
        const resultSave = vi.spyOn(EvalResult.prototype, 'save');
        const evalSave = vi.spyOn(Eval.prototype, 'save');
        for (const comment of ['A note', '!highlight A note', '']) {
          const response = await api
            .post(`/api/eval/${record.id}/results/${result.id}/rating`)
            .send({
              pass: !result.success,
              score: 999,
              reason: 'Stale client grade',
              componentResults: [],
              comment,
              action: 'annotate',
            });
          expect(response.status).toBe(200);
          const updated = await EvalResult.findById(result.id);
          expect(updated).toMatchObject({
            success: result.success,
            score: result.score,
            failureReason: result.failureReason,
          });
          expect(updated?.gradingResult).toEqual({
            ...(originalGrade ?? { pass: result.success, score: result.score, reason: '' }),
            comment,
          });
          const saved = await Eval.findById(record.id);
          expect(saved?.prompts.map((prompt) => prompt.metrics)).toEqual(originalMetrics);
        }
        expect(resultSave).toHaveBeenCalledTimes(3);
        expect(evalSave).toHaveBeenCalledTimes(3);
        expect(resultSave.mock.invocationCallOrder[0]).toBeLessThan(
          evalSave.mock.invocationCallOrder[0],
        );
      },
    );

    it('preserves full programmatic rating behavior without an action', async () => {
      const record = await EvalFactory.create();
      testEvalIds.add(record.id);
      const result = (await record.getResults())[0];
      invariant(result instanceof EvalResult, 'Persisted result required');
      const response = await api.post(`/api/eval/${record.id}/results/${result.id}/rating`).send({
        pass: false,
        score: 0.25,
        reason: 'Programmatic grade',
      });
      expect(response.status).toBe(200);
      expect(await EvalResult.findById(result.id)).toMatchObject({
        success: false,
        score: 0.25,
        failureReason: ResultFailureReason.ASSERT,
        gradingResult: { pass: false, score: 0.25, reason: 'Programmatic grade' },
      });
    });

    it.each(
      ['no grade', 'comparison', 'partial grader error'].flatMap((state) =>
        [true, false].map((approved) => ({ state, approved })),
      ),
    )('clears only the human assertion contribution: %j', async ({ state, approved }) => {
      const record = await EvalFactory.create();
      testEvalIds.add(record.id);
      const result = (await record.getResults())[0];
      invariant(result instanceof EvalResult, 'Persisted result required');
      const metrics = record.prompts[result.promptIdx].metrics!;
      result.success = false;
      result.score = state === 'partial grader error' ? 0.25 : 0;
      result.failureReason = ResultFailureReason.ERROR;
      metrics.testPassCount--;
      metrics.testErrorCount++;
      metrics.score += result.score - 1;
      if (state === 'no grade') {
        result.gradingResult = null;
        metrics.assertPassCount--;
      } else if (state === 'partial grader error') {
        result.gradingResult = {
          pass: false,
          score: 0.25,
          reason: 'Partial grader failure',
          metadata: { graderError: true },
          componentResults: [
            {
              pass: false,
              score: 0.25,
              reason: 'Partial grader failure',
              metadata: { graderError: true },
            },
          ],
        };
        metrics.assertPassCount--;
        metrics.assertFailCount++;
      }
      await result.save();
      await record.save();
      const originalMetrics = structuredClone(metrics);
      const underlyingGrade = structuredClone(result.gradingResult) ?? {
        pass: false,
        score: 0,
        reason: '',
      };
      const rating = await api.post(`/api/eval/${record.id}/results/${result.id}/rating`).send({
        ...underlyingGrade,
        pass: approved,
        score: approved ? 1 : 0,
        componentResults: [
          ...(underlyingGrade.componentResults ?? []),
          {
            pass: approved,
            score: approved ? 1 : 0,
            reason: 'Human rating',
            assertion: { type: 'human' },
          },
        ],
      });
      expect(rating.status).toBe(200);
      const cleared = await api.post(`/api/eval/${record.id}/results/${result.id}/rating`).send({
        ...underlyingGrade,
        action: 'clear',
      });
      expect(cleared.status).toBe(200);
      expect(await EvalResult.findById(result.id)).toMatchObject({
        success: false,
        score: underlyingGrade.score,
        failureReason: ResultFailureReason.ERROR,
        gradingResult: underlyingGrade,
      });
      expect((await Eval.findById(record.id))?.prompts[result.promptIdx].metrics).toMatchObject({
        assertPassCount: originalMetrics.assertPassCount,
        assertFailCount: originalMetrics.assertFailCount,
        testPassCount: originalMetrics.testPassCount,
        testFailCount: originalMetrics.testFailCount,
        testErrorCount: originalMetrics.testErrorCount,
        score: originalMetrics.score + underlyingGrade.score - result.score,
      });
    });

    it('repairs main-era category counters when clearing a legacy approved error', async () => {
      const record = await EvalFactory.create();
      testEvalIds.add(record.id);
      const result = (await record.getResults())[0];
      invariant(result instanceof EvalResult, 'Persisted result required');
      const underlyingGrade = structuredClone(result.gradingResult)!;
      const metrics = record.prompts[result.promptIdx].metrics!;
      // Main approved an ERROR by incrementing pass and decrementing fail,
      // while retaining failureReason=ERROR and the error counter.
      result.failureReason = ResultFailureReason.ERROR;
      result.gradingResult = createManualRatingPayload(result, true);
      metrics.testErrorCount = 1;
      metrics.testFailCount = 0;
      metrics.assertPassCount++;
      await result.save();
      await record.save();
      const unrelated = {
        tokenUsage: structuredClone(metrics.tokenUsage),
        namedScores: structuredClone(metrics.namedScores),
      };
      const response = await api.post(`/api/eval/${record.id}/results/${result.id}/rating`).send({
        ...underlyingGrade,
        action: 'clear',
      });
      expect(response.status).toBe(200);
      expect((await Eval.findById(record.id))?.prompts[result.promptIdx].metrics).toMatchObject({
        ...unrelated,
        testPassCount: 0,
        testFailCount: 1,
        testErrorCount: 1,
        assertPassCount: 1,
        assertFailCount: 1,
      });
    });

    it('surfaces count-query failures without overwriting persisted metrics', async () => {
      const record = await EvalFactory.create();
      testEvalIds.add(record.id);
      const result = (await record.getResults())[0];
      const metrics = structuredClone(record.prompts[0].metrics);
      vi.spyOn(Eval.prototype, 'getPromptGradingMetrics').mockRejectedValueOnce(
        new Error('Synthetic query failure'),
      );
      const response = await api.post(`/api/eval/${record.id}/results/${result.id}/rating`).send({
        pass: false,
        score: 0,
        reason: 'Changed rating',
      });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to submit rating' });
      expect((await Eval.findById(record.id))?.prompts[0].metrics).toEqual(metrics);
    });

    it('rejects a clear operation that retains a human override', async () => {
      const record = await EvalFactory.create();
      testEvalIds.add(record.id);
      const result = (await record.getResults())[0];
      const response = await api.post(`/api/eval/${record.id}/results/${result.id}/rating`).send({
        ...createManualRatingPayload(result, true),
        action: 'clear',
      });
      expect(response.status).toBe(400);
    });

    it.each([undefined, null, 4, {}])(
      'rejects invalid annotation comments: %j',
      async (comment) => {
        const response = await api.post('/api/eval/example/results/result/rating').send({
          pass: true,
          score: 1,
          action: 'annotate',
          comment,
        });
        expect(response.status).toBe(400);
      },
    );

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
      const originalTable = await eval_.getTable();

      const res = await api.get(`/api/eval/${eval_.id}/table`);

      expect(res.status).toBe(200);
      expect(res.body.config.tests).toHaveLength(2);

      const patchRes = await api
        .patch(`/api/eval/${eval_.id}`)
        .send({ config: { ...res.body.config, description: 'renamed eval', otherField: 'value' } });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body).toEqual({ message: 'Eval updated successfully' });

      const updatedEval = await Eval.findById(eval_.id);
      invariant(updatedEval, 'Eval is required');
      expect(updatedEval.config.tests).toHaveLength(2);
      expect(updatedEval.config).toMatchObject({
        description: 'renamed eval',
        otherField: 'value',
      });
      expect(await updatedEval.getTable()).toEqual(originalTable);
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
