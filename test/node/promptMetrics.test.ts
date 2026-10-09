import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getDb } from '../../src/database/index';
import { evalResultsTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult, { type EvalResultMetrics } from '../../src/models/evalResult';
import { recalculatePromptMetrics } from '../../src/node/promptMetrics';
import { ResultFailureReason } from '../../src/types/index';
import {
  createCompletedPrompt,
  createEvaluateResult,
  createPromptMetrics,
} from '../factories/eval';

async function batches<T>(source: AsyncIterable<T[]>): Promise<T[][]> {
  const results: T[][] = [];
  for await (const batch of source) {
    results.push(batch);
  }
  return results;
}

async function createEvaluation() {
  const evaluation = await Eval.create({}, [], { id: randomUUID() });
  await evaluation.addPrompts([createCompletedPrompt()]);
  return evaluation;
}

beforeAll(async () => {
  await runDbMigrations();
});
afterEach(() => vi.restoreAllMocks());

describe('persisted prompt metric projection', () => {
  it('preserves full-reader types and normalizes exactly the metric fields of full rows', async () => {
    const evaluation = await createEvaluation();
    await evaluation.addResult(createEvaluateResult());
    const db = await getDb();
    await db
      .update(evalResultsTable)
      .set({ latencyMs: null, cost: null, response: null, namedScores: null, failureReason: 99 })
      .where(eq(evalResultsTable.evalId, evaluation.id));

    const full = EvalResult.findManyByEvalIdBatched(evaluation.id);
    const projected = EvalResult.findManyByEvalIdBatched(evaluation.id, { projection: 'metrics' });
    const dynamicOptions: { batchSize?: number; projection?: 'metrics' } = {
      projection: 'metrics',
    };
    const dynamic = EvalResult.findManyByEvalIdBatched(evaluation.id, dynamicOptions);
    expectTypeOf(full).toEqualTypeOf<AsyncGenerator<EvalResult[]>>();
    expectTypeOf(projected).toEqualTypeOf<AsyncGenerator<EvalResultMetrics[]>>();
    expectTypeOf(dynamic).toEqualTypeOf<AsyncGenerator<EvalResult[] | EvalResultMetrics[]>>();
    expectTypeOf(evaluation.fetchResultsBatched()).toEqualTypeOf<
      AsyncGenerator<EvalResult[], void>
    >();
    expectTypeOf(evaluation.fetchResultsBatched(100, { projection: 'metrics' })).toEqualTypeOf<
      AsyncGenerator<EvalResultMetrics[], void>
    >();

    const [row] = (await batches(full)).flat();
    const [metricRow] = (await batches(projected)).flat();
    expect(row).toBeInstanceOf(EvalResult);
    expect(row.provider).toEqual({ id: 'test-provider' });
    expect(row.prompt.raw).toBeTruthy();
    expect(metricRow).not.toBeInstanceOf(EvalResult);
    expect(metricRow).not.toHaveProperty('provider');
    expect(metricRow).not.toHaveProperty('prompt');
    expect(metricRow).not.toHaveProperty('metadata');
    for (const key of Object.keys(metricRow) as Array<keyof EvalResultMetrics>) {
      expect(metricRow[key]).toEqual(row[key]);
    }
    expect(metricRow).toMatchObject({
      latencyMs: 0,
      cost: 0,
      response: undefined,
      namedScores: {},
      failureReason: ResultFailureReason.NONE,
    });
    expect((await batches(dynamic)).flat()).toEqual([metricRow]);
  });

  it('keeps valid legacy JSON string providers readable in both projections', async () => {
    const evaluation = await createEvaluation();
    await evaluation.addResult(createEvaluateResult());
    const db = await getDb();
    await db.run(sql`UPDATE eval_results SET provider = ${JSON.stringify('legacy-provider')},
      grading_result = NULL, named_scores = NULL, metadata = NULL
      WHERE eval_id = ${evaluation.id}`);

    const [full] = (await batches(evaluation.fetchResultsBatched())).flat();
    const [projected] = (
      await batches(evaluation.fetchResultsBatched(100, { projection: 'metrics' }))
    ).flat();
    expect(full.provider).toBe('legacy-provider');
    expect(projected).toMatchObject({ gradingResult: null, namedScores: {} });
    await recalculatePromptMetrics(evaluation);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      score: 1,
      testPassCount: 1,
      testErrorCount: 0,
    });
  });

  it.each(['provider', 'prompt'] as const)(
    'does not hydrate damaged %s artifacts during reconciliation or repair their bytes',
    async (artifact) => {
      const evaluation = await createEvaluation();
      await evaluation.addResult(createEvaluateResult({ response: { output: 'saved' } }));
      const db = await getDb();
      // Current writers encode strings as JSON. This deliberately simulates a damaged
      // artifact in an otherwise current schema; no schema/index changes are needed.
      await db
        .update(evalResultsTable)
        .set({ [artifact]: sql`${'not-json'}` })
        .where(eq(evalResultsTable.evalId, evaluation.id));
      const before = await db.all(sql`SELECT * FROM eval_results WHERE eval_id = ${evaluation.id}`);

      await expect(batches(evaluation.fetchResultsBatched())).rejects.toThrow();
      await recalculatePromptMetrics(evaluation);
      expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
        score: 1,
        testPassCount: 1,
        testErrorCount: 0,
        tokenUsage: { total: 0, numRequests: 1 },
      });
      expect(
        await db.all(sql`SELECT * FROM eval_results WHERE eval_id = ${evaluation.id}`),
      ).toEqual(before);
      await expect(batches(evaluation.fetchResultsBatched())).rejects.toThrow();
    },
  );

  it('still fails on malformed required JSON without saving partially rebuilt metrics', async () => {
    const evaluation = await createEvaluation();
    for (const testIdx of [0, 1500]) {
      await evaluation.addResult(createEvaluateResult({ testIdx }));
    }
    const db = await getDb();
    await db.run(sql`UPDATE eval_results SET response = ${'not-json'}
      WHERE eval_id = ${evaluation.id} AND test_idx = ${1500}`);
    const previous = structuredClone(evaluation.prompts);
    const before = await db.all(sql`SELECT * FROM eval_results WHERE eval_id = ${evaluation.id}`);

    await expect(recalculatePromptMetrics(evaluation)).rejects.toThrow();
    expect(evaluation.prompts).toEqual(previous);
    expect((await Eval.findById(evaluation.id))?.prompts).toEqual(previous);
    expect(await db.all(sql`SELECT * FROM eval_results WHERE eval_id = ${evaluation.id}`)).toEqual(
      before,
    );
    await expect(batches(evaluation.fetchResultsBatched())).rejects.toThrow();
  });

  it('preserves sparse test-index paging and keeps every prompt for the same test in its batch', async () => {
    const evaluation = await createEvaluation();
    for (const testIdx of [3, 4, 105, 300]) {
      for (const promptIdx of [0, 1]) {
        await evaluation.addResult(createEvaluateResult({ testIdx, promptIdx }));
      }
    }
    const full = await batches(evaluation.fetchResultsBatched(100));
    const projected = await batches(evaluation.fetchResultsBatched(100, { projection: 'metrics' }));
    const identities = (rows: Array<Array<Pick<EvalResult, 'testIdx' | 'promptIdx'>>>) =>
      rows.map((batch) => batch.map((row) => `${row.testIdx}:${row.promptIdx}`).sort());
    const expected = [
      ['3:0', '3:1', '4:0', '4:1'],
      ['105:0', '105:1'],
      ['300:0', '300:1'],
    ];
    expect(identities(full)).toEqual(expected);
    expect(identities(projected)).toEqual(expected);
    expect(new Set(projected.flat().map((row) => row.id)).size).toBe(8);

    const inMemory = new Eval({});
    await inMemory.setResults(full.flat());
    const memoryBatches = await batches(inMemory.fetchResultsBatched(3, { projection: 'metrics' }));
    expect(memoryBatches.map((batch) => batch.length)).toEqual([3, 3, 2]);
    expect(memoryBatches.flat()).toEqual(full.flat());
  });

  it('rebuilds weighted, cached, incurred and nested usage across batches using saved test vars', async () => {
    const evaluation = await createEvaluation();
    const savedFunction = vi.fn(() => 73);
    evaluation.config.derivedMetrics = [{ name: 'SavedFunction', value: savedFunction }];
    evaluation.prompts[0].metrics = createPromptMetrics({
      namedScores: { Quality: 999, StaleAssertion: 999, SavedFunction: 73 },
    });
    await evaluation.addPrompts(evaluation.prompts);
    const metric = '{{metricName}}';
    await evaluation.addResult(
      createEvaluateResult({
        testIdx: 0,
        testCase: { vars: { metricName: 'Quality' } },
        latencyMs: 10,
        cost: 0.25,
        namedScores: { Quality: 0.5 },
        response: {
          output: 'first',
          incurredCost: 0.2,
          tokenUsage: {
            total: 100,
            prompt: 60,
            completion: 40,
            numRequests: 2,
            attacker: { total: 10, prompt: 6, completion: 4, numRequests: 1 },
            generation: { total: 3, prompt: 2, completion: 1, numRequests: 1 },
            assertions: { total: 4, numRequests: 1 },
          },
        },
        gradingResult: {
          pass: true,
          score: 1,
          reason: 'graded',
          namedScoreWeights: { Quality: 3 },
          tokensUsed: { total: 5, numRequests: 1 },
          componentResults: [1, 2].map(() => ({
            pass: true,
            score: 1,
            reason: 'passed',
            assertion: { type: 'equals', value: 'first', metric },
          })),
        },
      }),
    );
    await evaluation.addResult(
      createEvaluateResult({
        testIdx: 1500,
        testCase: { vars: { metricName: 'Quality' } },
        success: false,
        failureReason: ResultFailureReason.ERROR,
        score: 0,
        latencyMs: 20,
        cost: 0.5,
        namedScores: { Quality: 0.9 },
        response: {
          output: 'second',
          cached: true,
          incurredCost: 0,
          tokenUsage: { total: 20, prompt: 12, completion: 8, numRequests: 1 },
        },
        gradingResult: {
          pass: false,
          score: 0,
          reason: 'interrupted',
          namedScoreWeights: { Quality: 0 },
          tokensUsed: { total: 7, cached: 7, numRequests: 1 },
          metadata: { cachedResponse: true },
          componentResults: [
            {
              pass: false,
              score: 0,
              reason: 'failed',
              assertion: { type: 'equals', value: 'first', metric },
            },
          ],
        },
      }),
    );
    const previousConfig = cliState.config;
    cliState.config = undefined;
    try {
      await recalculatePromptMetrics(evaluation, { preserveDerivedMetrics: true });
    } finally {
      cliState.config = previousConfig;
    }
    const metrics = (await Eval.findById(evaluation.id))?.prompts[0].metrics;
    expect(metrics).toMatchObject({
      score: 1,
      testPassCount: 1,
      testFailCount: 0,
      testErrorCount: 1,
      assertPassCount: 2,
      assertFailCount: 1,
      totalLatencyMs: 30,
      cost: 0.75,
      incurredCost: 0.2,
      namedScores: { Quality: 1.5, SavedFunction: 73 },
      namedScoresCount: { Quality: 3 },
      namedScoreWeights: { Quality: 3 },
      tokenUsage: {
        total: 120,
        prompt: 72,
        completion: 48,
        cached: 20,
        numRequests: 3,
        attacker: { total: 10, numRequests: 1 },
        generation: { total: 3, numRequests: 1 },
        assertions: { total: 16, cached: 7, numRequests: 3 },
        incurredTokenUsage: {
          total: 100,
          numRequests: 2,
          attacker: { total: 10, numRequests: 1 },
          generation: { total: 3, numRequests: 1 },
          assertions: { total: 9, numRequests: 2 },
        },
      },
    });
    expect(metrics?.namedScores).not.toHaveProperty('StaleAssertion');
    expect(savedFunction).not.toHaveBeenCalled();
  });
});
