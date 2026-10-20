import { describe, expect, it } from 'vitest';
import { createBayesAtNPlan } from '../../../src/evaluator/bayesAtN';
import { calculateRepeatStability } from '../../../src/util/eval/repeatStability';
import { createEvaluateResult } from '../../factories/eval';

function fixture(rows: boolean[][]) {
  const results = rows.flatMap((row, question) =>
    row.map((success, repeatIndex) =>
      createEvaluateResult({
        provider: { id: 'provider' },
        promptIdx: 0,
        repeatGroupId: `question-${question}`,
        repeatIndex,
        success,
        failureReason: success ? 0 : 1,
        response: { output: 'answer' },
      }),
    ),
  );
  const plan = createBayesAtNPlan(
    results.map((result) => ({
      ...result,
      provider: { id: () => 'provider' },
      evaluateOptions: { repeat: rows[Number(result.repeatGroupId!.split('-')[1])].length },
    })),
  );
  return { results, plan };
}

describe('Bayes@N repeat summary', () => {
  it.each([
    {
      rows: [
        [false, false],
        [true, true],
      ],
      mean: 1 / 2,
      variance: 3 / 160,
    },
    {
      rows: [
        [false, true],
        [false, true],
      ],
      mean: 1 / 2,
      variance: 1 / 40,
    },
    { rows: [[false]], mean: 1 / 3, variance: 1 / 18 },
    { rows: [[true]], mean: 2 / 3, variance: 1 / 18 },
    { rows: [[false, false]], mean: 1 / 4, variance: 3 / 80 },
    { rows: [[true, true]], mean: 3 / 4, variance: 3 / 80 },
  ])('matches exact Beta moments for $rows', ({ rows, mean, variance }) => {
    const { results, plan } = fixture(rows);
    const summary = calculateRepeatStability(results, plan)?.bayesAtN?.[0];
    expect(summary).toMatchObject({ questions: rows.length, trials: rows[0].length });
    expect(summary?.mean).toBeCloseTo(mean, 14);
    expect(summary?.posteriorStd).toBeCloseTo(Math.sqrt(variance), 14);
    expect(summary?.unavailableReason).toBeUndefined();
  });

  it('does not add posterior fields without an opt-in schedule', () => {
    const { results } = fixture([[false, true]]);
    expect(calculateRepeatStability(results)?.bayesAtN).toBeUndefined();
  });

  it('preserves existing Wilson summaries when enabled', () => {
    const { results, plan } = fixture([[false, true]]);
    const enabled = calculateRepeatStability(results, plan)!;
    const { bayesAtN, ...existing } = enabled;
    expect(bayesAtN).toHaveLength(1);
    expect(existing).toEqual(calculateRepeatStability(results));
  });

  it('is invariant to result arrival order', () => {
    const { results, plan } = fixture([
      [false, false],
      [true, true],
    ]);
    expect(calculateRepeatStability([...results].reverse(), plan)?.bayesAtN).toEqual(
      calculateRepeatStability(results, plan)?.bayesAtN,
    );
  });

  it('uses separate question posteriors for a 40-question, 64-trial workload', () => {
    const { results, plan } = fixture(
      Array.from({ length: 40 }, (_, question) => Array(64).fill(question >= 20)),
    );
    const summary = calculateRepeatStability(results, plan)?.bayesAtN?.[0];
    expect(summary?.mean).toBeCloseTo(1 / 2, 14);
    expect(summary?.posteriorStd).toBeCloseTo(Math.sqrt(65 / (66 * 66 * 67 * 40)), 14);
    expect(summary).toMatchObject({ questions: 40, trials: 64 });
  });

  it.each([
    'missing question',
    'missing trial',
    'duplicate index',
    'negative index',
    'fractional index',
    'out of range index',
    'absent index',
    'absent group',
    'unexpected group',
    'error',
    'fractional outcome',
    'target cache',
    'grader cache',
    'nested grader cache',
  ])('suppresses the cohort for %s', (problem) => {
    const { results, plan } = fixture([
      [false, true],
      [true, true],
    ]);
    switch (problem) {
      case 'missing question':
        results.splice(2);
        break;
      case 'missing trial':
        results.pop();
        break;
      case 'duplicate index':
        results[1].repeatIndex = 0;
        break;
      case 'negative index':
        results[0].repeatIndex = -1;
        break;
      case 'fractional index':
        results[0].repeatIndex = 0.5;
        break;
      case 'out of range index':
        results[0].repeatIndex = 2;
        break;
      case 'absent index':
        results[0].repeatIndex = undefined;
        break;
      case 'absent group':
        results[0].repeatGroupId = undefined;
        break;
      case 'unexpected group':
        results[0].repeatGroupId = 'other';
        break;
      case 'error':
        results[0].failureReason = 2;
        break;
      case 'fractional outcome':
        results[0].success = 0.5 as unknown as boolean;
        break;
      case 'target cache':
        results[0].response = { cached: true };
        break;
      case 'grader cache':
        results[0].gradingResult = {
          pass: false,
          score: 0,
          reason: 'fail',
          metadata: { cachedResponse: true },
        };
        break;
      case 'nested grader cache':
        results[0].gradingResult = {
          pass: false,
          score: 0,
          reason: 'fail',
          componentResults: [
            {
              pass: false,
              score: 0,
              reason: 'cached',
              metadata: { cachedResponse: true },
            },
          ],
        };
        break;
    }
    const summary = calculateRepeatStability(results, plan)?.bayesAtN?.[0];
    expect(summary?.unavailableReason).toBeTruthy();
    expect(summary?.mean).toBeUndefined();
    expect(summary?.posteriorStd).toBeUndefined();
  });

  it('reports missing questions even when no results are available', () => {
    const { plan } = fixture([[false, true]]);
    const summary = calculateRepeatStability([], plan);
    expect(summary?.totalGroups).toBe(0);
    expect(summary?.bayesAtN?.[0].unavailableReason).toContain('Not all scheduled');
  });

  it('suppresses unequal trial counts rather than discarding a question', () => {
    const { results, plan } = fixture([[false, true], [true]]);
    expect(calculateRepeatStability(results, plan)?.bayesAtN?.[0]).toMatchObject({
      questions: 2,
      unavailableReason: 'Questions have different repeat counts',
    });
  });

  it('keeps providers and prompts separate for ambiguous delimiter strings', () => {
    const { results, plan } = fixture([[true]]);
    const identities = [
      { id: 'a\u0000b', label: 'c' },
      { id: 'a', label: 'b\u0000c' },
      { id: 'undefined' },
      {},
    ];
    const groups = identities.flatMap((provider) =>
      [0, 1].map((promptIdx) => ({ ...plan.groups[0], provider, promptIdx })),
    );
    const rows = groups.map((group) => ({ ...results[0], ...group }));
    expect(calculateRepeatStability(rows, { version: 1, groups })?.bayesAtN).toHaveLength(8);
  });

  it.each([null, {}, { version: 2, groups: [] }, { version: 1, groups: [null] }])(
    'omits posterior estimates for malformed or legacy metadata %j',
    (plan) => {
      expect(calculateRepeatStability([], plan)).toBeUndefined();
    },
  );
});
