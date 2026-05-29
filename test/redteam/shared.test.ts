import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import path from 'path';

import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { doEval } from '../../src/commands/eval';
import { clearLogCallbackIfOwned, setLogCallback } from '../../src/logger';
import { doGenerateRedteam } from '../../src/redteam/commands/generate';
import { doRedteamRun } from '../../src/redteam/shared';
import { PartialGenerationError } from '../../src/redteam/types';
import telemetry from '../../src/telemetry';
import { ResultFailureReason } from '../../src/types/index';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { loadDefaultConfig } from '../../src/util/config/default';
import { initVerboseToggle } from '../../src/util/verboseToggle';
import FakeDataFactory from '../factories/data/fakeDataFactory';

vi.mock('../../src/redteam/commands/generate');
vi.mock('../../src/util/verboseToggle', () => ({
  initVerboseToggle: vi.fn(),
}));
vi.mock('../../src/commands/eval', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    doEval: vi.fn().mockResolvedValue({
      getStats: vi.fn().mockReturnValue({ successes: 0, failures: 0, errors: 0 }),
      table: [],
      version: 3,
      createdAt: new Date().toISOString(),
      results: {
        table: [],
        summary: {
          version: 3,
          stats: {
            successes: 0,
            failures: 0,
            tokenUsage: {},
          },
        },
      },
    }),
  };
});
vi.mock('../../src/util/apiHealth');
vi.mock('../../src/util/config/default');
vi.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  clearLogCallbackIfOwned: vi.fn(),
  setLogCallback: vi.fn(),
  setLogLevel: vi.fn(),
}));
vi.mock('../../src/globalConfig/accounts', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getUserEmail: vi.fn(() => 'test@example.com'),
    setUserEmail: vi.fn(),
    getAuthor: vi.fn(() => 'test@example.com'),
    promptForEmailUnverified: vi.fn().mockResolvedValue(undefined),
    checkEmailStatusAndMaybeExit: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('../../src/telemetry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/telemetry')>()),
  default: {
    record: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    saveConsent: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../../src/share', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    createShareableUrl: vi.fn().mockResolvedValue('http://example.com'),
  };
});
vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    setupEnv: vi.fn(),
  };
});

vi.mock('../../src/util/promptfooCommand', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    promptfooCommand: vi.fn().mockImplementation(function (cmd) {
      if (cmd === '') {
        return 'promptfoo';
      }
      return `promptfoo ${cmd}`;
    }),

    detectInstaller: vi.fn().mockReturnValue('unknown'),
    isRunningUnderNpx: vi.fn().mockReturnValue(false),
  };
});
vi.mock('../../src/util/config/manage', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getConfigDirectoryPath: vi.fn().mockReturnValue('/mock/config/dir'),
  };
});
vi.mock('fs');
vi.mock('fs/promises');
vi.mock('js-yaml');
vi.mock('os');

