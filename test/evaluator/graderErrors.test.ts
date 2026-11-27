import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, expect, it } from 'vitest';
import { evaluate } from '../../src/index';
import { runDbMigrations } from '../../src/migrate';
import { getErrorResultIds } from '../../src/node/retry';
import { ResultFailureReason } from '../../src/types/index';
import { calculateFilteredMetrics } from '../../src/util/calculateFilteredMetrics';
import { clearEvalTables } from '../util/evalDb';

import type { ApiProvider, EvaluateSummaryV3 } from '../../src/types/index';

beforeAll(() => runDbMigrations());
beforeEach(() => clearEvalTables());

it.each([false, true])(
  'keeps grader outages out of quality metrics with persistence %s',
  async (persisted) => {
    const grader: ApiProvider = {
      id: () => 'local-judge',
      callApi: async (_prompt, context) => ({
        ...(context?.vars.verdict === 'error'
          ? { error: 'Judge unavailable' }
          : { output: context?.vars.verdict === 'pass' ? 'Correct. Y' : 'Incorrect. N' }),
        tokenUsage: { prompt: 2, completion: 1, total: 3, numRequests: 1 },
      }),
    };
    const record = await evaluate(
      {
        providers: ['echo'],
        prompts: ['target output'],
        tests: ['pass', 'fail', 'error'].map((verdict) => ({
          vars: { verdict },
          assert: [
            { type: 'contains' as const, value: 'target', metric: 'format' },
            {
              type: 'model-graded-closedqa' as const,
              value: 'Correct answer',
              metric: 'quality',
              provider: grader,
            },
          ],
        })),
        writeLatestResults: persisted,
      },
      { cache: false, maxConcurrency: 1 },
    );
    const summary = (await record.toEvaluateSummary()) as EvaluateSummaryV3;
    expect(summary.stats).toMatchObject({ successes: 1, failures: 1, errors: 1 });
    const error = summary.results.find((row) => row.vars.verdict === 'error')!;
    expect(error).toMatchObject({
      success: false,
      failureReason: ResultFailureReason.ERROR,
      error: 'Judge unavailable',
      response: { output: 'target output' },
      namedScores: { format: 1 },
      gradingResult: { metadata: { graderError: true }, namedScoreWeights: { format: 1 } },
    });
    expect(error.gradingResult?.componentResults).toHaveLength(2);
    expect(error.namedScores).not.toHaveProperty('quality');
    const expectedMetrics = {
      testPassCount: 1,
      testFailCount: 1,
      testErrorCount: 1,
      assertPassCount: 4,
      assertFailCount: 1,
      namedScores: { format: 3, quality: 1 },
      namedScoreWeights: { format: 3, quality: 2 },
      tokenUsage: { assertions: { total: 9 } },
    };
    expect(summary.prompts[0].metrics).toMatchObject(expectedMetrics);

    if (persisted) {
      const filtered = await calculateFilteredMetrics({
        evalId: record.id,
        numPrompts: 1,
        whereSql: sql`eval_id = ${record.id}`,
      });
      expect(filtered[0]).toMatchObject(expectedMetrics);
      expect(await getErrorResultIds(record.id)).toEqual([error.id]);
    }
  },
);
