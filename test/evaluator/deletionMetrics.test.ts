import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { EvalRunningError } from '../../src/database/evalRun';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { deleteEval, deleteEvalResult } from '../../src/util/database';
import { createDeferred } from '../util/utils';

import type { ApiProvider, Assertion, TestSuite } from '../../src/types/index';

describe('deleting evaluated results preserves surviving token usage', () => {
  const evalIds: string[] = [];
  let fixtureDir: string;
  let comparisonProvider: string;

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