describe('doRedteamRun', () => {
  const mockDate = new Date('2023-01-01T00:00:00.000Z');
  let dateNowSpy: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();

    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());
    vi.mocked(checkRemoteHealth).mockResolvedValue({ status: 'OK', message: 'Healthy' });
    vi.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
    });
    vi.mocked(fs.existsSync).mockImplementation(function () {
      return true;
    });
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromises.writeFile).mockResolvedValue();
    vi.mocked(os.tmpdir).mockImplementation(function () {
      return '/tmp';
    });
    vi.mocked(fs.mkdirSync).mockImplementation(function () {
      return '';
    });
    vi.mocked(fs.writeFileSync).mockImplementation(function () {});
    vi.mocked(yaml.dump).mockImplementation(function () {
      return 'mocked-yaml-content';
    });
    vi.mocked(doGenerateRedteam).mockResolvedValue({});
  });

  afterEach(() => {
    vi.resetAllMocks();
    dateNowSpy.mockRestore();
  });

  it('should use default config path when not specified', async () => {
    await doRedteamRun({});
    expect(doGenerateRedteam).toHaveBeenCalledWith(
      expect.objectContaining({
        config: 'promptfooconfig.yaml',
      }),
    );
  });

  it('should use provided config path when specified', async () => {
    const customConfig = 'custom/config.yaml';
    await doRedteamRun({ config: customConfig });
    expect(doGenerateRedteam).toHaveBeenCalledWith(
      expect.objectContaining({
        config: customConfig,
      }),
    );
  });

  it('should use provided output path if specified', async () => {
    const outputPath = 'custom/output.yaml';
    await doRedteamRun({ output: outputPath });
    expect(doGenerateRedteam).toHaveBeenCalledWith(
      expect.objectContaining({
        output: outputPath,
      }),
    );
  });

  it('should locate the out file in the same directory as the config file if output is not specified', async () => {
    // Generate a random directory path
    const dirPath = FakeDataFactory.system.directoryPath();
    const customConfig = `${dirPath}/config.yaml`;
    await doRedteamRun({ config: customConfig });
    expect(doGenerateRedteam).toHaveBeenCalledWith(
      expect.objectContaining({
        config: customConfig,
        output: path.normalize(`${dirPath}/redteam.yaml`),
      }),
    );
  });

  it('should record effective local redteam config and evaluator counts in completion telemetry', async () => {
    vi.mocked(doGenerateRedteam).mockResolvedValueOnce({
      redteam: {
        plugins: [{ id: 'pii', numTests: 1 }],
        strategies: [{ id: 'jailbreak' }],
      },
      targets: [{ id: 'promptfoo:sample-target' }],
    });
    vi.mocked(doEval).mockResolvedValueOnce({
      persisted: false,
      results: [
        { success: true, failureReason: ResultFailureReason.NONE },
        {
          success: false,
          error: 'Expected output to contain "hello"',
          failureReason: ResultFailureReason.ASSERT,
        },
        {
          success: false,
          error: '500 Internal Server Error',
          failureReason: ResultFailureReason.ERROR,
        },
      ],
      durationMs: 0,
      evaluationDurationMs: 0,
      getStats: vi.fn().mockReturnValue({ successes: 1, failures: 1, errors: 1 }),
      setGenerationDurationMs: vi.fn(),
      findTargetErrorStatus: vi.fn().mockResolvedValue(null),
      shared: false,
    } as any);

    await doRedteamRun({});

    expect(telemetry.record).toHaveBeenCalledWith(
      'redteam run',
      expect.objectContaining({
        phase: 'completed',
        numTests: 3,
        numPasses: 1,
        numFails: 1,
        numErrors: 1,
        numPlugins: 1,
        numStrategies: 1,
        plugins: ['pii'],
        strategies: ['jailbreak'],
        isPromptfooSampleTarget: true,
        loadedFromCloud: false,
      }),
    );
  });

  it('should identify string promptfoo.dev target URLs as sample targets in completion telemetry', async () => {
    vi.mocked(doGenerateRedteam).mockResolvedValueOnce({
      redteam: {
        plugins: [{ id: 'pii', numTests: 1 }],
        strategies: [],
      },
      targets: 'https://api.promptfoo.dev/v1/redteam/target',
    });
    vi.mocked(doEval).mockResolvedValueOnce({
      persisted: false,
      getStats: vi.fn().mockReturnValue({ successes: 1, failures: 0, errors: 0 }),
      setGenerationDurationMs: vi.fn(),
      findTargetErrorStatus: vi.fn().mockResolvedValue(null),
      shared: false,
    } as any);

    await doRedteamRun({});

    expect(telemetry.record).toHaveBeenCalledWith(
      'redteam run',
      expect.objectContaining({
        phase: 'completed',
        isPromptfooSampleTarget: true,
      }),
    );
  });

  it('should identify object target ids on promptfoo.dev as sample targets in completion telemetry', async () => {
    vi.mocked(doGenerateRedteam).mockResolvedValueOnce({
      redteam: {
        plugins: [{ id: 'pii', numTests: 1 }],
        strategies: [],
      },
      targets: [{ id: 'https://api.promptfoo.dev/v1/redteam/target' }],
    });
    vi.mocked(doEval).mockResolvedValueOnce({
      persisted: false,
      getStats: vi.fn().mockReturnValue({ successes: 1, failures: 0, errors: 0 }),
      setGenerationDurationMs: vi.fn(),
      findTargetErrorStatus: vi.fn().mockResolvedValue(null),
      shared: false,
    } as any);

    await doRedteamRun({});

    expect(telemetry.record).toHaveBeenCalledWith(
      'redteam run',
      expect.objectContaining({
        phase: 'completed',
        isPromptfooSampleTarget: true,
      }),
    );
  });

  it('should not emit custom plugin or strategy file paths in completion telemetry', async () => {
    vi.mocked(doGenerateRedteam).mockResolvedValueOnce({
      redteam: {
        plugins: [{ id: 'file://./confidential/refund-policy.yaml', numTests: 1 }],
        strategies: [{ id: 'file://./confidential/attack-plan.yaml' }],
      },
      targets: [{ id: 'test-provider' }],
    });
    vi.mocked(doEval).mockResolvedValueOnce({
      getStats: vi.fn().mockReturnValue({ successes: 1, failures: 0, errors: 0 }),
      setGenerationDurationMs: vi.fn(),
      findTargetErrorStatus: vi.fn().mockResolvedValue(null),
      shared: false,
    } as any);

    await doRedteamRun({});

    expect(telemetry.record).toHaveBeenCalledWith(
      'redteam run',
      expect.objectContaining({
        phase: 'completed',
        plugins: ['file:custom'],
        strategies: ['file:custom'],
      }),
    );
  });

  it('should read persisted completion telemetry from aggregate stats without loading results', async () => {
    const getResults = vi.fn();
    const fetchResultsBatched = vi.fn();
    const getStats = vi.fn().mockReturnValue({ successes: 1, failures: 1, errors: 1 });
    vi.mocked(doGenerateRedteam).mockResolvedValueOnce({
      redteam: {
        plugins: [{ id: 'pii', numTests: 1 }],
        strategies: [{ id: 'jailbreak' }],
      },
      targets: [{ id: 'promptfoo:sample-target' }],
    });

    vi.mocked(doEval).mockResolvedValueOnce({
      persisted: true,
      results: [],
      fetchResultsBatched,
      getResults,
      getStats,
      save: vi.fn().mockResolvedValue(undefined),
      durationMs: 0,
      evaluationDurationMs: 0,
      setGenerationDurationMs: vi.fn(),
      findTargetErrorStatus: vi.fn().mockResolvedValue(null),
      shared: false,
    } as any);

    await doRedteamRun({
      liveRedteamConfig: {
        redteam: {
          plugins: ['pii'],
          strategies: ['jailbreak'],
        },
        targets: [{ id: 'promptfoo:sample-target' }],
      },
    });

    expect(getStats).toHaveBeenCalledOnce();
    expect(fetchResultsBatched).not.toHaveBeenCalled();
    expect(getResults).not.toHaveBeenCalled();
    expect(telemetry.record).toHaveBeenCalledWith(
      'redteam run',
      expect.objectContaining({
        phase: 'completed',
        numTests: 3,
        numPasses: 1,
        numFails: 1,
        numErrors: 1,
      }),
    );
  });

  it('should apply runtime tags to the eval without adding them to generated test cases', async () => {
    const tags = {
      'ci.run-id': '123',
      'git.sha': 'abc123',
    };

    await doRedteamRun({ tags });

    expect(vi.mocked(doGenerateRedteam).mock.calls[0][0]).not.toHaveProperty('tags');
    expect(doEval).toHaveBeenCalledWith(
      expect.objectContaining({ tags }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  describe('liveRedteamConfig temporary file handling', () => {
    const mockConfig = {
      prompts: ['Test prompt'],
      vars: {},
      providers: [{ id: 'test-provider' }],
    };

    it('should create timestamped temporary file in current directory when loadedFromCloud is true', async () => {
      await doRedteamRun({
        liveRedteamConfig: mockConfig,
        loadedFromCloud: true,
      });

      const expectedFilename = `redteam-${mockDate.getTime()}.yaml`;
      const expectedPath = path.join('', expectedFilename);

      expect(fsPromises.mkdir).toHaveBeenCalledWith(path.dirname(expectedPath), {
        recursive: true,
      });
      expect(fsPromises.writeFile).toHaveBeenCalledWith(expectedPath, 'mocked-yaml-content');
      expect(yaml.dump).toHaveBeenCalledWith(mockConfig);
      expect(doGenerateRedteam).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expectedPath,
          output: expectedPath,
        }),
      );
    });

    it('should create redteam.yaml file in system temp directory when loadedFromCloud is false', async () => {
      await doRedteamRun({
        liveRedteamConfig: mockConfig,
        loadedFromCloud: false,
      });

      const expectedPath = path.join('/tmp', 'redteam.yaml');
      const expectedFilePrefix = path.join('/tmp', 'redteam-');

      expect(os.tmpdir).toHaveBeenCalledWith();
      expect(fsPromises.mkdir).toHaveBeenCalledWith(path.dirname(expectedPath), {
        recursive: true,
      });
      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(expectedFilePrefix),
        'mocked-yaml-content',
      );
      expect(yaml.dump).toHaveBeenCalledWith(mockConfig);
      expect(doGenerateRedteam).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.stringContaining(expectedFilePrefix),
          output: expect.stringContaining(expectedFilePrefix),
        }),
      );
    });

    it('should create redteam.yaml file in system temp directory when loadedFromCloud is undefined', async () => {
      await doRedteamRun({
        liveRedteamConfig: mockConfig,
        // loadedFromCloud is undefined
      });

      const expectedPath = path.join('/tmp', 'redteam.yaml');
      const expectedFilePrefix = path.join('/tmp', 'redteam-');

      expect(os.tmpdir).toHaveBeenCalledWith();
      expect(fsPromises.mkdir).toHaveBeenCalledWith(path.dirname(expectedPath), {
        recursive: true,
      });
      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(expectedFilePrefix),
        'mocked-yaml-content',
      );
      expect(yaml.dump).toHaveBeenCalledWith(mockConfig);
      expect(doGenerateRedteam).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.stringContaining(expectedFilePrefix),
          output: expect.stringContaining(expectedFilePrefix),
        }),
      );
    });

    it('should generate unique timestamped filenames when loadedFromCloud is true', async () => {
      const firstTimestamp = mockDate.getTime();
      const secondTimestamp = firstTimestamp + 1000;

      // First call
      await doRedteamRun({
        liveRedteamConfig: mockConfig,
        loadedFromCloud: true,
      });

      // Update mock timestamp for second call
      dateNowSpy.mockReturnValue(secondTimestamp);

      // Second call
      await doRedteamRun({
        liveRedteamConfig: mockConfig,
        loadedFromCloud: true,
      });

      const firstExpectedPath = path.join('', `redteam-${firstTimestamp}.yaml`);
      const secondExpectedPath = path.join('', `redteam-${secondTimestamp}.yaml`);

      // Verify different filenames were generated
      expect(fsPromises.writeFile).toHaveBeenNthCalledWith(
        1,
        firstExpectedPath,
        'mocked-yaml-content',
      );
      expect(fsPromises.writeFile).toHaveBeenNthCalledWith(
        2,
        secondExpectedPath,
        'mocked-yaml-content',
      );
    });

    it('should use liveRedteamConfig.commandLineOptions when provided', async () => {
      const mockConfigWithOptions = {
        ...mockConfig,
        commandLineOptions: {
          verbose: true,
          delay: 500,
        },
      };

      await doRedteamRun({
        liveRedteamConfig: mockConfigWithOptions,
        loadedFromCloud: true,
      });

      expect(doGenerateRedteam).toHaveBeenCalledWith(
        expect.objectContaining({
          liveRedteamConfig: {
            ...mockConfig,
            commandLineOptions: {
              verbose: true,
              delay: 500,
            },
          },
        }),
      );
    });

    it('should log debug information when processing liveRedteamConfig', async () => {
      // Get the mocked logger
      const mockLogger = (await import('../../src/logger')).default;

      await doRedteamRun({
        liveRedteamConfig: mockConfig,
        loadedFromCloud: true,
      });

      const expectedFilename = `redteam-${mockDate.getTime()}.yaml`;
      const expectedPath = path.join('', expectedFilename);

      expect(mockLogger.debug).toHaveBeenCalledWith(`Using live config from ${expectedPath}`);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Live config: ${JSON.stringify(mockConfig, null, 2)}`,
      );
    });
  });

  describe('verbose toggle integration', () => {
    it('should initialize verbose toggle when logCallback is not provided', async () => {
      await doRedteamRun({ eventSource: 'cli' });

      expect(initVerboseToggle).toHaveBeenCalled();
    });

    it('should not initialize verbose toggle for reusable invocations', async () => {
      await doRedteamRun({});

      expect(initVerboseToggle).not.toHaveBeenCalled();
    });

    it('should provide Ctrl+C delegation for CLI invocations', async () => {
      await doRedteamRun({ eventSource: 'cli' });

      expect(initVerboseToggle).toHaveBeenCalledWith({
        onInterrupt: expect.any(Function),
      });
    });

    it('should re-emit SIGINT through process.kill when Ctrl+C delegation fires', async () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
      try {
        await doRedteamRun({ eventSource: 'cli' });

        const lastCall = vi.mocked(initVerboseToggle).mock.calls.at(-1);
        expect(lastCall).toBeDefined();
        const onInterrupt = lastCall![0]!.onInterrupt;

        onInterrupt();

        expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT');
      } finally {
        killSpy.mockRestore();
      }
    });

    it('should forward eventSource into the wrapped doEval call', async () => {
      await doRedteamRun({ eventSource: 'cli' });

      expect(doEval).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ eventSource: 'cli' }),
      );
    });

    it('should NOT initialize verbose toggle when logCallback is provided', async () => {
      const mockLogCallback = vi.fn();

      await doRedteamRun({
        logCallback: mockLogCallback,
      });

      expect(initVerboseToggle).not.toHaveBeenCalled();
    });

    it('should call cleanup function on successful completion', async () => {
      const mockCleanup = vi.fn();
      vi.mocked(initVerboseToggle).mockReturnValue(mockCleanup);

      await doRedteamRun({ eventSource: 'cli' });

      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should call cleanup function when no test cases are generated', async () => {
      const mockCleanup = vi.fn();
      vi.mocked(initVerboseToggle).mockReturnValue(mockCleanup);
      vi.mocked(doGenerateRedteam).mockResolvedValue(null);

      await doRedteamRun({ eventSource: 'cli' });

      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should handle null cleanup function gracefully', async () => {
      vi.mocked(initVerboseToggle).mockReturnValue(null);

      // Should not throw
      await expect(doRedteamRun({ eventSource: 'cli' })).resolves.not.toThrow();
    });

    it('should not call cleanup when initVerboseToggle returns null', async () => {
      vi.mocked(initVerboseToggle).mockReturnValue(null);

      await doRedteamRun({ eventSource: 'cli' });

      // Just verifying no errors - cleanup should be handled gracefully
      expect(initVerboseToggle).toHaveBeenCalled();
    });

    it('should cleanup run state when evaluation throws', async () => {
      const mockCleanup = vi.fn();
      vi.mocked(initVerboseToggle).mockReturnValue(mockCleanup);
      vi.mocked(doEval).mockRejectedValueOnce(new Error('eval failed'));

      await expect(doRedteamRun({ eventSource: 'cli' })).rejects.toThrow('eval failed');

      expect(clearLogCallbackIfOwned).toHaveBeenCalledWith(null);
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should clear log callbacks when evaluation throws', async () => {
      const mockLogCallback = vi.fn();
      vi.mocked(doEval).mockRejectedValueOnce(new Error('eval failed'));

      await expect(doRedteamRun({ logCallback: mockLogCallback })).rejects.toThrow('eval failed');

      expect(setLogCallback).toHaveBeenNthCalledWith(1, mockLogCallback);
      expect(clearLogCallbackIfOwned).toHaveBeenCalledWith(mockLogCallback);
    });
  });

  describe('PartialGenerationError handling', () => {
    it('should re-throw PartialGenerationError after logging when strict mode causes error', async () => {
      const failedPlugins = [
        { pluginId: 'pii', requested: 5 },
        { pluginId: 'harmful:hate', requested: 3 },
      ];
      const error = new PartialGenerationError(failedPlugins);
      vi.mocked(doGenerateRedteam).mockRejectedValue(error);

      // This happens when strict mode is enabled and doGenerateRedteam throws
      await expect(doRedteamRun({ strict: true })).rejects.toThrow(PartialGenerationError);
    });

    it('should log error message before re-throwing PartialGenerationError', async () => {
      const mockLogger = (await import('../../src/logger')).default;
      const failedPlugins = [{ pluginId: 'pii', requested: 5 }];
      const error = new PartialGenerationError(failedPlugins);
      vi.mocked(doGenerateRedteam).mockRejectedValue(error);

      try {
        await doRedteamRun({ strict: true });
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should call cleanup function when PartialGenerationError is thrown', async () => {
      const mockCleanup = vi.fn();
      vi.mocked(initVerboseToggle).mockReturnValue(mockCleanup);
      const failedPlugins = [{ pluginId: 'pii', requested: 5 }];
      const error = new PartialGenerationError(failedPlugins);
      vi.mocked(doGenerateRedteam).mockRejectedValue(error);

      try {
        await doRedteamRun({ strict: true, eventSource: 'cli' });
      } catch {
        // Expected to throw
      }

      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should re-throw other errors without special handling', async () => {
      const genericError = new Error('Some other error');
      vi.mocked(doGenerateRedteam).mockRejectedValue(genericError);

      await expect(doRedteamRun({})).rejects.toThrow('Some other error');
    });

    it('should pass strict option through to doGenerateRedteam', async () => {
      await doRedteamRun({ strict: true });

      expect(doGenerateRedteam).toHaveBeenCalledWith(
        expect.objectContaining({
          strict: true,
        }),
      );
    });

    it('should not pass strict option when not specified', async () => {
      await doRedteamRun({});

      expect(doGenerateRedteam).toHaveBeenCalledWith(
        expect.not.objectContaining({
          strict: true,
        }),
      );
    });
  });
});
