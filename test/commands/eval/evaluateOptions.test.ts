import fs from 'fs';
import os from 'os';
import path from 'path';

import yaml from 'js-yaml';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { doEval } from '../../../src/commands/eval';
import * as evaluatorModule from '../../../src/evaluator';
import logger from '../../../src/logger';
import Eval from '../../../src/models/eval';
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

  beforeAll(() => {
    process.exit = vi.fn() as any;

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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Reading values from config file', () => {
    it('should read evaluateOptions.maxConcurrency', async () => {
      const options = await runEvalAndGetOptions({
        config: [noDelayConfigPath],
      });

      expect(options.maxConcurrency).toBe(9);
    });

    it('should read evaluateOptions.repeat', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
      });

      expect(options.repeat).toBe(99);
    });

    it('should read evaluateOptions.delay', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
      });

      expect(options.delay).toBe(999);
    });

    it('should read evaluateOptions.showProgressBar', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
      });

      expect(options.showProgressBar).toBe(false);
    });

    it('should read evaluateOptions.cache', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
      });

      expect(options.cache).toBe(false);
    });

    it('should read evaluateOptions.timeoutMs', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
      });

      expect(options.timeoutMs).toBe(9999);
    });

    it('should read evaluateOptions.maxEvalTimeMs', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
      });

      expect(options.maxEvalTimeMs).toBe(99999);
    });
  });

  describe('Prioritization of CLI options over config file options', () => {
    it('should prioritize maxConcurrency from command line options over config file options', async () => {
      const options = await runEvalAndGetOptions({
        config: [noDelayConfigPath],
        maxConcurrency: 5,
      });

      expect(options.maxConcurrency).toBe(5);
    });

    it('should prioritize repeat from command line options over config file options', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
        repeat: 5,
      });

      expect(options.repeat).toBe(5);
    });

    it('should prioritize delay from command line options over config file options', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
        delay: 5,
      });

      expect(options.delay).toBe(5);
    });

    it('should prioritize showProgressBar from command line options over config file options', async () => {
      const options = await runEvalAndGetOptions({
        config: [configPath],
        progressBar: true,
      });

      expect(options.showProgressBar).toBe(true);
    });

    it('should prioritize cache from command line options over config file options', async () => {
      const options = await runEvalAndGetOptions({
        config: [noRepeatConfigPath],
        cache: true,
      });

      expect(options.cache).toBe(true);
    });
  });

  it('should correctly merge evaluateOptions from multiple sources', () => {
    const config = {
      evaluateOptions: {
        maxConcurrency: 3,
        showProgressBar: false,
      },
      providers: [],
      prompts: [],
    };

    const initialOptions: EvaluateOptions = {
      showProgressBar: true,
    };

    const mergedOptions = config.evaluateOptions
      ? { ...initialOptions, ...config.evaluateOptions }
      : initialOptions;

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
      const tempConfig = writeTempConfig(tmpDir, 'test-commandline-maxconcurrency.yaml', {
        commandLineOptions: {
          maxConcurrency: 10,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.maxConcurrency).toBe(10);
    });

    it('should prioritize CLI --max-concurrency over commandLineOptions.maxConcurrency', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-commandline-maxconcurrency-override.yaml', {
        commandLineOptions: {
          maxConcurrency: 10,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        maxConcurrency: 20, // CLI override
      });

      expect(options.maxConcurrency).toBe(20);
    });

    it('should prioritize commandLineOptions.maxConcurrency over evaluateOptions.maxConcurrency', async () => {
      const tempConfig = writeTempConfig(
        tmpDir,
        'test-commandline-vs-evaluateoptions-maxconcurrency.yaml',
        {
          commandLineOptions: {
            maxConcurrency: 10,
          },
          evaluateOptions: {
            maxConcurrency: 5,
          },
          providers: [{ id: 'openai:gpt-4o-mini' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test' } }],
        },
      );
      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.maxConcurrency).toBe(10); // commandLineOptions wins
    });

    it('should respect commandLineOptions.repeat from config', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-commandline-repeat.yaml', {
        commandLineOptions: {
          repeat: 5,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.repeat).toBe(5);
    });

    it('should prioritize CLI --repeat over commandLineOptions.repeat', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-commandline-repeat-override.yaml', {
        commandLineOptions: {
          repeat: 5,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        repeat: 10, // CLI override
      });

      expect(options.repeat).toBe(10);
    });

    it('should respect commandLineOptions.delay from config', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-commandline-delay.yaml', {
        commandLineOptions: {
          delay: 500,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.delay).toBe(500);
    });

    it('should prioritize CLI --delay over commandLineOptions.delay', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-commandline-delay-override.yaml', {
        commandLineOptions: {
          delay: 500,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        delay: 1000, // CLI override
      });

      expect(options.delay).toBe(1000);
    });

    it('should respect commandLineOptions.cache from config', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-commandline-cache.yaml', {
        commandLineOptions: {
          cache: false,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.cache).toBe(false);
    });

    it('should prioritize CLI --cache over commandLineOptions.cache', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-commandline-cache-override.yaml', {
        commandLineOptions: {
          cache: false,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        cache: true, // CLI override
      });

      expect(options.cache).toBe(true);
    });

    it('should respect commandLineOptions.generateSuggestions from config', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-generate-suggestions.yaml', {
        commandLineOptions: {
          generateSuggestions: true,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
      });

      expect(options.generateSuggestions).toBe(true);
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
    ])('should restore legacy %s.filterRange when resuming evals without persisted runtime options', async (_source, legacyConfig) => {
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
    });

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
      const tempConfig = writeTempConfig(tmpDir, 'test-generate-suggestions-override.yaml', {
        commandLineOptions: {
          generateSuggestions: false,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
      });

      const options = await runEvalAndGetOptions({
        config: [tempConfig],
        generateSuggestions: true, // CLI override
      });

      expect(options.generateSuggestions).toBe(true);
    });

    it('should respect commandLineOptions.table from config', async () => {
      const tempConfig = writeTempConfig(tmpDir, 'test-table.yaml', {
        commandLineOptions: {
          table: false,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
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
      const tempConfig = writeTempConfig(tmpDir, 'test-write.yaml', {
        commandLineOptions: {
          write: false,
        },
        providers: [{ id: 'openai:gpt-4o-mini' }],
        prompts: ['Test prompt'],
        tests: [{ vars: { input: 'test' } }],
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
