import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getDb } from '../../src/database/index';
import { evalResultsTable, evalsTable } from '../../src/database/tables';
import { hasTestsInRange } from '../../src/evaluator/engine';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { doEval } from '../../src/node/doEval';
import { getErrorResultIds, retryCommand } from '../../src/node/retry';
import telemetry from '../../src/telemetry';
import { ResultFailureReason } from '../../src/types/index';

import type { CommandLineOptions, TestSuite } from '../../src/types/index';

vi.mock('../../src/logger');
vi.mock('../../src/telemetry', () => ({
  default: { record: vi.fn(), send: vi.fn(), recordAndSendOnce: vi.fn() },
}));
vi.mock('../../src/share', () => ({
  isSharingEnabled: () => false,
  createShareableUrl: async () => null,
}));

describe('retry configured test selection', () => {
  let tempDir: string;
  let originalExitCode: typeof process.exitCode;
  let originalState: Pick<typeof cliState, 'config' | 'basePath' | 'selectedProviderConfigs'>;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-configured-filters-'));
    originalExitCode = process.exitCode;
    originalState = {
      config: cliState.config,
      basePath: cliState.basePath,
      selectedProviderConfigs: cliState.selectedProviderConfigs,
    };
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    Object.assign(cliState, originalState);
    cliState.resume = false;
    cliState.retryMode = false;
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function initialEval(
    form: 'top-level' | 'scenario' | 'mixed',
    commandLineOptions: Partial<CommandLineOptions>,
    cliFilters: Partial<Pick<CommandLineOptions, 'filterFirstN' | 'filterPattern'>> = {},
  ) {
    const readyPath = path.join(tempDir, 'ready');
    const callsPath = path.join(tempDir, 'calls.jsonl');
    const providerPath = path.join(tempDir, 'provider.cjs');
    fs.writeFileSync(
      providerPath,
      `const fs = require('node:fs');
       module.exports = class {
         id() { return 'retry-config-fixture'; }
         async callApi(prompt) {
           fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify(prompt) + String.fromCharCode(10));
           return fs.existsSync(${JSON.stringify(readyPath)})
             ? { output: prompt }
             : { error: 'deterministic initial error' };
         }
       };`,
    );
    const tests = ['other', 'keep', 'last'].map((description) => ({
      description,
      vars: { input: description },
    }));
    const config = {
      providers: [`file://${providerPath}`],
      prompts: ['{{input}}'],
      ...(form === 'scenario' ? {} : { tests }),
      ...(form === 'top-level'
        ? {}
        : {
            scenarios: [
              {
                config: [{}],
                tests: tests.map((test) => ({
                  ...test,
                  description: `scenario-${test.description}`,
                  vars: { input: `scenario-${test.description}` },
                })),
              },
            ],
          }),
      commandLineOptions,
    };
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
    const record = await doEval(
      {
        config: [configPath],
        table: false,
        write: true,
        share: false,
        cache: false,
        maxConcurrency: 1,
        ...cliFilters,
      },
      {},
      undefined,
      { showProgressBar: false },
    );
    const initial = (await record.toEvaluateSummary()).results;
    expect(initial.length).toBeGreaterThan(0);
    expect(initial.every((result) => result.failureReason === ResultFailureReason.ERROR)).toBe(
      true,
    );
    fs.writeFileSync(readyPath, 'ready');
    return { record, config, configPath, callsPath, readyPath, initial };
  }

  async function assertRetryMatchesInitial(
    fixture: Awaited<ReturnType<typeof initialEval>>,
    override: boolean,
  ) {
    const selected = fixture.initial.map((result) => result.testCase.description);
    if (!override) {
      // Materialized replay must not reload or resample the original configuration.
      fs.unlinkSync(fixture.configPath);
    }
    await retryCommand(fixture.record.id, {
      ...(override ? { config: fixture.configPath } : {}),
      maxConcurrency: 1,
      verbose: true,
      share: false,
    });
    const persisted = await Eval.findById(fixture.record.id);
    const retried = (await persisted!.toEvaluateSummary()).results;
    expect(retried.map((result) => result.testCase.description)).toEqual(selected);
    expect(retried.map((result) => result.testIdx)).toEqual(
      fixture.initial.map((result) => result.testIdx),
    );
    expect(retried.every((result) => result.success)).toBe(true);
    expect(await getErrorResultIds(fixture.record.id)).toEqual([]);
    const calls = fs
      .readFileSync(fixture.callsPath, 'utf8')
      .trim()
      .split(String.fromCharCode(10))
      .map((line) => JSON.parse(line));
    expect(calls).toEqual([...selected, ...selected]);
  }

  describe.each(['top-level', 'scenario'] as const)('%s tests', (form) => {
    it.each([
      { configured: { filterFirstN: 1 }, override: true },
      { configured: { filterPattern: 'keep$' }, override: true },
      { configured: { filterPattern: '.', filterSample: 2, filterSampleSeed: 42 }, override: true },
      { configured: { filterFirstN: 1 }, override: false },
      { configured: { filterPattern: 'keep$' }, override: false },
      {
        configured: { filterPattern: '.', filterSample: 2, filterSampleSeed: 42 },
        override: false,
      },
    ])(
      'retains selection with override=$override and $configured',
      async ({ configured, override }) => {
        const fixture = await initialEval(form, configured);
        await assertRetryMatchesInitial(fixture, override);
      },
    );

    it('preserves ERROR rows if the override selector is invalid', async () => {
      const fixture = await initialEval(form, { filterFirstN: 1 });
      const originalErrors = await getErrorResultIds(fixture.record.id);
      fs.writeFileSync(
        fixture.configPath,
        JSON.stringify({
          ...fixture.config,
          commandLineOptions: { filterPattern: '[' },
        }),
      );
      await expect(
        retryCommand(fixture.record.id, { config: fixture.configPath }),
      ).rejects.toThrow();
      expect(await getErrorResultIds(fixture.record.id)).toEqual(originalErrors);
      const calls = fs
        .readFileSync(fixture.callsPath, 'utf8')
        .trim()
        .split(String.fromCharCode(10));
      expect(calls).toHaveLength(fixture.initial.length);
    });

    it.each([
      { filterPattern: '^missing$' },
      { filterPattern: '.', filterRange: '9:10' },
      { filterPattern: '.', filterSample: 1 },
      { filterPattern: '.', filterSample: 10 },
    ])('refuses unsafe override selection without deleting errors: %j', async (configured) => {
      const fixture = await initialEval(form, { filterFirstN: 1 });
      const originalErrors = await getErrorResultIds(fixture.record.id);
      fs.writeFileSync(
        fixture.configPath,
        JSON.stringify({
          ...fixture.config,
          commandLineOptions: configured,
        }),
      );
      await expect(retryCommand(fixture.record.id, { config: fixture.configPath })).rejects.toThrow(
        /ERROR.*preserved/,
      );
      expect(await getErrorResultIds(fixture.record.id)).toEqual(originalErrors);
      const calls = fs
        .readFileSync(fixture.callsPath, 'utf8')
        .trim()
        .split(String.fromCharCode(10));
      expect(calls).toHaveLength(fixture.initial.length);
    });
  });

  it('accepts an unchanged range-only retry override', async () => {
    const fixture = await initialEval('mixed', { filterRange: '1:3' });
    await assertRetryMatchesInitial(fixture, true);
  });

  it('preserves ERROR rows when an override adds a range without a count or pattern', async () => {
    const fixture = await initialEval('mixed', {});
    const errors = await getErrorResultIds(fixture.record.id);
    fs.writeFileSync(
      fixture.configPath,
      JSON.stringify({
        ...fixture.config,
        commandLineOptions: { filterRange: '1:3' },
      }),
    );
    await expect(retryCommand(fixture.record.id, { config: fixture.configPath })).rejects.toThrow(
      /saved test layout/,
    );
    expect(await getErrorResultIds(fixture.record.id)).toEqual(errors);
  });

  it('allows transport-only override changes when the selected test layout is unchanged', async () => {
    const fixture = await initialEval('top-level', { filterFirstN: 1 });
    fs.writeFileSync(
      fixture.configPath,
      JSON.stringify({
        ...fixture.config,
        providers: fixture.config.providers.map((id) => ({ id, config: { timeoutMs: 4321 } })),
        commandLineOptions: { filterFirstN: 1, maxConcurrency: 4, delay: 0, share: false },
      }),
    );
    await assertRetryMatchesInitial(fixture, true);
  });

  it.each(
    (['top-level', 'scenario'] as const).flatMap((form) =>
      (['cli', 'config'] as const).flatMap((source) => [
        { form, source, selected: { filterFirstN: 1 } },
        { form, source, selected: { filterPattern: 'keep$' } },
      ]),
    ),
  )(
    'rejects a selector-less override after $source filtering $form tests: $selected',
    async ({ form, source, selected }) => {
      const fixture = await initialEval(
        form,
        source === 'config' ? selected : {},
        source === 'cli' ? selected : {},
      );
      const db = await getDb();
      const before = await db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, fixture.record.id))
        .all();
      fs.writeFileSync(
        fixture.configPath,
        JSON.stringify({ ...fixture.config, commandLineOptions: undefined }),
      );

      await expect(retryCommand(fixture.record.id, { config: fixture.configPath })).rejects.toThrow(
        /saved test layout.*ERROR results were preserved/,
      );

      expect(
        await db
          .select()
          .from(evalResultsTable)
          .where(eq(evalResultsTable.evalId, fixture.record.id))
          .all(),
      ).toEqual(before);
      expect(
        fs.readFileSync(fixture.callsPath, 'utf8').trim().split(String.fromCharCode(10)),
      ).toHaveLength(fixture.initial.length);
      await assertRetryMatchesInitial(fixture, false);
    },
  );

  it('allows an unchanged unfiltered layout with transport-only overrides', async () => {
    const fixture = await initialEval('top-level', {});
    fs.writeFileSync(
      fixture.configPath,
      JSON.stringify({
        ...fixture.config,
        providers: fixture.config.providers.map((id) => ({ id, config: { timeoutMs: 4321 } })),
        commandLineOptions: { maxConcurrency: 4, delay: 0, share: false },
      }),
    );
    await assertRetryMatchesInitial(fixture, true);
  });

  it.each(
    (['top-level', 'scenario'] as const).flatMap((form) => [
      { form, configured: { filterFirstN: 1 } },
      { form, configured: { filterPattern: 'keep$' } },
    ]),
  )(
    'allows removing $configured when the override retains the saved materialized $form tests',
    async ({ form, configured }) => {
      const fixture = await initialEval(form, configured);
      fs.writeFileSync(
        fixture.configPath,
        JSON.stringify({
          ...fixture.record.config,
          commandLineOptions: undefined,
        }),
      );
      await assertRetryMatchesInitial(fixture, true);
    },
  );

  it.each(
    (['top-level', 'scenario', 'mixed'] as const).flatMap((form) => [
      { form, configured: { filterFirstN: 1 } },
      { form, configured: { filterPattern: 'keep$' } },
    ]),
  )(
    'preserves the saved layout before a narrowing $form override: $configured',
    async ({ form, configured }) => {
      const fixture = await initialEval(form, {});
      const db = await getDb();
      const before = await db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, fixture.record.id))
        .all();
      fs.writeFileSync(
        fixture.configPath,
        JSON.stringify({ ...fixture.config, commandLineOptions: configured }),
      );

      await expect(retryCommand(fixture.record.id, { config: fixture.configPath })).rejects.toThrow(
        /saved test layout.*ERROR results were preserved/,
      );

      expect(
        await db
          .select()
          .from(evalResultsTable)
          .where(eq(evalResultsTable.evalId, fixture.record.id))
          .all(),
      ).toEqual(before);
      expect(
        fs.readFileSync(fixture.callsPath, 'utf8').trim().split(String.fromCharCode(10)),
      ).toHaveLength(fixture.initial.length);
    },
  );

  it('refuses a pattern that would move a completed test onto an ERROR index', async () => {
    const fixture = await initialEval('top-level', {});
    const db = await getDb();
    const rows = await db
      .select()
      .from(evalResultsTable)
      .where(eq(evalResultsTable.evalId, fixture.record.id))
      .all();
    for (const row of rows.filter((result) => result.testIdx > 0)) {
      await db
        .update(evalResultsTable)
        .set({
          success: true,
          score: 1,
          failureReason: ResultFailureReason.NONE,
          error: null,
          response: { output: String(row.testCase.vars?.input) },
        })
        .where(eq(evalResultsTable.id, row.id))
        .run();
    }
    const before = await db
      .select()
      .from(evalResultsTable)
      .where(eq(evalResultsTable.evalId, fixture.record.id))
      .all();
    const errors = await getErrorResultIds(fixture.record.id);
    expect(errors).toHaveLength(1);
    fs.writeFileSync(
      fixture.configPath,
      JSON.stringify({ ...fixture.config, commandLineOptions: { filterPattern: 'keep$' } }),
    );

    await expect(retryCommand(fixture.record.id, { config: fixture.configPath })).rejects.toThrow(
      /saved test layout.*ERROR results were preserved/,
    );

    expect(
      await db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, fixture.record.id))
        .all(),
    ).toEqual(before);
    expect(await getErrorResultIds(fixture.record.id)).toEqual(errors);
    expect(
      fs.readFileSync(fixture.callsPath, 'utf8').trim().split(String.fromCharCode(10)),
    ).toHaveLength(fixture.initial.length);
  });

  it.each(
    (['retry', 'retry-errors'] as const).flatMap((mode) => [
      { mode, stillFails: false },
      { mode, stillFails: true },
    ]),
  )(
    'preserves ERROR rows without a replacement in $mode (stillFails=$stillFails)',
    async ({ mode, stillFails }) => {
      const fixture = await initialEval('top-level', {});
      const db = await getDb();
      await db
        .update(evalsTable)
        .set({
          runtimeOptions: { ...fixture.record.runtimeOptions, filterRange: '0:1' },
        })
        .where(eq(evalsTable.id, fixture.record.id))
        .run();
      const before = await db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, fixture.record.id))
        .all();
      if (stillFails) {
        fs.unlinkSync(fixture.readyPath);
      }

      if (mode === 'retry') {
        await retryCommand(fixture.record.id, { share: false, verbose: true });
      } else {
        await doEval(
          { retryErrors: true, write: true, table: false, share: false },
          {},
          undefined,
          { showProgressBar: false },
        );
      }

      const after = await db
        .select()
        .from(evalResultsTable)
        .where(eq(evalResultsTable.evalId, fixture.record.id))
        .all();
      const unreplaced = before.filter((result) => result.testIdx !== 0);
      expect(after.filter((result) => result.testIdx !== 0)).toEqual(unreplaced);
      const replaced = after.filter((result) => result.testIdx === 0);
      expect(replaced).toHaveLength(1);
      expect(replaced[0].id).not.toBe(before.find((result) => result.testIdx === 0)!.id);
      expect(replaced[0].failureReason).toBe(
        stillFails ? ResultFailureReason.ERROR : ResultFailureReason.NONE,
      );
      expect(after).toHaveLength(before.length);
    },
  );

  it.each(
    (['top-level', 'scenario', 'mixed'] as const).flatMap((form) => [
      { form, override: true },
      { form, override: false },
    ]),
  )(
    'applies the range once for $form tests with override=$override',
    async ({ form, override }) => {
      const fixture = await initialEval(form, {
        filterPattern: '.',
        filterFirstN: 2,
        filterRange: '1:3',
      });
      await assertRetryMatchesInitial(fixture, override);
    },
  );
});

