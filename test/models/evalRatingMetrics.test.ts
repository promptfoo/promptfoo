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
