import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, isCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { doEval } from '../../src/node/doEval';
import { EchoProvider } from '../../src/providers/echo';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import { ResultFailureReason } from '../../src/types/index';
import { writeMultipleOutputs } from '../../src/util/output';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider, UnifiedConfig } from '../../src/types/index';

describe('persisted CLI pause drains completed deferred grading', () => {
  it.each(['drain and resume', 'caller cancellation after pause'] as const)(
    '%s through doEval and its installed SIGINT handler',
    async (mode) => {
      // Keep doEval, configuration loading, evaluator, queue, DB, and exporters real.
      // The global backend setup supplies the shared SQLite test database; doEval
      // runs real migrations because write is true. This is not a subprocess test.
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-deferred-pause-'));
      const restoreEnv = mockProcessEnv({
        PROMPTFOO_DISABLE_TELEMETRY: 'true',
        PROMPTFOO_DISABLE_SHARING: 'true',
        PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      });
      const previousCliState = {
        basePath: cliState.basePath,
        config: cliState.config,
        selectedProviderConfigs: cliState.selectedProviderConfigs,
        maxConcurrency: cliState.maxConcurrency,
        resume: cliState.resume,
        retryMode: cliState.retryMode,
        _retryErrorResultIds: cliState._retryErrorResultIds,
      };
      const previousExitCode = process.exitCode;
      const cacheWasEnabled = isCacheEnabled();
      const beforeSigint = process.listeners('SIGINT');
      const caller = new AbortController();
      const callerReason = Object.assign(new Error('caller cancelled the active deferred judge'), {
        name: 'AbortError',
      });
      const alphaQueued = createDeferred<void>();
      const betaEntered = createDeferred<void>();
      const judgeEntered = createDeferred<void>();
      const releases: (() => void)[] = [];
      const runs: Promise<Eval>[] = [];
      const targetCalls: string[] = [];
      const judgeCalls: string[] = [];
      const queuedSignals: (AbortSignal | undefined)[] = [];
      let betaSignal: AbortSignal | undefined;
      let judgeSignal: AbortSignal | undefined;
      let firstQueue: ProviderGroupedCallQueue | undefined;
      let resuming = false;
      let judgeStartedAfterPause = false;
      let watchdogFired = false;

      // Cleanup bound only: ordering is established by real enqueue and provider
      // entry, never by sleeping until an assumed scheduler turn.
      const watchdog = setTimeout(() => {
        watchdogFired = true;
        caller.abort(new Error('deferred pause fixture did not reach its barriers'));
        for (const release of releases) {
          release();
        }
      }, 5_000);

      const holdUntilAbort = (signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          const finish = (error?: unknown) => {
            signal.removeEventListener('abort', onAbort);
            if (error === undefined) {
              resolve();
            } else {
              reject(error);
            }
          };
          const onAbort = () => finish(signal.reason);
          releases.push(() => finish());
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener('abort', onAbort, { once: true });
          }
        });

      const nativeEnqueue = ProviderGroupedCallQueue.prototype.enqueue;
      const enqueue = vi
        .spyOn(ProviderGroupedCallQueue.prototype, 'enqueue')
        .mockImplementation(function <T>(
          this: ProviderGroupedCallQueue,
          providerId: string,
          call: () => Promise<T>,
          signal?: AbortSignal,
        ): Promise<T> {
          const pending = nativeEnqueue.call(this, providerId, call, signal) as Promise<T>;
          if (providerId === 'echo' && !resuming) {
            // The actual task is already in the actual queue at this barrier.
            firstQueue = this;
            queuedSignals.push(signal);
            expect(this.hasJobs()).toBe(true);
            alphaQueued.resolve();
          }
          return pending;
        });

      const nativeEcho = EchoProvider.prototype.callApi;
      const providerCalls = vi
        .spyOn(EchoProvider.prototype, 'callApi')
        .mockImplementation(async function (
          this: EchoProvider,
          input,
          context,
          options: Parameters<ApiProvider['callApi']>[2],
        ) {
          if (this.config?.pauseFixtureRole === 'judge') {
            judgeCalls.push(input);
            judgeSignal = options?.abortSignal;
            judgeEntered.resolve();
            if (mode === 'caller cancellation after pause' && !resuming) {
              expect(judgeSignal).toBeDefined();
              await holdUntilAbort(judgeSignal!);
            }
            // The primary case's local judge deliberately ignores the optional
            // signal. An aborted queued task must not be confused with a provider
            // voluntarily honoring that signal inside callApi.
            return {
              output: JSON.stringify({
                pass: true,
                score: 1,
                reason: 'Local deferred grade passed',
              }),
              cost: 0,
              tokenUsage: { total: 0, prompt: 0, completion: 0, numRequests: 1 },
            };
          }
          if (this.config?.pauseFixtureRole === 'target') {
            targetCalls.push(input);
            if (input === 'beta' && !resuming) {
              betaSignal = options?.abortSignal;
              expect(betaSignal).toBeDefined();
              betaEntered.resolve();
              await holdUntilAbort(betaSignal!);
            }
            return {
              output: 'Completed ' + input,
              cost: 0.25,
              tokenUsage: { total: 5, prompt: 2, completion: 3, numRequests: 1 },
            };
          }
          return nativeEcho.call(this, input, context, options);
        });

      const unexpectedFetch = vi.fn<typeof fetch>(() => {
        throw new Error('This local doEval integration fixture must not issue HTTP');
      });
      vi.stubGlobal('fetch', unexpectedFetch);
      const finalJson = path.join(directory, 'resumed.json');
      const finalJsonl = path.join(directory, 'resumed.jsonl');
      const config: UnifiedConfig = {
        description: 'Completed target grading survives CLI pause',
        prompts: ['{{topic}}'],
        // A provider map keeps the public loader route ("echo") separate from
        // its scheduler ID. These plain config values survive real DB resume.
        providers: [
          { echo: { id: 'deferred-pause-target', config: { pauseFixtureRole: 'target' } } },
        ],
        tests: ['alpha', 'beta', 'gamma'].map((topic) => ({ vars: { topic } })),
        defaultTest: {
          options: {
            provider: { id: 'echo', config: { pauseFixtureRole: 'judge' } },
            rubricPrompt: '{{output}}',
          },
          assert: [{ type: 'llm-rubric', value: 'Approve the harmless local answer.' }],
        },
        outputPath: [finalJson, finalJsonl],
      };
      const callOptions = {
        eventSource: 'cli' as const,
        maxConcurrency: 1,
        timeoutMs: -1,
        maxEvalTimeMs: 0,
        showProgressBar: false,
        abortSignal: caller.signal,
      };
      const command = { write: true, cache: false, share: false, table: false };
      const readJsonl = (filename: string) =>
        fs
          .readFileSync(filename, 'utf8')
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      const assertAlphaAccounting = (row: {
        response?: { output?: unknown; cost?: number; tokenUsage?: unknown };
        cost?: number;
      }) => {
        expect(row.response).toMatchObject({
          output: 'Completed alpha',
          cost: 0.25,
          tokenUsage: { total: 5, prompt: 2, completion: 3, numRequests: 1 },
        });
        expect(row.cost).toBe(0.25);
      };

      try {
        const pending = doEval(command, config, undefined, callOptions);
        runs.push(pending);
        await Promise.race([
          Promise.all([alphaQueued.promise, betaEntered.promise]),
          pending.then(() => {
            throw new Error('Evaluation finished before queued alpha and active beta barriers');
          }),
        ]);
        expect(targetCalls).toEqual(['alpha', 'beta']);
        expect(judgeCalls).toEqual([]);
        expect(queuedSignals).toHaveLength(1);
        expect(queuedSignals[0]?.aborted).toBe(false);
        expect(firstQueue?.hasJobs()).toBe(true);
        expect(betaSignal?.aborted).toBe(false);

        const installed = process
          .listeners('SIGINT')
          .filter((listener) => !beforeSigint.includes(listener));
        expect(installed).toHaveLength(1);
        // Invoke the real installed doEval handler, leaving Vitest's own SIGINT
        // listener alone. process.on/removeListener remain unmocked.
        installed[0]('SIGINT');
        expect(betaSignal?.aborted).toBe(true);
        expect(caller.signal.aborted).toBe(false);

        if (mode === 'caller cancellation after pause') {
          judgeStartedAfterPause = await Promise.race([
            judgeEntered.promise.then(() => true),
            pending.then(() => false),
          ]);
          if (judgeStartedAfterPause) {
            expect(judgeSignal?.aborted).toBe(false);
            caller.abort(callerReason);
          }
        }

        const paused = await pending;
        expect(watchdogFired).toBe(false);
        expect(paused.persisted).toBe(true);
        expect(callOptions.abortSignal).toBe(caller.signal);
        expect(firstQueue?.hasJobs()).toBe(false);
        expect(process.listeners('SIGINT')).toEqual(beforeSigint);
        expect(targetCalls).toEqual(['alpha', 'beta']);

        // Reload from the DB instead of reading evaluator-owned transient rows.
        const saved = await Eval.findById(paused.id);
        expect(saved).toBeDefined();
        const pausedRows = await saved!.getResults();
        expect(pausedRows).toHaveLength(1);
        expect(pausedRows[0].testIdx).toBe(0);
        assertAlphaAccounting(pausedRows[0]);
        expect(await EvalResult.getCompletedIndexPairs(paused.id)).toEqual(new Set(['0:0']));

        // A paused doEval returns before its normal reporting/export branch.
        // Exercise the real exporters explicitly on the reloaded partial eval.
        const pausedJson = path.join(directory, 'paused.json');
        const pausedJsonl = path.join(directory, 'paused.jsonl');
        await writeMultipleOutputs([pausedJson, pausedJsonl], saved!, null);
        const pausedExports = [
          JSON.parse(fs.readFileSync(pausedJson, 'utf8')).results.results,
          readJsonl(pausedJsonl),
        ];

        if (mode === 'caller cancellation after pause') {
          expect(
            judgeStartedAfterPause,
            'CLI pause must admit the queued completed-target judge before caller cancellation',
          ).toBe(true);
          expect(judgeCalls).toEqual(['Completed alpha']);
          expect(judgeSignal?.reason).toBe(callerReason);
          expect(callerReason.name).toBe('AbortError');
          expect(pausedRows[0].success).toBe(false);
          expect(pausedRows[0].failureReason).toBe(ResultFailureReason.ERROR);
          expect(pausedRows[0].error).toContain(callerReason.message);
          for (const rows of pausedExports) {
            expect(rows).toHaveLength(1);
            assertAlphaAccounting(rows[0]);
            expect(rows[0].success).toBe(false);
            expect(rows[0].failureReason).toBe(ResultFailureReason.ERROR);
            expect(rows[0].error).toContain(callerReason.message);
          }
          expect(unexpectedFetch).not.toHaveBeenCalled();
          return;
        }

        // RED: current doEval puts its pause signal on this already-queued task,
        // leaving the completed alpha target with an ERROR and no judge call.
        expect(
          pausedRows[0].success,
          'CLI pause must preserve the completed alpha target with its deferred passing grade',
        ).toBe(true);
        expect(pausedRows[0].failureReason).toBe(ResultFailureReason.NONE);
        expect(pausedRows[0].gradingResult).toMatchObject({ pass: true, score: 1 });
        expect(judgeCalls).toEqual(['Completed alpha']);
        expect(judgeSignal?.aborted).toBe(false);
        for (const rows of pausedExports) {
          expect(rows).toHaveLength(1);
          assertAlphaAccounting(rows[0]);
          expect(rows[0].success).toBe(true);
          expect(rows[0].gradingResult).toMatchObject({ pass: true, score: 1 });
        }

        resuming = true;
        const resumeCommand = { ...command, resume: paused.id };
        const resumedRun = doEval(resumeCommand, {}, undefined, {
          eventSource: 'cli',
          abortSignal: caller.signal,
        });
        runs.push(resumedRun);
        const resumed = await resumedRun;
        expect(resumed.id).toBe(paused.id);
        const reloaded = await Eval.findById(paused.id);
        const finalRows = await reloaded!.getResults();
        expect(finalRows).toHaveLength(3);
        expect(finalRows.map((row) => row.testIdx).sort()).toEqual([0, 1, 2]);
        const finalAlpha = finalRows.find((row) => row.testIdx === 0)!;
        expect(finalAlpha.id).toBe(pausedRows[0].id);
        assertAlphaAccounting(finalAlpha);
        expect(finalRows.every((row) => row.success)).toBe(true);
        expect(targetCalls).toEqual(['alpha', 'beta', 'beta', 'gamma']);
        expect(judgeCalls).toEqual(['Completed alpha', 'Completed beta', 'Completed gamma']);
        expect(await EvalResult.getCompletedIndexPairs(paused.id)).toEqual(
          new Set(['0:0', '1:0', '2:0']),
        );
        for (const rows of [
          JSON.parse(fs.readFileSync(finalJson, 'utf8')).results.results,
          readJsonl(finalJsonl),
        ]) {
          expect(rows).toHaveLength(3);
          expect(rows.map((row: { testIdx: number }) => row.testIdx).sort()).toEqual([0, 1, 2]);
          expect(rows.every((row: { success: boolean }) => row.success)).toBe(true);
          assertAlphaAccounting(rows.find((row: { testIdx: number }) => row.testIdx === 0));
        }
        // Successful reporting attempts one opt-out notification even with telemetry disabled.
        // The fetch stub still rejects it before transport; every other request fails this oracle.
        expect(unexpectedFetch).toHaveBeenCalledTimes(1);
        const [deniedUrl, deniedOptions] = unexpectedFetch.mock.calls[0];
        expect(deniedUrl).toBe('https://r.promptfoo.app/');
        expect(deniedOptions).toMatchObject({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        expect(JSON.parse(String(deniedOptions?.body))).toMatchObject({
          event: 'feature_used',
          meta: { feature: 'telemetry disabled' },
        });
        expect(watchdogFired).toBe(false);
        expect(process.listeners('SIGINT')).toEqual(beforeSigint);
      } finally {
        caller.abort(new Error('deferred pause fixture cleanup'));
        for (const release of releases) {
          release();
        }
        await Promise.allSettled(runs);
        clearTimeout(watchdog);
        for (const listener of process.listeners('SIGINT')) {
          if (!beforeSigint.includes(listener)) {
            process.removeListener('SIGINT', listener);
          }
        }
        enqueue.mockRestore();
        providerCalls.mockRestore();
        vi.unstubAllGlobals();
        if (cacheWasEnabled) {
          enableCache();
        } else {
          disableCache();
        }
        Object.assign(cliState, previousCliState);
        process.exitCode = previousExitCode;
        restoreEnv();
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
