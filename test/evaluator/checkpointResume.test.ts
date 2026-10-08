import './setup';

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { nodeEvaluatorRuntime } from '../../src/node/evaluatorRuntime';
import { deleteErrorResults, recalculatePromptMetrics } from '../../src/node/retry';
import { ResultFailureReason } from '../../src/types/index';
import { JsonlFileWriter } from '../../src/util/exportToFile/writeToFile';
import { writeMultipleOutputs } from '../../src/util/output';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, PromptMetrics, TestSuite } from '../../src/types/index';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describeEvaluator('resumable checkpoint preparation', () => {
  it('rebuilds partial-save accounting and ordinary named metrics while preserving only configured derived values', async () => {
    // Running the configured and unconfigured cases together also checks config-context isolation.
    for (const includeDerived of [true, false]) {
      cliState.resume = false;
      const prompts = [toPrompt('Probe {{case}}')];
      const record = await Eval.create({}, prompts, { id: randomUUID() });
      const controller = new AbortController();
      const started = deferred();
      let firstRowMetrics!: PromptMetrics;
      let phase: 'pause' | 'resume' = 'pause';
      let resumedRecord: Eval | undefined;
      const target: ApiProvider = {
        id: () => 'synthetic-metrics-rebuild',
        callApi: vi.fn(async (_prompt, context, options) => {
          if (context?.vars.case === 'completed') {
            return { output: 'ok', tokenUsage: { total: 5, numRequests: 1 }, cost: 0.05 };
          }
          if (phase === 'resume') {
            // Preparation must complete before the resumed target call starts.
            expect(resumedRecord!.prompts[0].metrics).toMatchObject({
              testPassCount: 1,
              testErrorCount: 1,
              totalLatencyMs: 25,
              cost: expect.closeTo(0.16),
              tokenUsage: { total: 16, numRequests: 2 },
              namedScores: { Quality: 2 },
              namedScoresCount: { Quality: 1 },
              namedScoreWeights: { Quality: 2 },
            });
            if (includeDerived) {
              expect(resumedRecord!.prompts[0].metrics!.namedScores).toMatchObject({
                Average: 1,
                Peak: 42,
              });
            } else {
              expect(resumedRecord!.prompts[0].metrics!.namedScores).not.toHaveProperty('Average');
              expect(resumedRecord!.prompts[0].metrics!.namedScores).not.toHaveProperty('Peak');
            }
            return { output: 'ok', tokenUsage: { total: 7, numRequests: 1 }, cost: 0.07 };
          }
          firstRowMetrics = structuredClone(record.prompts[0].metrics!);
          options?.onProgress?.({
            output: 'Partial evidence',
            tokenUsage: { total: 11, numRequests: 1 },
            cost: 0.11,
          });
          started.resolve();
          return new Promise<never>(() => {});
        }),
      };
      const suite: TestSuite = {
        providers: [target],
        prompts,
        tests: ['completed', 'checkpoint'].map((value) => ({
          vars: { case: value },
          assert: [{ type: 'equals', value: 'ok', metric: 'Quality', weight: 2 }],
        })),
        ...(includeDerived && {
          derivedMetrics: [
            { name: 'Average', value: 'Quality / (2 * __count)' },
            {
              name: 'Peak',
              value: (scores: Record<string, number>) =>
                Math.max(scores.Peak || 42, scores.Average),
            },
          ],
        }),
      };
      vi.useFakeTimers();
      try {
        const interrupted = evaluate(suite, record, {
          maxConcurrency: 1,
          timeoutMs: 1000,
          abortSignal: controller.signal,
        });
        await started.promise;
        await vi.advanceTimersByTimeAsync(25);
        controller.abort();
        await interrupted;
        const rowsBefore = [
          ...(await record.fetchResultsByTestIdx(0)),
          ...(await record.fetchResultsByTestIdx(1)),
        ];
        expect(rowsBefore).toHaveLength(2);
        // Model the durable split: the row committed, but aggregates still describe only
        // the preceding completed case. Unconfigured stale scores must not be preserved.
        firstRowMetrics.namedScores.Quality = 999;
        delete firstRowMetrics.namedScoresCount.Quality;
        firstRowMetrics.namedScoreWeights!.Quality = 999;
        if (!includeDerived) {
          firstRowMetrics.namedScores.Average = 999;
          firstRowMetrics.namedScores.Peak = 999;
        }
        record.prompts[0].metrics = firstRowMetrics;
        await record.addPrompts(record.prompts);

        resumedRecord = (await Eval.findById(record.id))!;
        phase = 'resume';
        cliState.resume = true;
        await evaluate(suite, resumedRecord, { maxConcurrency: 1, timeoutMs: 1000 });
        expect(resumedRecord.getStats()).toMatchObject({
          successes: 2,
          failures: 0,
          errors: 0,
          tokenUsage: { total: 12, numRequests: 2 },
        });
        expect(resumedRecord.prompts[0].metrics).toMatchObject({
          totalLatencyMs: 0,
          cost: expect.closeTo(0.12),
          namedScores: { Quality: 4 },
          namedScoresCount: { Quality: 2 },
          namedScoreWeights: { Quality: 4 },
        });
        if (includeDerived) {
          expect(resumedRecord.prompts[0].metrics!.namedScores).toMatchObject({
            Average: 1,
            Peak: 42,
          });
        }
        expect((await Eval.findById(record.id))!.prompts).toEqual(resumedRecord.prompts);
        expect(await resumedRecord.fetchResultsByTestIdx(1)).toHaveLength(1);
      } finally {
        vi.useRealTimers();
        cliState.resume = false;
      }
    }
  });

  it('leaves saved metric semantics unchanged when resume has no checkpoints', async () => {
    const target: ApiProvider = {
      id: () => 'ordinary-resume-control',
      callApi: vi.fn(async () => ({ output: 'ok' })),
    };
    const suite: TestSuite = { providers: [target], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, {});
    record.prompts[0].metrics!.namedScores.HistoricalValue = 777;
    await record.addPrompts(record.prompts);
    vi.mocked(target.callApi).mockClear();
    cliState.resume = true;
    await evaluate(suite, record, {});
    expect(target.callApi).not.toHaveBeenCalled();
    expect(record.prompts[0].metrics!.namedScores.HistoricalValue).toBe(777);
  });

  it('accounts for a saved checkpoint before a closed stream fails and resumes with correct metrics', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'promptfoo-closed-checkpoint-'));
    const outputPath = path.join(outputDir, 'results.jsonl');
    const writer = new JsonlFileWriter(outputPath);
    await writer.write({ bootstrap: true });
    await writer.close();
    const controller = new AbortController();
    const started = deferred();
    let phase: 'pause' | 'resume' = 'pause';
    const target: ApiProvider = {
      id: () => 'closed-stream-checkpoint',
      callApi: vi.fn(async (_prompt, _context, options) => {
        if (phase === 'resume') {
          return { output: 'Final response', tokenUsage: { total: 7, numRequests: 1 } };
        }
        options?.onProgress?.({
          output: 'Saved evidence',
          tokenUsage: { total: 11, numRequests: 1 },
        });
        started.resolve();
        return new Promise<never>(() => {});
      }),
    };
    const suite: TestSuite = { providers: [target], prompts: [toPrompt('Probe')], tests: [{}] };
    const record = await Eval.create({ outputPath }, suite.prompts, { id: randomUUID() });
    try {
      const paused = evaluate(
        suite,
        record,
        { timeoutMs: 0, abortSignal: controller.signal },
        { ...nodeEvaluatorRuntime, createResultWriters: () => [writer] },
      );
      await started.promise;
      controller.abort();
      await paused;
      const saved = (await Eval.findById(record.id))!;
      expect(saved.getStats()).toMatchObject({
        successes: 0,
        errors: 1,
        tokenUsage: { total: 11, numRequests: 1 },
      });
      expect((await saved.fetchResultsByTestIdx(0))[0].response?.output).toBe('Saved evidence');
      phase = 'resume';
      cliState.resume = true;
      await evaluate(suite, saved, { timeoutMs: 0 });
      expect(saved.getStats()).toMatchObject({
        successes: 1,
        errors: 0,
        tokenUsage: { total: 7, numRequests: 1 },
      });
      await writeMultipleOutputs([outputPath], saved, null);
      const rows = (await readFile(outputPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ success: true, response: { output: 'Final response' } });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it.each([false, true])(
    'preserves queued checkpoints across a global timeout and retry cleanup=%s',
    async (retry) => {
      const firstStarted = deferred();
      const resumedStarted = deferred();
      const controller = new AbortController();
      let phase: 'initial' | 'timed' | 'complete' = 'initial';
      const calls: Array<{ phase: string; index: number }> = [];
      const target: ApiProvider = {
        id: () => 'global-checkpoint-resume',
        callApi: vi.fn(async (_prompt, context, options) => {
          const index = Number(context?.vars.index);
          calls.push({ phase, index });
          if (phase === 'complete') {
            return { output: `Final ${index}`, tokenUsage: { total: 5, numRequests: 1 } };
          }
          options?.onProgress?.({
            output: `Evidence ${phase} ${index}`,
            tokenUsage: { total: phase === 'initial' ? 11 : 7, numRequests: 1 },
            metadata: {
              redteamHistory: [{ prompt: `Probe ${index}`, output: `Evidence ${phase} ${index}` }],
            },
          });
          if (phase === 'initial' && calls.length === 2) {
            firstStarted.resolve();
          }
          if (phase === 'timed') {
            resumedStarted.resolve();
          }
          return new Promise<never>(() => {});
        }),
      };
      const suite: TestSuite = {
        providers: [target],
        prompts: [toPrompt('Probe {{index}}')],
        tests: [0, 1, 2].map((index) => ({ vars: { index } })),
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      vi.useFakeTimers();
      try {
        const initial = evaluate(suite, record, {
          maxConcurrency: 2,
          timeoutMs: 1000,
          abortSignal: controller.signal,
        });
        await firstStarted.promise;
        controller.abort();
        await initial;
        const oldCheckpoints = [
          ...(await record.fetchResultsByTestIdx(0)),
          ...(await record.fetchResultsByTestIdx(1)),
        ];
        expect(oldCheckpoints).toHaveLength(2);
        cliState.resume = true;
        cliState.retryMode = retry;
        if (retry) {
          cliState._retryErrorResultIds = oldCheckpoints.map((row) => row.id);
        }
        phase = 'timed';
        const timed = evaluate(suite, record, {
          maxConcurrency: 1,
          timeoutMs: 1000,
          maxEvalTimeMs: 25,
        });
        await resumedStarted.promise;
        await vi.advanceTimersByTimeAsync(25);
        await timed;
        if (retry) {
          await deleteErrorResults(oldCheckpoints.map((row) => row.id));
          await recalculatePromptMetrics(record);
        }
        const rows = [
          ...(await record.fetchResultsByTestIdx(0)),
          ...(await record.fetchResultsByTestIdx(1)),
          ...(await record.fetchResultsByTestIdx(2)),
        ];
        expect(rows).toHaveLength(3);
        const queued = rows.find((row) => row.testIdx === 1)!;
        expect(queued.id).not.toBe(oldCheckpoints.find((row) => row.testIdx === 1)!.id);
        expect(queued).toMatchObject({
          success: false,
          failureReason: ResultFailureReason.ERROR,
          response: { output: 'Evidence initial 1', tokenUsage: { total: 11, numRequests: 1 } },
          metadata: {
            __promptfoo: { resumable: true },
            redteamHistory: [{ prompt: 'Probe 1', output: 'Evidence initial 1' }],
          },
        });
        const untouched = rows.find((row) => row.testIdx === 2)!;
        expect(untouched.metadata?.__promptfoo?.resumable).toBeUndefined();
        expect(untouched.error).toContain('exceeded max duration');
        expect(record.getStats()).toMatchObject({
          successes: 0,
          errors: 3,
          tokenUsage: { total: 18, numRequests: 2 },
        });
        phase = 'complete';
        cliState.retryMode = false;
        delete cliState._retryErrorResultIds;
        await evaluate(suite, record, { maxConcurrency: 1, timeoutMs: 1000 });
        expect(calls.filter((call) => call.phase === 'complete').map((call) => call.index)).toEqual(
          [0, 1],
        );
        expect(record.getStats()).toMatchObject({
          successes: 2,
          errors: 1,
          tokenUsage: { total: 10, numRequests: 2 },
        });
        expect((await record.toEvaluateSummary()).results).toHaveLength(3);
      } finally {
        delete cliState._retryErrorResultIds;
        cliState.retryMode = false;
        vi.useRealTimers();
      }
    },
  );
});
