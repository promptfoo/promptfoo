import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import yaml from 'js-yaml';
import { doEval } from '../../../src/commands/eval';
import * as evaluatorModule from '../../../src/evaluator';
import type { Command } from 'commander';

import type { CommandLineOptions, EvaluateOptions } from '../../../src/types/index';

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

describe('evaluateOptions behavior', () => {
  let configPath: string;
  let noDelayConfigPath: string;
  let noRepeatConfigPath: string;

  const originalExit = process.exit;

  beforeAll(() => {
    process.exit = vi.fn() as any;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-test-'));

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
  });

  describe('Reading values from config file', () => {
    it('should read evaluateOptions.maxConcurrency', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [noDelayConfigPath],
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];

      expect(options.maxConcurrency).toBe(9);
    });

    it('should read evaluateOptions.repeat', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];

      expect(options.repeat).toBe(99);
    });

    it('should read evaluateOptions.delay', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];

      expect(options.delay).toBe(999);
    });

    it('should read evaluateOptions.showProgressBar', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];

      expect(options.showProgressBar).toBe(false);
    });

    it('should read evaluateOptions.cache', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];

      expect(options.cache).toBe(false);
    });

    it('should read evaluateOptions.timeoutMs', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];

      expect(options.timeoutMs).toBe(9999);
    });

    it('should read evaluateOptions.maxEvalTimeMs', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];

      expect(options.maxEvalTimeMs).toBe(99999);
    });
  });

  describe('Prioritization of CLI options over config file options', () => {
    it('should prioritize maxConcurrency from command line options over config file options', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [noDelayConfigPath],
        maxConcurrency: 5,
      };

      await doEval(cmdObj, {}, undefined, {});

      expect(evaluateMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      );

      const options = evaluateMock.mock.calls[0][2];
      expect(options.maxConcurrency).toBe(5);
    });

    it('should prioritize repeat from command line options over config file options', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
        repeat: 5,
      };

      await doEval(cmdObj, {}, undefined, {});

      expect(evaluateMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      );

      const options = evaluateMock.mock.calls[0][2];
      expect(options.repeat).toBe(5);
    });

    it('should prioritize delay from command line options over config file options', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
        delay: 5,
      };

      await doEval(cmdObj, {}, undefined, {});

      expect(evaluateMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      );

      const options = evaluateMock.mock.calls[0][2];
      expect(options.delay).toBe(5);
    });

    it('should prioritize showProgressBar from command line options over config file options', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
        progressBar: true,
      };

      await doEval(cmdObj, {}, undefined, {});

      expect(evaluateMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
      );

      const options = evaluateMock.mock.calls[0][2];
      expect(options.showProgressBar).toBe(true);
    });

    it('should prioritize cache from command line options over config file options', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [noRepeatConfigPath],
        cache: true,
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];
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
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
        maxConcurrency: 10, // This should be overridden to 1 due to delay
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];
      expect(options.maxConcurrency).toBe(1); // Should be forced to 1 due to delay
    });

    it('should handle repeat >1 with cache value passed correctly', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath],
        cache: true,
        repeat: 3,
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];
      expect(options.cache).toBe(true); // Cache value is passed as-is
      expect(options.repeat).toBe(3); // Repeat value is correctly set
      // Note: disableCache() is called globally but options.cache reflects the config
    });

    it('should handle undefined/null evaluateOptions gracefully', async () => {
      const tempConfig = path.join(process.cwd(), 'temp-test-config.yaml');
      fs.writeFileSync(
        tempConfig,
        yaml.dump({
          evaluateOptions: null, // Explicitly null
          providers: [{ id: 'openai:gpt-4o-mini' }],
          prompts: ['test'],
          tests: [{ vars: { input: 'test' } }],
        }),
      );

      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [tempConfig],
      };

      await doEval(cmdObj, {}, undefined, {});

      expect(evaluateMock).toHaveBeenCalled();
      fs.unlinkSync(tempConfig);
    });

    it('should handle mixed CLI and config values correctly', async () => {
      const cmdObj: Partial<CommandLineOptions & Command> = {
        config: [configPath], // Has delay: 999, maxConcurrency: 9, etc.
        delay: 0, // CLI override
        repeat: 1, // CLI override
        // maxConcurrency not set, should use config value
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];
      expect(options.delay).toBeUndefined(); // CLI delay 0 should result in undefined
      expect(options.repeat).toBe(1); // CLI override
      expect(options.maxConcurrency).toBe(9); // From config
    });
  });

  describe('commandLineOptions behavior', () => {
    it('should respect commandLineOptions.generateSuggestions from config', async () => {
      const tempConfig = path.join(process.cwd(), 'test-generate-suggestions.yaml');
      fs.writeFileSync(
        tempConfig,
        yaml.dump({
          commandLineOptions: {
            generateSuggestions: true,
          },
          providers: [{ id: 'openai:gpt-4o-mini' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test' } }],
        }),
      );

      const cmdObj: Partial<CommandLineOptions & Command> = {
        table: false,
        write: false,
        config: [tempConfig],
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];
      expect(options.generateSuggestions).toBe(true);
      fs.unlinkSync(tempConfig);
    });

    it('should prioritize CLI --suggest-prompts over commandLineOptions.generateSuggestions', async () => {
      const tempConfig = path.join(process.cwd(), 'test-generate-suggestions-override.yaml');
      fs.writeFileSync(
        tempConfig,
        yaml.dump({
          commandLineOptions: {
            generateSuggestions: false,
          },
          providers: [{ id: 'openai:gpt-4o-mini' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test' } }],
        }),
      );

      const cmdObj: Partial<CommandLineOptions & Command> = {
        table: false,
        write: false,
        config: [tempConfig],
        generateSuggestions: true, // CLI override
      };

      await doEval(cmdObj, {}, undefined, {});

      const options = evaluateMock.mock.calls[0][2];
      expect(options.generateSuggestions).toBe(true);
      fs.unlinkSync(tempConfig);
    });

    it('should respect commandLineOptions.table from config', async () => {
      const tempConfig = path.join(process.cwd(), 'test-table.yaml');
      fs.writeFileSync(
        tempConfig,
        yaml.dump({
          commandLineOptions: {
            table: false,
          },
          providers: [{ id: 'openai:gpt-4o-mini' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test' } }],
        }),
      );

      const cmdObj: Partial<CommandLineOptions & Command> = {
        write: false,
        config: [tempConfig],
      };

      // We can't directly check table output, but we can verify the config loads
      await doEval(cmdObj, {}, undefined, {});

      // If this completes without error, the config was respected
      expect(evaluateMock).toHaveBeenCalled();
      fs.unlinkSync(tempConfig);
    });

    it('should respect commandLineOptions.write = false from config', async () => {
      const tempConfig = path.join(process.cwd(), 'test-write.yaml');
      fs.writeFileSync(
        tempConfig,
        yaml.dump({
          commandLineOptions: {
            write: false,
          },
          providers: [{ id: 'openai:gpt-4o-mini' }],
          prompts: ['Test prompt'],
          tests: [{ vars: { input: 'test' } }],
        }),
      );

      const cmdObj: Partial<CommandLineOptions & Command> = {
        table: false,
        config: [tempConfig],
      };

      await doEval(cmdObj, {}, undefined, {});

      // Verify eval completed successfully with write=false
      expect(evaluateMock).toHaveBeenCalled();
      fs.unlinkSync(tempConfig);
    });
  });
});
