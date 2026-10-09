import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, isCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { getDb } from '../../src/database/index';
import { evalResultsTable } from '../../src/database/tables';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import { doEval } from '../../src/node/doEval';
import { EchoProvider } from '../../src/providers/echo';
import { ResultFailureReason } from '../../src/types/index';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ProviderResponse, UnifiedConfig } from '../../src/types/index';

const commandOptions = {
  write: true,
  cache: false,
  share: false,
  noShare: true,
  progressBar: false,
  table: false,
};

const scenarios = [false, true].flatMap((resumable) =>
  (['timeout', 'success'] as const).flatMap((outcome) =>
    (['insert', 'none'] as const).map((failure) => ({ resumable, outcome, failure })),
  ),
);

// Exercise real doEval, SQLite transactions, retry cleanup, metrics, and exporters.
// Only the target provider is controlled; SQL triggers inject actual write failures.
describe('eval --retry-errors persistence', () => {
  it.each([...scenarios, { resumable: false, outcome: 'success', failure: 'cleanup' } as const])(
    '$outcome with resumable=$resumable and failure=$failure',
    async ({ resumable, outcome, failure }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-retry-persistence-'));
      const outputPath = path.join(directory, 'results.JSONL');
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
      let phase: 'seed' | 'timeout' | 'success' = 'seed';
      const entered = createDeferred<void>();
      const release = createDeferred<ProviderResponse>();
      const pendingRuns: Promise<unknown>[] = [];
      const provider = vi.spyOn(EchoProvider.prototype, 'callApi').mockImplementation(async () => {
        if (phase === 'seed') {
          return {
            output: 'Original durable response evidence',
            error: 'Original provider error evidence',
            tokenUsage: { total: 7, prompt: 3, completion: 4, numRequests: 1 },
            cost: 0.125,
            metadata: { evidenceMarker: 'original-durable-marker' },
          };
        }
        if (phase === 'timeout') {
          entered.resolve();
          return release.promise;
        }
        return {
          output: 'Successful retry replacement',
          tokenUsage: { total: 11, prompt: 5, completion: 6, numRequests: 1 },
          cost: 0.25,
          metadata: { evidenceMarker: 'successful-retry-marker' },
        };
      });
      const warning = vi.spyOn(logger, 'warn');
      const config: UnifiedConfig = {
        providers: ['echo'],
        prompts: ['Synthetic prompt {{value}}'],
        tests: [{ vars: { value: 'original-evidence' } }],
        evaluateOptions: { timeoutMs: 200, showProgressBar: false, maxConcurrency: 1 },
        sharing: false,
        outputPath,
      };
      const db = await getDb();
      try {
        const seeded = await doEval(commandOptions, config, undefined, { eventSource: 'cli' });
        if (resumable) {
          await db.run(sql`UPDATE eval_results SET metadata = json_set(
            COALESCE(metadata, '{}'), '$.__promptfoo.resumable', json('true')
          ) WHERE eval_id = ${seeded.id}`);
        }
        const readRows = () =>
          db.select().from(evalResultsTable).where(eq(evalResultsTable.evalId, seeded.id));
        const beforeRows = await readRows();
        const beforeMetrics = (await Eval.findById(seeded.id))!.prompts[0].metrics;
        expect(beforeRows).toHaveLength(1);
        expect(beforeRows[0]).toMatchObject({
          failureReason: ResultFailureReason.ERROR,
          error: 'Original provider error evidence',
          response: { output: 'Original durable response evidence' },
        });
        expect(beforeMetrics).toMatchObject({
          testPassCount: 0,
          testFailCount: 0,
          testErrorCount: 1,
          tokenUsage: { total: 7, prompt: 3, completion: 4, numRequests: 1 },
          cost: 0.125,
        });
        if (failure === 'insert') {
          await db.run(sql`CREATE TRIGGER retry_fail_insert BEFORE INSERT ON eval_results BEGIN
            SELECT RAISE(FAIL, 'injected retry insert failure');
          END`);
        } else if (failure === 'cleanup') {
          await db.run(sql`CREATE TRIGGER retry_fail_cleanup BEFORE DELETE ON eval_results BEGIN
            SELECT RAISE(FAIL, 'injected retry cleanup failure');
          END`);
        }

        phase = outcome;
        // Start the deadline clock only after real migrations/configuration have completed.
        // setImmediate stays real so the scheduler's abort turn can settle normally.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        const retry = doEval({ ...commandOptions, retryErrors: true }, {}, undefined, {
          eventSource: 'cli',
        }).then(
          (value) => ({ value, error: undefined }),
          (error: unknown) => ({ value: undefined, error }),
        );
        pendingRuns.push(retry);
        if (outcome === 'timeout') {
          await entered.promise;
          await vi.advanceTimersByTimeAsync(200);
        }
        const result = await retry;
        vi.useRealTimers();
        expect(cliState.resume).toBe(false);
        expect(cliState.retryMode).toBe(false);
        expect(cliState._retryErrorResultIds).toBeUndefined();
        expect(
          process.listeners('SIGINT').filter((listener) => listener.name === 'sigintHandler'),
        ).toEqual(beforeSigint.filter((listener) => listener.name === 'sigintHandler'));
        const rows = await readRows();
        const metrics = (await Eval.findById(seeded.id))!.prompts[0].metrics;
        const jsonl = fs
          .readFileSync(outputPath, 'utf8')
          .trim()
          .split(/\r?\n/)
          .map((line) => JSON.parse(line));
        if (failure === 'insert') {
          expect(result.error).toEqual(
            new Error('Retry results failed to persist. Existing ERROR rows were preserved.'),
          );
          expect(rows).toEqual(beforeRows);
          expect(metrics).toEqual(beforeMetrics);
          expect(jsonl).toHaveLength(1);
          expect(jsonl[0]).toMatchObject({
            id: beforeRows[0].id,
            error: beforeRows[0].error,
            response: beforeRows[0].response,
            metadata: beforeRows[0].metadata,
          });
          expect(JSON.stringify(jsonl)).not.toContain('Successful retry replacement');
          expect(warning).not.toHaveBeenCalledWith(
            'Post-retry cleanup had issues. Retry results are saved.',
            expect.anything(),
          );
        } else {
          expect(result.error).toBeUndefined();
          expect(result.value!.resultPersistenceFailed).toBe(false);
          if (failure === 'cleanup') {
            expect(rows).toHaveLength(2);
            expect(rows).toContainEqual(beforeRows[0]);
            expect(rows.some((row) => row.success)).toBe(true);
            expect(warning).toHaveBeenCalledWith(
              'Post-retry cleanup had issues. Retry results are saved.',
              expect.anything(),
            );
          } else {
            expect(rows).toHaveLength(1);
            expect(rows[0].id).not.toBe(beforeRows[0].id);
            expect(rows[0]).toMatchObject({
              success: outcome === 'success',
              score: outcome === 'success' ? 1 : 0,
              failureReason:
                outcome === 'success' ? ResultFailureReason.NONE : ResultFailureReason.ERROR,
            });
            expect(metrics).toMatchObject({
              testPassCount: outcome === 'success' ? 1 : 0,
              testFailCount: 0,
              testErrorCount: outcome === 'success' ? 0 : 1,
            });
          }
          expect(jsonl.map((row) => row.id).sort()).toEqual(rows.map((row) => row.id).sort());
        }

        // Late target completion must not change the durable result or retry bookkeeping.
        release.resolve({ output: 'Late provider response', tokenUsage: { total: 99 } });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(await readRows()).toEqual(rows);
        await db.run(sql`DROP TRIGGER IF EXISTS retry_fail_insert`);
        await db.run(sql`DROP TRIGGER IF EXISTS retry_fail_cleanup`);

        if (failure === 'insert') {
          phase = 'success';
          const recovered = await doEval({ ...commandOptions, retryErrors: true }, {}, undefined, {
            eventSource: 'cli',
          });
          expect(recovered.resultPersistenceFailed).toBe(false);
          const finalRows = await readRows();
          expect(finalRows).toHaveLength(1);
          expect(finalRows[0]).toMatchObject({
            success: true,
            score: 1,
            response: { output: 'Successful retry replacement' },
          });
          expect(finalRows[0].id).not.toBe(beforeRows[0].id);
          expect((await Eval.findById(seeded.id))!.prompts[0].metrics).toMatchObject({
            testPassCount: 1,
            testFailCount: 0,
            testErrorCount: 0,
            tokenUsage: { total: 11, prompt: 5, completion: 6, numRequests: 1 },
            cost: 0.25,
          });
          expect(provider).toHaveBeenCalledTimes(3);
        } else {
          expect(provider).toHaveBeenCalledTimes(2);
        }
      } finally {
        release.resolve({ output: 'Fixture cleanup' });
        await Promise.allSettled(pendingRuns);
        vi.useRealTimers();
        await db.run(sql`DROP TRIGGER IF EXISTS retry_fail_insert`);
        await db.run(sql`DROP TRIGGER IF EXISTS retry_fail_cleanup`);
        provider.mockRestore();
        warning.mockRestore();
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
