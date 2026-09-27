import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { beginEvalRun, EvalRunningError } from '../../src/database/evalRun';
import { getDb } from '../../src/database/index';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { recalculatePromptMetrics } from '../../src/node/recalculatePromptMetrics';
import { retryCommand } from '../../src/node/retry';
import { deleteEval, deleteEvalResult } from '../../src/util/database';
import { streamEvalCsv } from '../../src/util/eval/evalTableUtils';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider, Assertion, TestSuite } from '../../src/types/index';

describe('deleting evaluated results preserves surviving token usage', () => {
  const evalIds: string[] = [];
  let fixtureDir: string;
  let comparisonProvider: string;
  let nestedMetricAssertion: string;
  let hookMetricExtension: string;
  let errorProvider: string;

  beforeAll(async () => {
    await runDbMigrations();
    fixtureDir = await mkdtemp(path.join(tmpdir(), 'promptfoo-deletion-metrics-'));
    const providerPath = path.join(fixtureDir, 'comparison.cjs');
    await writeFile(
      providerPath,
      `
      module.exports = class {
        id() { return 'deletion-comparison-judge'; }
        async callApi(_prompt, { vars }) {
          return {
            output: '0',
            cached: vars.cachedComparison,
            tokenUsage: vars.cachedComparison
              ? { total: 0, cached: 10, numRequests: 0 }
              : { total: vars.initial ? 6 : 10, prompt: vars.initial ? 6 : 10, completion: 0 },
          };
        }
      };
    `,
    );
    comparisonProvider = `file://${providerPath}`;
    const assertionPath = path.join(fixtureDir, 'nested-metric.cjs');
    await writeFile(
      assertionPath,
      `module.exports = () => ({pass:true,score:1,reason:'parent',componentResults:[
      {pass:true,score:1,reason:'first'},
      {pass:true,score:1,reason:'second',assertion:{type:'contains',metric:'{{ env.PF9868_METRIC }}'},metadata:{custom:true}}
    ]});`,
    );
    nestedMetricAssertion = `file://${assertionPath}`;
    const hookPath = path.join(fixtureDir, 'hook-metric.cjs');
    await writeFile(
      hookPath,
      `module.exports=(name,context)=>{
      if(name==='afterEach') context.result.namedScores={...context.result.namedScores,attempts:1};
      return context;
    };`,
    );
    hookMetricExtension = `file://${hookPath}`;
    const errorPath = path.join(fixtureDir, 'error-target.cjs');
    await writeFile(
      errorPath,
      `module.exports=class {
      id(){return 'hook-error-target'}
      async callApi(prompt){return prompt === 'graded' ? {output:prompt} : {error:'Retryable error'}}
    };`,
    );
    errorProvider = `file://${errorPath}`;
  });

  afterAll(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    for (const evalId of evalIds.splice(0)) {
      await deleteEval(evalId);
    }
    vi.restoreAllMocks();
  });

  it.each([false, true])(
    'recovers saved grading during a failed retry after a header flush failure (legacy=%s)',
    async (legacy) => {
      const tests = [
        { vars: { row: 'error' } },
        {
          vars: { row: 'graded' },
          assert: [
            {
              type: 'javascript' as const,
              value:
                '({pass:true,score:1,reason:"paid grading",tokensUsed:{total:7,numRequests:1}})',
            },
          ],
        },
      ];
      const suite: TestSuite = {
        prompts: [{ raw: '{{row}}', label: 'Mixed recovery' }],
        providers: [
          {
            id: () => 'hook-error-target',
            callApi: async (prompt) =>
              prompt === 'graded' ? { output: prompt } : { error: 'Retryable error' },
          },
        ],
        tests,
      };
      const evaluation = await Eval.create(
        { prompts: ['{{row}}'], providers: [errorProvider], tests },
        suite.prompts,
        { id: randomUUID() },
      );
      evalIds.push(evaluation.id);
      const addPrompts = Eval.prototype.addPrompts;
      vi.spyOn(Eval.prototype, 'addPrompts').mockImplementation(function (this: Eval, prompts) {
        if (prompts[0].metrics!.testPassCount > 0) {
          throw new Error('Header flush failed');
        }
        return addPrompts.call(this, prompts);
      });
      await expect(evaluate(suite, evaluation, { maxConcurrency: 1 })).rejects.toThrow(
        'Header flush failed',
      );
      vi.restoreAllMocks();
      const before = (await Eval.findById(evaluation.id))!;
      expect(before.prompts[0].metrics!.assertPassCount).toBe(0);
      const rows = await EvalResult.findManyByEvalId(evaluation.id);
      expect(rows).toHaveLength(2);
      const graded = rows.find((row) => row.testIdx === 1)!;
      expect(graded.gradingResult!.tokensUsed!.total).toBe(7);
      if (legacy) {
        const error = rows.find((row) => row.testIdx === 0)!;
        error.metadata = {};
        await error.save();
        const release = await beginEvalRun(before, () => recalculatePromptMetrics(before));
        await release();
        await expect(deleteEvalResult(evaluation.id, graded.id)).rejects.toThrow(
          'Retry failed results',
        );
      }

      await retryCommand(evaluation.id, { maxConcurrency: 1 });
      const repaired = (await Eval.findById(evaluation.id))!.prompts[0].metrics!;
      expect(repaired.assertPassCount).toBe(1);
      expect(repaired.tokenUsage.assertions).toMatchObject({ total: 7, numRequests: 1 });
      expect((await EvalResult.findManyByEvalId(evaluation.id)).map((row) => row.id)).toContain(
        graded.id,
      );
      await deleteEvalResult(evaluation.id, graded.id);
      const remaining = (await Eval.findById(evaluation.id))!.prompts[0].metrics!;
      expect(remaining.assertPassCount).toBe(0);
      expect(remaining.tokenUsage.assertions).toMatchObject({ total: 0, numRequests: 0 });
    },
  );

  it.each(['delete', 'retry', 'human-grade', 'legacy-target'] as const)(
    'reverses fresh ungraded hook metrics during %s',
    async (operation) => {
      const tests = Array.from({ length: operation === 'retry' ? 1 : 2 }, () => ({}));
      const suite: TestSuite = {
        providers: [
          { id: () => 'hook-error-target', callApi: async () => ({ error: 'Retryable error' }) },
        ],
        prompts: [{ raw: 'error', label: 'error' }],
        tests,
        extensions: [hookMetricExtension],
      };
      const config = {
        prompts: ['error'],
        providers: [errorProvider],
        tests,
        extensions: [hookMetricExtension],
      };
      const evaluation = await Eval.create(config, suite.prompts, { id: randomUUID() });
      evalIds.push(evaluation.id);
      await evaluate(suite, evaluation, { maxConcurrency: 1 });
      const rows = await EvalResult.findManyByEvalId(evaluation.id);
      expect(rows.every((row) => row.gradingResult == null)).toBe(true);
      const target = rows[0];
      if (operation === 'retry') {
        await retryCommand(evaluation.id, { maxConcurrency: 1 });
      } else {
        if (operation === 'human-grade') {
          target.gradingResult = {
            pass: true,
            score: 1,
            reason: 'Human override',
            assertion: { type: 'human' },
            namedScoreWeights: { attempts: 7 },
          };
          await target.save();
        } else if (operation === 'legacy-target') {
          target.metadata = {};
          await target.save();
        }
        await deleteEvalResult(evaluation.id, target.id);
      }
      const reloaded = (await Eval.findById(evaluation.id))!;
      expect(await EvalResult.findManyByEvalId(evaluation.id)).toHaveLength(1);
      expect(reloaded.prompts[0].metrics).toMatchObject({
        namedScores: { attempts: 1 },
        namedScoresCount: { attempts: 1 },
        namedScoreWeights: { attempts: 1 },
      });
    },
  );

  it('does not treat stripped graded rows or supplied markers as ungraded contributions', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_STRIP_GRADING_RESULT: 'true' });
    try {
      const suite: TestSuite = {
        providers: [
          {
            id: () => 'graded-target',
            callApi: async () => ({
              output: 'pass',
              metadata: { __promptfoo: { originallyUngraded: true, retained: 'control' } },
            }),
          },
        ],
        prompts: [{ raw: 'pass', label: 'pass' }],
        tests: Array.from({ length: 2 }, () => ({
          assert: Array.from({ length: 2 }, () => ({
            type: 'contains' as const,
            value: 'pass',
            metric: 'attempts',
          })),
        })),
        extensions: [hookMetricExtension],
      };
      const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
      evalIds.push(evaluation.id);
      await evaluate(suite, evaluation, {});
      const rows = await EvalResult.findManyByEvalId(evaluation.id);
      const exported = rows.map((row) => row.toEvaluateResult());
      expect(exported.every((row) => row.gradingResult == null)).toBe(true);
      expect(rows[0].metadata?.__promptfoo).toEqual({ retained: 'control' });
      const before = structuredClone(evaluation.prompts[0].metrics);
      const imported = await Eval.create({}, evaluation.prompts, {
        id: randomUUID(),
        completedPrompts: evaluation.prompts,
      });
      evalIds.push(imported.id);
      for (const row of exported) {
        await imported.addResult(row);
      }
      const [target] = await EvalResult.findManyByEvalId(imported.id);
      await deleteEvalResult(imported.id, target.id);
      const metrics = (await Eval.findById(imported.id))!.prompts[0].metrics!;
      expect(metrics.namedScores).toEqual(before!.namedScores);
      expect(metrics.namedScoresCount).toEqual({ attempts: 4 });
      expect(metrics.namedScoreWeights).toEqual({ attempts: 4 });
    } finally {
      restoreEnv();
    }
  });

  it.each(['delete', 'recalculate'])(
    'excludes late comparison metrics during %s',
    async (operation) => {
      const suite: TestSuite = {
        providers: [
          { id: () => 'comparison-metric', callApi: async (prompt) => ({ output: prompt }) },
        ],
        prompts: [
          { raw: 'ok A', label: 'A' },
          { raw: 'ok B', label: 'B' },
        ],
        tests: Array.from({ length: 2 }, () => ({
          assert: [
            { type: 'contains' as const, value: 'ok', metric: 'quality' },
            { type: 'max-score' as const, metric: 'quality' },
          ],
        })),
      };
      const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
      evalIds.push(evaluation.id);
      await evaluate(suite, evaluation, {});
      expect(evaluation.prompts[0].metrics!.namedScoresCount.quality).toBe(2);
      if (operation === 'delete') {
        const target = (await EvalResult.findManyByEvalId(evaluation.id)).find(
          (row) => row.testIdx === 0 && row.promptIdx === 0,
        )!;
        await deleteEvalResult(evaluation.id, target.id);
      } else {
        await recalculatePromptMetrics(evaluation);
      }
      const reloaded = (await Eval.findById(evaluation.id))!;
      expect(reloaded.prompts[0].metrics!.namedScoresCount.quality).toBe(
        operation === 'delete' ? 1 : 2,
      );
      let csv = '';
      await streamEvalCsv(reloaded, {
        write: (chunk) => {
          csv += chunk;
        },
      });
      expect(csv.split('\n')[0].match(/Metric: quality/g)).toHaveLength(2);
    },
  );

  it('carries rendered metric names into inherited custom assertion components', async () => {
    const suite: TestSuite = {
      env: { PF9868_METRIC: 'quality' } as TestSuite['env'],
      providers: [{ id: () => 'nested-metric', callApi: async () => ({ output: 'ok' }) }],
      prompts: [{ raw: 'ok', label: 'Nested metric' }],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              metric: '{{ env.PF9868_METRIC }}',
              value: nestedMetricAssertion,
            },
          ],
        },
      ],
    };
    const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
    evalIds.push(evaluation.id);
    await evaluate(suite, evaluation, {});
    const [result] = await EvalResult.findManyByEvalId(evaluation.id);
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics!.namedScoresCount).toEqual({
      quality: 3,
    });
    expect(
      result.gradingResult!.componentResults!.map(
        (component) => component.metadata?.renderedMetric,
      ),
    ).toEqual(['quality', 'quality', 'quality']);
    expect(result.gradingResult!.componentResults![2].metadata?.custom).toBe(true);
    await deleteEvalResult(evaluation.id, result.id);
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics!.namedScoresCount).toEqual({});
  });

  it('keeps tokenless response requests consistent across retry and deletion', async () => {
    const suite: TestSuite = {
      providers: [
        {
          id: () => 'retry-requests',
          callApi: async (prompt) => ({
            output: prompt,
            ...(prompt === 'counted' && { tokenUsage: { total: 1, numRequests: 1 } }),
          }),
        },
      ],
      prompts: [{ raw: '{{ row }}', label: 'Retry requests' }],
      tests: [{ vars: { row: 'tokenless' } }, { vars: { row: 'counted' } }],
    };
    const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
    evalIds.push(evaluation.id);
    await evaluate(suite, evaluation, { maxConcurrency: 1 });
    await recalculatePromptMetrics(evaluation);
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics!.tokenUsage.numRequests).toBe(
      2,
    );
    const target = (await EvalResult.findManyByEvalId(evaluation.id)).find(
      (row) => row.testIdx === 0,
    )!;
    await deleteEvalResult(evaluation.id, target.id);
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics!.tokenUsage.numRequests).toBe(
      1,
    );
  });

  it.each([false, true])(
    'retains the verdict and usage of a selected provider error (cached=%s)',
    async (cachedComparison) => {
      const suite: TestSuite = {
        providers: [
          {
            id: () => 'selected-error',
            callApi: async (prompt) =>
              prompt === 'error' ? { error: 'provider failed' } : { output: 'survivor' },
          },
          { id: () => 'other-output', callApi: async () => ({ output: 'other' }) },
        ],
        prompts: [{ raw: '{{ row }}', label: 'Comparison verdict' }],
        tests: [
          {
            vars: { row: 'error', cachedComparison },
            assert: [{ type: 'select-best', value: 'first', provider: comparisonProvider }],
          },
          {
            vars: { row: 'survivor' },
            assert: [
              {
                type: 'javascript',
                value:
                  '({pass:false,score:0,reason:"survivor",tokensUsed:{total:3,numRequests:1}})',
              },
            ],
          },
        ],
      };
      const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
      evalIds.push(evaluation.id);
      await evaluate(suite, evaluation, { maxConcurrency: 1 });
      const target = (await EvalResult.findManyByEvalId(evaluation.id)).find(
        (row) => row.promptIdx === 0 && row.testIdx === 0,
      )!;
      expect(target.success).toBe(false);
      expect(target.gradingResult!.componentResults![0].pass).toBe(true);
      await recalculatePromptMetrics(evaluation);
      expect(
        (await Eval.findById(evaluation.id))!.prompts[0].metrics!.tokenUsage.assertions!
          .numRequests,
      ).toBe(1);
      await deleteEvalResult(evaluation.id, target.id);
      expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
        assertPassCount: 0,
        assertFailCount: 1,
        tokenUsage: { assertions: { total: 3, numRequests: 1 } },
      });
    },
  );

  it('accounts for a non-transient target error before stopping the evaluation', async () => {
    const suite: TestSuite = {
      providers: [
        {
          id: () => 'http403-target',
          callApi: async (prompt) =>
            prompt === 'good'
              ? { output: 'ok', cost: 1, tokenUsage: { total: 1, numRequests: 1 } }
              : {
                  error: 'HTTP403',
                  cost: 10,
                  tokenUsage: { total: 10, numRequests: 1 },
                  metadata: { http: { status: 403, statusText: 'Forbidden' } },
                },
        },
      ],
      prompts: [{ raw: '{{ row }}', label: 'HTTP403' }],
      tests: [{ vars: { row: 'good' } }, { vars: { row: 'forbidden' } }],
    };
    const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
    evalIds.push(evaluation.id);
    await evaluate(suite, evaluation, { maxConcurrency: 1 });
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
      cost: 11,
      testPassCount: 1,
      testErrorCount: 1,
    });
    const target = (await EvalResult.findManyByEvalId(evaluation.id)).find(
      (row) => row.testIdx === 1,
    )!;
    await deleteEvalResult(evaluation.id, target.id);
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
      cost: 1,
      testPassCount: 1,
      testErrorCount: 0,
      tokenUsage: { total: 1, numRequests: 1 },
    });
  });

  it('retains completed work missing from SQL when a persisted row is deleted', async () => {
    const suite: TestSuite = {
      derivedMetrics: [{ name: 'Rows', value: '__count' }],
      providers: [
        {
          id: () => 'failed-write',
          callApi: async (prompt) =>
            prompt === 'target' ? { error: 'recoverable provider error' } : { output: 'ok' },
        },
      ],
      prompts: [{ raw: '{{ row }}', label: 'Retained work' }],
      tests: ['target', 'failed-write', 'survivor'].map((row) => ({
        vars: { row },
        assert: [
          {
            type: 'javascript',
            value: '({pass:true,score:1,reason:"known",tokensUsed:{total:3,numRequests:1}})',
          },
        ],
      })),
    };
    const evaluation = await Eval.create({ derivedMetrics: suite.derivedMetrics }, suite.prompts, {
      id: randomUUID(),
    });
    evalIds.push(evaluation.id);
    const db = await getDb();
    await db.run(
      sql`CREATE TRIGGER deletion_reject_second BEFORE INSERT ON eval_results WHEN NEW.test_idx = 1 BEGIN SELECT RAISE(FAIL, 'intentional result persistence failure'); END`,
    );
    try {
      await evaluate(suite, evaluation, { maxConcurrency: 1 });
    } finally {
      await db.run(sql`DROP TRIGGER deletion_reject_second`);
    }
    const rows = await EvalResult.findManyByEvalId(evaluation.id);
    expect(rows.map((row) => row.testIdx).sort()).toEqual([0, 2]);
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
      assertPassCount: 2,
      namedScores: { Rows: 3 },
      tokenUsage: { assertions: { total: 6 } },
    });
    await deleteEvalResult(evaluation.id, rows.find((row) => row.testIdx === 0)!.id);
    expect((await Eval.findById(evaluation.id))!.prompts[0].metrics).toMatchObject({
      testPassCount: 2,
      assertPassCount: 2,
      namedScores: { Rows: 2 },
      tokenUsage: { assertions: { total: 6 } },
    });
  });

  it('deletes the resolved contribution of environment-dependent metric names', async () => {
    const metric = '{{ env.PF9868_METRIC }}';
    const suite: TestSuite = {
      env: { PF9868_METRIC: 'accuracy' } as TestSuite['env'],
      providers: [{ id: () => 'env-metric-target', callApi: async () => ({ output: 'ok' }) }],
      prompts: [{ raw: 'ok', label: 'Environment metric' }],
      tests: [
        {
          assert: [
            { type: 'contains', value: 'ok', metric },
            { type: 'contains', value: 'ok', metric },
          ],
        },
      ],
    };
    const evaluation = await Eval.create({ env: suite.env }, suite.prompts, { id: randomUUID() });
    evalIds.push(evaluation.id);
    await evaluate(suite, evaluation, {});
    const [result] = await EvalResult.findManyByEvalId(evaluation.id);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      namedScoresCount: { accuracy: 2 },
    });
    await deleteEvalResult(evaluation.id, result.id);
    expect(
      (await Eval.findById(evaluation.id))?.prompts[0].metrics?.namedScoresCount?.accuracy ?? 0,
    ).toBe(0);
    expect(
      result.gradingResult?.componentResults?.map((grade) => grade.metadata?.renderedMetric),
    ).toEqual(['accuracy', 'accuracy']);
    expect(result.gradingResult?.componentResults?.map((grade) => grade.assertion?.metric)).toEqual(
      [metric, metric],
    );
    expect(suite.tests?.[0].assert?.map((assertion) => assertion.metric)).toEqual([metric, metric]);
  });

  it('keeps repeated metric counts when another resolved name contains template delimiters', async () => {
    const suite: TestSuite = {
      providers: [{ id: () => 'literal-metric-target', callApi: async () => ({ output: 'ok' }) }],
      prompts: [{ raw: 'ok', label: 'Literal metric' }],
      tests: [
        {
          vars: { tag: '{{ literal }}' },
          assert: [
            { type: 'contains', value: 'ok', metric: 'accuracy' },
            { type: 'contains', value: 'ok', metric: 'accuracy' },
            { type: 'contains', value: 'ok', metric: '{{ tag }}' },
          ],
        },
      ],
    };
    const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
    evalIds.push(evaluation.id);
    await evaluate(suite, evaluation, {});
    const [result] = await EvalResult.findManyByEvalId(evaluation.id);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      namedScoresCount: { accuracy: 2, '{{ literal }}': 1 },
    });
    expect(
      result.gradingResult?.componentResults?.map((grade) => grade.metadata?.renderedMetric),
    ).toEqual(['accuracy', 'accuracy', '{{ literal }}']);
    await deleteEvalResult(evaluation.id, result.id);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics?.namedScoresCount).toEqual({});
  });

  it('rejects deletion during evaluation and allows it after final metrics are saved', async () => {
    const secondCallStarted = createDeferred<void>();
    const releaseSecondCall = createDeferred<void>();
    const provider: ApiProvider = {
      id: () => 'gated-deletion-target',
      callApi: async (prompt) => {
        if (prompt === 'second') {
          secondCallStarted.resolve();
          await releaseSecondCall.promise;
        }
        return {
          output: prompt,
          cost: 3,
          tokenUsage: { total: 2, prompt: 1, completion: 1, numRequests: 1 },
        };
      },
    };
    const suite: TestSuite = {
      providers: [provider],
      prompts: [{ raw: '{{row}}', label: 'Gated prompt' }],
      tests: [{ vars: { row: 'first' } }, { vars: { row: 'second' } }],
    };
    const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
    evalIds.push(evaluation.id);
    const running = evaluate(suite, evaluation, { maxConcurrency: 1 });
    try {
      await secondCallStarted.promise;
      const [first] = await EvalResult.findManyByEvalId(evaluation.id);
      expect(first.testIdx).toBe(0);
      const before = (await Eval.findById(evaluation.id))!.prompts;
      expect(before[0].metrics).toMatchObject({
        testPassCount: 1,
        cost: 3,
        tokenUsage: { total: 2, numRequests: 1 },
      });
      await expect(deleteEvalResult(evaluation.id, first.id)).rejects.toBeInstanceOf(
        EvalRunningError,
      );
      expect(await EvalResult.findManyByEvalId(evaluation.id)).toHaveLength(1);
      expect((await Eval.findById(evaluation.id))?.prompts).toEqual(before);
    } finally {
      releaseSecondCall.resolve();
      await running;
    }

    const completed = await EvalResult.findManyByEvalId(evaluation.id);
    expect(completed).toHaveLength(2);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      testPassCount: 2,
      cost: 6,
      tokenUsage: { total: 4, numRequests: 2 },
    });
    await deleteEvalResult(evaluation.id, completed.find((result) => result.testIdx === 0)!.id);
    const remaining = await EvalResult.findManyByEvalId(evaluation.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].testIdx).toBe(1);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      testPassCount: 1,
      cost: 3,
      tokenUsage: { total: 2, numRequests: 1 },
    });
  });

  it('refreshes stale prompt metrics when a deleted coordinate is resumed', async () => {
    const calls: string[] = [];
    const suite: TestSuite = {
      providers: [
        {
          id: () => 'resumed-deletion-target',
          callApi: async (prompt) => {
            calls.push(prompt);
            return { output: prompt, tokenUsage: { total: 2, numRequests: 1 } };
          },
        },
      ],
      prompts: [{ raw: '{{row}}', label: 'Resume prompt' }],
      tests: [{ vars: { row: 'first' } }, { vars: { row: 'second' } }],
    };
    const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
    evalIds.push(evaluation.id);
    await evaluate(suite, evaluation, { maxConcurrency: 1 });
    const stale = (await Eval.findById(evaluation.id))!;
    const target = (await EvalResult.findManyByEvalId(evaluation.id)).find(
      (result) => result.testIdx === 0,
    )!;
    await deleteEvalResult(evaluation.id, target.id);
    expect(stale.prompts[0].metrics?.testPassCount).toBe(2);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics?.testPassCount).toBe(1);

    calls.length = 0;
    const previousResume = cliState.resume;
    cliState.resume = true;
    try {
      await evaluate(suite, stale, { maxConcurrency: 1 });
    } finally {
      cliState.resume = previousResume;
    }

    expect(calls).toEqual(['first']);
    expect(await EvalResult.findManyByEvalId(evaluation.id)).toHaveLength(2);
    expect((await Eval.findById(evaluation.id))?.prompts[0].metrics).toMatchObject({
      testPassCount: 2,
      tokenUsage: { total: 4, numRequests: 2 },
    });
  });

  it.each([
    { phase: 'no assertions', initial: false, comparison: false, total: 3, requests: 1 },
    { phase: 'initial only', initial: true, comparison: false, total: 7, requests: 2 },
    { phase: 'comparison only', initial: false, comparison: true, total: 13, requests: 1 },
    { phase: 'initial and comparison', initial: true, comparison: true, total: 13, requests: 2 },
    { phase: 'cached comparison', initial: false, comparison: true, total: 3, requests: 1 },
    {
      phase: 'cached initial and fresh comparison',
      initial: true,
      comparison: true,
      total: 13,
      requests: 2,
    },
  ])(
    'debits $phase using its persisted grading phases',
    async ({ phase, initial, comparison, total, requests }) => {
      const cachedInitial = phase === 'cached initial and fresh comparison';
      const cachedComparison = phase === 'cached comparison';
      const provider: ApiProvider = {
        id: () => 'deletion-target',
        callApi: async (prompt) => ({
          output: prompt,
          tokenUsage: { total: 2, prompt: 1, completion: 1, numRequests: 1 },
        }),
      };
      const cachedJudge: ApiProvider = {
        id: () => 'deletion-cached-initial-judge',
        callApi: async () => ({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Cached initial grade' }),
          cached: true,
          tokenUsage: { total: 4, prompt: 4, completion: 0, numRequests: 0 },
        }),
      };
      const targetAssertions: Assertion[] = [];
      if (initial) {
        targetAssertions.push(
          cachedInitial
            ? { type: 'llm-rubric', value: 'Accept the response', provider: cachedJudge }
            : {
                type: 'javascript',
                value:
                  '({ pass: true, score: 1, reason: "Initial grade", tokensUsed: { total: 4, prompt: 4, completion: 0 } })',
              },
        );
      }
      if (comparison) {
        targetAssertions.push({ type: 'select-best', value: 'Choose the first response' });
      }
      const suite: TestSuite = {
        providers: [provider],
        prompts: ['First {{row}}', 'Second {{row}}'].map((raw) => ({ raw, label: raw })),
        tests: [
          {
            vars: { row: 'target', initial, cachedComparison },
            options: { provider: comparisonProvider },
            assert: targetAssertions,
          },
          {
            vars: { row: 'survivor' },
            assert: [
              {
                type: 'javascript',
                value:
                  '({ pass: true, score: 1, reason: "Surviving grade", tokensUsed: { total: 3, prompt: 3, completion: 0, numRequests: 1 } })',
              },
            ],
          },
        ],
      };
      const evaluation = await Eval.create({}, suite.prompts, { id: randomUUID() });
      evalIds.push(evaluation.id);
      await evaluate(suite, evaluation, { maxConcurrency: 1 });

      const before = (await Eval.findById(evaluation.id))!;
      const results = await EvalResult.findManyByEvalId(evaluation.id);
      const target = results.find((result) => result.testIdx === 0 && result.promptIdx === 0)!;
      const survivor = results.find((result) => result.testIdx === 1 && result.promptIdx === 0)!;
      expect(results).toHaveLength(4);
      expect(before.prompts[0].metrics?.tokenUsage.assertions).toMatchObject({
        total,
        numRequests: requests,
      });
      if (comparison) {
        const component = target.gradingResult?.componentResults?.find(
          (result) => result.assertion?.type === 'select-best',
        );
        expect(component?.tokensUsed?.numRequests).toBe(0);
        expect(component?.metadata?.cachedResponse).toBe(cachedComparison ? true : undefined);
      }
      if (cachedInitial) {
        // Adding a fresh comparison removes the root cache flag, but keeps incurred usage.
        expect(target.gradingResult?.metadata?.cachedResponse).toBeUndefined();
        expect(target.gradingResult?.tokensUsed?.incurredTokenUsage).toMatchObject({
          total: 6,
          numRequests: 0,
        });
      }

      await deleteEvalResult(evaluation.id, target.id);

      const after = (await Eval.findById(evaluation.id))!;
      const remaining = await EvalResult.findManyByEvalId(evaluation.id);
      expect(remaining).toHaveLength(3);
      expect(remaining.find((result) => result.id === target.id)).toBeUndefined();
      expect(remaining.find((result) => result.id === survivor.id)?.toEvaluateResult()).toEqual(
        survivor.toEvaluateResult(),
      );
      expect(after.prompts[1]).toEqual(before.prompts[1]);
      expect(after.prompts[0].metrics).toMatchObject({
        assertPassCount: 1,
        assertFailCount: 0,
      });
      expect(after.prompts[0].metrics?.tokenUsage).toMatchObject({
        total: 2,
        numRequests: 1,
        assertions: { total: 3, prompt: 3, completion: 0, cached: 0, numRequests: 1 },
      });
      if (cachedInitial || cachedComparison) {
        expect(after.prompts[0].metrics?.tokenUsage.incurredTokenUsage?.assertions).toMatchObject({
          total: 3,
          numRequests: 1,
        });
      }
    },
  );
});
