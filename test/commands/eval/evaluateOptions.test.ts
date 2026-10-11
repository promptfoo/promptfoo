import fs from 'fs';
import os from 'os';
import path from 'path';

import * as yaml from 'js-yaml';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as evaluatorModule from '../../../src/evaluator';
import logger from '../../../src/logger';
import Eval from '../../../src/models/eval';
import { doEval } from '../../../src/node/doEval';
import * as retryModule from '../../../src/node/retry';
import { isSafeMode } from '../../../src/util/safeMode';
import { mockProcessEnv } from '../../util/utils';
import type { Command } from 'commander';

import type { CommandLineOptions, EvaluateOptions, TestSuite } from '../../../src/types/index';

vi.mock('../../../src/evaluator', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    evaluate: vi.fn().mockResolvedValue({ results: [], summary: {} }),
  };
});

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
  isDebugEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/migrate', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    runDbMigrations: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
    recordAndSendOnce: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/share', () => ({
  isSharingEnabled: vi.fn().mockReturnValue(false),
  createShareableUrl: vi.fn().mockResolvedValue(null),
}));

const evaluateMock = vi.mocked(evaluatorModule.evaluate);

function makeConfig(configPath: string, evaluateOptions: Partial<EvaluateOptions> = {}) {
  fs.writeFileSync(
    configPath,
    yaml.dump({
      evaluateOptions: {
        // Define default values for the tests to use if none are provided.
        maxConcurrency: evaluateOptions.maxConcurrency ?? 9,
        repeat: evaluateOptions.repeat ?? 99,
        delay: evaluateOptions.delay ?? 999,
        showProgressBar: evaluateOptions.showProgressBar ?? false,
        cache: evaluateOptions.cache ?? false,
        timeoutMs: evaluateOptions.timeoutMs ?? 9999,
        maxEvalTimeMs: evaluateOptions.maxEvalTimeMs ?? 99999,
      },
      providers: [{ id: 'openai:gpt-4o-mini' }],
      prompts: ['test prompt'],
      tests: [{ vars: { input: 'test input' } }],
    }),
  );
}

function writeTempConfig(tmpDir: string, fileName: string, config: Record<string, unknown>) {
  const configPath = path.join(tmpDir, fileName);
  fs.writeFileSync(configPath, yaml.dump(config));
  return configPath;
}

function writeOptionsConfig(tmpDir: string, fileName: string, config: Record<string, unknown>) {
  return writeTempConfig(tmpDir, fileName, {
    ...config,
    providers: [{ id: 'openai:gpt-4o-mini' }],
    prompts: ['Test prompt'],
    tests: [{ vars: { input: 'test' } }],
  });
}

async function runEvalAndGetOptions(
  cmdObj: Partial<CommandLineOptions & Command>,
): Promise<EvaluateOptions> {
  await doEval(
    {
      table: false,
      write: false,
      ...cmdObj,
    },
    {},
    undefined,
    {},
  );

  expect(evaluateMock).toHaveBeenCalled();
  return evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
}

