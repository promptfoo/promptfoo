import type { Server } from 'node:http';

import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AssertionsResult } from '../../src/assertions/assertionsResult';
import { getDb } from '../../src/database';
import { updateSignalFile } from '../../src/database/signal';
import { evalResultsTable } from '../../src/database/tables';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { getErrorResultIds } from '../../src/node/retry';
import { createApp } from '../../src/server/server';
import { type GradingResult, ResultFailureReason } from '../../src/types';
import { STRIPPED_TABLE_CELL_PROMPT } from '../../src/util/eval/evalTableUtils';
import invariant from '../../src/util/invariant';
import { createEvaluateResult } from '../factories/eval';
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
    } else if (payload.reason === 'Manual result (overrides all other grading results)') {
      payload.reason = 'Manual rating cleared';
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

  describe('PATCH eval metadata', () => {
    it('still saves legacy table edits in the results column', async () => {
      const stored = await EvalFactory.createOldResult();
      testEvalIds.add(stored.id);
      const eval_ = await Eval.findById(stored.id);
      invariant(eval_?.oldResults, 'Legacy results are required');
      const table = structuredClone(eval_.oldResults.table);
      table.body[0].outputs[0].text = 'Updated legacy output';

      const response = await api.patch(`/api/eval/${eval_.id}`).send({ table });

      expect(response.status).toBe(200);
      expect((await Eval.findById(eval_.id))?.oldResults?.table).toEqual(table);
    });

    it.each([
      { field: 'author', concurrentRating: false },
      { field: 'author', concurrentRating: true },
      { field: 'description', concurrentRating: false },
      { field: 'description', concurrentRating: true },
    ])(
      'preserves retained result metrics when updating $field (concurrent rating: $concurrentRating)',
      async ({ field, concurrentRating }) => {
        const eval_ = await EvalFactory.create({ numResults: 0 });
        testEvalIds.add(eval_.id);
        const gradingResult: GradingResult = {
          pass: true,
          score: 0.6,
          reason: 'Custom score',
          componentResults: [
            { pass: true, score: 1, reason: 'Match', assertion: { type: 'equals' } },
          ],
        };
        await eval_.addResult(createEvaluateResult({ score: 0.6, gradingResult }));
        const [persisted] = await EvalResult.findManyByEvalId(eval_.id);
        for (const action of ['rate', 'clear'] as const) {
          await EvalResult.submitRating(
            eval_.id,
            persisted.id,
            { pass: true, score: 1, reason: 'Prepare cleared rating history' },
            action,
          );
        }
        eval_.recordResultPersistenceFailure(
          createEvaluateResult({
            testIdx: 1,
            success: false,
            score: 0.2,
            failureReason: ResultFailureReason.ASSERT,
            gradingResult: {
              pass: false,
              score: 0.2,
              reason: 'Retained failure',
              componentResults: [
                { pass: false, score: 0, reason: 'Mismatch', assertion: { type: 'equals' } },
              ],
            },
          }),
        );
        await eval_.save();
        expect((await Eval.findById(eval_.id))?.prompts[0].metrics).toMatchObject({
          score: 0.8,
          testPassCount: 1,
          testFailCount: 1,
          assertPassCount: 1,
          assertFailCount: 1,
        });

        if (concurrentRating) {
          const [result] = await EvalResult.findManyByEvalId(eval_.id);
          const save = Eval.prototype.save;
          vi.spyOn(Eval.prototype, 'save').mockImplementationOnce(async function (
            this: Eval,
            ...args
          ) {
            // The metadata route has loaded its stale prompt snapshot before the rating commits.
            const rating = await api
              .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
              .send(createManualRatingPayload(result, false));
            expect(rating.status).toBe(200);
            return save.apply(this, args);
          });
        }

        vi.mocked(updateSignalFile).mockClear();
        const response = await api
          .patch(`/api/eval/${eval_.id}${field === 'author' ? '/author' : ''}`)
          .send(
            field === 'author'
              ? { author: 'reviewer@example.com' }
              : { config: { ...eval_.config, description: 'Updated description' } },
          );
        expect(response.status).toBe(200);
        const updated = await Eval.findById(eval_.id);
        expect(updated?.author).toBe(field === 'author' ? 'reviewer@example.com' : eval_.author);
        expect(updated?.config.description).toBe(
          field === 'description' ? 'Updated description' : eval_.config.description,
        );
        expect(updated?.prompts[0].metrics?.score).toBeCloseTo(concurrentRating ? 0.2 : 0.8);
        expect(updated?.prompts[0].metrics).toMatchObject({
          testPassCount: concurrentRating ? 0 : 1,
          testFailCount: concurrentRating ? 2 : 1,
          testErrorCount: 0,
          assertPassCount: 1,
          assertFailCount: concurrentRating ? 2 : 1,
          totalLatencyMs: 200,
        });
        expect(await EvalResult.findManyByEvalId(eval_.id)).toHaveLength(1);
        expect(updateSignalFile).toHaveBeenCalledWith(eval_.id);
      },
    );
  });

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

    it('does not accept private manual-rating provenance in v4 result payloads', async () => {
      const sourceEval = await EvalFactory.create();
      testEvalIds.add(sourceEval.id);
      const [sourceResult] = await sourceEval.getResults();
      invariant(sourceResult instanceof EvalResult, 'Source result is required');

      const response = await api.post('/api/eval').send({
        config: { description: 'private provenance import test' },
        prompts: [{ raw: 'hello', label: 'hello' }],
        results: [
          {
            ...sourceResult.toEvaluateResult(),
            manualRatingState: {
              version: 1,
              status: 'active',
              original: {
                success: false,
                score: 0.123,
                failureReason: ResultFailureReason.ASSERT,
                gradingResult: null,
              },
            },
          },
        ],
      });

      expect(response.status).toBe(200);
      testEvalIds.add(response.body.id);
      const stored = await (await getDb())
        .select({ manualRatingState: evalResultsTable.manualRatingState })
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, response.body.id))
        .get();
      expect(stored?.manualRatingState).toBeNull();
    });
  });

  describe('POST /:id/results', () => {
    it('does not accept private manual-rating provenance from result payloads', async () => {
      const sourceEval = await EvalFactory.create();
      const targetEval = await EvalFactory.create({ numResults: 0 });
      testEvalIds.add(sourceEval.id);
      testEvalIds.add(targetEval.id);
      const [sourceResult] = await sourceEval.getResults();
      invariant(sourceResult instanceof EvalResult, 'Source result is required');
      const resultId = crypto.randomUUID();

      const response = await api.post(`/api/eval/${targetEval.id}/results`).send([
        {
          ...sourceResult.toEvaluateResult(),
          id: resultId,
          manualRatingState: {
            version: 1,
            status: 'active',
            original: {
              success: false,
              score: 0.123,
              failureReason: ResultFailureReason.ASSERT,
              gradingResult: null,
            },
          },
        },
      ]);

      expect(response.status).toBe(204);
      const stored = await (await getDb())
        .select({ manualRatingState: evalResultsTable.manualRatingState })
        .from(evalResultsTable)
        .where(eq(evalResultsTable.id, resultId))
        .get();
      expect(stored?.manualRatingState).toBeNull();
    });
  });

  describe('post("/:evalId/results/:id/rating")', () => {
    function outcomeCategory(pass: boolean, error = false) {
      if (error) {
        return ResultFailureReason.ERROR;
      }
      return pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT;
    }

    function comparison(type: 'max-score' | 'select-best', pass: boolean, score = pass ? 1 : 0) {
      return {
        pass,
        score,
        reason: `${type} ${pass ? 'winner' : 'loser'}`,
        assertion: { type },
      } satisfies GradingResult;
    }

    const lateComparisonCases: Array<{
      name: string;
      later: GradingResult[];
      originalPass?: boolean;
      originalError?: boolean;
      originalGrade?: boolean;
      initial?: GradingResult[];
      editedScore?: number;
      oldState?: boolean;
      historicalComparison?: boolean;
      removeHuman?: boolean;
      expectedPass: boolean;
      expectedScore: number;
      expectedReason: string;
    }> = [
      {
        name: 'max-score loser',
        later: [comparison('max-score', false)],
        expectedPass: false,
        expectedScore: 0,
        expectedReason: 'max-score loser',
      },
      {
        name: 'max-score winner preserves custom score',
        later: [comparison('max-score', true)],
        expectedPass: true,
        expectedScore: 0.25,
        expectedReason: 'Custom outcome',
      },
      {
        name: 'select-best loser',
        later: [comparison('select-best', false)],
        expectedPass: false,
        expectedScore: 0,
        expectedReason: 'select-best loser',
      },
      {
        name: 'select-best winner preserves custom failure',
        originalPass: false,
        later: [comparison('select-best', true)],
        expectedPass: false,
        expectedScore: 0.25,
        expectedReason: 'Custom outcome',
      },
      {
        name: 'max-score loser preserves earlier failure reason',
        originalPass: false,
        later: [comparison('max-score', false)],
        expectedPass: false,
        expectedScore: 0,
        expectedReason: 'Custom outcome',
      },
      {
        name: 'comparison preserves execution error category',
        originalPass: false,
        originalError: true,
        later: [comparison('max-score', false)],
        expectedPass: false,
        expectedScore: 0,
        expectedReason: 'Custom outcome',
      },
      {
        name: 'max-score loser adds evidence to originally absent grade',
        originalGrade: false,
        later: [comparison('max-score', false)],
        expectedPass: false,
        expectedScore: 0,
        expectedReason: 'max-score loser',
      },
      {
        name: 'select-best winner adds evidence to originally absent grade',
        originalGrade: false,
        later: [comparison('select-best', true)],
        expectedPass: true,
        expectedScore: 0.25,
        expectedReason: 'select-best winner',
      },
      {
        name: 'multiple later comparisons retain evaluator order',
        later: [
          comparison('max-score', false),
          comparison('select-best', false, 0.1),
          comparison('max-score', true),
        ],
        expectedPass: false,
        expectedScore: 0.1,
        expectedReason: 'select-best loser',
      },
      {
        name: 'score edit after completed comparison survives clear',
        originalPass: false,
        initial: [comparison('max-score', false)],
        editedScore: 0.4,
        later: [],
        expectedPass: false,
        expectedScore: 0.4,
        expectedReason: 'Custom outcome',
      },
      {
        name: 'later winner does not undo score edit after completed comparison',
        originalPass: false,
        initial: [comparison('max-score', false)],
        editedScore: 0.4,
        later: [comparison('max-score', true)],
        expectedPass: false,
        expectedScore: 0.4,
        expectedReason: 'Custom outcome',
      },
      {
        name: 'old private state retains snapshot semantics without guessing a boundary',
        oldState: true,
        historicalComparison: true,
        later: [comparison('max-score', false)],
        expectedPass: true,
        expectedScore: 0.25,
        expectedReason: 'Custom outcome',
      },
      {
        name: 'old private state includes a future comparison after reload',
        oldState: true,
        later: [comparison('max-score', false)],
        expectedPass: false,
        expectedScore: 0,
        expectedReason: 'max-score loser',
      },
      {
        name: 'old private state preserves an edited score before a future winner',
        oldState: true,
        originalPass: false,
        initial: [comparison('max-score', false)],
        editedScore: 0.4,
        later: [comparison('max-score', true)],
        expectedPass: false,
        expectedScore: 0.4,
        expectedReason: 'Custom outcome',
      },
      {
        name: 'active private state restores after human component was removed',
        removeHuman: true,
        later: [comparison('max-score', false)],
        expectedPass: false,
        expectedScore: 0,
        expectedReason: 'max-score loser',
      },
    ];

    it.each(lateComparisonCases)('clears a rating with $name', async (scenario) => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'Result is required');
      const originalPass = scenario.originalPass ?? true;
      result.success = originalPass;
      result.score = 0.25;
      result.failureReason = outcomeCategory(originalPass, scenario.originalError);
      result.gradingResult =
        scenario.originalGrade === false
          ? null
          : {
              pass: originalPass,
              score: 0.25,
              reason: 'Custom outcome',
              componentResults: [
                { pass: true, score: 1, reason: 'Ordinary assertion passed' },
                ...(scenario.initial ?? []),
              ],
            };
      await result.save();
      const endpoint = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      if (scenario.editedScore !== undefined) {
        const edited = await api.post(endpoint).send({
          pass: originalPass,
          score: scenario.editedScore,
          ratingAction: 'update',
          ratingUpdate: 'score',
        });
        expect(edited.status).toBe(200);
      }
      const rated = await api
        .post(endpoint)
        .send({ pass: true, score: 1, ratingAction: 'rate', comment: 'Retain reviewer note' });
      expect(rated.status).toBe(200);
      if (scenario.oldState) {
        const db = await getDb();
        await db
          .update(evalResultsTable)
          .set({
            manualRatingState: sql`json_remove(${evalResultsTable.manualRatingState}, '$.original.comparisonCount')`,
          })
          .where(eq(evalResultsTable.id, result.id));
      }
      // Comparison finalization reloads the persisted row and appends its verdicts.
      const compared = await EvalResult.findById(result.id);
      invariant(compared?.gradingResult, 'Rated result is required');
      compared.gradingResult.componentResults = [
        ...(compared.gradingResult.componentResults ?? []).filter(
          (component) => !scenario.removeHuman || component.assertion?.type !== 'human',
        ),
        ...scenario.later,
      ];
      const lastFailure = [...scenario.later].reverse().find((component) => !component.pass);
      if (lastFailure) {
        compared.success = compared.gradingResult.pass = false;
        compared.score = compared.gradingResult.score = lastFailure.score;
        compared.gradingResult.reason = lastFailure.reason;
        compared.failureReason = ResultFailureReason.ASSERT;
      }
      if (scenario.historicalComparison) {
        // This verdict predates the boundary-aware writer. Preserve that DB state without
        // saving the boundary initialized when an EvalResult is reconstructed.
        await (await getDb())
          .update(evalResultsTable)
          .set({
            gradingResult: compared.gradingResult,
            success: compared.success,
            score: compared.score,
            failureReason: compared.failureReason,
          })
          .where(eq(evalResultsTable.id, result.id));
      } else {
        await compared.save();
      }

      const cleared = await api
        .post(endpoint)
        .send({ pass: true, score: 1, ratingAction: 'clear' });
      expect(cleared.status).toBe(200);
      const expected = {
        success: scenario.expectedPass,
        score: scenario.expectedScore,
        failureReason: outcomeCategory(scenario.expectedPass, scenario.originalError),
        gradingResult: {
          pass: scenario.expectedPass,
          score: scenario.expectedScore,
          reason: scenario.expectedReason,
          comment: 'Retain reviewer note',
        },
      };
      expect(cleared.body).toMatchObject(expected);
      const persisted = await EvalResult.findById(result.id);
      expect(persisted).toMatchObject(expected);
      expect(persisted?.gradingResult?.componentResults).not.toContainEqual(
        expect.objectContaining({ assertion: { type: 'human' } }),
      );
      for (const component of [...(scenario.initial ?? []), ...scenario.later]) {
        expect(persisted?.gradingResult?.componentResults).toContainEqual(component);
      }
      const repeated = await api
        .post(endpoint)
        .send({ pass: true, score: 1, ratingAction: 'clear' });
      expect(repeated.body).toEqual(cleared.body);
    });

    it.each([true, false])(
      'clears the manual override reason on imported legacy grades (pass: %s)',
      async (pass) => {
        const eval_ = await EvalFactory.create();
        testEvalIds.add(eval_.id);
        const [result] = await eval_.getResults();
        invariant(result instanceof EvalResult, 'Result is required');
        result.success = true;
        result.score = 1;
        result.gradingResult = {
          pass: true,
          score: 1,
          reason: 'Manual result (overrides all other grading results)',
          componentResults: [
            { pass, score: pass ? 1 : 0, reason: 'Original assertion result' },
            { pass: true, score: 1, reason: 'Manual rating', assertion: { type: 'human' } },
          ],
        };
        await result.save();
        const cleared = await api
          .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
          .send({ pass: true, score: 1, reason: 'Caller reason', ratingAction: 'clear' });
        expect(cleared.status).toBe(200);
        expect(cleared.body).toMatchObject({
          success: pass,
          score: pass ? 1 : 0,
          gradingResult: { reason: 'Manual rating cleared' },
        });
        expect((await EvalResult.findById(result.id))?.gradingResult?.reason).toBe(
          'Manual rating cleared',
        );
      },
    );

    it.each([
      { name: 'comment', update: 'comment', comment: 'Reviewer note', score: 0, humanScore: 1 },
      { name: 'highlight', update: 'comment', comment: '!highlight', score: 0, humanScore: 1 },
      { name: 'comment removal', update: 'comment', score: 0, humanScore: 1 },
      { name: 'score', update: 'score', comment: 'Prior note', score: 0.4, humanScore: 0.4 },
      {
        name: 'legacy comment',
        update: 'comment',
        legacy: true,
        comment: 'Old client note',
        score: 0,
        humanScore: 1,
      },
      {
        name: 'legacy highlight',
        update: 'comment',
        legacy: true,
        comment: '!highlight Old client',
        score: 0,
        humanScore: 1,
      },
      {
        name: 'legacy score',
        update: 'score',
        legacy: true,
        comment: 'Prior note',
        score: 0.4,
        humanScore: 1,
      },
    ])('preserves the human verdict on a $name update after comparison', async (scenario) => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'Result is required');
      const endpoint = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      const rated = await api.post(endpoint).send({
        pass: true,
        score: 1,
        reason: 'Reviewer prefers this output',
        comment: 'Prior note',
        ratingAction: 'rate',
      });
      expect(rated.status).toBe(200);
      const compared = await EvalResult.findById(result.id);
      invariant(compared?.gradingResult?.componentResults, 'Rated result is required');
      const human = compared.gradingResult.componentResults.find(
        (component) => component.assertion?.type === 'human',
      );
      invariant(human, 'Human rating is required');
      const laterComparison = comparison('max-score', false);
      compared.success = compared.gradingResult.pass = false;
      compared.score = compared.gradingResult.score = 0;
      compared.failureReason = ResultFailureReason.ASSERT;
      compared.gradingResult.reason = laterComparison.reason;
      compared.gradingResult.assertion = laterComparison.assertion;
      compared.gradingResult.componentResults.push(laterComparison);
      await compared.save();
      const comparisonEval = await Eval.findById(eval_.id);
      invariant(comparisonEval, 'Eval is required');
      const metrics = comparisonEval.prompts[result.promptIdx].metrics;
      invariant(metrics, 'Metrics are required');
      metrics.score -= 1;
      metrics.testPassCount -= 1;
      metrics.testFailCount += 1;
      metrics.assertFailCount += 1;
      await comparisonEval.save();
      const db = await getDb();
      const readRatingState = () =>
        db
          .select({ state: evalResultsTable.manualRatingState })
          .from(evalResultsTable)
          .where(eq(evalResultsTable.id, result.id))
          .get();
      const previousState = await readRatingState();

      const legacyPayload = {
        ...compared.gradingResult,
        score: scenario.score,
        reason:
          scenario.update === 'score'
            ? 'Manual result (overrides all other grading results)'
            : compared.gradingResult.reason,
        comment: scenario.comment,
      };
      const updated = await api.post(endpoint).send(
        scenario.legacy
          ? legacyPayload
          : {
              pass: true,
              score: scenario.update === 'score' ? scenario.score : 999,
              reason: 'Stale submitted reason',
              componentResults: rated.body.gradingResult.componentResults,
              comment: scenario.comment,
              ratingAction: 'update',
              ratingUpdate: scenario.update,
            },
      );
      expect(updated.status).toBe(200);
      const expected = {
        success: false,
        score: scenario.score,
        failureReason: ResultFailureReason.ASSERT,
        gradingResult: {
          pass: false,
          score: scenario.score,
          reason: laterComparison.reason,
          assertion: laterComparison.assertion,
        },
      };
      expect(updated.body).toMatchObject(expected);
      const persisted = await EvalResult.findById(result.id);
      expect(persisted).toMatchObject(expected);
      expect(persisted?.gradingResult?.comment).toBe(scenario.comment);
      expect(persisted?.gradingResult?.componentResults).toContainEqual({
        ...human,
        pass: true,
        score: scenario.humanScore,
        comment: scenario.comment,
      });
      expect(persisted?.gradingResult?.componentResults).toContainEqual(laterComparison);
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual({
        ...metrics,
        score: metrics.score + scenario.score,
      });
      expect(await readRatingState()).toEqual(previousState);

      if (scenario.legacy) {
        // Old clients keep their original human component when editing again.
        const commented = await api.post(endpoint).send({
          ...legacyPayload,
          comment: 'Another old client note',
        });
        expect(commented.status).toBe(200);
        expect(commented.body).toMatchObject(expected);
        expect(commented.body.gradingResult.componentResults).toContainEqual({
          ...human,
          comment: 'Another old client note',
        });
        expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual({
          ...metrics,
          score: metrics.score + scenario.score,
        });
        expect(await readRatingState()).toEqual(previousState);
      }

      const cleared = await api
        .post(endpoint)
        .send({ pass: true, score: 1, ratingAction: 'clear' });
      expect(cleared.status).toBe(200);
      expect(cleared.body).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ASSERT,
      });
      expect(cleared.body.gradingResult.componentResults).toContainEqual(laterComparison);
      expect(cleared.body.gradingResult.componentResults).not.toContainEqual(
        expect.objectContaining({ assertion: { type: 'human' } }),
      );
    });

    it.each(['bare', 'explicit', 'top-level human'])(
      'keeps %s rating inference separate from legacy field edits',
      async (intent) => {
        const eval_ = await EvalFactory.create();
        testEvalIds.add(eval_.id);
        const [, result] = await eval_.getResults();
        invariant(result instanceof EvalResult && result.gradingResult, 'Result is required');
        result.gradingResult.componentResults = [
          ...(result.gradingResult.componentResults ?? []),
          { pass: true, score: 1, reason: 'Human pass', assertion: { type: 'human' } },
        ];
        await result.save();
        const metrics = eval_.prompts[result.promptIdx].metrics;
        invariant(metrics, 'Metrics are required');
        metrics.assertPassCount += 1;
        await eval_.save();
        const response = await api.post(`/api/eval/${eval_.id}/results/${result.id}/rating`).send({
          ...(intent === 'bare' ? {} : result.gradingResult),
          ...(intent === 'explicit' ? { ratingAction: 'rate' } : {}),
          ...(intent === 'top-level human' ? { assertion: { type: 'human' } } : {}),
          pass: false,
          score: 0.4,
          reason: 'Manual result (overrides all other grading results)',
        });
        expect(response.status).toBe(200);
        expect(response.body.gradingResult.componentResults).toContainEqual(
          expect.objectContaining({
            pass: false,
            score: 0.4,
            assertion: { type: 'human' },
          }),
        );
      },
    );

    it.each(['comment', 'score'])(
      'preserves a stored error category with a human component on %s updates',
      async (ratingUpdate) => {
        const eval_ = await EvalFactory.create();
        testEvalIds.add(eval_.id);
        const [, result] = await eval_.getResults();
        invariant(result instanceof EvalResult && result.gradingResult, 'Result is required');
        await markResultAsError(eval_, result);
        const human = {
          pass: true,
          score: 1,
          reason: 'Retained human verdict',
          assertion: { type: 'human' as const },
        };
        result.gradingResult.componentResults = [
          ...(result.gradingResult.componentResults ?? []),
          human,
        ];
        await result.save();
        const metrics = eval_.prompts[result.promptIdx].metrics;
        invariant(metrics, 'Metrics are required');
        metrics.assertPassCount += 1;
        await eval_.save();
        const score = ratingUpdate === 'score' ? 0.4 : result.score;
        const updated = await api
          .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
          .send({ pass: true, score: 0.4, comment: 'Note', ratingAction: 'update', ratingUpdate });
        expect(updated.status).toBe(200);
        expect(updated.body).toMatchObject({
          success: false,
          score,
          failureReason: ResultFailureReason.ERROR,
        });
        expect(updated.body.gradingResult.componentResults).toContainEqual({
          ...human,
          ...(ratingUpdate === 'score' ? { score: 0.4 } : { comment: 'Note' }),
        });
        expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual({
          ...metrics,
          score: metrics.score + score - result.score,
        });
      },
    );

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
      const db = await getDb();
      await db
        .update(evalResultsTable)
        .set({ updatedAt: 1 })
        .where(eq(evalResultsTable.id, result.id));
      const originalUpdatedAt = await db
        .select({ updatedAt: evalResultsTable.updatedAt })
        .from(evalResultsTable)
        .where(eq(evalResultsTable.id, result.id))
        .get();
      vi.mocked(updateSignalFile).mockClear();

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: true, score: 1, ratingAction: 'clear' });

      expect(res.status).toBe(200);
      expect(await EvalResult.findById(result.id)).toMatchObject(originalResult);
      expect(
        await db
          .select({ updatedAt: evalResultsTable.updatedAt })
          .from(evalResultsTable)
          .where(eq(evalResultsTable.id, result.id))
          .get(),
      ).toEqual(originalUpdatedAt);
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        originalMetrics,
      );
      expect(updateSignalFile).not.toHaveBeenCalled();
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

      const res = await api.post(`/api/eval/${eval_.id}/results/${result.id}/rating`).send({
        ...result.gradingResult,
        comment: 'Investigating',
        ratingAction: 'update',
        ratingUpdate: 'comment',
      });

      expect(res.status).toBe(200);
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.failureReason).toBe(ResultFailureReason.ERROR);
      expect(updatedResult?.gradingResult?.comment).toBe('Investigating');
      expect(updatedResult?.gradingResult?.componentResults).not.toContainEqual(
        expect.objectContaining({ assertion: { type: 'human' } }),
      );
      const noOpResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          pass: false,
          score: 0,
          comment: 'Investigating',
          ratingAction: 'update',
          ratingUpdate: 'comment',
        });
      expect(noOpResponse.status).toBe(200);
      expect(
        (await EvalResult.findById(result.id))?.gradingResult?.componentResults,
      ).not.toContainEqual(expect.objectContaining({ assertion: { type: 'human' } }));
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        originalMetrics,
      );
    });

    it('does not clear a newer manual rating with a stale comment update', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');
      const staleAutomatedPayload = structuredClone(result.gradingResult);
      const rateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...createManualRatingPayload(result, false), ratingAction: 'rate' });
      expect(rateResponse.status).toBe(200);
      const ratedMetrics = structuredClone((await Eval.findById(eval_.id))?.prompts[0].metrics);

      const updateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          ...staleAutomatedPayload,
          comment: 'Comment from a stale tab',
          ratingAction: 'update',
          ratingUpdate: 'comment',
        });

      expect(updateResponse.status).toBe(200);
      const updatedResult = await EvalResult.findById(result.id);
      expect(updatedResult?.success).toBe(false);
      expect(updatedResult?.score).toBe(0);
      expect(updatedResult?.gradingResult?.componentResults).toContainEqual(
        expect.objectContaining({ pass: false, assertion: { type: 'human' } }),
      );
      expect(updatedResult?.gradingResult?.comment).toBe('Comment from a stale tab');
      expect((await Eval.findById(eval_.id))?.prompts[0].metrics).toEqual(ratedMetrics);
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

    it('normalizes a missing legacy error counter before applying a category delta', async () => {
      const eval_ = await EvalFactory.create({ numResults: 3, resultTypes: ['error'] });
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const otherPromptResult = results[2];
      invariant(otherPromptResult instanceof EvalResult, 'Result is required');
      otherPromptResult.promptIdx = 1;
      await otherPromptResult.save();
      const prompt = eval_.prompts[0];
      invariant(prompt.metrics, 'Prompt metrics are required');
      Object.assign(prompt.metrics, { score: 0, testPassCount: 0, testFailCount: 0 });
      const otherPrompt = structuredClone(prompt);
      invariant(otherPrompt.metrics, 'Other prompt metrics are required');
      otherPrompt.metrics.testErrorCount = 1;
      eval_.prompts.push(otherPrompt);
      delete (prompt.metrics as Partial<typeof prompt.metrics>).testErrorCount;
      await eval_.save();

      for (const [index, ratingAction, errorCount] of [
        [0, 'rate', 1],
        [1, 'rate', 0],
        [0, 'clear', 1],
        [1, 'clear', 2],
      ] as const) {
        const response = await api
          .post(`/api/eval/${eval_.id}/results/${results[index].id}/rating`)
          .send({ pass: true, score: 1, ratingAction });
        expect(response.status).toBe(200);
        const updatedEval = await Eval.findById(eval_.id);
        expect(updatedEval?.prompts[0].metrics).toMatchObject({
          testPassCount: 2 - errorCount,
          testFailCount: 0,
          testErrorCount: errorCount,
        });
        expect(updatedEval?.prompts[1].metrics).toEqual(otherPrompt.metrics);
      }
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

    it('canonicalizes an explicit same-outcome rating as one manual component', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');

      const res = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: result.success, score: result.score, ratingAction: 'rate' });

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

    it('keeps repeated minimal legacy score updates unrated', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      invariant(originalMetrics, 'Original metrics are required');
      const route = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      const payload = { pass: result.success, score: 0.4 };

      const updated = await api.post(route).send(payload);
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ success: result.success, score: 0.4 });
      expect(updated.body.gradingResult.componentResults).toEqual(
        result.gradingResult?.componentResults,
      );
      vi.mocked(updateSignalFile).mockClear();
      const retried = await api.post(route).send(payload);
      expect(retried.status).toBe(200);
      expect(retried.body).toEqual(updated.body);
      expect(updateSignalFile).not.toHaveBeenCalled();
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual({
        ...originalMetrics,
        score: expect.closeTo(originalMetrics.score + 0.4 - result.score),
      });
      const userRated = await api.get(`/api/eval/${eval_.id}/table?filterMode=user-rated`);
      expect(userRated.status).toBe(200);
      expect(userRated.body.filteredCount).toBe(0);
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

    it('does not double count a persisted legacy top-level human assertion', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      result.gradingResult = {
        pass: true,
        score: 0.6,
        reason: 'Legacy manual rating',
        assertion: { type: 'human' },
      };
      result.score = 0.6;
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      prompt.metrics.score -= 0.4;
      prompt.metrics.assertPassCount += 1;
      await eval_.save();
      const originalAssertPassCount = prompt.metrics.assertPassCount;

      const response = await api.post(`/api/eval/${eval_.id}/results/${result.id}/rating`).send({
        pass: true,
        score: 0.4,
        reason: 'Updated legacy rating',
        assertion: { type: 'human' },
      });

      expect(response.status).toBe(200);
      expect(response.body.gradingResult).not.toHaveProperty('assertion');
      expect(response.body.gradingResult?.componentResults).toHaveLength(1);
      expect((await Eval.findById(eval_.id))?.prompts[0].metrics?.assertPassCount).toBe(
        originalAssertPassCount,
      );
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
      legacyClearPayload.comment = 'Stale clear comment';
      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...legacyClearPayload, ratingAction: 'clear' });
      expect(clearResponse.status).toBe(200);

      const restoredResult = await EvalResult.findById(result.id);
      invariant(restoredResult, 'Restored result is required');
      const scoreResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          ...createScoreOnlyRatingPayload(restoredResult, 0.4),
          ratingAction: 'update',
          ratingUpdate: 'score',
        });

      expect(scoreResponse.status).toBe(200);
      expect(scoreResponse.body.score).toBe(0.4);
      expect(scoreResponse.body.gradingResult?.score).toBe(0.4);
      expect(scoreResponse.body.gradingResult).not.toHaveProperty('ratingAction');
      expect(scoreResponse.body.gradingResult).not.toHaveProperty('ratingUpdate');
      const scoreUpdatedResult = await EvalResult.findById(result.id);
      invariant(scoreUpdatedResult, 'Score-updated result is required');
      const commentResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          ...scoreUpdatedResult.gradingResult,
          comment: 'Newer baseline comment',
          ratingAction: 'update',
          ratingUpdate: 'comment',
        });
      expect(commentResponse.status).toBe(200);
      const delayedClearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...legacyClearPayload, ratingAction: 'clear' });
      expect(delayedClearResponse.status).toBe(200);
      const persistedResult = await EvalResult.findById(result.id);
      expect(persistedResult?.score).toBe(0.4);
      expect(persistedResult?.gradingResult?.componentResults).not.toContainEqual(
        expect.objectContaining({ assertion: { type: 'human' } }),
      );
      expect(persistedResult?.gradingResult?.comment).toBe('Newer baseline comment');
      const persistedEval = await Eval.findById(eval_.id);
      expect(persistedEval?.prompts[result.promptIdx].metrics?.score).toBeCloseTo(0.4);
    });

    it('accepts legacy score edits and the latest annotation after clearing', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');
      const route = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      expect((await api.post(route).send(createManualRatingPayload(result, false))).status).toBe(
        200,
      );
      const manuallyRated = await EvalResult.findById(result.id);
      invariant(manuallyRated, 'Manually rated result is required');
      const clearPayload = createClearManualRatingPayload(manuallyRated);
      const cleared = await api.post(route).send(clearPayload);
      expect(cleared.body.score).toBe(1);
      const oldClientScore = (score: number) => ({
        ...cleared.body.gradingResult,
        score,
        reason: 'Manual result (overrides all other grading results)',
      });
      expect((await api.post(route).send(oldClientScore(0.4))).body.score).toBe(0.4);
      expect((await api.post(route).send(oldClientScore(1))).body.score).toBe(1);
      const updated = await api.post(route).send(oldClientScore(0.6));
      expect(updated.body.score).toBe(0.6);
      const annotated = await api.post(route).send({
        ...updated.body.gradingResult,
        comment: 'Newer annotation',
      });
      expect(annotated.body.gradingResult.comment).toBe('Newer annotation');
      vi.mocked(updateSignalFile).mockClear();
      const retried = await api.post(route).send(clearPayload);
      expect(retried.body.score).toBe(0.6);
      // An old clear and an intentional return to the original comment have the same body.
      expect(retried.body.gradingResult.comment).toBe(clearPayload.comment);
      expect(updateSignalFile).toHaveBeenCalledOnce();
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics?.score).toBeCloseTo(
        0.6,
      );
    });

    it.each([
      { label: 'comment', comment: 'Legacy annotation', score: 1 },
      { label: 'highlight', comment: '!highlight', score: 1 },
      { label: 'score', comment: undefined, score: 0.4 },
      { label: 'score with an empty comment', comment: '', score: 0.4 },
    ])('accepts a legacy $label edit after a minimal clear', async ({ comment, score }) => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      invariant(originalMetrics, 'Original metrics are required');
      const route = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      expect(
        (await api.post(route).send({ pass: false, score: 0, ratingAction: 'rate' })).status,
      ).toBe(200);
      const clearPayload = { pass: false, score: 0, ratingAction: 'clear' };
      const cleared = await api.post(route).send(clearPayload);
      expect(cleared.status).toBe(200);
      expect(cleared.body.score).toBe(1);
      const legacyUpdate = {
        ...cleared.body.gradingResult,
        ...(score === result.score
          ? {}
          : { score, reason: 'Manual result (overrides all other grading results)' }),
        ...(comment === undefined ? {} : { comment }),
      };
      const updated = await api.post(route).send(legacyUpdate);
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({
        success: true,
        score,
        failureReason: ResultFailureReason.NONE,
        gradingResult: {
          pass: true,
          score,
          componentResults: cleared.body.gradingResult.componentResults,
        },
      });
      expect(updated.body.gradingResult.comment ?? '').toBe(comment ?? '');
      vi.mocked(updateSignalFile).mockClear();
      for (const retry of [legacyUpdate, clearPayload]) {
        const retried = await api.post(route).send(retry);
        expect(retried.status).toBe(200);
        expect(retried.body).toEqual(updated.body);
      }
      expect(updateSignalFile).not.toHaveBeenCalled();
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual({
        ...originalMetrics,
        score: expect.closeTo(originalMetrics.score + score - result.score),
      });
    });

    it('accepts assertion-less old UI annotations and scores after clearing', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult && result.id, 'Result is required');
      result.gradingResult = null;
      await result.save();
      const route = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      expect((await api.post(route).send(createManualRatingPayload(result, false))).status).toBe(
        200,
      );
      // With no automated assertions, the old UI retains the manual outcome locally.
      const localClear = {
        pass: false,
        score: 0,
        reason: 'Manual rating cleared',
        comment: '',
        componentResults: [],
      };
      const cleared = await api.post(route).send(localClear);
      expect(cleared.body).toMatchObject({ success: true, score: 1, gradingResult: null });
      const originalMetrics = structuredClone(
        (await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics,
      );
      invariant(originalMetrics, 'Restored metrics are required');
      // Its next edit omits the empty componentResults array and ignores the clear response.
      for (const comment of ['!highlight', '', 'A', 'B', 'A', '']) {
        const annotated = await api.post(route).send({
          pass: false,
          score: 0,
          reason: localClear.reason,
          comment,
        });
        expect(annotated.status).toBe(200);
        expect(annotated.body).toMatchObject({
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          gradingResult: { pass: true, score: 1, comment },
        });
        expect(annotated.body.gradingResult.componentResults).toBeUndefined();
        expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
          originalMetrics,
        );
      }
      const scored = await api.post(route).send({
        pass: false,
        score: 0.4,
        reason: 'Manual result (overrides all other grading results)',
      });
      expect(scored.body).toMatchObject({
        success: true,
        score: 0.4,
        gradingResult: { pass: true, score: 0.4, comment: '' },
      });
      expect(scored.body.gradingResult.componentResults).toBeUndefined();
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual({
        ...originalMetrics,
        score: expect.closeTo(originalMetrics.score - 0.6),
      });
    });

    it.each([
      { label: 'bare API pass/score', fields: {} },
      { label: 'explicit intent', fields: { ratingAction: 'rate' } },
      { label: 'top-level human assertion', fields: { assertion: { type: 'human' } } },
      {
        label: 'human component',
        fields: { componentResults: [{ pass: false, score: 0, assertion: { type: 'human' } }] },
      },
    ])('accepts a new rating with $label after clearing', async ({ fields }) => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');
      const route = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      await api.post(route).send({ pass: false, score: 0, ratingAction: 'rate' });
      const cleared = await api.post(route).send({ pass: false, score: 0, ratingAction: 'clear' });
      vi.mocked(updateSignalFile).mockClear();
      const rated = await api.post(route).send({ pass: false, score: 0, ...fields });
      expect(rated.status).toBe(200);
      expect(rated.body).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ASSERT,
        gradingResult: {
          componentResults: expect.arrayContaining([
            expect.objectContaining({ assertion: { type: 'human' } }),
          ]),
        },
      });
      expect(
        (await api.post(route).send({ pass: false, score: 0, ratingAction: 'clear' })).body,
      ).toEqual(cleared.body);
    });

    it('accepts and repeats a bare API score edit after clearing without adding a rating', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');
      const route = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      await api.post(route).send({ pass: false, score: 0, ratingAction: 'rate' });
      await api.post(route).send({ pass: false, score: 0, ratingAction: 'clear' });
      const updated = await api.post(route).send({ pass: true, score: 0.4 });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ success: true, score: 0.4 });
      expect(updated.body.gradingResult.componentResults).not.toContainEqual(
        expect.objectContaining({ assertion: { type: 'human' } }),
      );
      vi.mocked(updateSignalFile).mockClear();
      const repeated = await api.post(route).send({ pass: true, score: 0.4 });
      expect(repeated.body).toEqual(updated.body);
      expect(updateSignalFile).not.toHaveBeenCalled();
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics?.score).toBeCloseTo(
        0.4,
      );
    });

    it.each([
      [ResultFailureReason.NONE, false],
      [ResultFailureReason.ASSERT, true],
      [ResultFailureReason.ERROR, true],
    ])(
      'preserves legacy category %s after annotations and score edits before clearing',
      async (failureReason, manualPass) => {
        const eval_ = await EvalFactory.create();
        testEvalIds.add(eval_.id);
        const [result] = await eval_.getResults();
        invariant(result instanceof EvalResult && result.id, 'Result is required');
        result.success = manualPass;
        result.score = manualPass ? 1 : 0;
        result.failureReason = failureReason;
        result.gradingResult = {
          pass: manualPass,
          score: result.score,
          reason: 'Manual result (overrides all other grading results)',
          componentResults: [
            {
              pass: manualPass,
              score: result.score,
              reason: 'Manual result (overrides all other grading results)',
              assertion: { type: 'human' },
            },
          ],
        };
        await result.save();
        const route = `/api/eval/${eval_.id}/results/${result.id}/rating`;
        const originalGrade = structuredClone(result.gradingResult);
        const directClear = await api
          .post(route)
          .send({ pass: false, score: 0, ratingAction: 'clear' });
        expect(directClear.status).toBe(200);
        // Restore the pre-upgrade row shape; the second clear must reconstruct the same outcome.
        result.gradingResult = originalGrade;
        await result.save();
        const db = await getDb();
        await db
          .update(evalResultsTable)
          .set({ manualRatingState: null })
          .where(eq(evalResultsTable.id, result.id));
        const commentResponse = await api.post(route).send({
          pass: manualPass,
          score: result.score,
          comment: 'Keep this annotation',
          ratingAction: 'update',
          ratingUpdate: 'comment',
        });
        expect(commentResponse.status).toBe(200);
        const scoreResponse = await api.post(route).send({
          pass: manualPass,
          score: 0.4,
          ratingAction: 'update',
          ratingUpdate: 'score',
        });
        expect(scoreResponse.status).toBe(200);
        const afterEdits = await api
          .post(route)
          .send({ pass: false, score: 0, ratingAction: 'clear' });
        expect(afterEdits.status).toBe(200);
        expect(afterEdits.body).toMatchObject({
          success: directClear.body.success,
          score: directClear.body.score,
          failureReason: directClear.body.failureReason,
          gradingResult: { comment: 'Keep this annotation' },
        });
      },
    );

    it.each([
      { failureReason: ResultFailureReason.ASSERT, shape: 'component' },
      { failureReason: ResultFailureReason.ASSERT, shape: 'top-level' },
      { failureReason: ResultFailureReason.ERROR, shape: 'component' },
      { failureReason: ResultFailureReason.ERROR, shape: 'top-level' },
    ])(
      'restores legacy $shape failure category $failureReason after a pass rating',
      async ({ failureReason, shape }) => {
        const eval_ = await EvalFactory.create();
        testEvalIds.add(eval_.id);
        const [, result] = await eval_.getResults();
        invariant(result instanceof EvalResult, 'Result is required');
        result.success = false;
        result.score = 0;
        result.failureReason = failureReason;
        result.error =
          failureReason === ResultFailureReason.ASSERT
            ? 'Expected output to equal expected'
            : 'Provider request failed';
        const human = {
          pass: false,
          score: 0,
          reason: 'Legacy manual failure',
          assertion: { type: 'human' },
        } satisfies GradingResult;
        result.gradingResult =
          shape === 'top-level'
            ? human
            : { ...human, assertion: undefined, componentResults: [human] };
        await result.save();
        const metrics = eval_.prompts[result.promptIdx].metrics;
        invariant(metrics, 'Prompt metrics are required');
        if (failureReason === ResultFailureReason.ERROR) {
          metrics.testFailCount -= 1;
          metrics.testErrorCount += 1;
        }
        await eval_.save();
        const expectedMetrics = {
          score: metrics.score,
          testPassCount: metrics.testPassCount,
          testFailCount: metrics.testFailCount,
          testErrorCount: metrics.testErrorCount,
          assertPassCount: metrics.assertPassCount,
          // The original legacy human assertion is removed by clearing.
          assertFailCount: metrics.assertFailCount - 1,
        };
        const route = `/api/eval/${eval_.id}/results/${result.id}/rating`;
        const rated = await api.post(route).send({ pass: true, score: 1, ratingAction: 'rate' });
        expect(rated.status).toBe(200);
        expect(rated.body).toMatchObject({
          success: true,
          failureReason: ResultFailureReason.NONE,
        });

        for (let attempt = 0; attempt < 2; attempt++) {
          const cleared = await api
            .post(route)
            .send({ pass: true, score: 1, ratingAction: 'clear' });
          expect(cleared.status).toBe(200);
          expect(cleared.body).toMatchObject({ success: false, score: 0, failureReason });
          expect(await EvalResult.findById(result.id)).toMatchObject({
            success: false,
            score: 0,
            failureReason,
          });
          const saved = await Eval.findById(eval_.id);
          invariant(saved, 'Eval is required');
          expect(saved.prompts[result.promptIdx].metrics).toMatchObject(expectedMetrics);
          expect(
            (await saved.getFilteredMetrics({ filterMode: 'all' }))[result.promptIdx],
          ).toMatchObject(expectedMetrics);
        }
      },
    );

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
      const failResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(legacyRating, false));
      expect(failResponse.status).toBe(200);
      expect(failResponse.body.failureReason).toBe(ResultFailureReason.ASSERT);
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toMatchObject({
        testPassCount: 1,
        testFailCount: 1,
        testErrorCount: 0,
      });
      const failedLegacyRating = await EvalResult.findById(result.id);
      invariant(failedLegacyRating, 'Failed legacy rating is required');
      const updateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createManualRatingPayload(failedLegacyRating, true, 0.4));
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

    it('preserves server-owned fields when implicitly clearing a legacy rating', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      await markResultAsError(eval_, result);
      const errorMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);

      result.gradingResult = {
        ...createManualRatingPayload(result, true),
        comment: 'Server-current comment',
        metadata: { source: 'server' },
        reason: 'Server-current manual reason',
        tokensUsed: { total: 7 },
      };
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
      const clearPayload = createClearManualRatingPayload(legacyRating);
      const expectedClearScore = clearPayload.score;
      clearPayload.comment = 'Stale client comment';
      clearPayload.metadata = { source: 'stale client' };
      clearPayload.reason = 'Stale client reason';
      clearPayload.tokensUsed = { total: 999 };
      const poisonedOutcomeClearPayload = { ...clearPayload, pass: true, score: 999 };
      const response = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(poisonedOutcomeClearPayload);

      expect(response.status).toBe(200);
      expect(response.body.gradingResult).toMatchObject({
        comment: 'Server-current comment',
        metadata: { source: 'server' },
        reason: 'Server-current manual reason',
        tokensUsed: { total: 7 },
      });
      expect(response.body.gradingResult?.componentResults).not.toContainEqual(
        expect.objectContaining({ assertion: { type: 'human' } }),
      );
      expect(response.body).toMatchObject({
        success: false,
        score: expectedClearScore,
        failureReason: ResultFailureReason.ERROR,
      });
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        errorMetrics,
      );
      const db = await getDb();
      const firstClearState = await db
        .select({
          manualRatingState: evalResultsTable.manualRatingState,
          updatedAt: evalResultsTable.updatedAt,
        })
        .from(evalResultsTable)
        .where(eq(evalResultsTable.id, result.id))
        .get();
      expect(firstClearState?.manualRatingState).toMatchObject({
        status: 'cleared',
      });
      expect(JSON.stringify(firstClearState?.manualRatingState)).not.toContain(
        'Stale client comment',
      );
      vi.mocked(updateSignalFile).mockClear();

      const retryResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...poisonedOutcomeClearPayload, ratingAction: 'clear' });

      expect(retryResponse.status).toBe(200);
      expect(retryResponse.body.gradingResult).toMatchObject({
        comment: 'Server-current comment',
        metadata: { source: 'server' },
        reason: 'Server-current manual reason',
        tokensUsed: { total: 7 },
      });
      expect(retryResponse.body.gradingResult?.componentResults).not.toContainEqual(
        expect.objectContaining({ assertion: { type: 'human' } }),
      );
      expect(retryResponse.body).toMatchObject({
        success: false,
        failureReason: ResultFailureReason.ERROR,
      });
      expect(
        await db
          .select({
            manualRatingState: evalResultsTable.manualRatingState,
            updatedAt: evalResultsTable.updatedAt,
          })
          .from(evalResultsTable)
          .where(eq(evalResultsTable.id, result.id))
          .get(),
      ).toEqual(firstClearState);
      expect(updateSignalFile).not.toHaveBeenCalled();

      const legacyCommentResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          ...retryResponse.body.gradingResult,
          comment: 'Updated by a legacy client',
        });
      expect(legacyCommentResponse.status).toBe(200);
      expect(legacyCommentResponse.body.gradingResult?.comment).toBe('Updated by a legacy client');

      vi.mocked(updateSignalFile).mockClear();
      const delayedClearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...poisonedOutcomeClearPayload, ratingAction: 'clear' });
      expect(delayedClearResponse.status).toBe(200);
      expect(delayedClearResponse.body.gradingResult?.comment).toBe('Updated by a legacy client');
      expect(updateSignalFile).not.toHaveBeenCalled();

      const scoreResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          ...delayedClearResponse.body.gradingResult,
          pass: false,
          score: 0.4,
          reason: 'Manual result (overrides all other grading results)',
        });
      expect(scoreResponse.status).toBe(200);
      expect(scoreResponse.body.score).toBe(0.4);
      const scoreUpdatedMetrics = structuredClone(
        (await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics,
      );

      const changedDelayedClearPayload = {
        ...clearPayload,
        comment: 'Changed stale clear comment',
        metadata: { source: 'poisoned retry' },
        tokensUsed: { total: 9999 },
      };
      const changedDelayedClearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(changedDelayedClearPayload);
      expect(changedDelayedClearResponse.status).toBe(200);
      expect(changedDelayedClearResponse.body).toMatchObject({
        score: 0.4,
        success: false,
        failureReason: ResultFailureReason.ERROR,
        gradingResult: {
          comment: 'Changed stale clear comment',
          metadata: { source: 'server' },
          score: 0.4,
          tokensUsed: { total: 7 },
        },
      });
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        scoreUpdatedMetrics,
      );
      const updatedRatingState = await db
        .select({ manualRatingState: evalResultsTable.manualRatingState })
        .from(evalResultsTable)
        .where(eq(evalResultsTable.id, result.id))
        .get();
      expect(JSON.stringify(updatedRatingState?.manualRatingState)).not.toContain(
        'Changed stale clear comment',
      );

      vi.mocked(updateSignalFile).mockClear();
      const repeatedChangedClearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(changedDelayedClearPayload);
      expect(repeatedChangedClearResponse.status).toBe(200);
      expect(repeatedChangedClearResponse.body).toEqual(changedDelayedClearResponse.body);
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        scoreUpdatedMetrics,
      );
      expect(updateSignalFile).not.toHaveBeenCalled();
    });

    it('reconstructs weighted threshold outcomes when clearing a legacy rating', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      const automatedComponents = [
        {
          pass: true,
          score: 1,
          reason: 'Weighted pass',
          assertion: {
            type: 'assert-set' as const,
            assert: [{ type: 'equals' as const, value: 'yes' }],
            weight: 9,
          },
          componentResults: [
            {
              pass: true,
              score: 1,
              reason: 'Nested weighted pass',
              assertion: { type: 'equals' as const, value: 'yes' },
            },
          ],
        },
        {
          pass: false,
          score: 0,
          reason: 'Weighted failure',
          assertion: { type: 'equals' as const, value: 'no', weight: 1 },
        },
      ];
      result.testCase = {
        ...result.testCase,
        threshold: 0.8,
        assert: automatedComponents.map(({ assertion }) => assertion),
      };
      result.gradingResult = {
        pass: false,
        score: 0,
        reason: 'Legacy manual failure',
        componentResults: [
          null,
          ...automatedComponents,
          {
            pass: false,
            score: 0,
            reason: 'Legacy manual failure',
            assertion: { type: 'human' },
          },
        ],
      } as unknown as NonNullable<typeof result.gradingResult>;
      result.success = false;
      result.score = 0;
      result.failureReason = ResultFailureReason.NONE;
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      Object.assign(prompt.metrics, {
        score: 0,
        testPassCount: 0,
        testFailCount: 2,
        testErrorCount: 0,
        assertPassCount: 1,
        assertFailCount: 3,
      });
      await eval_.save();

      const route = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      // Older clients clear using an unweighted mean and require every component to pass.
      const clearPayload = {
        pass: false,
        score: 0.5,
        componentResults: [null, ...automatedComponents],
        comment: '',
      };
      const clearResponse = await api.post(route).send(clearPayload);

      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body).toMatchObject({
        success: true,
        score: 0.9,
        failureReason: ResultFailureReason.NONE,
      });
      expect(clearResponse.body.gradingResult.componentResults).toEqual([
        null,
        ...automatedComponents,
      ]);
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toMatchObject({
        score: expect.closeTo(0.9, 10),
        testPassCount: 1,
        testFailCount: 1,
        testErrorCount: 0,
        assertPassCount: 1,
        assertFailCount: 2,
      });

      const restoredMetrics = structuredClone(
        (await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics,
      );
      for (const comment of ['!highlight', '', 'A', 'B', 'A']) {
        // The old UI ignores the clear response and retains its incorrect local outcome.
        const annotated = await api.post(route).send({ ...clearPayload, comment });
        expect(annotated.status).toBe(200);
        expect(annotated.body).toMatchObject({
          success: true,
          score: 0.9,
          failureReason: ResultFailureReason.NONE,
          gradingResult: { comment, componentResults: [null, ...automatedComponents] },
        });
        vi.mocked(updateSignalFile).mockClear();
        for (const retry of [
          { ...clearPayload, comment },
          { ...clearPayload, ratingAction: 'clear' },
        ]) {
          const repeated = await api.post(route).send(retry);
          expect(repeated.status).toBe(200);
          expect(repeated.body).toEqual(annotated.body);
        }
        expect(updateSignalFile).not.toHaveBeenCalled();
        expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
          restoredMetrics,
        );
      }
    });

    it('captures the custom-scored outcome at the first rating after the function is stripped', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      const automatedComponent = {
        pass: true,
        score: 1,
        reason: 'Standard component passed',
        assertion: { type: 'equals' as const, value: 'yes' },
      };
      const assertionsResult = new AssertionsResult();
      assertionsResult.addResult({ index: 0, result: automatedComponent });
      const customBaseline = await assertionsResult.testResult(() => ({
        pass: false,
        score: 0.25,
        reason: 'Custom aggregate failed',
      }));
      result.gradingResult = customBaseline;
      result.success = false;
      result.score = 0.25;
      result.failureReason = ResultFailureReason.ASSERT;
      result.error = 'Expected assertion failure';
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      prompt.metrics.score -= 0.75;
      prompt.metrics.testPassCount -= 1;
      prompt.metrics.testFailCount += 1;
      await eval_.save();
      const db = await getDb();
      const persistedBaseline = await db
        .select({ manualRatingState: evalResultsTable.manualRatingState })
        .from(evalResultsTable)
        .where(eq(evalResultsTable.id, result.id))
        .get();
      expect(persistedBaseline?.manualRatingState).toBeNull();
      const reloadedBaseline = await EvalResult.findById(result.id);
      invariant(reloadedBaseline, 'Reloaded custom baseline is required');

      const rateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...createManualRatingPayload(reloadedBaseline, true), ratingAction: 'rate' });
      expect(rateResponse.status).toBe(200);
      const manualResult = await EvalResult.findById(result.id);
      invariant(manualResult, 'Manual result is required');

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          ...createClearManualRatingPayload(manualResult),
          score: 999,
          ratingAction: 'clear',
        });

      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body).toMatchObject({
        success: false,
        score: 0.25,
        failureReason: ResultFailureReason.ASSERT,
      });
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toMatchObject({
        score: expect.closeTo(0.25, 10),
        testPassCount: 0,
        testFailCount: 2,
        testErrorCount: 0,
        assertPassCount: 1,
        assertFailCount: 1,
      });
    });

    it('fails closed when a pre-provenance rating retains an unexplained failure', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      invariant(result.gradingResult, 'Grading result is required');

      result.gradingResult = createManualRatingPayload(result, true);
      result.success = true;
      result.score = 1;
      result.failureReason = ResultFailureReason.NONE;
      result.error = 'Custom aggregate failed';
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      prompt.metrics.assertPassCount += 1;
      await eval_.save();

      const legacyRating = await EvalResult.findById(result.id);
      invariant(legacyRating, 'Legacy rating is required');
      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createClearManualRatingPayload(legacyRating));

      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ASSERT,
        error: 'Custom aggregate failed',
      });
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toMatchObject({
        score: 0,
        testPassCount: 0,
        testFailCount: 2,
        testErrorCount: 0,
        assertPassCount: 1,
        assertFailCount: 1,
      });
    });

    it.each([
      { providerError: 'response', manualPass: false, components: false },
      { providerError: 'response', manualPass: true, components: false },
      { providerError: 'exception', manualPass: false, components: false },
      { providerError: 'exception', manualPass: true, components: false },
      { providerError: 'timeout', manualPass: false, components: false },
      { providerError: 'timeout', manualPass: true, components: false },
      { providerError: false, manualPass: false, components: true },
      { providerError: false, manualPass: true, components: true },
      { providerError: false, manualPass: false, components: false },
      { providerError: false, manualPass: false, components: 'comparison' },
      { providerError: false, manualPass: true, components: 'comparison' },
    ])(
      'restores imported failure category (provider error $providerError, manual pass $manualPass, components $components)',
      async ({ providerError, manualPass, components }) => {
        const source = await EvalFactory.create();
        testEvalIds.add(source.id);
        const result = (await source.getResults())[1];
        invariant(result instanceof EvalResult && result.id, 'Result is required');
        const metrics = source.prompts[result.promptIdx].metrics;
        invariant(metrics, 'Prompt metrics are required');
        if (!components) {
          result.gradingResult = null;
          metrics.assertFailCount -= 1;
        }
        result.error =
          providerError === 'timeout'
            ? 'Evaluation timed out after 10ms: Error: Evaluation timed out after 10ms'
            : providerError
              ? 'Provider request failed'
              : 'Assertion failed';
        if (components === 'comparison') {
          result.gradingResult = {
            pass: false,
            score: 0,
            reason: result.error,
            componentResults: [
              { pass: false, score: 0, reason: result.error, assertion: { type: 'max-score' } },
            ],
          };
        }
        if (providerError) {
          // Thrown provider errors and per-test timeouts never produce a response object.
          result.response = providerError === 'response' ? { error: result.error } : undefined;
          await markResultAsError(source, result);
        } else {
          result.failureReason = ResultFailureReason.ASSERT;
          await result.save();
          await source.save();
        }
        if (!result.response) {
          await (await getDb())
            .update(evalResultsTable)
            .set({ response: null })
            .where(eq(evalResultsTable.id, result.id));
        }
        const originalMetrics = structuredClone(metrics);
        const expectedFailure = providerError
          ? ResultFailureReason.ERROR
          : ResultFailureReason.ASSERT;
        const submittedHuman = {
          pass: manualPass,
          score: Number(manualPass),
          assertion: { type: 'human' },
          metadata: {
            originalFailureReason: providerError
              ? ResultFailureReason.ASSERT
              : ResultFailureReason.ERROR,
            reviewerNote: 'Keep unrelated metadata',
          },
        };
        const rated = await api.post(`/api/eval/${source.id}/results/${result.id}/rating`).send({
          pass: manualPass,
          score: Number(manualPass),
          ratingAction: 'rate',
          componentResults: [submittedHuman],
        });
        expect(rated.status).toBe(200);
        expect(rated.body.failureReason).toBe(
          manualPass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
        );
        expect(
          rated.body.gradingResult.componentResults.find(
            (component: GradingResult) => component.assertion?.type === 'human',
          )?.metadata,
        ).toEqual({
          ...submittedHuman.metadata,
          originalFailureReason: expectedFailure,
        });

        const ratedEval = await Eval.findById(source.id);
        invariant(ratedEval, 'Rated eval is required');
        const exported = await ratedEval.toResultsFile();
        const imported = await api.post('/api/eval').send(
          JSON.parse(
            JSON.stringify({
              config: exported.config,
              prompts: exported.prompts,
              results: exported.results.results,
            }),
          ),
        );
        expect(imported.status).toBe(200);
        testEvalIds.add(imported.body.id);
        const importedEval = await Eval.findById(imported.body.id);
        invariant(importedEval, 'Imported eval is required');
        const importedResult = (await importedEval.getResults()).find(
          (row) => row.testIdx === result.testIdx,
        );
        invariant(importedResult?.id, 'Imported result is required');
        expect(importedResult.response).toEqual(result.response);
        const privateState = await (await getDb())
          .select({ state: evalResultsTable.manualRatingState })
          .from(evalResultsTable)
          .where(eq(evalResultsTable.id, importedResult.id))
          .get();
        expect(privateState?.state).toBeNull();

        const route = `/api/eval/${importedEval.id}/results/${importedResult.id}/rating`;
        for (const edit of [
          { ratingAction: 'rate', componentResults: [submittedHuman] },
          { ratingAction: 'rate' },
          { ratingAction: 'update', ratingUpdate: 'comment', comment: 'Still reviewed' },
          { ratingAction: 'update', ratingUpdate: 'score', score: 0.5 },
        ]) {
          const edited = await api
            .post(route)
            .send({ pass: manualPass, score: Number(manualPass), ...edit });
          expect(edited.status).toBe(200);
          expect(
            edited.body.gradingResult.componentResults.find(
              (component: GradingResult) => component.assertion?.type === 'human',
            )?.metadata?.originalFailureReason,
          ).toBe(expectedFailure);
        }
        const clearPayload = { pass: true, score: 1, ratingAction: 'clear' };
        const cleared = await api.post(route).send(clearPayload);
        expect(cleared.status).toBe(200);
        expect(cleared.body).toMatchObject({
          success: false,
          score: 0,
          failureReason: expectedFailure,
        });
        expect(await EvalResult.findById(importedResult.id)).toMatchObject({
          success: false,
          score: 0,
          failureReason: expectedFailure,
        });
        const saved = await Eval.findById(importedEval.id);
        invariant(saved, 'Saved eval is required');
        expect(saved.prompts[result.promptIdx].metrics).toEqual(originalMetrics);
        expect(
          (await saved.getFilteredMetrics({ filterMode: 'all' }))[result.promptIdx],
        ).toMatchObject({
          score: originalMetrics.score,
          testPassCount: originalMetrics.testPassCount,
          testFailCount: originalMetrics.testFailCount,
          testErrorCount: originalMetrics.testErrorCount,
          assertPassCount: originalMetrics.assertPassCount,
          assertFailCount: originalMetrics.assertFailCount,
        });
        expect(await getErrorResultIds(importedEval.id)).toEqual(
          providerError ? [importedResult.id] : [],
        );

        vi.mocked(updateSignalFile).mockClear();
        const repeated = await api.post(route).send(clearPayload);
        expect(repeated.status).toBe(200);
        expect(repeated.body).toEqual(cleared.body);
        expect(updateSignalFile).not.toHaveBeenCalled();
        expect((await Eval.findById(importedEval.id))?.prompts[result.promptIdx].metrics).toEqual(
          originalMetrics,
        );
      },
    );

    it('captures the latest category for a new rating after clearing', async () => {
      const source = await EvalFactory.create();
      testEvalIds.add(source.id);
      const [result] = await source.getResults();
      invariant(result.id, 'Result is required');
      const route = `/api/eval/${source.id}/results/${result.id}/rating`;
      await api.post(route).send({ pass: false, score: 0, ratingAction: 'rate' });
      await api.post(route).send({ pass: false, score: 0, ratingAction: 'clear' });
      const latest = await EvalResult.findById(result.id);
      invariant(latest, 'Saved result is required');
      latest.success = false;
      latest.score = 0;
      latest.failureReason = ResultFailureReason.ASSERT;
      latest.error = 'New automated failure';
      latest.gradingResult = { pass: false, score: 0, reason: latest.error, componentResults: [] };
      await latest.save();
      await source.save();
      const rated = await api.post(route).send({ pass: true, score: 1, ratingAction: 'rate' });
      expect(rated.status).toBe(200);
      expect(rated.body.gradingResult.componentResults).toMatchObject([
        { metadata: { originalFailureReason: ResultFailureReason.ASSERT } },
      ]);
      const cleared = await api.post(route).send({ pass: true, score: 1, ratingAction: 'clear' });
      expect(cleared.body).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ASSERT,
      });
      expect(cleared.body.gradingResult.componentResults).toEqual([]);
    });

    it.each([null, '2', 3])(
      'ignores an invalid imported human diagnostic: %s',
      async (originalFailureReason) => {
        const source = await EvalFactory.create();
        testEvalIds.add(source.id);
        const results = await source.getResults();
        const imported = await api.post('/api/eval').send({
          config: source.config,
          prompts: source.prompts,
          results: results.map((row) => ({
            ...(row as EvalResult).toEvaluateResult(),
            ...(row.testIdx === 1 && {
              failureReason: ResultFailureReason.ASSERT,
              error: 'Original assertion failure',
              gradingResult: {
                pass: false,
                score: 0,
                reason: 'Legacy manual failure',
                assertion: { type: 'human' },
                metadata: { originalFailureReason },
              },
            }),
          })),
        });
        expect(imported.status).toBe(200);
        testEvalIds.add(imported.body.id);
        const result = (await EvalResult.findManyByEvalId(imported.body.id)).find(
          (row) => row.testIdx === 1,
        );
        invariant(result, 'Imported result is required');
        const cleared = await api
          .post(`/api/eval/${imported.body.id}/results/${result.id}/rating`)
          .send({ pass: true, score: 1, ratingAction: 'clear' });
        expect(cleared.status).toBe(200);
        expect(cleared.body.failureReason).toBe(ResultFailureReason.ASSERT);
      },
    );

    it.each([
      { gradingError: false, comparisonPass: false, manualPass: false },
      { gradingError: false, comparisonPass: false, manualPass: true },
      { gradingError: false, comparisonPass: true, manualPass: false },
      { gradingError: false, comparisonPass: true, manualPass: true },
      { gradingError: true, comparisonPass: false, manualPass: false },
      { gradingError: true, comparisonPass: false, manualPass: true },
    ])(
      'restores an imported execution error (grading error $gradingError, comparison pass $comparisonPass, manual pass $manualPass)',
      async ({ gradingError, comparisonPass, manualPass }) => {
        const prompts = [
          { raw: 'First', label: 'First' },
          ...(gradingError ? [] : [{ raw: 'Second', label: 'Second' }]),
        ];
        const source = await Eval.create({}, prompts, { id: crypto.randomUUID() });
        testEvalIds.add(source.id);
        await evaluate(
          {
            prompts,
            providers: [
              {
                id: () => 'comparison-error',
                callApi: async (prompt) => {
                  if (!gradingError && prompt === 'First') {
                    throw new Error('Provider failed before producing a response');
                  }
                  return { output: 'Valid answer' };
                },
              },
            ],
            tests: [
              {
                assert: gradingError
                  ? [
                      {
                        type: 'llm-rubric',
                        value: 'Grade the answer',
                        provider: {
                          id: () => 'throwing-judge',
                          callApi: async () => {
                            throw new Error('Grading failed after a successful provider response');
                          },
                        },
                      },
                    ]
                  : [{ type: 'select-best', value: 'Choose the best answer' }],
                options: { provider: 'echo', rubricPrompt: comparisonPass ? '0' : '1' },
              },
            ],
          },
          source,
          { maxConcurrency: 1 },
        );
        const result = (await source.getResults()).find((row) => row.promptIdx === 0);
        invariant(result?.id, 'Result is required');
        expect(result).toMatchObject({
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
        });
        if (gradingError) {
          expect(result.response?.output).toBe('Valid answer');
          expect(result.gradingResult).toBeNull();
        } else {
          expect(result.response).toBeUndefined();
          expect(result.gradingResult?.componentResults).toHaveLength(1);
          expect(result.gradingResult?.componentResults?.[0]).toMatchObject({
            pass: comparisonPass,
            assertion: { type: 'select-best' },
          });
        }
        const originalMetrics = structuredClone(source.prompts[0].metrics);
        const rated = await api
          .post(`/api/eval/${source.id}/results/${result.id}/rating`)
          .send({ pass: manualPass, score: Number(manualPass), ratingAction: 'rate' });
        expect(rated.status).toBe(200);
        const ratedEval = await Eval.findById(source.id);
        invariant(ratedEval, 'Rated eval is required');
        const exported = await ratedEval.toResultsFile();
        const imported = await api.post('/api/eval').send({
          config: exported.config,
          prompts: exported.prompts,
          results: exported.results.results,
        });
        expect(imported.status).toBe(200);
        testEvalIds.add(imported.body.id);
        const importedResult = (await EvalResult.findManyByEvalId(imported.body.id)).find(
          (row) => row.promptIdx === 0,
        );
        invariant(importedResult, 'Imported result is required');
        for (let attempt = 0; attempt < 2; attempt++) {
          const cleared = await api
            .post(`/api/eval/${imported.body.id}/results/${importedResult.id}/rating`)
            .send({ pass: true, score: 1, ratingAction: 'clear' });
          expect(cleared.status).toBe(200);
          expect(cleared.body).toMatchObject({
            success: false,
            score: 0,
            failureReason: ResultFailureReason.ERROR,
          });
          expect(cleared.body.gradingResult.componentResults).toHaveLength(gradingError ? 0 : 1);
          if (!gradingError) {
            expect(cleared.body.gradingResult.componentResults[0]).toMatchObject({
              pass: comparisonPass,
              assertion: { type: 'select-best' },
            });
          }
          const saved = await Eval.findById(imported.body.id);
          invariant(saved, 'Saved eval is required');
          expect(saved.prompts[0].metrics).toEqual(originalMetrics);
          expect((await saved.getFilteredMetrics({ filterMode: 'all' }))[0]).toMatchObject({
            score: 0,
            testPassCount: 0,
            testFailCount: 0,
            testErrorCount: 1,
            assertPassCount: gradingError ? 0 : Number(comparisonPass),
            assertFailCount: gradingError ? 0 : Number(!comparisonPass),
          });
          expect(await getErrorResultIds(imported.body.id)).toEqual([importedResult.id]);
        }
      },
    );

    it('fails closed on caller aggregate fields when a legacy error has no components', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      result.gradingResult = null;
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      prompt.metrics.assertFailCount -= 1;
      await eval_.save();
      await markResultAsError(eval_, result);
      // Rows created before failure_reason was added retained execution errors only here.
      result.failureReason = ResultFailureReason.NONE;
      result.error = 'Legacy provider exception';
      await result.save();
      const errorMetrics = structuredClone(prompt.metrics);

      result.gradingResult = {
        pass: true,
        score: 1,
        reason: 'Legacy manual pass',
        componentResults: [
          {
            pass: true,
            score: 1,
            reason: 'Legacy manual pass',
            assertion: { type: 'human' },
          },
        ],
      };
      result.success = true;
      result.score = 1;
      await result.save();
      prompt.metrics.score += 1;
      prompt.metrics.testErrorCount -= 1;
      prompt.metrics.testPassCount += 1;
      prompt.metrics.assertPassCount += 1;
      await eval_.save();

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: true, score: 31_337, componentResults: [] });

      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ERROR,
        gradingResult: { pass: false, score: 0, componentResults: [] },
      });
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        errorMetrics,
      );
    });

    it.each([
      { label: 'weighted-score overflow', score: 1, threshold: undefined, guardrail: false },
      { label: 'threshold zero', score: 1, threshold: 0, guardrail: false },
      { label: 'redteam guardrail override', score: 1, threshold: undefined, guardrail: true },
      {
        label: 'denominator overflow with a finite quotient',
        score: 0,
        threshold: 0,
        guardrail: false,
      },
    ])(
      'rejects non-finite legacy reconstruction: $label',
      async ({ score, threshold, guardrail }) => {
        const eval_ = await EvalFactory.create();
        testEvalIds.add(eval_.id);
        const [result] = await eval_.getResults();
        invariant(result instanceof EvalResult && result.id, 'Result is required');
        const automatedComponents = [
          ...Array.from({ length: 2 }, () => ({
            pass: true,
            score,
            reason: 'Weighted pass',
            assertion: { type: 'equals' as const, value: 'yes', weight: Number.MAX_VALUE },
          })),
          {
            pass: false,
            score: 0,
            reason: 'Failed assertion',
            assertion: guardrail
              ? { type: 'guardrails' as const, config: { purpose: 'redteam' }, weight: 1 }
              : { type: 'equals' as const, value: 'no', weight: 1 },
          },
        ];
        result.testCase = { ...result.testCase, threshold };
        result.gradingResult = {
          pass: true,
          score: 1,
          reason: 'Imported manual pass',
          componentResults: [
            ...automatedComponents,
            { pass: true, score: 1, reason: 'Manual pass', assertion: { type: 'human' } },
          ],
        };
        await result.save();
        const metrics = eval_.prompts[result.promptIdx].metrics;
        invariant(metrics, 'Prompt metrics are required');
        Object.assign(metrics, { assertPassCount: 3, assertFailCount: 2 });
        await eval_.save();

        const response = await api
          .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
          .send({ pass: true, score: 1, ratingAction: 'clear' });
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ASSERT,
        });
        expect((await EvalResult.findById(result.id))?.score).toBe(0);
        expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toMatchObject({
          score: 0,
          testPassCount: 0,
          testFailCount: 2,
          assertPassCount: 2,
          assertFailCount: 2,
        });
      },
    );

    it('fails closed when clearing an unmarked legacy comparison result', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      const automatedComponents = [
        {
          pass: true,
          score: 1,
          reason: 'Ordinary assertion passed',
          assertion: { type: 'equals' as const, value: 'yes' },
        },
        {
          pass: false,
          score: 0,
          reason: 'Max-score comparison failed',
          assertion: { type: 'max-score' as const, value: 'metric' },
        },
      ];
      result.gradingResult = {
        pass: true,
        score: 1,
        reason: 'Legacy manual pass',
        componentResults: [
          ...automatedComponents,
          {
            pass: true,
            score: 1,
            reason: 'Legacy manual pass',
            assertion: { type: 'human' },
          },
        ],
      };
      result.success = true;
      result.score = 1;
      result.failureReason = ResultFailureReason.ASSERT;
      result.error = 'Max-score comparison failed';
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      Object.assign(prompt.metrics, {
        score: 1,
        testPassCount: 1,
        testFailCount: 1,
        testErrorCount: 0,
        assertPassCount: 2,
        assertFailCount: 2,
      });
      await eval_.save();

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: true, score: 999, componentResults: automatedComponents });

      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ASSERT,
      });
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toMatchObject({
        score: 0,
        testPassCount: 0,
        testFailCount: 2,
        testErrorCount: 0,
        assertPassCount: 1,
        assertFailCount: 2,
      });
    });

    it.each<{
      label: string;
      comparisons: { type: 'max-score' | 'select-best'; pass: boolean; score: number }[];
      ordinary?: { pass: boolean; score: number; weight?: number; guardrail?: boolean }[];
      threshold?: number;
      expectedPass: boolean;
      expectedScore: number;
    }>([
      ...(['max-score', 'select-best'] as const).flatMap((type) => [
        ...([undefined, 0] as const).map((threshold) => ({
          label: `${type} failure with threshold ${threshold}`,
          comparisons: [{ type, pass: false, score: 0 }],
          ordinary: [{ pass: true, score: 1 }],
          threshold,
          expectedPass: false,
          expectedScore: 0,
        })),
        {
          label: `${type} winner with ordinary failure`,
          comparisons: [{ type, pass: true, score: 1 }],
          ordinary: [{ pass: false, score: 0.4 }],
          expectedPass: false,
          expectedScore: 0.4,
        },
      ]),
      {
        label: 'winner preserves weighted threshold score',
        comparisons: [{ type: 'max-score', pass: true, score: 1 }],
        ordinary: [
          { pass: true, score: 1, weight: 9 },
          { pass: false, score: 0 },
        ],
        threshold: 0.8,
        expectedPass: true,
        expectedScore: 0.9,
      },
      {
        label: 'winner preserves threshold zero pass',
        comparisons: [{ type: 'select-best', pass: true, score: 1 }],
        ordinary: [{ pass: false, score: 0 }],
        threshold: 0,
        expectedPass: true,
        expectedScore: 0,
      },
      {
        label: 'winner preserves redteam guardrail pass',
        comparisons: [{ type: 'select-best', pass: true, score: 1 }],
        ordinary: [{ pass: false, score: 0, guardrail: true }],
        expectedPass: true,
        expectedScore: 0,
      },
      {
        label: 'failed comparison vetoes redteam guardrail pass',
        comparisons: [{ type: 'select-best', pass: false, score: 0 }],
        ordinary: [{ pass: false, score: 0, guardrail: true }],
        expectedPass: false,
        expectedScore: 0,
      },
      {
        label: 'comparison-only winner preserves empty aggregate score',
        comparisons: [{ type: 'select-best', pass: true, score: 1 }],
        expectedPass: true,
        expectedScore: 0,
      },
      {
        label: 'comparison-only winner preserves failed threshold',
        comparisons: [{ type: 'select-best', pass: true, score: 1 }],
        threshold: 0.5,
        expectedPass: false,
        expectedScore: 0,
      },
      {
        label: 'later winner preserves earlier comparison failure',
        comparisons: [
          { type: 'select-best', pass: false, score: 0 },
          { type: 'max-score', pass: true, score: 1 },
        ],
        ordinary: [{ pass: true, score: 0.7 }],
        expectedPass: false,
        expectedScore: 0,
      },
      {
        label: 'last failed comparison replaces the score',
        comparisons: [
          { type: 'select-best', pass: false, score: 0.25 },
          { type: 'max-score', pass: false, score: 0.5 },
        ],
        ordinary: [{ pass: true, score: 0.7 }],
        expectedPass: false,
        expectedScore: 0.5,
      },
      {
        label: 'winner cannot restore an overflowing ordinary aggregate',
        comparisons: [{ type: 'select-best', pass: true, score: 1 }],
        ordinary: [
          { pass: true, score: 1, weight: Number.MAX_VALUE },
          { pass: true, score: 1, weight: Number.MAX_VALUE },
        ],
        threshold: 0,
        expectedPass: false,
        expectedScore: 0,
      },
    ])(
      'restores imported comparison outcome: $label',
      async ({ comparisons, ordinary = [], threshold, expectedPass, expectedScore }) => {
        const sourceEval = await EvalFactory.create();
        testEvalIds.add(sourceEval.id);
        const [result] = await sourceEval.getResults();
        invariant(result instanceof EvalResult && result.id, 'Result is required');
        const automatedComponents = [
          ...ordinary.map(({ pass, score, weight = 1, guardrail }) => ({
            pass,
            score,
            reason: pass ? 'Ordinary pass' : 'Ordinary failure',
            assertion: guardrail
              ? { type: 'guardrails' as const, config: { purpose: 'redteam' }, weight }
              : { type: 'equals' as const, value: 'yes', weight },
          })),
          ...comparisons.map(({ type, pass, score }) => ({
            pass,
            score,
            reason: pass ? 'Comparison passed' : 'Comparison failed',
            assertion: { type, value: 'metric' },
          })),
        ];
        result.testCase = {
          ...result.testCase,
          threshold,
          assert: automatedComponents.map(({ assertion }) => assertion),
        };
        result.success = expectedPass;
        result.score = expectedScore;
        result.failureReason = expectedPass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT;
        result.error = expectedPass ? undefined : 'Automated failure';
        result.gradingResult = {
          pass: expectedPass,
          score: expectedScore,
          reason: result.error ?? 'Automated pass',
          componentResults: automatedComponents,
        };
        await result.save();
        const metrics = sourceEval.prompts[result.promptIdx].metrics;
        invariant(metrics, 'Prompt metrics are required');
        Object.assign(metrics, {
          score: expectedScore,
          testPassCount: expectedPass ? 1 : 0,
          testFailCount: expectedPass ? 1 : 2,
          assertPassCount: automatedComponents.filter((component) => component.pass).length,
          assertFailCount: automatedComponents.filter((component) => !component.pass).length + 1,
        });
        await sourceEval.save();

        const rated = await api
          .post(`/api/eval/${sourceEval.id}/results/${result.id}/rating`)
          .send({ pass: true, score: 1, ratingAction: 'rate' });
        expect(rated.status).toBe(200);
        expect(rated.body.failureReason).toBe(ResultFailureReason.NONE);
        const ratedEval = await Eval.findById(sourceEval.id);
        invariant(ratedEval, 'Rated eval is required');
        const exported = await ratedEval.toResultsFile();
        const payload = JSON.parse(
          JSON.stringify({
            config: exported.config,
            prompts: exported.prompts,
            results: exported.results.results,
          }),
        );
        expect(payload.results[result.testIdx]).not.toHaveProperty('manualRatingState');
        const imported = await api.post('/api/eval').send(payload);
        expect(imported.status).toBe(200);
        testEvalIds.add(imported.body.id);
        const importedEval = await Eval.findById(imported.body.id);
        invariant(importedEval, 'Imported eval is required');
        const importedResult = (await importedEval.getResults()).find(
          (item) => item.testIdx === result.testIdx,
        );
        invariant(importedResult?.id, 'Imported result is required');
        expect(importedResult.failureReason).toBe(ResultFailureReason.NONE);
        const dbRow = await (await getDb())
          .select({ state: evalResultsTable.manualRatingState })
          .from(evalResultsTable)
          .where(eq(evalResultsTable.id, importedResult.id))
          .get();
        expect(dbRow?.state).toBeNull();

        const cleared = await api
          .post(`/api/eval/${importedEval.id}/results/${importedResult.id}/rating`)
          .send({ pass: true, score: 1, ratingAction: 'clear' });
        expect(cleared.status).toBe(200);
        expect(cleared.body).toMatchObject({
          success: expectedPass,
          score: expectedScore,
          failureReason: expectedPass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
        });
        expect(cleared.body.gradingResult.componentResults).toEqual(automatedComponents);
        expect(
          (await Eval.findById(importedEval.id))?.prompts[result.promptIdx].metrics,
        ).toMatchObject(metrics);
      },
    );

    it('discards caller-supplied automated components when no server baseline exists', async () => {
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
      const baselineMetrics = structuredClone(prompt.metrics);

      const rateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          pass: true,
          score: 1,
          ratingAction: 'rate',
          metadata: {
            __promptfooNonstandardScoringBaseline: { pass: false, score: 31_337 },
          },
          componentResults: [
            { pass: true, score: 1, assertion: { type: 'equals', value: 'forged-1' } },
            { pass: true, score: 1, assertion: { type: 'equals', value: 'forged-2' } },
            { pass: false, score: 0, assertion: { type: 'equals', value: 'forged-3' } },
          ],
        });

      expect(rateResponse.status).toBe(200);
      expect(rateResponse.body.gradingResult.componentResults).toEqual([
        expect.objectContaining({ pass: true, score: 1, assertion: { type: 'human' } }),
      ]);
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toMatchObject({
        ...baselineMetrics,
        assertPassCount: baselineMetrics.assertPassCount + 1,
      });
      const manualResult = await EvalResult.findById(result.id);
      invariant(manualResult, 'Manual result is required');
      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...createClearManualRatingPayload(manualResult), ratingAction: 'clear' });
      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body).toMatchObject({ success: true, score: 1 });
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        baselineMetrics,
      );
    });

    it('derives a consistent failure category after updating a pre-provenance rating', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const results = await eval_.getResults();
      const result = results[1];
      invariant(result instanceof EvalResult, 'EvalResult is required');
      invariant(result.id, 'Result ID is required');
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);

      // Emulate an imported manual pass written before private rating provenance existed.
      result.gradingResult = createManualRatingPayload(result, true);
      result.success = true;
      result.score = 1;
      result.failureReason = ResultFailureReason.NONE;
      await result.save();
      const prompt = eval_.prompts[result.promptIdx];
      invariant(prompt.metrics, 'Prompt metrics are required');
      prompt.metrics.score += 1;
      prompt.metrics.testFailCount -= 1;
      prompt.metrics.testPassCount += 1;
      prompt.metrics.assertPassCount += 1;
      await eval_.save();

      const legacyRating = await EvalResult.findById(result.id);
      invariant(legacyRating?.gradingResult, 'Legacy rating is required');
      const updateResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          ...legacyRating.gradingResult,
          comment: 'Updated before clear',
          metadata: {
            __promptfooNonstandardScoringBaseline: { pass: false, score: 4_242 },
          },
        });
      expect(updateResponse.status).toBe(200);

      const updatedRating = await EvalResult.findById(result.id);
      invariant(updatedRating, 'Updated legacy rating is required');
      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send(createClearManualRatingPayload(updatedRating));

      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ASSERT,
      });
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        originalMetrics,
      );
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
      clearPayload.tokensUsed = { total: 999 };

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...clearPayload, ratingAction: 'clear' });

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

    it('does not resurrect a cleared rating when updating a null grading result', async () => {
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
        .send({ pass: false, score: 0, ratingAction: 'rate' });
      expect(rateResponse.status).toBe(200);
      const manualResult = await EvalResult.findById(result.id);
      invariant(manualResult, 'Manual result is required');
      const staleManualPayload = structuredClone(manualResult.gradingResult);

      const clearResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ ...createClearManualRatingPayload(manualResult), ratingAction: 'clear' });
      expect(clearResponse.status).toBe(200);
      expect((await EvalResult.findById(result.id))?.gradingResult).toBeNull();

      const commentResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          ...staleManualPayload,
          comment: 'Stale tab comment',
          ratingAction: 'update',
          ratingUpdate: 'comment',
        });
      expect(commentResponse.status).toBe(200);
      expect(commentResponse.body).toMatchObject({ success: true, score: 1 });
      expect(commentResponse.body.gradingResult).toEqual({
        pass: true,
        score: 1,
        comment: 'Stale tab comment',
      });

      const scoreResponse = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({
          ...staleManualPayload,
          score: 0.25,
          ratingAction: 'update',
          ratingUpdate: 'score',
        });
      expect(scoreResponse.status).toBe(200);
      expect(scoreResponse.body.gradingResult).toEqual({
        pass: true,
        score: 0.25,
        comment: 'Stale tab comment',
      });
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toMatchObject({
        ...originalMetrics,
        score: originalMetrics.score - 0.75,
      });
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

    it.each(['Reviewer note', '!highlight Reviewer note'])(
      'preserves an annotation when clearing an originally ungraded error: %s',
      async (comment) => {
        const eval_ = await EvalFactory.create();
        testEvalIds.add(eval_.id);
        const results = await eval_.getResults();
        const result = results[1];
        invariant(result instanceof EvalResult && result.id, 'Result is required');
        await markResultAsError(eval_, result);
        result.gradingResult = null;
        await result.save();
        const metrics = eval_.prompts[result.promptIdx].metrics;
        invariant(metrics, 'Metrics are required');
        metrics.assertFailCount -= 1;
        await eval_.save();
        const baselineMetrics = structuredClone(metrics);
        const endpoint = `/api/eval/${eval_.id}/results/${result.id}/rating`;
        expect(
          (await api.post(endpoint).send({ pass: true, score: 1, ratingAction: 'rate' })).status,
        ).toBe(200);
        expect(
          (
            await api.post(endpoint).send({
              pass: true,
              score: 1,
              ratingAction: 'update',
              ratingUpdate: 'comment',
              comment,
            })
          ).status,
        ).toBe(200);
        const cleared = await api
          .post(endpoint)
          .send({ pass: true, score: 1, ratingAction: 'clear' });
        expect(cleared.status).toBe(200);
        expect(cleared.body).toMatchObject({
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
        });
        expect(cleared.body.gradingResult).toEqual({ pass: false, score: 0, reason: '', comment });
        expect((await EvalResult.findById(result.id))?.gradingResult?.comment).toBe(comment);
        expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
          baselineMetrics,
        );
        const repeated = await api
          .post(endpoint)
          .send({ pass: true, score: 1, ratingAction: 'clear' });
        expect(repeated.body.gradingResult.comment).toBe(comment);
      },
    );

    it('removes an omitted comment in an explicit comment update without changing metrics', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result is required');
      const endpoint = `/api/eval/${eval_.id}/results/${result.id}/rating`;
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      await api.post(endpoint).send({
        pass: true,
        score: 1,
        ratingAction: 'update',
        ratingUpdate: 'comment',
        comment: 'Remove this note',
      });
      const response = await api
        .post(endpoint)
        .send({ pass: true, score: 1, ratingAction: 'update', ratingUpdate: 'comment' });
      expect(response.status).toBe(200);
      expect(response.body.gradingResult).not.toHaveProperty('comment');
      expect((await EvalResult.findById(result.id))?.gradingResult).not.toHaveProperty('comment');
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        originalMetrics,
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
      expect(rateResponse.body).not.toHaveProperty('manualRatingState');
      expect(rateResponse.body.metadata?.__promptfoo?.manualRating).toBeUndefined();

      const storedRatingState = await (await getDb())
        .select({ manualRatingState: evalResultsTable.manualRatingState })
        .from(evalResultsTable)
        .where(eq(evalResultsTable.id, result.id))
        .get();
      expect(storedRatingState?.manualRatingState).toMatchObject({
        version: 1,
        status: 'active',
      });

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

    it('ignores pre-existing metadata that collides with manual-rating provenance', async () => {
      const eval_ = await EvalFactory.create();
      testEvalIds.add(eval_.id);
      const [result] = await eval_.getResults();
      invariant(result.id, 'Result ID is required');
      const originalResult = {
        success: result.success,
        score: result.score,
        failureReason: result.failureReason,
        gradingResult: structuredClone(result.gradingResult),
      };
      const originalMetrics = structuredClone(eval_.prompts[result.promptIdx].metrics);
      const db = await getDb();
      await db
        .update(evalResultsTable)
        .set({
          metadata: {
            __promptfoo: {
              manualRating: {
                version: 1,
                status: 'active',
                original: {
                  success: false,
                  score: 0.123,
                  failureReason: ResultFailureReason.ASSERT,
                  gradingResult: null,
                },
              },
            },
          } as unknown as Record<string, string>,
        })
        .where(eq(evalResultsTable.id, result.id));
      vi.mocked(updateSignalFile).mockClear();

      const response = await api
        .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
        .send({ pass: false, score: 0, ratingAction: 'clear' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(originalResult);
      const persistedResult = await EvalResult.findById(result.id);
      expect(persistedResult).toMatchObject(originalResult);
      expect((await Eval.findById(eval_.id))?.prompts[result.promptIdx].metrics).toEqual(
        originalMetrics,
      );
      expect(updateSignalFile).not.toHaveBeenCalled();
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
