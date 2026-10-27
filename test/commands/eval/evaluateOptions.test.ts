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
import { ResultFailureReason } from '../../../src/types/index';
import * as configLoadModule from '../../../src/util/config/load';
import { isSafeMode } from '../../../src/util/safeMode';
import { mockProcessEnv } from '../../util/utils';
import type { Command } from 'commander';

import type { CommandLineOptions, EvaluateOptions, TestSuite } from '../../../src/types/index';
import type {
  InternalEvaluateOptions,
  PreparedHistoricalCandidate,
} from '../../../src/types/internal';

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

    it('should filter an implicit default test by exact inherited metadata', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-implicit-default-exact.yaml', {
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
          filterMetadataExact: 'category=keep',
        },
        {},
        undefined,
        {},
      );

      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(testSuite.tests).toHaveLength(1);
      expect(testSuite.tests?.[0].metadata).toEqual({ category: 'keep' });
    });

    it('should prefer the CLI exact metadata filter over its configured value', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-metadata-exact-precedence.yaml', {
        commandLineOptions: { filterMetadataExact: 'category=unit' },
        providers: ['echo'],
        prompts: ['Hello {{input}}'],
        tests: [
          { vars: { input: 'unit' }, metadata: { category: 'unit' } },
          { vars: { input: 'integration' }, metadata: { category: 'integration' } },
        ],
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadataExact: ['category=integration'],
        },
        {},
        undefined,
        {},
      );

      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(testSuite.tests?.map((test) => test.vars?.input)).toEqual(['integration']);
    });

    it.each([
      ['filterFailing', ResultFailureReason.ASSERT],
      ['filterFailingOnly', ResultFailureReason.ASSERT],
      ['filterErrorsOnly', ResultFailureReason.ERROR],
    ] as const)(
      'should not reuse a different top-level metadata case with %s',
      async (resultFilter, failureReason) => {
        const tempConfig = writeTempConfig(tmpDir, 'test-exact-top-level-results.yaml', {
          providers: ['echo'],
          prompts: ['Hello {{input}}'],
          tests: [
            { vars: { input: 'same' }, metadata: { id: 'A' } },
            { vars: { input: 'same' }, metadata: { id: 'B' } },
          ],
        });
        const resultsPath = path.join(tmpDir, 'test-exact-top-level-results.json');
        fs.writeFileSync(
          resultsPath,
          JSON.stringify({
            results: {
              results: [
                {
                  success: false,
                  failureReason,
                  vars: { input: 'same' },
                  testCase: { vars: { input: 'same' }, metadata: { id: 'A' } },
                },
              ],
            },
          }),
        );

        await doEval(
          {
            table: false,
            write: false,
            config: [tempConfig],
            filterMetadataExact: 'id=B',
            [resultFilter]: resultsPath,
          },
          {},
          undefined,
          {},
        );

        const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
        expect(testSuite.tests?.map((test) => test.metadata?.id)).toEqual(['B']);
        const selection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
          .exactHistoricalSelection;
        expect(selection).toBeDefined();
        expect(
          await selection?.select(
            [{ test: testSuite.tests![0], source: { kind: 'top-level', testIndex: 0 } }],
            testSuite,
          ),
        ).toEqual([]);
      },
    );

    it('defers historical selection until scenario vars have been transformed', async () => {
      const configFile = writeTempConfig(tmpDir, 'scenario-transformed-history.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{variant}}'],
        scenarios: [
          {
            config: [
              { vars: { variant: 'a' }, metadata: { role: 'keep' } },
              { vars: { variant: 'b' }, metadata: { role: 'keep' } },
            ],
            tests: [
              {
                options: { transformVars: 'return { ...vars, variant: vars.variant + "!" }' },
              },
            ],
          },
        ],
      });
      const resultsPath = path.join(tmpDir, 'scenario-transformed-history.json');
      fs.writeFileSync(
        resultsPath,
        JSON.stringify({
          results: {
            results: [
              {
                success: false,
                failureReason: ResultFailureReason.ASSERT,
                vars: { variant: 'a!' },
                testCase: {
                  vars: { variant: 'a!' },
                  metadata: { role: 'keep', conversationId: '__scenario_0__' },
                },
              },
            ],
          },
        }),
      );

      await doEval(
        {
          table: false,
          write: false,
          config: [configFile],
          filterMetadataExact: 'role=keep',
          filterFailing: resultsPath,
        },
        {},
        undefined,
        {},
      );

      const suite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(suite.scenarios?.map((scenario) => scenario.tests?.length)).toEqual([1, 1]);
      expect(evaluateMock.mock.calls.at(-1)?.[2]).toHaveProperty('exactHistoricalSelection');
    });

    it('applies the top-level range after beforeAll removes scenarios', async () => {
      const configFile = writeTempConfig(tmpDir, 'exact-history-remove-scenario.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{id}}'],
        tests: ['A', 'B'].map((id) => ({ vars: { id }, metadata: { id } })),
        scenarios: [{ config: [{}], tests: [{ vars: { id: 'C' }, metadata: { id: 'C' } }] }],
      });
      const resultsPath = path.join(tmpDir, 'exact-history-remove-scenario.json');
      fs.writeFileSync(
        resultsPath,
        JSON.stringify({
          results: {
            results: ['A', 'B'].map((id) => ({
              success: false,
              failureReason: ResultFailureReason.ASSERT,
              vars: { id },
              testCase: { vars: { id }, metadata: { id } },
            })),
          },
        }),
      );
      await doEval(
        {
          table: false,
          write: false,
          config: [configFile],
          filterMetadataExact: 'id=A,B,C',
          filterFailing: resultsPath,
          filterRange: '1:2',
        },
        {},
        undefined,
        {},
      );
      const suite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const selection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
        .exactHistoricalSelection!;
      const postHookSuite = { ...suite, scenarios: [] };
      const candidates: PreparedHistoricalCandidate[] = (suite.tests ?? []).map(
        (test, testIndex) => ({
          source: { kind: 'top-level', testIndex },
          test,
        }),
      );
      expect(
        (await selection.select(candidates, postHookSuite)).map(
          (candidate) => candidate.test.vars?.id,
        ),
      ).toEqual(['B']);
    });

    it('keeps a seeded sample tied to the original scenario after beforeAll clones it', async () => {
      const configFile = writeTempConfig(tmpDir, 'exact-history-cloned-scenarios.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{variant}} {{caseId}}'],
        scenarios: [
          {
            config: ['A', 'B'].map((variant) => ({
              vars: { variant },
              metadata: { role: 'keep' },
            })),
            tests: ['one', 'two'].map((caseId) => ({ vars: { caseId } })),
          },
        ],
      });
      const resultsPath = path.join(tmpDir, 'exact-history-cloned-scenarios.json');
      fs.writeFileSync(
        resultsPath,
        JSON.stringify({
          results: {
            results: ['A', 'B'].flatMap((variant, scenarioIndex) =>
              ['one', 'two'].map((caseId) => ({
                success: false,
                failureReason: ResultFailureReason.ASSERT,
                vars: { variant, caseId },
                testCase: {
                  vars: { variant, caseId },
                  metadata: { role: 'keep', conversationId: `__scenario_${scenarioIndex}__` },
                },
              })),
            ),
          },
        }),
      );
      await doEval(
        {
          table: false,
          write: false,
          config: [configFile],
          filterMetadataExact: 'role=keep',
          filterFailing: resultsPath,
          filterSample: 1,
          filterSampleSeed: 0,
        },
        {},
        undefined,
        {},
      );
      const suite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const selection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
        .exactHistoricalSelection!;
      const candidates: PreparedHistoricalCandidate[] = (suite.scenarios ?? []).flatMap(
        (scenario, scenarioIndex) =>
          scenario.tests.map((test, testIndex) => ({
            source: { kind: 'scenario', scenarioIndex, variantIndex: 0, testIndex },
            test: {
              ...test,
              vars: { ...scenario.config[0].vars, ...test.vars },
              metadata: {
                ...scenario.config[0].metadata,
                ...test.metadata,
                conversationId: `__scenario_${scenarioIndex}__`,
              },
            },
          })),
      );
      const selectedPairs = async (postHookSuite: TestSuite) =>
        (await selection.select(candidates, postHookSuite)).map((candidate) => [
          candidate.test.vars?.variant,
          candidate.test.vars?.caseId,
        ]);
      const expected = await selectedPairs(suite);
      expect(expected).toHaveLength(2);
      expect(
        await selectedPairs({
          ...suite,
          scenarios: suite.scenarios?.map((scenario) => ({
            ...scenario,
            config: [...scenario.config],
            tests: [...scenario.tests],
          })),
        }),
      ).toEqual(expected);
      expect(
        await selectedPairs({
          ...suite,
          scenarios: JSON.parse(JSON.stringify(suite.scenarios)),
        }),
      ).toEqual(expected);
    });

    it('does not extract a stale transformed top-level row with inherited default metadata', async () => {
      const configFile = writeTempConfig(tmpDir, 'exact-history-default-metadata.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{id}}'],
        defaultTest: {
          metadata: { role: 'keep' },
          options: { transformVars: 'return { id: vars.id + "?" }' },
        },
        tests: [{ vars: { id: 'a' } }],
      });
      const resultsPath = path.join(tmpDir, 'exact-history-default-metadata.json');
      const writeResult = (metadata: Record<string, unknown>) =>
        fs.writeFileSync(
          resultsPath,
          JSON.stringify({
            results: {
              results: [
                {
                  success: false,
                  failureReason: ResultFailureReason.ASSERT,
                  vars: { id: 'a!' },
                  testCase: { vars: { id: 'a!' }, metadata },
                },
              ],
            },
          }),
        );
      writeResult({ role: 'keep' });
      await doEval(
        {
          table: false,
          write: false,
          config: [configFile],
          filterMetadataExact: 'role=keep',
          filterFailing: resultsPath,
        },
        {},
        undefined,
        {},
      );
      const suite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const selection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
        .exactHistoricalSelection!;
      const prepared: PreparedHistoricalCandidate[] = [
        {
          source: { kind: 'top-level', testIndex: 0 },
          test: {
            ...suite.tests![0],
            vars: { id: 'a?' },
            options: {
              ...(typeof suite.defaultTest === 'object' ? suite.defaultTest.options : undefined),
            },
          },
        },
      ];
      expect(await selection.select(prepared, suite)).toEqual([]);

      // Extra runtime metadata cannot prove that this was the authored test.
      writeResult({ role: 'keep', pluginId: 'runtime-generated' });
      expect((await selection.select(prepared, suite)).map((item) => item.test.vars?.id)).toEqual([
        'a!',
      ]);
    });

    it('should retain distinct failed top-level tests that share vars', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-exact-top-level-shared-vars.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{input}}'],
        tests: [
          { vars: { input: 'same' }, metadata: { id: 'A' } },
          { vars: { input: 'same' }, metadata: { id: 'B' } },
        ],
      });
      const resultsPath = path.join(tmpDir, 'test-exact-top-level-shared-vars.json');
      fs.writeFileSync(
        resultsPath,
        JSON.stringify({
          results: {
            results: ['A', 'B'].map((id) => ({
              success: false,
              failureReason: id === 'A' ? ResultFailureReason.ASSERT : ResultFailureReason.ERROR,
              vars: { input: 'same' },
              testCase: { vars: { input: 'same' }, metadata: { id } },
            })),
          },
        }),
      );

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadataExact: 'id=A,B',
          filterFailingOnly: resultsPath,
          filterErrorsOnly: resultsPath,
        },
        {},
        undefined,
        {},
      );

      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(testSuite.tests?.map((test) => test.metadata?.id)).toEqual(['A', 'B']);
    });

    it('should extract a top-level runtime test from results when there are no authored tests', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-exact-top-level-runtime.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{input}}'],
        tests: [],
        scenarios: [],
      });
      const resultsPath = path.join(tmpDir, 'test-exact-top-level-runtime.json');
      fs.writeFileSync(
        resultsPath,
        JSON.stringify({
          results: {
            results: [
              {
                success: false,
                vars: { input: 'runtime' },
                testCase: { vars: { input: 'runtime' }, metadata: { id: 'generated' } },
              },
            ],
          },
        }),
      );

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadataExact: 'id=generated',
          filterFailing: resultsPath,
        },
        {},
        undefined,
        {},
      );

      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const selection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
        .exactHistoricalSelection;
      expect(selection).toBeDefined();
      expect(
        (await selection?.select([], testSuite))?.map((candidate) => candidate.test.vars?.input),
      ).toEqual(['runtime']);
    });

    it('keeps synthetic scenario routing within current and stored provider and prompt selectors', async () => {
      const configFile = writeTempConfig(tmpDir, 'exact-history-synthetic-routing.yaml', {
        providers: [
          { id: 'echo', label: 'provider-A' },
          { id: 'echo', label: 'provider-B' },
        ],
        prompts: [
          { raw: 'A {{input}}', label: 'prompt-A' },
          { raw: 'B {{input}}', label: 'prompt-B' },
        ],
        scenarios: [
          {
            config: [
              {
                metadata: { role: 'keep' },
                providers: ['provider-A'],
                prompts: ['prompt-A'],
              },
            ],
            tests: [],
          },
        ],
      });
      const resultsPath = path.join(tmpDir, 'exact-history-synthetic-routing.json');
      const writeResult = (providers: string[], prompts: string[]) =>
        fs.writeFileSync(
          resultsPath,
          JSON.stringify({
            results: {
              results: [
                {
                  success: false,
                  failureReason: ResultFailureReason.ASSERT,
                  vars: { input: 'runtime' },
                  provider: { id: 'echo', label: 'provider-A' },
                  prompt: { raw: 'A runtime', label: 'prompt-A' },
                  metadata: { __promptfoo: { evalOrigin: 'scenario' } },
                  testCase: {
                    vars: { input: 'runtime' },
                    metadata: { role: 'keep', conversationId: '__scenario_0__' },
                    providers,
                    prompts,
                  },
                },
              ],
            },
          }),
        );
      writeResult(['provider-A', 'provider-B'], ['prompt-A', 'prompt-B']);
      await doEval(
        {
          table: false,
          write: false,
          config: [configFile],
          filterMetadataExact: 'role=keep',
          filterFailing: resultsPath,
        },
        {},
        undefined,
        {},
      );
      const suite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const selection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
        .exactHistoricalSelection!;
      const selected = await selection.select([], suite);
      expect(selected).toHaveLength(1);
      expect(selected[0].source).toEqual({
        kind: 'scenario',
        scenarioIndex: 0,
        variantIndex: 0,
        testIndex: -1,
      });
      expect(selected[0].test.providers).toEqual(['provider-A']);
      expect(selected[0].test.prompts).toEqual(['prompt-A']);

      // Historical test-specific selectors remain narrower when the current variant widens.
      writeResult(['provider-A'], ['prompt-A']);
      const wideSuite: TestSuite = {
        ...suite,
        scenarios: suite.scenarios?.map((scenario) => ({
          ...scenario,
          config: scenario.config.map((variant) => ({
            ...variant,
            providers: ['provider-A', 'provider-B'],
            prompts: ['prompt-A', 'prompt-B'],
          })),
        })),
      };
      expect((await selection.select([], wideSuite))[0].test.providers).toEqual(['provider-A']);
      expect((await selection.select([], wideSuite))[0].test.prompts).toEqual(['prompt-A']);

      writeResult(['provider-*'], ['prompt-*']);
      expect((await selection.select([], suite))[0].test.providers).toEqual(['provider-A']);
      expect((await selection.select([], suite))[0].test.prompts).toEqual(['prompt-A']);
      writeResult(['provider:A'], ['prompt:A']);
      const prefixResult = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      prefixResult.results.results[0].provider.label = 'provider:A';
      prefixResult.results.results[0].prompt.label = 'prompt:A';
      fs.writeFileSync(resultsPath, JSON.stringify(prefixResult));
      const prefixSuite: TestSuite = {
        ...wideSuite,
        providers: wideSuite.providers.map((provider) => ({
          id: () => provider.id(),
          label: provider.label?.replace('-', ':'),
          callApi: async () => ({ output: 'unused' }),
        })),
        prompts: wideSuite.prompts.map((prompt) => ({
          ...prompt,
          label: prompt.label.replace('-', ':'),
        })),
        scenarios: wideSuite.scenarios?.map((scenario) => ({
          ...scenario,
          config: scenario.config.map((variant) => ({
            ...variant,
            providers: ['provider'],
            prompts: ['prompt'],
          })),
        })),
      };
      expect((await selection.select([], prefixSuite))[0].test.providers).toEqual(['provider:A']);
      expect((await selection.select([], prefixSuite))[0].test.prompts).toEqual(['prompt:A']);

      // Intersect overlapping lists against current columns; prefer A's safe
      // label over its credential-bearing URL ID in the prepared plan.
      writeResult(['provider-A', 'provider-C'], ['prompt-A', 'prompt-C']);
      const overlappingSuite: TestSuite = {
        ...wideSuite,
        providers: [
          {
            id: () => 'https://example.invalid/target?api_key=qa-fake-secret',
            label: 'provider-A',
            callApi: async () => ({ output: 'unused' }),
          },
          ...wideSuite.providers.slice(1),
          {
            id: () => 'echo',
            label: 'provider-C',
            callApi: async () => ({ output: 'unused' }),
          },
        ],
        prompts: [
          ...wideSuite.prompts,
          { raw: 'C {{input}}', label: 'prompt-C', id: 'prompt-id-C' },
        ],
      };
      const overlap = (await selection.select([], overlappingSuite))[0];
      expect(overlap.test.providers).toEqual(['provider-A']);
      expect(overlap.test.prompts).toEqual(['prompt-A']);

      // A shared prompt label cannot represent just one prompt; its unique ID can.
      const stored = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      stored.results.results[0].prompt = { raw: 'A runtime', label: 'shared', id: 'prompt-id-A' };
      stored.results.results[0].testCase.prompts = ['prompt-id-A', 'prompt-id-C'];
      fs.writeFileSync(resultsPath, JSON.stringify(stored));
      const duplicateLabelSuite: TestSuite = {
        ...overlappingSuite,
        prompts: [
          { raw: 'A {{input}}', label: 'shared', id: 'prompt-id-A' },
          { raw: 'B {{input}}', label: 'shared', id: 'prompt-id-B' },
          { raw: 'C {{input}}', label: 'prompt-C', id: 'prompt-id-C' },
        ],
        scenarios: overlappingSuite.scenarios?.map((scenario) => ({
          ...scenario,
          config: scenario.config.map((variant) => ({ ...variant, prompts: ['shared'] })),
        })),
      };
      expect((await selection.select([], duplicateLabelSuite))[0].test.prompts).toEqual([
        'prompt-id-A',
      ]);

      // These two OR-lists intersect on one column, but neither its ID nor label
      // can select it alone without admitting a different excluded column.
      writeResult(['provider-A'], ['prompt-id-X']);
      const crossCollisionResult = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      crossCollisionResult.results.results[0].prompt = {
        raw: 'A runtime',
        id: 'prompt-id-X',
        label: 'prompt-label-Y',
      };
      fs.writeFileSync(resultsPath, JSON.stringify(crossCollisionResult));
      const crossCollisionSuite: TestSuite = {
        ...suite,
        prompts: [
          { raw: 'A {{input}}', id: 'prompt-id-X', label: 'prompt-label-Y' },
          { raw: 'B {{input}}', id: 'prompt-id-X', label: 'prompt-label-Z' },
          { raw: 'C {{input}}', id: 'prompt-id-W', label: 'prompt-label-Y' },
        ],
        scenarios: suite.scenarios?.map((scenario) => ({
          ...scenario,
          config: scenario.config.map((variant) => ({
            ...variant,
            prompts: ['prompt-label-Y'],
          })),
        })),
      };
      await expect(selection.select([], crossCollisionSuite)).rejects.toThrow(
        'Use distinct provider/prompt IDs or labels',
      );

      const noneSuite: TestSuite = {
        ...suite,
        scenarios: suite.scenarios?.map((scenario) => ({
          ...scenario,
          config: scenario.config.map((variant) => ({
            ...variant,
            providers: [],
            prompts: [],
          })),
        })),
      };
      expect(await selection.select([], noneSuite)).toEqual([]);
    });

    it('keeps synthetic top-level routing within current default selectors', async () => {
      const configFile = writeTempConfig(tmpDir, 'exact-history-synthetic-default-routing.yaml', {
        providers: [
          { id: 'echo', label: 'provider-A' },
          { id: 'echo', label: 'provider-B' },
        ],
        prompts: [
          { raw: 'A {{input}}', label: 'prompt-A' },
          { raw: 'B {{input}}', label: 'prompt-B' },
        ],
        defaultTest: { providers: ['provider-A'], prompts: ['prompt-A'] },
        tests: [],
      });
      const resultsPath = path.join(tmpDir, 'exact-history-synthetic-default-routing.json');
      fs.writeFileSync(
        resultsPath,
        JSON.stringify({
          results: {
            results: [
              {
                success: false,
                failureReason: ResultFailureReason.ASSERT,
                vars: { input: 'runtime' },
                provider: { id: 'echo', label: 'provider-A' },
                prompt: { raw: 'A runtime', label: 'prompt-A' },
                metadata: { __promptfoo: { evalOrigin: 'top-level' } },
                testCase: {
                  vars: { input: 'runtime' },
                  metadata: { role: 'keep' },
                  providers: ['provider-A', 'provider-B'],
                  prompts: ['prompt-A', 'prompt-B'],
                },
              },
            ],
          },
        }),
      );
      await doEval(
        {
          table: false,
          write: false,
          config: [configFile],
          filterMetadataExact: 'role=keep',
          filterFailing: resultsPath,
        },
        {},
        undefined,
        {},
      );
      const suite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const selection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
        .exactHistoricalSelection!;
      const selected = await selection.select([], suite);
      expect(selected).toHaveLength(1);
      expect(selected[0].test.providers).toEqual(['provider-A']);
      expect(selected[0].test.prompts).toEqual(['prompt-A']);
    });

    it('accepts declarative runtime assertions but rejects executable historical references', async () => {
      const configFile = writeTempConfig(tmpDir, 'exact-runtime-safe-assert.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{input}}'],
        tests: [],
        scenarios: [],
      });
      const resultsPath = path.join(tmpDir, 'exact-runtime-safe-assert.json');
      const writeResult = (testCase: Record<string, unknown>) =>
        fs.writeFileSync(
          resultsPath,
          JSON.stringify({
            results: {
              results: [
                {
                  success: false,
                  vars: testCase.vars ?? { input: 'runtime' },
                  testCase: {
                    vars: { input: 'runtime' },
                    metadata: { id: 'generated' },
                    ...testCase,
                  },
                },
              ],
            },
          }),
        );
      writeResult({ assert: [{ type: 'contains', value: 'ok' }] });
      await doEval(
        {
          table: false,
          write: false,
          config: [configFile],
          filterMetadataExact: 'id=generated',
          filterFailing: resultsPath,
        },
        {},
        undefined,
        {},
      );
      const suite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const selection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
        .exactHistoricalSelection!;
      expect((await selection.select([], suite))[0].test.assert).toEqual([
        { type: 'contains', value: 'ok' },
      ]);

      writeResult({ vars: { provider: 'data-only', type: 'label-only' } });
      expect((await selection.select([], suite))[0].test.vars).toEqual({
        provider: 'data-only',
        type: 'label-only',
      });

      for (const unsafe of [
        { options: { provider: 'file://./old-grader.js' } },
        { assert: [{ type: 'javascript', value: 'true' }] },
        { assert: [{ type: 'equals', value: 'file://./old-value.js' }] },
        { assert: [{ type: 'equals', value: 'package:old-grader:check' }] },
        { vars: { input: 'file://./old-variable.js' } },
      ]) {
        writeResult(unsafe);
        await expect(selection.select([], suite)).rejects.toThrow(
          'An extracted historical case contains executable or provider references',
        );
      }
    });

    it('should resume the exact selection and its original order after range and sampling', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-exact-resume-selection.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{id}}'],
        tests: [1, 10, 3, 13, 7, 70].map((id) => ({
          vars: { id },
          metadata: { id },
        })),
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadataExact: 'id=1,3,7',
          filterRange: '1:3',
          filterSample: 1,
        },
        {},
        undefined,
        {},
      );

      const initialSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const initialEval = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      expect(initialSuite.tests).toHaveLength(1);
      const selectedIds = initialSuite.tests?.map((test) => test.vars?.id);
      const savedEval = new Eval(initialEval.config, {
        id: 'eval-exact-resume-selection',
        persisted: true,
        runtimeOptions: initialEval.runtimeOptions,
      });
      const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(savedEval);
      evaluateMock.mockClear();
      try {
        await doEval({ table: false, resume: savedEval.id } as any, {}, undefined, {});
        const resumedSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
        const resumedOptions = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
        expect(resumedSuite.tests?.map((test) => test.vars?.id)).toEqual(selectedIds);
        expect(resumedOptions.filterRange).toBeUndefined();
      } finally {
        findByIdSpy.mockRestore();
      }
    });

    it('should retry errors against the saved exact test selection', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-exact-retry-selection.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{id}}'],
        tests: [1, 10, 3, 13, 7, 70].map((id) => ({
          vars: { id },
          metadata: { id },
        })),
      });
      await doEval(
        { table: false, write: false, config: [tempConfig], filterMetadataExact: 'id=1,3,7' },
        {},
        undefined,
        {},
      );
      const initialEval = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const savedEval = new Eval(initialEval.config, {
        id: 'eval-exact-retry-selection',
        persisted: true,
        runtimeOptions: initialEval.runtimeOptions,
      });
      const latestSpy = vi.spyOn(Eval, 'latest').mockResolvedValue(savedEval);
      const errorsSpy = vi
        .spyOn(retryModule, 'getErrorResultIds')
        .mockResolvedValue(['failed-row']);
      const deleteSpy = vi.spyOn(retryModule, 'deleteErrorResults').mockResolvedValue(undefined);
      const metricsSpy = vi
        .spyOn(retryModule, 'recalculatePromptMetrics')
        .mockResolvedValue(undefined);
      evaluateMock.mockClear();
      try {
        await doEval({ table: false, retryErrors: true }, {}, undefined, {});
        const retriedSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
        expect(retriedSuite.tests?.map((test) => test.vars?.id)).toEqual([1, 3, 7]);
      } finally {
        latestSpy.mockRestore();
        errorsSpy.mockRestore();
        deleteSpy.mockRestore();
        metricsSpy.mockRestore();
      }
    });

    it('should resume scenario exact samples without filtering the saved variants again', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-exact-scenario-resume.yaml', {
        commandLineOptions: {
          filterMetadataExact: 'category=keep',
          filterSample: 2,
          filterSampleSeed: 42,
          filterRange: '1:3',
        },
        providers: ['echo'],
        prompts: ['Hello'],
        scenarios: [
          {
            config: [
              { metadata: { category: 'keep', variant: 'a' } },
              { metadata: { category: 'keep', variant: 'b' } },
            ],
            tests: [{ description: 'one' }, { description: 'two' }, { description: 'three' }],
          },
        ],
      });

      await doEval({ table: false, write: false, config: [tempConfig] }, {}, undefined, {});
      const initialSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      const initialEval = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const selectedDescriptions = initialSuite.scenarios?.map((scenario) =>
        scenario.tests?.map((test) => test.description),
      );
      expect(selectedDescriptions).toHaveLength(2);
      expect(selectedDescriptions?.every((tests) => tests?.length === 2)).toBe(true);

      const savedEval = new Eval(initialEval.config, {
        id: 'eval-exact-scenario-resume',
        persisted: true,
        runtimeOptions: initialEval.runtimeOptions,
      });
      const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(savedEval);
      evaluateMock.mockClear();
      try {
        await doEval({ table: false, resume: savedEval.id } as any, {}, undefined, {});
        const resumedSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
        const resumedOptions = evaluateMock.mock.calls.at(-1)?.[2] as EvaluateOptions;
        expect(
          resumedSuite.scenarios?.map((scenario) =>
            scenario.tests?.map((test) => test.description),
          ),
        ).toEqual(selectedDescriptions);
        expect(resumedOptions.filterRange).toBe('1:3');
      } finally {
        findByIdSpy.mockRestore();
      }
    });

    it('should keep an empty exact selection empty when resuming', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-exact-empty-resume.yaml', {
        providers: ['echo'],
        prompts: ['Hello'],
        tests: [{ metadata: { id: 'excluded' } }],
      });
      await doEval(
        { table: false, write: false, config: [tempConfig], filterMetadataExact: 'id=selected' },
        {},
        undefined,
        {},
      );
      const initialEval = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const savedEval = new Eval(initialEval.config, {
        id: 'eval-exact-empty-resume',
        persisted: true,
        runtimeOptions: initialEval.runtimeOptions,
      });
      const findByIdSpy = vi.spyOn(Eval, 'findById').mockResolvedValue(savedEval);
      evaluateMock.mockClear();
      try {
        await doEval({ table: false, resume: savedEval.id } as any, {}, undefined, {});
        const resumedSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
        expect(resumedSuite.tests).toEqual([]);
        expect(resumedSuite.scenarios).toEqual([]);
      } finally {
        findByIdSpy.mockRestore();
      }
    });

    it('should keep failed scenario variants separate when their test vars are shared', async () => {
      const scenarioConfig = {
        providers: ['echo'],
        prompts: ['Hello {{variant}}'],
        scenarios: [
          {
            config: [
              { vars: { variant: 'shared' }, metadata: { category: 'A' } },
              { vars: { variant: 'shared' }, metadata: { category: 'B' } },
            ],
            tests: [{ vars: { caseId: 'shared' }, metadata: { role: 'common' } }],
          },
        ],
      };
      const tempConfig = writeTempConfig(
        tmpDir,
        'test-exact-scenario-failing.yaml',
        scenarioConfig,
      );
      const failedResultsPath = path.join(tmpDir, 'test-exact-scenario-failing.json');
      const failedCase = (category: string) => ({
        success: false,
        vars: { variant: 'shared', caseId: 'shared' },
        testCase: {
          vars: { variant: 'shared', caseId: 'shared' },
          metadata: {
            category,
            role: 'common',
            conversationId: `__scenario_${category === 'A' ? 0 : 1}__`,
          },
        },
      });
      for (const failedCases of [[failedCase('A')], [failedCase('A'), failedCase('B')]]) {
        fs.writeFileSync(
          failedResultsPath,
          JSON.stringify({
            config: { ...scenarioConfig, tests: [] },
            results: { version: 3, results: failedCases },
          }),
        );
        await doEval(
          {
            table: false,
            write: false,
            config: [tempConfig],
            filterMetadataExact: 'role=common',
            filterFailing: failedResultsPath,
          },
          {},
          undefined,
          {},
        );
        const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
        expect(testSuite.tests).toEqual([]);
        expect(testSuite.scenarios?.map((scenario) => scenario.tests?.length)).toEqual([1, 1]);
        const selection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
          .exactHistoricalSelection;
        const prepared = (testSuite.scenarios ?? []).map((scenario, scenarioIndex) => ({
          source: { kind: 'scenario' as const, scenarioIndex, variantIndex: 0, testIndex: 0 },
          test: {
            ...scenario.tests![0],
            vars: { ...scenario.config[0].vars, ...scenario.tests![0].vars },
            metadata: {
              ...scenario.config[0].metadata,
              ...scenario.tests![0].metadata,
              conversationId: `__scenario_${scenarioIndex}__`,
            },
          },
        })) as PreparedHistoricalCandidate[];
        const selected = await selection!.select(prepared, testSuite);
        expect(
          selected.flatMap((candidate) =>
            candidate.source.kind === 'scenario' ? [candidate.source.scenarioIndex] : [],
          ),
        ).toEqual(failedCases.length === 1 ? [0] : [0, 1]);
      }

      fs.writeFileSync(
        failedResultsPath,
        JSON.stringify({
          config: { ...scenarioConfig, tests: [] },
          results: {
            version: 3,
            results: [
              {
                success: false,
                vars: { variant: 'shared', caseId: 'generated' },
                testCase: {
                  vars: { variant: 'shared', caseId: 'generated' },
                  metadata: { category: 'A', role: 'common', conversationId: '__scenario_0__' },
                },
              },
            ],
          },
        }),
      );
      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadataExact: 'role=common',
          filterFailing: failedResultsPath,
        },
        {},
        undefined,
        {},
      );
      const generatedSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(generatedSuite.tests).toEqual([]);
      expect(generatedSuite.scenarios?.map((scenario) => scenario.tests?.length)).toEqual([1, 1]);
      const generatedSelection = (evaluateMock.mock.calls.at(-1)?.[2] as InternalEvaluateOptions)
        .exactHistoricalSelection;
      const generatedCandidates = (generatedSuite.scenarios ?? []).map(
        (scenario, scenarioIndex) => ({
          source: { kind: 'scenario' as const, scenarioIndex, variantIndex: 0, testIndex: 0 },
          test: {
            ...scenario.tests![0],
            vars: { ...scenario.config[0].vars, ...scenario.tests![0].vars },
            metadata: {
              ...scenario.config[0].metadata,
              ...scenario.tests![0].metadata,
              conversationId: `__scenario_${scenarioIndex}__`,
            },
          },
        }),
      ) as PreparedHistoricalCandidate[];
      const generatedSelected = await generatedSelection!.select(
        generatedCandidates,
        generatedSuite,
      );
      expect(
        generatedSelected.map((candidate) => [candidate.source.kind, candidate.test.vars?.caseId]),
      ).toEqual([['scenario', 'generated']]);
    });

    it('should retain distinct failed scenario tests that share vars', async () => {
      const scenarioConfig = {
        providers: ['echo'],
        prompts: ['Hello {{caseId}}'],
        scenarios: [
          {
            config: [{ metadata: { category: 'A' } }],
            tests: [
              { vars: { caseId: 'shared' }, metadata: { id: 'X' } },
              { vars: { caseId: 'shared' }, metadata: { id: 'Y' } },
            ],
          },
        ],
      };
      const tempConfig = writeTempConfig(
        tmpDir,
        'test-exact-scenario-shared-vars.yaml',
        scenarioConfig,
      );
      const failedResultsPath = path.join(tmpDir, 'test-exact-scenario-shared-vars.json');
      fs.writeFileSync(
        failedResultsPath,
        JSON.stringify({
          config: { ...scenarioConfig, tests: [] },
          results: {
            version: 3,
            results: ['X', 'Y'].map((id) => ({
              success: false,
              vars: { caseId: 'shared' },
              testCase: {
                vars: { caseId: 'shared' },
                metadata: { category: 'A', id, conversationId: '__scenario_0__' },
              },
            })),
          },
        }),
      );

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadataExact: 'category=A',
          filterFailing: failedResultsPath,
        },
        {},
        undefined,
        {},
      );
      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(testSuite.tests).toEqual([]);
      expect(testSuite.scenarios?.[0].tests?.map((test) => test.metadata?.id)).toEqual(['X', 'Y']);
    });

    it('should retain authored provider options in the saved exact selection', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-exact-provider-resume.yaml', {
        providers: ['echo'],
        prompts: ['Hello'],
        tests: [
          {
            provider: { id: 'echo', config: { response: 'kept-provider-option' } },
            metadata: { id: 'selected' },
          },
          { metadata: { id: 'excluded' } },
        ],
      });
      await doEval(
        { table: false, write: false, config: [tempConfig], filterMetadataExact: 'id=selected' },
        {},
        undefined,
        {},
      );
      const initialEval = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const savedTests = initialEval.config.tests;
      expect(Array.isArray(savedTests) ? savedTests : []).toHaveLength(1);
      const selectedProvider = Array.isArray(savedTests) ? savedTests[0] : undefined;
      expect(
        selectedProvider && typeof selectedProvider === 'object' && 'provider' in selectedProvider
          ? selectedProvider.provider
          : undefined,
      ).toEqual({
        id: 'echo',
        config: { response: 'kept-provider-option' },
      });
    });

    it('should persist normal exact selections without scanning source tests per selected test', async () => {
      const sourceCount = 100;
      const tempConfig = writeTempConfig(tmpDir, 'test-exact-source-lookup.yaml', {
        providers: ['echo'],
        prompts: ['Hello {{id}}'],
        tests: Array.from({ length: sourceCount }, (_, id) => ({
          vars: { id },
          metadata: { category: id % 2 === 0 ? 'selected' : 'excluded' },
        })),
      });
      let sourceReads = 0;
      const resolveConfigs = configLoadModule.resolveConfigs;
      const resolveSpy = vi
        .spyOn(configLoadModule, 'resolveConfigs')
        .mockImplementation(async (...args) => {
          const resolved = await resolveConfigs(...args);
          const tests = resolved.testSuite.tests ?? [];
          resolved.testSuite.tests = new Proxy(tests, {
            get(target, key, receiver) {
              if (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)) {
                sourceReads++;
              }
              return Reflect.get(target, key, receiver);
            },
          });
          return resolved;
        });
      try {
        await doEval(
          {
            table: false,
            write: false,
            config: [tempConfig],
            filterMetadataExact: 'category=selected',
          },
          {},
          undefined,
          {},
        );
        const initialEval = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
        expect(
          Array.isArray(initialEval.config.tests) ? initialEval.config.tests : [],
        ).toHaveLength(50);
        expect(sourceReads).toBeLessThan(sourceCount * 10);
      } finally {
        resolveSpy.mockRestore();
      }
    });

    it('should persist the selected source when tests share vars and provider', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-exact-duplicate-vars-resume.yaml', {
        providers: ['echo'],
        prompts: ['Hello'],
        tests: [
          { vars: { input: 'same' }, metadata: { id: 1 } },
          { vars: { input: 'same' }, metadata: { id: 3 } },
        ],
      });
      await doEval(
        { table: false, write: false, config: [tempConfig], filterMetadataExact: 'id=3' },
        {},
        undefined,
        {},
      );
      const initialEval = evaluateMock.mock.calls.at(-1)?.[1] as Eval;
      const savedTests = initialEval.config.tests;
      expect(
        Array.isArray(savedTests)
          ? savedTests.map((test) =>
              typeof test === 'object' && 'metadata' in test ? test.metadata?.id : undefined,
            )
          : [],
      ).toEqual([3]);
    });

    it('should filter scenario tests using default, scenario, and test metadata precedence', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-scenario-metadata-exact.yaml', {
        providers: ['echo'],
        prompts: ['Hello'],
        defaultTest: { metadata: { category: 'default' } },
        scenarios: [
          {
            description: 'metadata precedence',
            config: [
              { metadata: { category: 'scenario', region: 'west' } },
              { metadata: { category: 'scenario', region: 'east' } },
            ],
            tests: [
              { description: 'inherits scenario metadata', metadata: { kind: 'fast' } },
              { description: 'overrides scenario metadata', metadata: { category: 'test' } },
            ],
          },
        ],
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadataExact: 'category=scenario',
        },
        {},
        undefined,
        {},
      );

      const testSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(testSuite.scenarios).toHaveLength(2);
      expect(
        testSuite.scenarios?.map((scenario) => scenario.tests?.map((test) => test.description)),
      ).toEqual([['inherits scenario metadata'], ['inherits scenario metadata']]);
    });

    it('should use the effective defaultTest metadata when filtering scenarios', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-filter-scenario-default-metadata.yaml', {
        metadata: { category: 'root' },
        defaultTest: { metadata: { label: 'default' } },
        providers: ['echo'],
        prompts: ['Hello'],
        scenarios: [
          {
            config: [{}],
            tests: [{ description: 'inherits default metadata', metadata: { kind: 'fast' } }],
          },
        ],
      });

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadataExact: 'category=root',
        },
        {},
        undefined,
        {},
      );
      const rootMetadataSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(rootMetadataSuite.scenarios?.[0]?.tests).toEqual([]);

      await doEval(
        {
          table: false,
          write: false,
          config: [tempConfig],
          filterMetadataExact: 'label=default',
        },
        {},
        undefined,
        {},
      );
      const defaultMetadataSuite = evaluateMock.mock.calls.at(-1)?.[0] as TestSuite;
      expect(defaultMetadataSuite.scenarios?.[0]?.tests?.map((test) => test.description)).toEqual([
        'inherits default metadata',
      ]);
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

    it.each([false, true])(
      'reads table output only when the table command flag is %s',
      async (table) => {
        const tempConfig = writeOptionsConfig(tmpDir, 'test-table.yaml', {});

        const cmdObj: Partial<CommandLineOptions & Command> = {
          write: false,
          table,
          config: [tempConfig],
        };

        const getTable = vi.spyOn(Eval.prototype, 'getTable').mockResolvedValue({
          head: { prompts: [], vars: [] },
          body: [],
        });
        try {
          await doEval(cmdObj, {}, undefined, {});
          expect(evaluateMock).toHaveBeenCalledOnce();
          expect(getTable).toHaveBeenCalledTimes(table ? 1 : 0);
        } finally {
          getTable.mockRestore();
        }
      },
    );

    it.each([false, true])(
      'requests persistence only when the write command flag is %s',
      async (write) => {
        const tempConfig = writeOptionsConfig(tmpDir, 'test-write.yaml', {});

        const cmdObj: Partial<CommandLineOptions & Command> = {
          table: false,
          write,
          config: [tempConfig],
        };

        const persistedRecord = new Eval({});
        const create = vi.spyOn(Eval, 'create').mockResolvedValue(persistedRecord);
        try {
          await doEval(cmdObj, {}, undefined, {});
          expect(evaluateMock).toHaveBeenCalledOnce();
          expect(create).toHaveBeenCalledTimes(write ? 1 : 0);
          const evalRecord = evaluateMock.mock.calls[0][1];
          if (write) {
            expect(evalRecord).toBe(persistedRecord);
          } else {
            expect(evalRecord.persisted).toBe(false);
          }
        } finally {
          create.mockRestore();
        }
      },
    );
  });
});
