import { randomUUID } from 'crypto';

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { ResultFailureReason } from '../../src/types/index';
import {
  createCompletedPrompt,
  createEvaluateResult,
  createPromptMetrics,
} from '../factories/eval';

import type { GradingResult } from '../../src/types/index';

describe('prompt metrics after live manual ratings', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  it.each([
    { rated: false, compared: false },
    { rated: true, compared: false },
    { rated: false, compared: true },
    { rated: true, compared: true },
  ])(
    'retains unpersisted failures (rated: $rated, compared: $compared)',
    async ({ rated, compared }) => {
      const passing: GradingResult = {
        pass: true,
        score: 0.6,
        reason: 'Custom passing score',
        componentResults: [
          { pass: true, score: 1, reason: 'Match', assertion: { type: 'equals' } },
        ],
      };
      const prompts = [
        createCompletedPrompt('recovery', {
          metrics: createPromptMetrics({
            score: 0.8,
            testPassCount: 1,
            testFailCount: 1,
            testErrorCount: 1,
            assertPassCount: compared ? 2 : 1,
            assertFailCount: 1,
            totalLatencyMs: 300,
          }),
        }),
      ];
      const evalRecord = await Eval.create({}, prompts, { id: randomUUID() });
      await evalRecord.addPrompts(prompts);
      await evalRecord.addResult(createEvaluateResult({ score: 0.6, gradingResult: passing }));
      const [persisted] = await EvalResult.findManyByEvalId(evalRecord.id);
      await EvalResult.submitRating(
        evalRecord.id,
        persisted.id,
        { pass: true, score: 1, reason: 'Manual pass' },
        'rate',
      );
      if (!rated) {
        // Cleared rating history must still trigger canonical reconciliation.
        await EvalResult.submitRating(
          evalRecord.id,
          persisted.id,
          { pass: true, score: 1, reason: 'Clear manual pass' },
          'clear',
        );
      }
      const originalPass = compared;
      const failed = createEvaluateResult({
        testIdx: 1,
        success: originalPass,
        score: originalPass ? 1 : 0.2,
        failureReason: originalPass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
        gradingResult: {
          pass: originalPass,
          score: originalPass ? 1 : 0.2,
          reason: 'Original assertion',
          componentResults: [
            {
              pass: originalPass,
              score: originalPass ? 1 : 0.2,
              reason: 'Original assertion',
              assertion: { type: 'equals' },
            },
          ],
        },
      });
      evalRecord.recordResultPersistenceFailure(failed);
      evalRecord.recordResultPersistenceFailure(
        createEvaluateResult({
          testIdx: 2,
          success: false,
          score: 0,
          failureReason: ResultFailureReason.ERROR,
          error: 'Provider failed',
          gradingResult: null,
        }),
      );
      if (compared) {
        // Comparison passes mutate the cached reconstruction, not the original failed row.
        const [latest] = await evalRecord.getFailedResultsByTestIdx(1);
        latest.success = latest.gradingResult!.pass = false;
        latest.score = latest.gradingResult!.score = 0.2;
        latest.failureReason = ResultFailureReason.ASSERT;
        latest.gradingResult!.componentResults!.push({
          pass: false,
          score: 0.2,
          reason: 'Lost comparison',
          assertion: { type: 'max-score' },
        });
      }
      const expected = {
        score: rated ? 1.2 : 0.8,
        testPassCount: 1,
        testFailCount: 1,
        testErrorCount: 1,
        assertPassCount: 1 + Number(compared) + Number(rated),
        assertFailCount: 1,
        totalLatencyMs: 300,
      };
      await evalRecord.addPrompts(prompts);
      expect(evalRecord.prompts[0].metrics).toMatchObject(expected);
      expect(evalRecord.getStats()).toMatchObject({ successes: 1, failures: 1, errors: 1 });
      await evalRecord.save();
      expect((await Eval.findById(evalRecord.id))?.prompts[0].metrics).toMatchObject(expected);
      if (rated) {
        await EvalResult.submitRating(
          evalRecord.id,
          persisted.id,
          { pass: true, score: 1, reason: 'Clear manual pass' },
          'clear',
        );
        await evalRecord.save();
        expect(evalRecord.prompts[0].metrics).toMatchObject({
          ...expected,
          score: 0.8,
          assertPassCount: 1 + Number(compared),
        });
      }

      // A later successful write for the same key owns the outcome; the retained fallback
      // must not count twice or override the now-persisted recovery result.
      await evalRecord.addResult(
        createEvaluateResult({
          testIdx: 1,
          score: 0.9,
          gradingResult: {
            pass: true,
            score: 0.9,
            reason: 'Recovered',
            componentResults: [
              { pass: true, score: 0.9, reason: 'Recovered', assertion: { type: 'equals' } },
            ],
          },
        }),
      );
      await evalRecord.save();
      expect(evalRecord.prompts[0].metrics).toMatchObject({
        score: 1.5,
        testPassCount: 2,
        testFailCount: 0,
        testErrorCount: 1,
        assertPassCount: 2,
        assertFailCount: 0,
      });
    },
  );

  it('retains each incoming prompt snapshot when prompt flushes overlap', async () => {
    const initial = [createCompletedPrompt('initial')];
    const evalRecord = await Eval.create({}, initial, { id: randomUUID() });
    const first = [createCompletedPrompt('first flush')];
    const latest = [createCompletedPrompt('latest flush'), createCompletedPrompt('new column')];
    const db = await getDb();
    const transaction = db.transaction.bind(db);
    let release!: () => void;
    let entered!: () => void;
    const paused = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hold = true;
    const spy = vi.spyOn(db, 'transaction').mockImplementation((callback, config) =>
      transaction(async (tx) => {
        const result = await callback(tx);
        if (hold) {
          hold = false;
          entered();
          await gate;
        }
        return result;
      }, config),
    );
    try {
      const firstFlush = evalRecord.addPrompts(first);
      await paused;
      const latestFlush = evalRecord.addPrompts(latest);
      release();
      await Promise.all([firstFlush, latestFlush]);
      expect(evalRecord.prompts).toEqual(latest);
      expect((await Eval.findById(evalRecord.id))?.prompts).toEqual(latest);
    } finally {
      release();
      spy.mockRestore();
    }
  });

  for (const method of ['addPrompts', 'save'] as const) {
    it.each([true, false])(
      `${method} serializes an overlapping rating (rating first: %s)`,
      async (ratingFirst) => {
        const prompts = [createCompletedPrompt()];
        const evalRecord = await Eval.create({}, prompts, { id: randomUUID() });
        await evalRecord.addPrompts(prompts);
        await evalRecord.addResult(createEvaluateResult({ gradingResult: null }));
        const [result] = await EvalResult.findManyByEvalId(evalRecord.id);
        const rate = () =>
          EvalResult.submitRating(
            evalRecord.id,
            result.id,
            { pass: false, score: 0, reason: 'Manual fail' },
            'rate',
          );
        const flush = () =>
          method === 'addPrompts' ? evalRecord.addPrompts(prompts) : evalRecord.save();
        await Promise.all(ratingFirst ? [rate(), flush()] : [flush(), rate()]);
        expect((await Eval.findById(evalRecord.id))?.prompts[0].metrics).toMatchObject({
          score: 0,
          testPassCount: 0,
          testFailCount: 1,
          testErrorCount: 0,
          assertPassCount: 0,
          assertFailCount: 1,
        });
      },
    );

    it.each(['pass', 'fail', 'error'] as const)(
      `${method} preserves canonical rating counters for a %s result`,
      async (outcome) => {
        const success = outcome === 'pass';
        const failureReason = success
          ? ResultFailureReason.NONE
          : outcome === 'error'
            ? ResultFailureReason.ERROR
            : ResultFailureReason.ASSERT;
        const originalMetrics = createPromptMetrics({
          score: Number(success),
          testPassCount: Number(success),
          testFailCount: Number(outcome === 'fail'),
          testErrorCount: Number(outcome === 'error'),
          assertFailCount: Number(outcome === 'fail'),
          totalLatencyMs: 123,
          cost: 0.4,
          namedScores: { retained: 0.7 },
          namedScoresCount: { retained: 1 },
        });
        const evaluatorPrompts = [
          createCompletedPrompt('rated', { metrics: originalMetrics }),
          createCompletedPrompt('untouched import', {
            metrics: createPromptMetrics({ score: 42, testPassCount: 42 }),
          }),
          createCompletedPrompt('missing metrics', { metrics: undefined }),
        ];
        const evalRecord = await Eval.create({}, evaluatorPrompts, { id: randomUUID() });
        await evalRecord.addPrompts(evaluatorPrompts);
        await evalRecord.addResult(
          createEvaluateResult({
            success,
            score: Number(success),
            failureReason,
            error: outcome === 'error' ? 'Provider failed' : null,
            gradingResult:
              outcome === 'fail'
                ? {
                    pass: false,
                    score: 0,
                    reason: 'Automated failure',
                    componentResults: [
                      { pass: false, score: 0, reason: 'Mismatch', assertion: { type: 'equals' } },
                    ],
                  }
                : null,
          }),
        );
        const [result] = await EvalResult.findManyByEvalId(evalRecord.id);
        await EvalResult.submitRating(
          evalRecord.id,
          result.id,
          { pass: true, score: 1, reason: 'Manual pass' },
          'rate',
        );
        const flush = async () => {
          if (method === 'addPrompts') {
            await evalRecord.addPrompts(evaluatorPrompts);
          } else {
            evalRecord.prompts = evaluatorPrompts;
            await evalRecord.save();
          }
        };
        await flush();
        const ratedMetrics = {
          ...originalMetrics,
          score: 1,
          testPassCount: 1,
          testFailCount: 0,
          testErrorCount: 0,
          assertPassCount: 1,
        };
        expect((await Eval.findById(evalRecord.id))?.prompts[0].metrics).toEqual(ratedMetrics);
        expect(evalRecord.prompts[0].metrics).toEqual(ratedMetrics);
        expect(evaluatorPrompts[0].metrics).toEqual(originalMetrics);
        expect(evalRecord.prompts.slice(1)).toEqual(evaluatorPrompts.slice(1));

        await EvalResult.submitRating(
          evalRecord.id,
          result.id,
          { pass: true, score: 1, reason: 'Clear' },
          'clear',
        );
        expect((await Eval.findById(evalRecord.id))?.prompts[0].metrics).toEqual(originalMetrics);

        // Cleared history still protects later score edits from stale evaluator snapshots.
        await EvalResult.submitRating(
          evalRecord.id,
          result.id,
          { pass: !success, score: 0.35, reason: 'Score edit' },
          'update',
          'score',
        );
        await flush();
        expect((await Eval.findById(evalRecord.id))?.prompts[0].metrics).toEqual({
          ...originalMetrics,
          score: 0.35,
        });
        expect(evaluatorPrompts[0].metrics).toEqual(originalMetrics);
      },
    );
  }

  describe.each(['clear', 'rate'] as const)('%s a legacy top-level human rating', (action) => {
    it.each([undefined, null, 0, 1, 'false', 'true', false, true])(
      'keeps assertion deltas consistent with canonical counts for pass=%s',
      async (pass) => {
        const prompts = [createCompletedPrompt()];
        const evalRecord = await Eval.create({}, prompts, { id: randomUUID() });
        await evalRecord.addPrompts(prompts);
        await evalRecord.addResult(createEvaluateResult({ gradingResult: null }));
        await evalRecord.addResult(
          createEvaluateResult({
            testIdx: 1,
            success: false,
            score: 0,
            failureReason: ResultFailureReason.ASSERT,
            gradingResult: {
              ...(pass === undefined ? {} : { pass }),
              score: 0,
              reason: 'Imported rating',
              assertion: { type: 'human' },
            } as GradingResult,
          }),
        );
        const rows = await EvalResult.findManyByEvalId(evalRecord.id);
        const sibling = rows.find((row) => row.testIdx === 0)!;
        const legacy = rows.find((row) => row.testIdx === 1)!;
        // An unrelated rating makes the next prompt flush recount this column from SQL.
        for (const siblingAction of ['rate', 'clear'] as const) {
          await EvalResult.submitRating(
            evalRecord.id,
            sibling.id,
            { pass: true, score: 1, reason: 'Sibling rating' },
            siblingAction,
          );
        }
        await evalRecord.save();
        expect(evalRecord.prompts[0].metrics).toMatchObject({
          assertPassCount: Number(pass === true),
          assertFailCount: Number(pass === false),
        });

        await EvalResult.submitRating(
          evalRecord.id,
          legacy.id,
          { pass: false, score: 0, reason: 'Updated rating' },
          action,
        );
        const expected = { assertPassCount: 0, assertFailCount: Number(action === 'rate') };
        expect((await Eval.findById(evalRecord.id))?.prompts[0].metrics).toMatchObject(expected);
        await evalRecord.save();
        expect(evalRecord.prompts[0].metrics).toMatchObject(expected);
      },
    );
  });

  it('counts legacy and malformed grading components without duplicating top-level humans', async () => {
    const prompts = [createCompletedPrompt()];
    const evalRecord = await Eval.create({}, prompts, { id: randomUUID() });
    await evalRecord.addPrompts(prompts);
    await evalRecord.addResult(createEvaluateResult({ gradingResult: null }));
    const [rated] = await EvalResult.findManyByEvalId(evalRecord.id);
    await EvalResult.submitRating(
      evalRecord.id,
      rated.id,
      { pass: true, score: 1, reason: 'Manual pass' },
      'rate',
    );
    const legacy = [
      {
        pass: true,
        score: 1,
        reason: 'Legacy pass',
        assertion: { type: 'human' },
        componentResults: [null, 42, 'invalid', { pass: 'false' }],
      },
      {
        pass: false,
        score: 0,
        reason: 'Legacy fail',
        assertion: { type: 'human' },
        componentResults: [
          { pass: false, score: 0, assertion: { type: 'human' } },
          { pass: true, score: 1, assertion: { type: 'equals' } },
        ],
      },
    ];
    for (const [index, gradingResult] of legacy.entries()) {
      await evalRecord.addResult(
        createEvaluateResult({
          testIdx: index + 1,
          success: gradingResult.pass,
          score: gradingResult.score,
          failureReason: gradingResult.pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
          gradingResult: gradingResult as GradingResult,
        }),
      );
    }
    await evalRecord.addResult(
      createEvaluateResult({
        testIdx: 3,
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'Malformed component container',
          componentResults: { pass: true },
        } as unknown as GradingResult,
      }),
    );
    await evalRecord.addPrompts(prompts);
    expect((await Eval.findById(evalRecord.id))?.prompts[0].metrics).toMatchObject({
      score: 3,
      testPassCount: 3,
      testFailCount: 1,
      testErrorCount: 0,
      assertPassCount: 3,
      assertFailCount: 1,
    });
  });
});
