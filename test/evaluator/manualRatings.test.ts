import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import * as comparisons from '../../src/matchers/comparison';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { ResultFailureReason } from '../../src/types/index';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { Assertion, TestSuite } from '../../src/types/index';

describeEvaluator('manual ratings during deferred comparison grading', () => {
  it.each([
    {
      name: 'select-best loser',
      compare: ['select-best'],
      comparisonPass: false,
      sameRating: true,
    },
    { name: 'select-best winner', compare: ['select-best'], comparisonPass: true },
    { name: 'max-score loser', compare: ['max-score'], comparisonPass: false, sameRating: true },
    { name: 'max-score winner', compare: ['max-score'], comparisonPass: true },
    {
      name: 'weighted failure and winner',
      compare: ['select-best'],
      comparisonPass: true,
      fail: true,
    },
    {
      name: 'custom success and winner',
      compare: ['max-score'],
      comparisonPass: true,
      custom: true,
    },
    {
      name: 'custom failure and winner',
      compare: ['select-best'],
      comparisonPass: true,
      custom: true,
      fail: true,
    },
    {
      name: 'ordered comparison failures',
      compare: ['select-best', 'max-score'],
      comparisonPass: false,
      custom: true,
    },
    {
      name: 'loser followed by winner',
      compare: ['select-best', 'max-score'],
      comparisonPass: false,
      maxPass: true,
    },
    {
      name: 'winner followed by loser',
      compare: ['select-best', 'max-score'],
      comparisonPass: true,
      maxPass: false,
    },
    {
      name: 'retained score edit between comparisons',
      compare: ['select-best', 'max-score'],
      comparisonPass: false,
      maxPass: true,
      retainedScore: 0.55,
    },
    {
      name: 'execution error and loser',
      compare: ['select-best'],
      comparisonPass: false,
      error: true,
    },
  ])('clears a streamed manual rating to the updated $name baseline', async (scenario) => {
    const comparisonPass = (type: string) =>
      type === 'max-score'
        ? (scenario.maxPass ?? scenario.comparisonPass)
        : scenario.comparisonPass;
    const selectBest = vi.spyOn(comparisons, 'matchesSelectBest').mockResolvedValue([
      {
        pass: scenario.comparisonPass,
        score: scenario.comparisonPass ? 1 : 0.3,
        reason: 'Select-best outcome',
      },
      { pass: true, score: 1, reason: 'Other result' },
    ]);
    const maxScore = vi.spyOn(comparisons, 'selectMaxScore').mockResolvedValue([
      {
        pass: comparisonPass('max-score'),
        score: comparisonPass('max-score') ? 1 : 0.2,
        reason: 'Max-score outcome',
      },
      { pass: true, score: 1, reason: 'Other result' },
    ]);
    const baselineScore = scenario.error ? 0 : scenario.custom ? 0.42 : 0.75;
    const baselinePass = !scenario.fail && !scenario.error;
    const testSuite: TestSuite = {
      providers: [
        {
          id: () => 'streamed-rating',
          callApi: async (prompt) =>
            scenario.error && prompt === 'First'
              ? { error: 'Provider execution failed' }
              : { output: 'hello' },
        },
      ],
      prompts: [toPrompt('First'), toPrompt('Second')],
      tests: [
        {
          threshold: scenario.fail ? 0.9 : 0.5,
          ...(scenario.custom && {
            assertScoringFunction: () => ({
              pass: baselinePass,
              score: baselineScore,
              reason: 'Custom aggregate',
            }),
          }),
          assert: [
            { type: 'contains', value: 'hello', weight: 3 },
            { type: 'contains', value: 'missing', weight: 1 },
            ...scenario.compare.map((type) => ({ type, value: 'Choose the best' }) as Assertion),
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const addResult = evalRecord.addResult.bind(evalRecord);
    const readResults = evalRecord.fetchResultsByTestIdx.bind(evalRecord);
    let ratedId: string | undefined;
    let reads = 0;
    const readAfterRating = vi
      .spyOn(evalRecord, 'fetchResultsByTestIdx')
      .mockImplementation(async (testIdx) => {
        if (++reads === 2 && scenario.retainedScore !== undefined) {
          for (const [ratingAction, score] of [
            ['clear', 1],
            ['update', scenario.retainedScore],
            ['rate', 1],
          ] as const) {
            const rating = await EvalResult.submitRating(
              evalRecord.id,
              ratedId!,
              {
                pass: true,
                score,
                reason: 'Edit between comparisons',
              },
              ratingAction,
              ratingAction === 'update' ? 'score' : undefined,
            );
            expect(rating.status).toBe('updated');
          }
        }
        return readResults(testIdx);
      });
    const persistAndRate = vi.spyOn(evalRecord, 'addResult').mockImplementation(async (row) => {
      await addResult(row);
      if (row.promptIdx !== 0) {
        return;
      }
      const [result] = await EvalResult.findManyByEvalId(evalRecord.id);
      expect(result).toMatchObject({ success: baselinePass, score: baselineScore });
      ratedId = result.id;
      const rating = await EvalResult.submitRating(
        evalRecord.id,
        result.id,
        {
          pass: scenario.sameRating ? baselinePass : !baselinePass,
          score: Number(scenario.sameRating ? baselinePass : !baselinePass),
          reason: 'Manual override while streaming',
        },
        'rate',
      );
      expect(rating.status).toBe('updated');
    });
    try {
      await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
      expect(ratedId).toBeDefined();
      const clear = await EvalResult.submitRating(
        evalRecord.id,
        ratedId!,
        {
          pass: true,
          score: 1,
          reason: 'Stale client clear',
        },
        'clear',
      );
      expect(clear.status).toBe('updated');
      const result = await EvalResult.findById(ratedId!);
      const expectedPass = baselinePass && scenario.compare.every(comparisonPass);
      const lastFailure = scenario.compare.filter((type) => !comparisonPass(type)).at(-1);
      const expectedScore =
        scenario.retainedScore ??
        (lastFailure === undefined ? baselineScore : lastFailure === 'max-score' ? 0.2 : 0.3);
      expect(result).toMatchObject({
        success: expectedPass,
        score: expectedScore,
        failureReason: scenario.error
          ? ResultFailureReason.ERROR
          : expectedPass
            ? ResultFailureReason.NONE
            : ResultFailureReason.ASSERT,
        gradingResult: { pass: expectedPass, score: expectedScore },
      });
      expect(result?.gradingResult?.componentResults).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ assertion: { type: 'human' } })]),
      );
      for (const type of scenario.compare) {
        expect(result?.gradingResult?.componentResults).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              pass: comparisonPass(type),
              assertion: expect.objectContaining({ type }),
            }),
          ]),
        );
      }
    } finally {
      persistAndRate.mockRestore();
      readAfterRating.mockRestore();
      selectBest.mockRestore();
      maxScore.mockRestore();
    }
  });
});