describe('evaluateOptions behavior', () => {
  let tmpDir: string;
  let configPath: string;
  let noDelayConfigPath: string;
  let noRepeatConfigPath: string;

  const originalExit = process.exit;
  let repeatSummarySpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    process.exit = vi.fn() as any;
    // These option-routing tests mock evaluation and migrations, so no result table exists.
    repeatSummarySpy = vi.spyOn(Eval.prototype, 'getRepeatStability').mockResolvedValue(undefined);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-test-'));

    // Build a config file for the tests to use.
    configPath = path.join(tmpDir, 'promptfooconfig.yaml');
    makeConfig(configPath);

    // Build a config that has no delay set; a delay set to >0 will override the maxConcurrency value.
    noDelayConfigPath = path.join(tmpDir, 'promptfooconfig-noDelay.yaml');
    makeConfig(noDelayConfigPath, { delay: 0 });

    // Build a config that has no repeat set; a repeat set to >1 will override the cache value
    noRepeatConfigPath = path.join(tmpDir, 'promptfooconfig-noRepeat.yaml');
    makeConfig(noRepeatConfigPath, { repeat: 1 });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    process.exit = originalExit;
    repeatSummarySpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('restores saved repeat options when retrying errors despite conflicting CLI overrides', async () => {
    const saved = new Eval(
      {
        providers: ['echo'],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
      },
      {
        id: 'eval-retry-repeat-options',
        persisted: true,
        runtimeOptions: { repeat: 3, cache: false, maxConcurrency: 2, delay: 0 },
      },
    );
    const latest = vi.spyOn(Eval, 'latest').mockResolvedValue(saved);
    const errors = vi.spyOn(retryModule, 'getErrorResultIds').mockResolvedValue(['failed-row']);
    const remove = vi.spyOn(retryModule, 'deleteErrorResults').mockResolvedValue(undefined);
    const metrics = vi.spyOn(retryModule, 'recalculatePromptMetrics').mockResolvedValue(undefined);
    try {
      await doEval(
        { table: false, retryErrors: true, repeat: 1, maxConcurrency: 7 },
        {},
        undefined,
        {},
      );
      expect(evaluateMock.mock.calls.at(-1)?.[2]).toMatchObject({
        repeat: 3,
        cache: false,
        maxConcurrency: 2,
      });
    } finally {
      latest.mockRestore();
      errors.mockRestore();
      remove.mockRestore();
      metrics.mockRestore();
    }
  });

  it('honors safe mode from an explicit config and restores it after evaluation', async () => {
    const configFile = writeTempConfig(tmpDir, 'safe-mode.yaml', {
      providers: ['echo'],
      prompts: ['Hello'],
      tests: [{ vars: {} }],
      commandLineOptions: { safeMode: true },
    });
    const observed: boolean[] = [];
    evaluateMock.mockImplementationOnce(async () => {
      observed.push(isSafeMode());
      return {} as any;
    });
    await doEval({ table: false, write: false, config: [configFile] }, {}, undefined, {});
    expect(observed).toEqual([true]);
    expect(isSafeMode()).toBe(false);
  });

  it('does not leak safe mode from one API evaluation into the next', async () => {
    const observed: boolean[] = [];
    const config = { providers: ['echo'], prompts: ['Hello'], tests: [{ vars: {} }] };
    evaluateMock.mockImplementationOnce(async () => {
      observed.push(isSafeMode());
      return {} as any;
    });
    await doEval({ table: false, write: false, safeMode: true }, config, undefined, {});
    evaluateMock.mockImplementationOnce(async () => {
      observed.push(isSafeMode());
      return {} as any;
    });
    await doEval({ table: false, write: false }, config, undefined, {});
    expect(observed).toEqual([true, false]);
  });

  describe('generation accounting provenance', () => {
    function generationConfig(metadata: Record<string, unknown>) {
      return {
        metadata,
        providers: [{ id: 'echo' }],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
      };
    }

    it('removes copied generation charges from a newly created evaluation', async () => {
      const configFile = writeTempConfig(
        tmpDir,
        'test-stale-generation-accounting.yaml',
        generationConfig({
          owner: 'preserved metadata',
          generationAccounting: {
            id: 'previous-generation',
            tokenUsage: { total: 40, numRequests: 4 },
          },
        }),
      );

      await doEval({ table: false, write: false, config: [configFile] }, {}, undefined, {});

      const evalRecord = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      expect(evalRecord.config.metadata).toEqual({ owner: 'preserved metadata' });
      expect(evalRecord.getStats().tokenUsage.generation).toBeUndefined();
    });

    it('replaces copied generation charges with accounting from the current run', async () => {
      const configFile = writeTempConfig(
        tmpDir,
        'test-current-generation-accounting.yaml',
        generationConfig({
          generationAccounting: {
            id: 'previous-generation',
            tokenUsage: { total: 40, numRequests: 4 },
          },
        }),
      );
      const currentUsage = { total: 12, prompt: 8, completion: 4, numRequests: 1 };

      await doEval({ table: false, write: false, config: [configFile] }, {}, undefined, {
        generationEventId: 'current-generation',
        generationTokenUsage: currentUsage,
      });

      const evalRecord = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      expect(evalRecord.config.metadata?.generationAccounting).toEqual({
        id: 'current-generation',
        tokenUsage: currentUsage,
      });
      expect(evalRecord.getStats().tokenUsage.generation).toMatchObject(currentUsage);
    });

    it('preserves existing generation charges when resuming the same evaluation', async () => {
      const generationAccounting = {
        id: 'original-generation',
        tokenUsage: { total: 40, prompt: 25, completion: 15, numRequests: 4 },
      };
      const resumeEval = new Eval(generationConfig({ generationAccounting }), {
        id: 'eval-resume-generation-accounting',
        persisted: true,
      });
      const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(resumeEval);

      try {
        await doEval({ table: false, resume: resumeEval.id } as any, {}, undefined, {});

        expect(resumeEval.config.metadata?.generationAccounting).toEqual(generationAccounting);
        expect(resumeEval.getStats().tokenUsage.generation).toMatchObject(
          generationAccounting.tokenUsage,
        );
      } finally {
        findByIdSpy.mockRestore();
      }
    });
  });

  describe('Reading values from config file', () => {
    it.each([
      ['maxConcurrency', () => noDelayConfigPath, 9],
      ['repeat', () => configPath, 99],
      ['delay', () => configPath, 999],
      ['showProgressBar', () => configPath, false],
      ['cache', () => configPath, false],
      ['timeoutMs', () => configPath, 9999],
      ['maxEvalTimeMs', () => configPath, 99999],
    ] as const)('should read evaluateOptions.%s', async (key, configPath, expected) => {
      const options = await runEvalAndGetOptions({ config: [configPath()] });

      expect(options[key]).toBe(expected);
    });
  });

  describe('Prioritization of CLI options over config file options', () => {
    it.each([
      ['maxConcurrency', 'maxConcurrency', () => noDelayConfigPath, 5, 5],
      ['repeat', 'repeat', () => configPath, 5, 5],
      ['delay', 'delay', () => configPath, 5, 5],
      ['showProgressBar', 'progressBar', () => configPath, true, true],
      ['cache', 'cache', () => noRepeatConfigPath, true, true],
    ] as const)(
      'should prioritize %s from command line options over config file options',
      async (key, cliKey, configPath, value, expected) => {
        const options = await runEvalAndGetOptions({ config: [configPath()], [cliKey]: value });

        expect(options[key]).toBe(expected);
      },
    );
  });

  it('should correctly merge evaluateOptions from multiple sources', async () => {
    const configPath = writeOptionsConfig(tmpDir, 'test-merge-options.yaml', {
      evaluateOptions: { maxConcurrency: 3, showProgressBar: false },
    });
    await doEval({ config: [configPath], table: false, write: false }, {}, undefined, {
      showProgressBar: true,
    });
    expect(evaluateMock).toHaveBeenCalled();
    const mergedOptions = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
    expect(mergedOptions.maxConcurrency).toBe(3);
    expect(mergedOptions.showProgressBar).toBe(false);
  });

  describe('Edge cases and interactions', () => {
    it('should handle delay >0 forcing concurrency to 1 even with CLI override', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
        maxConcurrency: 10, // This should be overridden to 1 due to delay
      });

      expect(options.maxConcurrency).toBe(1); // Should be forced to 1 due to delay
    });

    it('should handle repeat >1 with cache value passed correctly', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
        cache: true,
        repeat: 3,
      });

      expect(options.cache).toBe(true); // Cache value is passed as-is
      expect(options.repeat).toBe(3); // Repeat value is correctly set
      // Repeat no longer disables cache globally. Each repeat index uses its own cache namespace.
    });

    it('should handle undefined/null evaluateOptions gracefully', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'temp-test-config.yaml', {
        evaluateOptions: null, // Explicitly null
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['test'],
        tests: [{ vars: { input: 'test' } }],
      });

      await runEvalAndGetOptions({
        config: [tempConfig],
      });
    });

    it('should handle mixed CLI and config values correctly', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath], // Has delay: 999, maxConcurrency: 9, etc.
        delay: 0, // CLI override
        repeat: 1, // CLI override
        // maxConcurrency not set, should use config value
      });

      expect(options.delay).toBeUndefined(); // CLI delay 0 should result in undefined
      expect(options.repeat).toBe(1); // CLI override
      expect(options.maxConcurrency).toBe(9); // From config
    });
  });

  describe('commandLineOptions behavior', () => {
    it('should respect commandLineOptions.maxConcurrency from config', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-commandline-maxconcurrency.yaml', {
        commandLineOptions: {
          maxConcurrency: 10,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.maxConcurrency).toBe(10);
    });

    it('should prioritize CLI --max-concurrency over commandLineOptions.maxConcurrency', async () => {
      const tempConfig = writeOptionsConfig(
        tmpDir,
        'test-commandline-maxconcurrency-override.yaml',
        {
          commandLineOptions: {
            maxConcurrency: 10,
          },
        },
      );

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        maxConcurrency: 20, // CLI override
      });

      expect(options.maxConcurrency).toBe(20);
    });

    it('should prioritize commandLineOptions.maxConcurrency over evaluateOptions.maxConcurrency', async () => {
      const tempConfig = writeOptionsConfig(
        tmpDir,
        'test-commandline-vs-evaluateoptions-maxconcurrency.yaml',
        {
          commandLineOptions: {
            maxConcurrency: 10,
          },
          evaluateOptions: {
            maxConcurrency: 5,
          },
        },
      );
      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.maxConcurrency).toBe(10); // commandLineOptions wins
    });

    it('should respect commandLineOptions.repeat from config', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-commandline-repeat.yaml', {
        commandLineOptions: {
          repeat: 5,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.repeat).toBe(5);
    });

    it('should prioritize CLI --repeat over commandLineOptions.repeat', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-commandline-repeat-override.yaml', {
        commandLineOptions: {
          repeat: 5,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        repeat: 10, // CLI override
      });

      expect(options.repeat).toBe(10);
    });

    it('should respect commandLineOptions.delay from config', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-commandline-delay.yaml', {
        commandLineOptions: {
          delay: 500,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.delay).toBe(500);
    });

    it('should prioritize CLI --delay over commandLineOptions.delay', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-commandline-delay-override.yaml', {
        commandLineOptions: {
          delay: 500,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        delay: 1000, // CLI override
      });

      expect(options.delay).toBe(1000);
    });

    it('should respect commandLineOptions.cache from config', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-commandline-cache.yaml', {
        commandLineOptions: {
          cache: false,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.cache).toBe(false);
    });

    it('should prioritize CLI --cache over commandLineOptions.cache', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-commandline-cache-override.yaml', {
        commandLineOptions: {
          cache: false,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        cache: true, // CLI override
      });

      expect(options.cache).toBe(true);
    });

    it('should respect commandLineOptions.generateSuggestions from config', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-generate-suggestions.yaml', {
        commandLineOptions: {
          generateSuggestions: true,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.generateSuggestions).toBe(true);
    });

    it('should preserve evaluateOptions.suggestionsCount from config defaults', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-suggestions-count.yaml', {
        evaluateOptions: {
          generateSuggestions: true,
          suggestionsCount: 2,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.generateSuggestions).toBe(true);
      expect(options.suggestionsCount).toBe(2);
    });

    it('should respect commandLineOptions.suggestionsCount from config defaults', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-commandline-suggestions-count.yaml', {
        commandLineOptions: {
          generateSuggestions: true,
          suggestionsCount: 3,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.generateSuggestions).toBe(true);
      expect(options.suggestionsCount).toBe(3);
    });

    it('should let commandLineOptions.suggestionsCount override evaluateOptions defaults', async () => {
      const tempConfig = writeOptionsConfig(
        tmpDir,
        'test-commandline-suggestions-count-overrides-evaluate-default.yaml',
        {
          evaluateOptions: {
            generateSuggestions: true,
          },
          commandLineOptions: {
            suggestionsCount: 4,
          },
        },
      );

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.generateSuggestions).toBe(true);
      expect(options.suggestionsCount).toBe(4);
    });

    it('should persist CLI filterRange without applying it twice for regular test suites', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-range.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{input}}'],
        tests: [
          { vars: { input: 'one' } },
          { vars: { input: 'two' } },
          { vars: { input: 'three' } },
        ],
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterRange: '1:2',
        },
        {},
        undefined,
        {},
      );

      expect(evaluateMock).toHaveBeenCalled();
      const evalRecord = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const options = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
      expect(evalRecord.runtimeOptions?.filterRange).toBe('1:2');
      expect(options.filterRange).toBeUndefined();
    });

    it.each([
      ['--filter-targets', 'filterTargets'],
      ['--filter-providers', 'filterProviders'],
    ] as const)('should persist and restore %s for resumed evaluations', async (_flag, key) => {
      const tempConfig = writeTempConfig(tmpDir, `test-${key}.yaml`, {
        providers: [
          { id: 'echo', label: 'excluded-target' },
          { id: 'echo', label: 'selected-target' },
        ],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          [key]: 'selected-target',
        },
        {},
        undefined,
        {},
      );

      const initialSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const initialEval = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      expect(initialSuite.providers.map((provider) => provider.label)).toEqual(['selected-target']);
      expect(initialEval.runtimeOptions?.providerFilter).toBe('selected-target');

      const resumeEval = new Eval(initialEval.config, {
        id: `eval-resume-${key}`,
        persisted: true,
        runtimeOptions: initialEval.runtimeOptions,
      });
      const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(resumeEval);
      evaluateMock.mockClear();

      try {
        await doEval(
          {
            table: false,
            resume: resumeEval.id,
          } as any,
          {},
          undefined,
          {},
        );

        const resumedSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
        expect(resumedSuite.providers.map((provider) => provider.label)).toEqual([
          'selected-target',
        ]);
      } finally {
        findByIdSpy.mockRestore();
      }
    });

    it('resolves persisted trace-provider credential references when resuming an eval', async () => {
      const restoreEnv = mockProcessEnv({
        PROMPTFOO_TEST_TEMPO_RESUME_TOKEN: 'resumed-tempo-runtime-secret',
      });
      const resumeEval = new Eval(
        {
          providers: [{ id: 'echo', label: 'traced-target' }],
          prompts: ['Hello'],
          tests: [{ vars: {} }],
          tracing: {
            enabled: true,
            provider: {
              id: 'tempo',
              endpoint: 'https://tempo.example.com',
              auth: { token: '{{ env.PROMPTFOO_TEST_TEMPO_RESUME_TOKEN }}' },
              headers: {
                Authorization: 'Bearer {{ env.PROMPTFOO_TEST_TEMPO_RESUME_TOKEN }}',
              },
            },
          },
        },
        { id: 'eval-resume-tempo-credentials', persisted: true },
      );
      const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(resumeEval);

      try {
        await doEval({ table: false, resume: resumeEval.id } as any, {}, undefined, {});

        const resumedSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
        expect(resumedSuite.tracing?.provider?.auth?.token).toBe('resumed-tempo-runtime-secret');
        expect(resumedSuite.tracing?.provider?.headers?.Authorization).toBe(
          'Bearer resumed-tempo-runtime-secret',
        );
        expect(resumeEval.config.tracing?.provider?.auth?.token).toBe(
          '{{ env.PROMPTFOO_TEST_TEMPO_RESUME_TOKEN }}',
        );
      } finally {
        findByIdSpy.mockRestore();
        restoreEnv();
      }
    });

    it('resolves nested persisted environment references before resuming trace retrieval', async () => {
      const restoreEnv = mockProcessEnv({
        PROMPTFOO_TEST_TEMPO_SOURCE_SECRET: 'nested-tempo-runtime-secret',
      });
      const resumeEval = new Eval(
        {
          providers: [{ id: 'echo', label: 'traced-target' }],
          prompts: ['Hello'],
          tests: [{ vars: {} }],
          env: {
            PROMPTFOO_TEST_TEMPO_READER: '{{ env.PROMPTFOO_TEST_TEMPO_SOURCE_SECRET }}',
          },
          tracing: {
            enabled: true,
            provider: {
              id: 'tempo',
              endpoint: 'https://tempo.example.com',
              auth: { token: '{{ env.PROMPTFOO_TEST_TEMPO_READER }}' },
              headers: {
                'X-Tempo-Reader': '{{ env.PROMPTFOO_TEST_TEMPO_READER }}',
              },
            },
          },
        },
        { id: 'eval-resume-nested-tempo-credentials', persisted: true },
      );
      const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(resumeEval);

      try {
        await doEval({ table: false, resume: resumeEval.id } as any, {}, undefined, {});

        const resumedSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
        expect(resumedSuite.tracing?.provider?.auth?.token).toBe('nested-tempo-runtime-secret');
        expect(resumedSuite.tracing?.provider?.headers?.['X-Tempo-Reader']).toBe(
          'nested-tempo-runtime-secret',
        );
        expect(resumeEval.config.env).toEqual({
          PROMPTFOO_TEST_TEMPO_READER: '{{ env.PROMPTFOO_TEST_TEMPO_SOURCE_SECRET }}',
        });
      } finally {
        findByIdSpy.mockRestore();
        restoreEnv();
      }
    });

    it('should not treat evaluateOptions.providerFilter as a provider selection', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-ignored-provider-filter.yaml', {
        evaluateOptions: {
          providerFilter: 'selected-target',
        },
        providers: [
          { id: 'echo', label: 'excluded-target' },
          { id: 'echo', label: 'selected-target' },
        ],
        prompts: ['Hello'],
        tests: [{ vars: {} }],
      });

      await doEval({ table: false, write: false, config: [tempConfig] }, {}, undefined, {});

      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const evalRecord = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const options = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
      expect(testSuite.providers.map((provider) => provider.label)).toEqual([
        'excluded-target',
        'selected-target',
      ]);
      expect(evalRecord.runtimeOptions?.providerFilter).toBeUndefined();
      expect(options).not.toHaveProperty('providerFilter');
    });

    it('should make commandLineOptions.filterSample repeatable with a configured seed', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-sample-seed.yaml', {
        commandLineOptions: {
          filterSample: 2,
          filterSampleSeed: 42,
        },
        providers: ['echo'],
        prompts: ['Hello {{input}}'],
        tests: [
          { vars: { input: 'one' } },
          { vars: { input: 'two' } },
          { vars: { input: 'three' } },
        ],
      });

      await doEval({ table: false, write: false, config: [tempConfig] }, {}, undefined, {});
      const firstSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      await doEval({ table: false, write: false, config: [tempConfig] }, {}, undefined, {});
      const secondSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;

      expect(firstSuite.tests?.map((test) => test.vars?.input)).toEqual(['two', 'three']);
      expect(firstSuite.tests?.map((test) => test.vars?.input)).toEqual(
        secondSuite.tests?.map((test) => test.vars?.input),
      );
    });

    it('should use evaluateOptions.filterRange when command-line defaults do not set it', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-evaluate-options-filter-range.yaml', {
        evaluateOptions: {
          filterRange: '1:2',
        },
        providers: ['echo'],
        prompts: ['Hello {{input}}'],
        tests: [
          { vars: { input: 'one' } },
          { vars: { input: 'two' } },
          { vars: { input: 'three' } },
        ],
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
        },
        {},
        undefined,
        {},
      );

      expect(evaluateMock).toHaveBeenCalled();
      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const evalRecord = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const options = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
      expect(testSuite.tests?.map((test) => test.vars?.input)).toEqual(['two']);
      expect(evalRecord.runtimeOptions?.filterRange).toBe('1:2');
      expect(options.filterRange).toBeUndefined();
    });

    it('should suppress the implicit default test when filters remove explicit tests', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-pattern-filter-empty.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{input}}'],
        tests: [{ description: 'kept only by matching filters', vars: { input: 'one' } }],
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterPattern: 'no match',
        },
        {},
        undefined,
        {},
      );

      expect(evaluateMock).toHaveBeenCalled();
      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(testSuite.tests).toHaveLength(0);
      expect(testSuite.scenarios).toEqual([]);
    });

    it.each([
      ['--filter-pattern', { filterPattern: 'no match' }],
      ['--filter-metadata', { filterMetadata: 'category=drop' }],
    ])('should apply %s to the implicit default test', async (_filterName, filterOptions) => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-implicit-default.yaml', {
        providers: ['echo'],
        prompts: ['Hello'],
        defaultTest: {
          metadata: { category: 'keep' },
          assert: [{ type: 'contains', value: 'Hello' }],
        },
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          ...filterOptions,
        },
        {},
        undefined,
        {},
      );

      expect(evaluateMock).toHaveBeenCalled();
      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(testSuite.tests).toHaveLength(0);
      expect(testSuite.scenarios).toEqual([]);
    });

    it('should filter an implicit default test by inherited metadata', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-implicit-default-metadata.yaml', {
        providers: ['echo'],
        prompts: ['Hello'],
        defaultTest: {
          metadata: { category: 'keep' },
          assert: [{ type: 'contains', value: 'Hello' }],
        },
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadata: 'category=keep',
        },
        {},
        undefined,
        {},
      );

      expect(evaluateMock).toHaveBeenCalled();
      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(testSuite.tests).toHaveLength(1);
      expect(testSuite.tests?.[0].metadata).toEqual({ category: 'keep' });
      expect(testSuite.scenarios).toBeUndefined();
    });

    it('should apply filterRange to the implicit default test', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-range-implicit-default.yaml', {
        providers: ['echo'],
        prompts: ['Hello'],
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterRange: '0:1',
        },
        {},
        undefined,
        {},
      );

      expect(evaluateMock).toHaveBeenCalled();
      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const evalRecord = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const options = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
      expect(testSuite.tests).toHaveLength(1);
      expect(evalRecord.runtimeOptions?.filterRange).toBe('0:1');
      expect(options.filterRange).toBeUndefined();
    });

    it('should not synthesize a default test from explicitly empty scenarios', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-range-empty-scenarios.yaml', {
        providers: ['echo'],
        prompts: ['Hello'],
        scenarios: [],
        defaultTest: {
          assert: [{ type: 'contains', value: 'Hello' }],
        },
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterRange: '0:1',
        },
        {},
        undefined,
        {},
      );

      expect(evaluateMock).toHaveBeenCalled();
      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(testSuite.tests).toHaveLength(0);
      expect(testSuite.scenarios).toEqual([]);
    });

    it('should preserve empty filterRange slices for the implicit default test', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-range-implicit-empty.yaml', {
        providers: ['echo'],
        prompts: ['Hello'],
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterRange: '0:0',
        },
        {},
        undefined,
        {},
      );

      expect(evaluateMock).toHaveBeenCalled();
      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const evalRecord = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const options = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
      expect(testSuite.tests).toHaveLength(0);
      expect(testSuite.scenarios).toEqual([]);
      expect(evalRecord.runtimeOptions?.filterRange).toBe('0:0');
      expect(options.filterRange).toBeUndefined();
    });

    it('should restore persisted filterRange when resuming scenario evals', async () => {
      const resumeEval = new Eval(
        {
          providers: ['echo'],
          prompts: ['Hello {{name}}'],
          scenarios: [
            {
              config: [{}],
              tests: [{ vars: { name: 'Alice' } }, { vars: { name: 'Bob' } }],
            },
          ],
        },
        {
          id: 'eval-resume-filter-range',
          persisted: true,
          runtimeOptions: {
            cache: true,
            filterRange: '1:2',
            maxConcurrency: 1,
            repeat: 1,
          },
        },
      );
      const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(resumeEval);

      try {
        await doEval(
          {
            table: false,
            resume: 'eval-resume-filter-range',
          } as any,
          {},
          undefined,
          {},
        );

        expect(evaluateMock).toHaveBeenCalled();
        const options = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
        expect(options.filterRange).toBe('1:2');
      } finally {
        findByIdSpy.mockRestore();
      }
    });

    it.each([
      ['commandLineOptions', { commandLineOptions: { filterRange: '1:2' } }],
      ['evaluateOptions', { evaluateOptions: { filterRange: '1:2' } }],
    ])(
      'should restore legacy %s.filterRange when resuming evals without persisted runtime options',
      async (_source, legacyConfig) => {
        const resumeEval = new Eval(
          {
            ...legacyConfig,
            providers: ['echo'],
            prompts: ['Hello {{name}}'],
            tests: [
              { vars: { name: 'Alice' } },
              { vars: { name: 'Bob' } },
              { vars: { name: 'Carol' } },
            ],
          },
          {
            id: 'eval-resume-without-filter-range',
            persisted: true,
          },
        );
        const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(resumeEval);

        try {
          await doEval(
            {
              table: false,
              resume: 'eval-resume-without-filter-range',
            } as any,
            {},
            undefined,
            {
              filterRange: '0:1',
            },
          );

          expect(evaluateMock).toHaveBeenCalled();
          const options = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
          expect(options.filterRange).toBe('1:2');
        } finally {
          findByIdSpy.mockRestore();
        }
      },
    );

    it('should warn and ignore CLI --filter-range when resuming with a different persisted range', async () => {
      const resumeEval = new Eval(
        {
          providers: ['echo'],
          prompts: ['Hello {{name}}'],
          tests: [
            { vars: { name: 'Alice' } },
            { vars: { name: 'Bob' } },
            { vars: { name: 'Carol' } },
          ],
        },
        {
          id: 'eval-resume-filter-range-conflict',
          persisted: true,
          runtimeOptions: {
            cache: true,
            filterRange: '0:1',
            maxConcurrency: 1,
            repeat: 1,
          },
        },
      );
      const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(resumeEval);
      const warnMock = vi.mocked(logger.warn);
      warnMock.mockClear();

      try {
        await doEval(
          {
            table: false,
            resume: 'eval-resume-filter-range-conflict',
            filterRange: '1:3',
          } as any,
          {},
          undefined,
          {},
        );

        expect(warnMock).toHaveBeenCalledWith(
          expect.stringContaining('Ignoring --filter-range 1:3'),
        );
        const evalRecord = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
        expect(evalRecord.runtimeOptions?.filterRange).toBe('0:1');
      } finally {
        findByIdSpy.mockRestore();
      }
    });

    it('should prioritize CLI --suggest-prompts over commandLineOptions.generateSuggestions', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-generate-suggestions-override.yaml', {
        commandLineOptions: {
          generateSuggestions: false,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        suggestPrompts: 3, // CLI override
      } as Partial<CommandLineOptions & Command>);

      expect(options.generateSuggestions).toBe(true);
      expect(options.suggestionsCount).toBe(3);
    });

    it('should let an explicit generateSuggestions=false override commandLineOptions config', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-generate-suggestions-disabled.yaml', {
        commandLineOptions: {
          generateSuggestions: true,
        },
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        generateSuggestions: false,
      });

      expect(options.generateSuggestions).toBe(false);
      expect(options.suggestionsCount).toBeUndefined();
    });

    it('should let an explicit generateSuggestions=false override evaluateOptions config', async () => {
      const tempConfig = writeOptionsConfig(
        tmpDir,
        'test-generate-suggestions-disabled-evaluate.yaml',
        {
          evaluateOptions: {
            generateSuggestions: true,
            suggestionsCount: 4,
          },
        },
      );

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        generateSuggestions: false,
      });

      expect(options.generateSuggestions).toBe(false);
      expect(options.suggestionsCount).toBe(4);
    });

    it('should let commandLineOptions.generateSuggestions=false override evaluateOptions.generateSuggestions=true', async () => {
      const tempConfig = writeOptionsConfig(
        tmpDir,
        'test-cli-options-disable-overrides-evaluate.yaml',
        {
          commandLineOptions: { generateSuggestions: false },
          evaluateOptions: { generateSuggestions: true, suggestionsCount: 4 },
        },
      );

      const options = await runEvalAndGetOptions({ config: [tempConfig] });

      expect(options.generateSuggestions).toBe(false);
      expect(options.suggestionsCount).toBe(4);
    });

    it('should honor cmdObj.suggestionsCount from non-Commander callers', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-cmdobj-suggestions-count.yaml', {});

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        generateSuggestions: true,
        suggestionsCount: 7,
      });

      expect(options.generateSuggestions).toBe(true);
      expect(options.suggestionsCount).toBe(7);
    });

    it('should let --suggest-prompts override an explicit generateSuggestions=false', async () => {
      const tempConfig = writeOptionsConfig(
        tmpDir,
        'test-suggest-prompts-overrides-disable.yaml',
        {},
      );

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        generateSuggestions: false,
        suggestPrompts: 5,
      } as Partial<CommandLineOptions & Command>);

      expect(options.generateSuggestions).toBe(true);
      expect(options.suggestionsCount).toBe(5);
    });

    it('should respect commandLineOptions.table from config', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-table.yaml', {
        commandLineOptions: {
          table: false,
        },
      });

      const cmdObj: Partial<CommandLineOptions & Command> = {
        write: false,
        config: [tempConfig],
      };

      // We can't directly check table output, but we can verify the config loads
      await doEval(cmdObj, {}, undefined, {});

      // If this completes without error, the config was respected
      expect(evaluateMock).toHaveBeenCalled();
    });

    it('should respect commandLineOptions.write = false from config', async () => {
      const tempConfig = writeOptionsConfig(tmpDir, 'test-write.yaml', {
        commandLineOptions: {
          write: false,
        },
      });

      const cmdObj: Partial<CommandLineOptions & Command> = {
        table: false,
        config: [tempConfig],
      };

      await doEval(cmdObj, {}, undefined, {});

      // Verify eval completed successfully with write=false
      expect(evaluateMock).toHaveBeenCalled();
    });
  });
});