describe('retry selection preflight', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expands scenario configs without mutating tests, duplicating scenarios, or recording telemetry', () => {
    const tests = [{ vars: { input: 'root' } }];
    const suite: TestSuite = {
      providers: [],
      prompts: [],
      tests,
      scenarios: [
        {
          config: [{ vars: { variant: 'a' } }, { vars: { variant: 'b' } }],
          tests: [{ vars: { input: 'scenario' } }],
        },
      ],
    };
    expect(hasTestsInRange(suite, '2:3')).toBe(true);
    expect(hasTestsInRange(suite, '3:4')).toBe(false);
    expect(suite.tests).toBe(tests);
    expect(tests).toEqual([{ vars: { input: 'root' } }]);
    expect(suite.scenarios?.[0].tests).toEqual([{ vars: { input: 'scenario' } }]);
    expect(telemetry.record).not.toHaveBeenCalled();
  });

  it('distinguishes an implicit default test from an explicitly empty selection', () => {
    expect(hasTestsInRange({ providers: [], prompts: [] })).toBe(true);
    expect(hasTestsInRange({ providers: [], prompts: [], tests: [], scenarios: [] })).toBe(false);
    expect(
      hasTestsInRange({
        providers: [],
        prompts: [],
        scenarios: [{ config: [{}], tests: [] }],
      }),
    ).toBe(false);
  });

  it('rejects an invalid range before evaluation', () => {
    expect(() => hasTestsInRange({ providers: [], prompts: [] }, 'invalid')).toThrow();
    expect(telemetry.record).not.toHaveBeenCalled();
  });
});
