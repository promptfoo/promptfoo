import './setup';

import { randomUUID } from 'node:crypto';

import { afterEach, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import * as comparisons from '../../src/matchers/comparison';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { ResultFailureReason } from '../../src/types/index';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { PromptMetrics, TestSuite } from '../../src/types/index';

afterEach(() => {
  vi.restoreAllMocks();
});

describeEvaluator('rating-aware evaluation finalization', () => {
  it.each([true, false])(
    'retains the actual select-best assertion on a provider error (comparison passes: %s)',
    async (comparisonPass) => {
      vi.spyOn(comparisons, 'matchesSelectBest').mockResolvedValue([
        { pass: comparisonPass, score: comparisonPass ? 1 : 0.25, reason: 'Comparison result' },
        { pass: true, score: 1, reason: 'Other response wins' },
      ]);
      const testSuite: TestSuite = {
        providers: [
          {
            id: () => 'comparison-error-provider',
            callApi: async (prompt) =>
              prompt === 'Error' ? { error: 'Provider unavailable' } : { output: 'hello' },
          },
        ],
        prompts: [toPrompt('Error'), toPrompt('Success')],
        tests: [{ assert: [{ type: 'select-best', value: 'Choose the best response' }] }],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

      const assertCounts = {
        assertPassCount: Number(comparisonPass),
        assertFailCount: Number(!comparisonPass),
      };
      const expectedMetrics = {
        ...assertCounts,
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 1,
      };
      const saved = await Eval.findById(evalRecord.id);
      expect(saved!.prompts[0].metrics).toMatchObject(expectedMetrics);
      expect((await saved!.getFilteredMetrics({ filterMode: 'all' }))[0]).toMatchObject(
        expectedMetrics,
      );
      const result = (await EvalResult.findManyByEvalId(evalRecord.id)).find(
        (row) => row.promptIdx === 0,
      )!;
      expect(result).toMatchObject({ success: false, failureReason: ResultFailureReason.ERROR });
      expect(result.gradingResult).toMatchObject({
        pass: false,
        componentResults: [{ pass: comparisonPass, assertion: { type: 'select-best' } }],
      });

      const rated = await EvalResult.submitRating(
        evalRecord.id,
        result.id,
        { pass: true, score: 1, reason: 'Reviewed provider error' },
        'rate',
      );
      expect(rated.status).toBe('updated');
      expect((await Eval.findById(evalRecord.id))!.prompts[0].metrics).toMatchObject({
        assertPassCount: assertCounts.assertPassCount + 1,
        assertFailCount: assertCounts.assertFailCount,
        testPassCount: 1,
        testErrorCount: 0,
      });
      const cleared = await EvalResult.submitRating(
        evalRecord.id,
        result.id,
        { pass: true, score: 1, reason: 'Clear manual override' },
        'clear',
      );
      expect(cleared.status).toBe('updated');
      expect(await EvalResult.findById(result.id)).toMatchObject({
        success: false,
        failureReason: ResultFailureReason.ERROR,
        score: comparisonPass ? 0 : 0.25,
      });
      expect((await Eval.findById(evalRecord.id))!.prompts[0].metrics).toMatchObject(
        expectedMetrics,
      );
    },
  );

  it.each(['custom scoring baseline', 'live manual rating'] as const)(
    'includes synthesized timeout latency in persisted and extension metrics with %s',
    async (history) => {
      let targetStarted!: () => void;
      const slowTargetStarted = new Promise<void>((resolve) => {
        targetStarted = resolve;
      });
      const testSuite: TestSuite = {
        providers: [
          {
            id: () => 'timeout-provider',
            callApi: async (prompt, _context, options) => {
              if (prompt === 'first') {
                return { output: 'hello', latencyMs: 5 };
              }
              return new Promise((_resolve, reject) => {
                options?.abortSignal?.addEventListener(
                  'abort',
                  () => reject(new Error('Target aborted by evaluation deadline')),
                  { once: true },
                );
                targetStarted();
              });
            },
          },
        ],
        prompts: [toPrompt('{{name}}')],
        tests: ['first', 'blocked', 'unstarted'].map((name) => ({
          vars: { name },
          assert: [{ type: 'contains', value: 'hello' }],
          ...(history === 'custom scoring baseline' && {
            assertScoringFunction: () => ({ pass: true, score: 0.75, reason: 'Custom score' }),
          }),
        })),
        extensions: ['file://inspect-final-metrics.js'],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      const addResult = evalRecord.addResult.bind(evalRecord);
      let ratedId: string | undefined;
      vi.spyOn(evalRecord, 'addResult').mockImplementation(async (row) => {
        await addResult(row);
        if (row.testIdx === 0 && history === 'live manual rating') {
          const [saved] = await EvalResult.findManyByEvalId(evalRecord.id, { testIdx: 0 });
          ratedId = saved.id;
          const rated = await EvalResult.submitRating(
            evalRecord.id,
            saved.id,
            { pass: false, score: 0, reason: 'Manual failure while streaming' },
            'rate',
          );
          expect(rated.status).toBe('updated');
        }
      });
      let extensionMetrics: PromptMetrics | undefined;
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
        if (hook === 'afterAll' && 'prompts' in context) {
          extensionMetrics = structuredClone(context.prompts[0].metrics);
        }
        return context;
      });

      vi.useFakeTimers();
      const running = evaluate(testSuite, evalRecord, { maxConcurrency: 1, maxEvalTimeMs: 100 });
      await slowTargetStarted;
      await vi.advanceTimersByTimeAsync(100);
      await running;

      const rows = await EvalResult.findManyByEvalId(evalRecord.id);
      expect(rows).toHaveLength(3);
      expect(rows.find((row) => row.testIdx === 2)).toMatchObject({
        success: false,
        failureReason: ResultFailureReason.ERROR,
        error: 'Evaluation exceeded max duration of 100ms',
        latencyMs: 100,
      });
      const totalLatencyMs = rows.reduce((sum, row) => sum + row.latencyMs, 0);
      const expectedMetrics = {
        testPassCount: history === 'live manual rating' ? 0 : 1,
        testFailCount: history === 'live manual rating' ? 1 : 0,
        testErrorCount: 2,
        totalLatencyMs,
      };
      expect((await Eval.findById(evalRecord.id))!.prompts[0].metrics).toMatchObject(
        expectedMetrics,
      );
      expect(extensionMetrics).toMatchObject(expectedMetrics);
      if (history === 'live manual rating') {
        expect(ratedId).toBeDefined();
        const cleared = await EvalResult.submitRating(
          evalRecord.id,
          ratedId!,
          { pass: false, score: 0, reason: 'Clear streamed rating' },
          'clear',
        );
        expect(cleared.status).toBe('updated');
        expect((await Eval.findById(evalRecord.id))!.prompts[0].metrics).toMatchObject({
          testPassCount: 1,
          testFailCount: 0,
          testErrorCount: 2,
          totalLatencyMs,
        });
      }
    },
  );
});
