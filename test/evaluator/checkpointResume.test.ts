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
  it.each([
    {
      name: 'absent',
      checkpointUsage: undefined,
      replacementUsage: undefined,
      beforeRequests: 2,
      afterRequests: 2,
      afterTotal: 0,
    },
    {
      name: 'absent to explicit zero',
      checkpointUsage: undefined,
      replacementUsage: { total: 0, numRequests: 0 },
      beforeRequests: 2,
      afterRequests: 1,
      afterTotal: 0,
    },
    {
      name: 'partial',
      checkpointUsage: { total: 11 },
      replacementUsage: { total: 5 },
      beforeRequests: 2,
      afterRequests: 2,
      afterTotal: 5,
    },
    {
      name: 'explicit zero',
      checkpointUsage: { total: 0, numRequests: 0 },
      replacementUsage: { total: 0, numRequests: 0 },
      beforeRequests: 1,
      afterRequests: 1,
      afterTotal: 0,
    },
  ])(
    'preserves inferred requests and reported zero counts for $name usage',
    async ({ checkpointUsage, replacementUsage, beforeRequests, afterRequests, afterTotal }) => {
      const controller = new AbortController();
      const started = deferred();
      let phase: 'pause' | 'resume' = 'pause';
      let resumedRecord: Eval;
      const target: ApiProvider = {
        id: () => 'request-count-checkpoint',
        callApi: vi.fn(async (_prompt, context, options) => {
          if (context?.vars.index === 0) {
            return { output: 'Completed without token usage' };
          }
          if (phase === 'resume') {
            expect(resumedRecord.prompts[0].metrics).toMatchObject({
              testPassCount: 1,
              testErrorCount: 1,
              totalLatencyMs: 10,
              tokenUsage: { numRequests: beforeRequests },
            });
            return { output: 'Finished', tokenUsage: replacementUsage };
          }
          options?.onProgress?.({ output: 'Checkpoint', tokenUsage: checkpointUsage });
          started.resolve();
          return new Promise<never>(() => {});
        }),
      };
      const suite: TestSuite = {
        providers: [target],
        prompts: [toPrompt('Probe {{index}}')],
        tests: [0, 1].map((index) => ({ vars: { index } })),
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      vi.useFakeTimers();
      try {
        const paused = evaluate(suite, record, {
          maxConcurrency: 1,
          timeoutMs: 1000,
          abortSignal: controller.signal,
        });
        await started.promise;
        await vi.advanceTimersByTimeAsync(10);
        controller.abort();
        await paused;
        expect(record.prompts[0].metrics!.tokenUsage.numRequests).toBe(beforeRequests);
        resumedRecord = (await Eval.findById(record.id))!;
        phase = 'resume';
        cliState.resume = true;
        await evaluate(suite, resumedRecord, { maxConcurrency: 1, timeoutMs: 1000 });
        expect(target.callApi).toHaveBeenCalledTimes(3);
        expect(resumedRecord.prompts[0].metrics).toMatchObject({
          testPassCount: 2,
          testFailCount: 0,
          testErrorCount: 0,
          totalLatencyMs: 0,
          tokenUsage: { numRequests: afterRequests, total: afterTotal },
        });
        expect(await resumedRecord.fetchResultsByTestIdx(0)).toHaveLength(1);
        expect(await resumedRecord.fetchResultsByTestIdx(1)).toHaveLength(1);
        expect((await Eval.findById(record.id))!.prompts).toEqual(resumedRecord.prompts);
      } finally {
        vi.useRealTimers();
      }
    },
  );

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
          expect(cliState.safeMode).toBe(true);
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
                Average: 0.5,
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
        const interrupted = cliState.withSafeMode(true, () =>
          evaluate(suite, record, {
            maxConcurrency: 1,
            timeoutMs: 1000,
            abortSignal: controller.signal,
          }),
        );
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
        await cliState.withSafeMode(true, () =>
          evaluate(suite, resumedRecord!, { maxConcurrency: 1, timeoutMs: 1000 }),
        );
        expect(cliState.safeMode).not.toBe(true);
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

  it('rebuilds an ordinary completed eval without replaying function metrics', async () => {
    const functionMetric = vi.fn(() => 777);
    const target: ApiProvider = {
      id: () => 'ordinary-resume-control',
      callApi: vi.fn(async () => ({ output: 'ok' })),
    };
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('Probe')],
      tests: [{ assert: [{ type: 'equals', value: 'ok', metric: 'Quality', weight: 2 }] }],
      derivedMetrics: [
        { name: 'HistoricalValue', value: functionMetric },
        { name: 'Average', value: 'Quality / (2 * __count)' },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, {});
    record.prompts[0].metrics!.namedScores.Quality = 999;
    record.prompts[0].metrics!.namedScores.Average = 999;
    await record.addPrompts(record.prompts);
    vi.mocked(target.callApi).mockClear();
    cliState.resume = true;
    await evaluate(suite, record, {});
    expect(target.callApi).not.toHaveBeenCalled();
    expect(functionMetric).toHaveBeenCalledOnce();
    expect(record.prompts[0].metrics).toMatchObject({
      testPassCount: 1,
      testFailCount: 0,
      testErrorCount: 0,
      namedScores: { Quality: 2, Average: 1, HistoricalValue: 777 },
      namedScoresCount: { Quality: 1 },
      namedScoreWeights: { Quality: 2 },
      tokenUsage: { numRequests: 1 },
    });
    expect((await Eval.findById(record.id))!.prompts).toEqual(record.prompts);
  });

  it('repairs metrics and expressions after the last replacement commits but its aggregate flush fails', async () => {
    const controller = new AbortController();
    const started = deferred();
    let phase: 'pause' | 'complete' = 'pause';
    const functionMetric = vi.fn((scores: Record<string, number>) => 42 + (scores.Quality || 0));
    const target: ApiProvider = {
      id: () => 'last-checkpoint-flush',
      callApi: vi.fn(async (_prompt, _context, options) => {
        if (phase === 'complete') {
          return {
            output: 'Completed',
            cost: 0.07,
            tokenUsage: {
              total: 7,
              numRequests: 1,
              attacker: { total: 13, numRequests: 1 },
              assertions: { total: 17, numRequests: 1 },
            },
          };
        }
        options?.onProgress?.({
          output: 'Checkpoint',
          cost: 0.11,
          tokenUsage: {
            total: 11,
            numRequests: 1,
            attacker: { total: 19, numRequests: 1 },
            assertions: { total: 23, numRequests: 1 },
          },
        });
        started.resolve();
        return new Promise<never>(() => {});
      }),
    };
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('Probe')],
      tests: [
        {
          assert: [
            { type: 'equals', value: 'Completed', metric: 'Quality', weight: 2 },
            { type: 'contains', value: 'Completed', metric: 'Correctness' },
          ],
        },
      ],
      derivedMetrics: [
        { name: 'Average', value: 'Quality / (2 * __count)' },
        { name: 'FunctionValue', value: functionMetric },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    vi.useFakeTimers();
    try {
      const paused = evaluate(suite, record, {
        maxConcurrency: 1,
        timeoutMs: 1000,
        abortSignal: controller.signal,
      });
      await started.promise;
      await vi.advanceTimersByTimeAsync(10);
      controller.abort();
      await paused;
      expect(functionMetric).toHaveBeenCalledOnce();
      const append = record.addResult.bind(record);
      const flush = record.addPrompts.bind(record);
      let replaced = false;
      const appendSpy = vi.spyOn(record, 'addResult').mockImplementation(async (row, options) => {
        await append(row, options);
        replaced = row.success;
      });
      const flushSpy = vi.spyOn(record, 'addPrompts').mockImplementation((prompts) => {
        if (replaced) {
          throw new Error('Aggregate flush unavailable');
        }
        return flush(prompts);
      });
      phase = 'complete';
      cliState.resume = true;
      try {
        await expect(
          evaluate(suite, record, { maxConcurrency: 1, timeoutMs: 1000 }),
        ).rejects.toThrow('Aggregate flush unavailable');
      } finally {
        appendSpy.mockRestore();
        flushSpy.mockRestore();
      }
      const fresh = (await Eval.findById(record.id))!;
      expect(await fresh.fetchResultsByTestIdx(0)).toHaveLength(1);
      expect((await fresh.fetchResultsByTestIdx(0))[0].success).toBe(true);
      expect(fresh.prompts[0].metrics).toMatchObject({
        testPassCount: 0,
        testErrorCount: 1,
        tokenUsage: { total: 11 },
        namedScores: { Average: 0, FunctionValue: 42 },
      });
      expect(functionMetric).toHaveBeenCalledTimes(2);
      await evaluate(suite, fresh, { maxConcurrency: 1, timeoutMs: 1000 });
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(functionMetric).toHaveBeenCalledTimes(2);
      expect(fresh.prompts[0].metrics).toMatchObject({
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        score: 1,
        assertPassCount: 2,
        assertFailCount: 0,
        totalLatencyMs: 0,
        cost: 0.07,
        tokenUsage: {
          total: 7,
          numRequests: 1,
          attacker: { total: 13, numRequests: 1 },
          assertions: { total: 17, numRequests: 1 },
        },
        namedScores: { Quality: 2, Correctness: 1, Average: 1, FunctionValue: 42 },
        namedScoresCount: { Quality: 1, Correctness: 1 },
        namedScoreWeights: { Quality: 2, Correctness: 1 },
      });
      expect((await Eval.findById(record.id))!.prompts).toEqual(fresh.prompts);
    } finally {
      vi.useRealTimers();
    }
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

  it('keeps a single interruption row when global cancellation cannot write JSONL', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'promptfoo-global-writer-error-'));
    // Opening a directory as a JSONL destination produces a real asynchronous stream error.
    const writer = new JsonlFileWriter(outputDir);
    const write = vi.spyOn(writer, 'write');
    const started = deferred();
    let phase: 'timed' | 'resume' = 'timed';
    const target: ApiProvider = {
      id: () => 'global-writer-error',
      callApi: vi.fn(async (_prompt, _context, options) => {
        if (phase === 'resume') {
          return { output: 'Completed', tokenUsage: { total: 7, numRequests: 1 } };
        }
        options?.onProgress?.({
          output: 'Saved evidence',
          tokenUsage: { total: 11, numRequests: 1 },
        });
        started.resolve();
        return new Promise<never>(() => {});
      }),
    };
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('Probe {{index}}')],
      tests: [0, 1].map((index) => ({ vars: { index } })),
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    vi.useFakeTimers();
    try {
      const timed = evaluate(
        suite,
        record,
        { maxConcurrency: 1, timeoutMs: 1000, maxEvalTimeMs: 25 },
        { ...nodeEvaluatorRuntime, createResultWriters: () => [writer] },
      );
      await started.promise;
      await vi.advanceTimersByTimeAsync(25);
      await timed;
      expect(write).toHaveBeenCalledOnce();
      await expect(write.mock.results[0].value).rejects.toThrow('Failed to write JSONL output');
      await expect(writer.close()).rejects.toThrow('Failed to close JSONL output');
      const saved = (await Eval.findById(record.id))!;
      expect(await saved.fetchResultsByTestIdx(0)).toHaveLength(1);
      expect((await saved.fetchResultsByTestIdx(0))[0]).toMatchObject({
        response: { output: 'Saved evidence' },
        metadata: { __promptfoo: { resumable: true } },
      });
      expect(await saved.fetchResultsByTestIdx(1)).toHaveLength(1);
      expect(saved.prompts[0].metrics).toMatchObject({
        testPassCount: 0,
        testFailCount: 0,
        testErrorCount: 2,
        totalLatencyMs: 50,
        tokenUsage: { total: 11, numRequests: 1 },
      });
      phase = 'resume';
      cliState.resume = true;
      await evaluate(suite, saved, { maxConcurrency: 1, timeoutMs: 1000 });
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(await saved.fetchResultsByTestIdx(0)).toHaveLength(1);
      expect(saved.prompts[0].metrics).toMatchObject({
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 1,
        totalLatencyMs: 25,
        tokenUsage: { total: 7, numRequests: 1 },
      });
      expect((await Eval.findById(record.id))!.prompts).toEqual(saved.prompts);
    } finally {
      vi.useRealTimers();
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it.each([
    { retry: false, strip: false },
    { retry: true, strip: false },
    { retry: false, strip: true },
    { retry: true, strip: true },
  ])(
    'preserves queued checkpoints across a global timeout (retry=$retry, strip=$strip)',
    async ({ retry, strip }) => {
      const outputDir = await mkdtemp(path.join(tmpdir(), 'promptfoo-queued-checkpoint-'));
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
        if (strip) {
          vi.stubEnv('PROMPTFOO_STRIP_RESPONSE_OUTPUT', 'true');
          vi.stubEnv('PROMPTFOO_STRIP_METADATA', 'true');
          vi.stubEnv('PROMPTFOO_STRIP_TEST_VARS', 'true');
          vi.stubEnv('PROMPTFOO_STRIP_PROMPT_TEXT', 'true');
          vi.stubEnv('PROMPTFOO_STRIP_GRADING_RESULT', 'true');
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
        expect(queued.testCase.vars).toEqual({ index: 1 });
        expect(queued.prompt.raw).toBe('Probe 1');
        const outputPath = path.join(outputDir, 'results.jsonl');
        await writeMultipleOutputs([outputPath], record, null);
        const exported = (await readFile(outputPath, 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
          .find((row) => row.testIdx === 1);
        expect(exported).toMatchObject(
          strip
            ? {
                response: { output: '[output stripped]' },
                metadata: {},
                vars: {},
                prompt: { raw: '[prompt stripped]' },
                gradingResult: null,
              }
            : { response: { output: 'Evidence initial 1' }, vars: { index: 1 } },
        );
        expect((await record.fetchResultsByTestIdx(1))[0].response?.output).toBe(
          'Evidence initial 1',
        );
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
        vi.unstubAllEnvs();
        vi.useRealTimers();
        await rm(outputDir, { recursive: true, force: true });
      }
    },
  );
});
