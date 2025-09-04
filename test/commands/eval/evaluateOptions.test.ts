import fs from 'fs';
import os from 'os';
import path from 'path';

import yaml from 'js-yaml';
import { doEval } from '../../../src/commands/eval';
import * as evaluatorModule from '../../../src/evaluator';
import type { Command } from 'commander';

import type { CommandLineOptions, EvaluateOptions } from '../../../src/types';

jest.mock('../../../src/evaluator', () => ({
  evaluate: jest.fn().mockResolvedValue({ results: [], summary: {} }),
}));

jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  getLogLevel: jest.fn().mockReturnValue('info'),
}));

jest.mock('../../../src/migrate', () => ({
  runDbMigrations: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/telemetry', () => ({
  record: jest.fn(),
  recordAndSendOnce: jest.fn(),
  send: jest.fn().mockResolvedValue(undefined),
}));

const evaluateMock = jest.mocked(evaluatorModule.evaluate);

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
    process.exit = jest.fn() as any;

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
    jest.clearAllMocks();
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
});
