import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, isCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import { getDb } from '../../src/database/index';
import { evalResultsTable } from '../../src/database/tables';
import logger from '../../src/logger';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { doEval, EvalRunError } from '../../src/node/doEval';
import { recalculatePromptMetrics } from '../../src/node/promptMetrics';
import { EchoProvider } from '../../src/providers/echo';
import { ResultFailureReason } from '../../src/types/index';
import { writeMultipleOutputs } from '../../src/util/output';
import { mockProcessEnv } from '../util/utils';

import type { UnifiedConfig } from '../../src/types/index';

interface Scenario {
  name: string;
  mode: 'resume' | 'fresh' | 'no-write' | 'pause';
  outcome: 'PASS' | 'FAIL';
  inject?: boolean;
  api?: boolean;
  complete?: boolean;
  threshold?: number;
  brokenOutput?: boolean;
}
const scenarios: Scenario[] = [
  { name: 'CLI resume unsaved failure', mode: 'resume', outcome: 'FAIL', inject: true },
  { name: 'API resume unsaved failure', mode: 'resume', outcome: 'FAIL', inject: true, api: true },
  { name: 'CLI resume unsaved pass', mode: 'resume', outcome: 'PASS', inject: true },
  {
    name: 'failed write overrides threshold zero',
    mode: 'resume',
    outcome: 'FAIL',
    inject: true,
    threshold: 0,
  },
  { name: 'fresh eval unsaved failure', mode: 'fresh', outcome: 'FAIL', inject: true },
  { name: 'fresh eval unsaved pass', mode: 'fresh', outcome: 'PASS', inject: true, threshold: 0 },
  { name: 'paused resume unsaved result', mode: 'pause', outcome: 'FAIL', inject: true },
  {
    name: 'CLI recovery export also fails',
    mode: 'resume',
    outcome: 'FAIL',
    inject: true,
    brokenOutput: true,
  },
  {
    name: 'API recovery export also fails',
    mode: 'resume',
    outcome: 'FAIL',
    inject: true,
    api: true,
    brokenOutput: true,
  },
  {
    name: 'no new work performs no result write',
    mode: 'resume',
    outcome: 'PASS',
    inject: true,
    complete: true,
  },
  { name: 'successful writes honor default threshold', mode: 'resume', outcome: 'FAIL' },
  { name: 'successful writes honor threshold zero', mode: 'resume', outcome: 'FAIL', threshold: 0 },
  { name: 'successful passing resume', mode: 'resume', outcome: 'PASS' },
  { name: 'no-write honors default threshold', mode: 'no-write', outcome: 'FAIL', inject: true },
  {
    name: 'no-write honors threshold zero',
    mode: 'no-write',
    outcome: 'FAIL',
    inject: true,
    threshold: 0,
  },
  {
    name: 'ordinary output failure still propagates',
    mode: 'resume',
    outcome: 'PASS',
    brokenOutput: true,
  },
];
const commandOptions = {
  write: true,
  cache: false,
  share: false,
  noShare: true,
  progressBar: false,
  table: false,
};
const failureMessage = 'Evaluation failed because one or more results could not be saved.';

beforeAll(async () => {
  await runDbMigrations();
});

