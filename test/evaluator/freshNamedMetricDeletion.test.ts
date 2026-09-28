import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { deleteEvalResult } from '../../src/util/database';

import type { GradingResult, TestSuite } from '../../src/types/index';

describe('deleting fresh runtime named metrics', () => {
  const evaluations: Eval[] = [];

  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(async () => {
    for (const evaluation of evaluations.splice(0)) {
      await evaluation.delete({ notify: false });
    }
    vi.unstubAllGlobals();
  });

  it.each([undefined, 'overall'])(
    'debits literal runtime contributions with parent %s',
    async (metric) => {
      const suite: TestSuite = {
        providers: [{ id: () => 'fresh-metric-target', callApi: async () => ({ output: 'ok' }) }],
        prompts: [{ raw: 'ok', label: 'Fresh metric' }],
        tests: Array.from({ length: 2 }, () => ({
          vars: { tag: 'quality' },
          assert: [
            {
              type: 'javascript' as const,
              metric,
              value: (): GradingResult => ({
                pass: true,
                score: 1,
                reason: 'Fresh runtime children',
                namedScores: { quality: 1 },
                namedScoreWeights: { quality: 2 },
                componentResults: Array.from({ length: 2 }, () => ({
                  pass: true,
                  score: 1,
                  reason: 'Independent runtime name',
                  assertion: { type: 'javascript', metric: '{{ tag }}' },
                })),
              }),
            },
          ],
        })),
      };
      const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
      evaluations.push(evaluation);
      await evaluate(suite, evaluation, { maxConcurrency: 1 });
      const rows = await EvalResult.findManyByEvalId(evaluation.id);
      const counts = metric ? { overall: 2, quality: 2 } : { quality: 2 };
      expect((await Eval.findById(evaluation.id))?.prompts[0].metrics?.namedScoresCount).toEqual(
        counts,
      );
      expect(
        rows[0].gradingResult?.componentResults?.slice(1).map((c) => c.assertion?.metric),
      ).toEqual(['{{ tag }}', '{{ tag }}']);
      await deleteEvalResult(evaluation.id, rows[0].id);
      expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
        namedScoresCount: metric ? { overall: 1, quality: 1 } : { quality: 1 },
        namedScores: metric ? { overall: 1, quality: 2 } : { quality: 2 },
        namedScoreWeights: metric ? { overall: 1, quality: 2 } : { quality: 2 },
      });
      await deleteEvalResult(evaluation.id, rows[1].id);
      expect((await Eval.findById(evaluation.id))?.prompts[0].metrics?.namedScoresCount).toEqual(
        {},
      );
    },
  );

  it('never renders template-looking grader output while debiting its fresh fallback', async () => {
    vi.stubGlobal('__promptfooNamedMetricExecuted', false);
    const metric = `{{ range.constructor("globalThis.__promptfooNamedMetricExecuted = true; return 'quality'")() }}`;
    const suite: TestSuite = {
      providers: [
        { id: () => 'untrusted-metric-target', callApi: async () => ({ output: metric }) },
      ],
      prompts: [{ raw: 'ok', label: 'Inert metric' }],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: (output): GradingResult => ({
                pass: true,
                score: 1,
                reason: 'Provider output remains data',
                namedScores: { quality: 1 },
                componentResults: [
                  {
                    pass: true,
                    score: 1,
                    reason: 'Untrusted name',
                    assertion: { type: 'javascript', metric: String(output) },
                  },
                ],
              }),
            },
          ],
        },
      ],
    };
    const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
    evaluations.push(evaluation);
    await evaluate(suite, evaluation, {});
    const [row] = await EvalResult.findManyByEvalId(evaluation.id);
    await deleteEvalResult(evaluation.id, row.id);
    expect((globalThis as Record<string, unknown>).__promptfooNamedMetricExecuted).toBe(false);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics?.namedScoresCount).toEqual({});
  });

  it('debits fresh scoring-function metrics when component provenance is deliberately omitted', async () => {
    const suite: TestSuite = {
      providers: [{ id: () => 'score-metric-target', callApi: async () => ({ output: 'ok' }) }],
      prompts: [{ raw: 'ok', label: 'Scoring function metric' }],
      tests: Array.from({ length: 2 }, () => ({
        assert: [{ type: 'contains' as const, value: 'ok' }],
        assertScoringFunction: (): GradingResult => ({
          pass: true,
          score: 1,
          reason: 'Fresh score without component details',
          namedScores: { quality: 1 },
          componentResults: null,
        }),
      })),
    };
    const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
    evaluations.push(evaluation);
    await evaluate(suite, evaluation, { maxConcurrency: 1 });
    const [row] = await EvalResult.findManyByEvalId(evaluation.id);
    expect(row.gradingResult?.componentResults).toBeNull();
    expect(row.gradingResult?.namedScoreWeights).toBeUndefined();
    await deleteEvalResult(evaluation.id, row.id);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      namedScores: { quality: 1 },
      namedScoresCount: { quality: 1 },
      namedScoreWeights: { quality: 1 },
    });
  });
});