describe('doEval persistence completion', () => {
  it.each(scenarios)('$name', async (scenario) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-completion-persistence-'));
    const jsonPath = path.join(directory, 'results.json');
    const jsonlPath = path.join(directory, 'results.jsonl');
    const outputs = [jsonPath, jsonlPath];
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_DISABLE_SHARING: 'true',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_PASS_RATE_THRESHOLD: scenario.threshold?.toString(),
    });
    const previousExitCode = process.exitCode;
    const cacheWasEnabled = isCacheEnabled();
    const previousCliState = {
      basePath: cliState.basePath,
      config: cliState.config,
      selectedProviderConfigs: cliState.selectedProviderConfigs,
      maxConcurrency: cliState.maxConcurrency,
      resume: cliState.resume,
      retryMode: cliState.retryMode,
      _retryErrorResultIds: cliState._retryErrorResultIds,
    };
    const beforeSigint = process.listeners('SIGINT');
    let phase: 'seed' | 'run' = 'seed';
    const provider = vi
      .spyOn(EchoProvider.prototype, 'callApi')
      .mockImplementation(async (prompt, context) => {
        if (
          phase === 'run' &&
          scenario.mode === 'pause' &&
          context?.test?.metadata?.testIdx === 1
        ) {
          // Exercise doEval's installed CLI pause handler after the target completed work.
          const installed = process
            .listeners('SIGINT')
            .filter(
              (listener) => !beforeSigint.includes(listener) && listener.name === 'sigintHandler',
            );
          expect(installed).toHaveLength(1);
          installed[0]('SIGINT');
        }
        return {
          output: prompt,
          tokenUsage: { total: 7, prompt: 3, completion: 4, numRequests: 1 },
          cost: 0.125,
        };
      });
    const errorLog = vi.spyOn(logger, 'error');
    const warningLog = vi.spyOn(logger, 'warn');
    const config: UnifiedConfig = {
      providers: ['echo'],
      prompts: ['{{value}}'],
      tests: ['PASS', scenario.outcome].map((value, testIdx) => ({
        vars: { value },
        metadata: { testIdx },
        assert: [{ type: 'equals' as const, value: 'PASS' }],
      })),
      evaluateOptions: { showProgressBar: false, maxConcurrency: 1 },
      outputPath: outputs,
      sharing: false,
    };
    const db = await getDb();
    let seeded: Eval | undefined;
    try {
      if (scenario.mode === 'resume' || scenario.mode === 'pause') {
        seeded = await doEval(commandOptions, config, undefined, { eventSource: 'cli' });
        if (!scenario.complete) {
          // A valid partial saved run: its original config still contains the unexecuted pair.
          await db
            .delete(evalResultsTable)
            .where(and(eq(evalResultsTable.evalId, seeded.id), eq(evalResultsTable.testIdx, 1)));
          await recalculatePromptMetrics(seeded);
          seeded.clearResults();
          await writeMultipleOutputs(outputs, seeded, null);
        }
      }
      const beforeRows = seeded
        ? await db.select().from(evalResultsTable).where(eq(evalResultsTable.evalId, seeded.id))
        : [];
      const beforeMetrics = seeded
        ? (await Eval.findById(seeded.id))!.prompts.map((p) => p.metrics)
        : [];
      if (scenario.inject) {
        await db.run(sql`CREATE TRIGGER completion_fail_insert BEFORE INSERT ON eval_results
          WHEN NEW.test_idx = 1 BEGIN SELECT RAISE(FAIL, 'injected completion insert failure'); END`);
      }
      if (scenario.brokenOutput) {
        fs.rmSync(jsonPath, { force: true });
        fs.mkdirSync(jsonPath);
      }
      phase = 'run';
      provider.mockClear();
      errorLog.mockClear();
      warningLog.mockClear();
      process.exitCode = 0;
      const writeFailed = Boolean(
        scenario.inject && !scenario.complete && scenario.mode !== 'no-write',
      );
      const outputOnlyFailure = scenario.brokenOutput && !writeFailed;
      const command = {
        ...commandOptions,
        ...(seeded ? { resume: seeded.id } : {}),
        ...(scenario.mode === 'no-write' ? { write: false } : {}),
      };
      let returned: Eval | undefined;
      let thrown: unknown;
      try {
        returned = await doEval(
          command,
          seeded ? {} : config,
          undefined,
          scenario.api ? {} : { eventSource: 'cli' },
        );
      } catch (error) {
        thrown = error;
      }
      if (writeFailed && scenario.api) {
        expect(thrown).toBeInstanceOf(EvalRunError);
        expect(thrown).toMatchObject({ message: failureMessage, exitCode: 1 });
        expect(process.exitCode).toBe(0);
      } else if (outputOnlyFailure) {
        expect(thrown).toEqual(
          expect.objectContaining({ message: 'One or more output writes failed' }),
        );
      } else {
        expect(thrown).toBeUndefined();
        expect(returned!.resultPersistenceFailed).toBe(writeFailed);
        const expectedExit = writeFailed
          ? 1
          : scenario.outcome === 'FAIL' && scenario.threshold !== 0
            ? 100
            : 0;
        expect(process.exitCode).toBe(expectedExit);
      }
      expect(cliState.resume).toBe(false);
      expect(cliState.retryMode).toBeFalsy();
      expect(cliState._retryErrorResultIds).toBeUndefined();
      expect(process.listeners('SIGINT').filter((fn) => fn.name === 'sigintHandler')).toEqual(
        beforeSigint.filter((fn) => fn.name === 'sigintHandler'),
      );
      expect(provider).toHaveBeenCalledTimes(scenario.complete ? 0 : seeded ? 1 : 2);
      const evalId = seeded?.id ?? returned!.id;
      const durableRows = await db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, evalId));
      if (writeFailed && seeded) {
        expect(durableRows).toEqual(beforeRows);
        expect((await Eval.findById(evalId))!.prompts.map((p) => p.metrics)).toEqual(beforeMetrics);
      } else {
        expect(durableRows).toHaveLength(scenario.mode === 'no-write' ? 0 : writeFailed ? 1 : 2);
      }
      const jsonl = fs
        .readFileSync(jsonlPath, 'utf8')
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(jsonl).toHaveLength(2);
      const logical = jsonl.find((row) => row.testIdx === 1);
      expect(logical.response.output).toBe(scenario.outcome);
      if (scenario.mode !== 'pause') {
        expect(logical).toMatchObject({
          success: scenario.outcome === 'PASS',
          score: scenario.outcome === 'PASS' ? 1 : 0,
          failureReason:
            scenario.outcome === 'PASS' ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
        });
      }
      if (writeFailed && returned) {
        expect(await returned.getFailedResultsByTestIdx(1)).toHaveLength(1);
        expect(returned.getFinalJsonlResults().some((row) => row.testIdx === 1)).toBe(true);
        expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(failureMessage));
      }
      if (scenario.brokenOutput) {
        if (writeFailed) {
          expect(warningLog).toHaveBeenCalledWith(
            'Could not finalize outputs after evaluation results failed to persist.',
            expect.anything(),
          );
        }
      } else {
        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).results.results;
        expect(json).toHaveLength(scenario.mode === 'no-write' ? 2 : durableRows.length);
        if (writeFailed) {
          expect(json.map((row: { testIdx: number }) => row.testIdx)).toEqual([0]);
        }
      }
    } finally {
      await db.run(sql`DROP TRIGGER IF EXISTS completion_fail_insert`);
      provider.mockRestore();
      errorLog.mockRestore();
      warningLog.mockRestore();
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
  });
});
