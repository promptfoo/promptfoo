import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import path from 'path';

import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLogCallbackIfOwned, setLogCallback } from '../../src/logger';
import { doEval } from '../../src/node/doEval';
import { doGenerateRedteam } from '../../src/redteam/commands/generate';
import { doRedteamRun } from '../../src/redteam/shared';
import { PartialGenerationError } from '../../src/redteam/types';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { loadDefaultConfig } from '../../src/util/config/default';
import { initVerboseToggle } from '../../src/util/verboseToggle';
import FakeDataFactory from '../factories/data/fakeDataFactory';

vi.mock('../../src/redteam/commands/generate');
vi.mock('../../src/util/verboseToggle', () => ({
  initVerboseToggle: vi.fn(),
}));
vi.mock('../../src/node/doEval', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    doEval: vi.fn().mockResolvedValue({
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
vi.mock('../../src/telemetry', () => ({
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
// js-yaml v5 is native ESM with a sealed namespace, so vi.spyOn cannot patch it.
// Wrap dump in a spy-able mock that keeps the real implementation.
vi.mock('js-yaml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('js-yaml')>();
  return { ...actual, dump: vi.fn(actual.dump) };
});
vi.mock('os');

describe('doRedteamRun', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(checkRemoteHealth).mockResolvedValue({ status: 'OK', message: 'Healthy' });
    vi.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromises.writeFile).mockResolvedValue();
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    vi.mocked(fs.mkdirSync).mockReturnValue('');
    vi.mocked(fs.writeFileSync).mockImplementation(function () {});
    vi.mocked(yaml.dump).mockReturnValue('mocked-yaml-content');
    vi.mocked(doGenerateRedteam).mockResolvedValue({});
  });

  afterEach(() => {
    vi.resetAllMocks();
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

  it('attributes generation usage only when this run generated the test suite', async () => {
    const tokenUsage = { total: 42, prompt: 30, completion: 12, numRequests: 3 };
    vi.mocked(doGenerateRedteam).mockImplementation(async (options) => ({
      metadata: {
        generation: { id: options.generationRunId, tokenUsage },
      },
    }));

    await doRedteamRun({});

    expect(doEval).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        generationEventId: expect.any(String),
        generationTokenUsage: tokenUsage,
      }),
    );
  });

  it('does not charge an evaluation for a reused generated test suite', async () => {
    vi.mocked(doGenerateRedteam).mockResolvedValue({
      metadata: {
        generation: {
          id: 'previous-generation',
          tokenUsage: { total: 42, numRequests: 3 },
        },
      },
    });

    await doRedteamRun({});

    expect(vi.mocked(doEval).mock.calls[0][3]).not.toHaveProperty('generationTokenUsage');
  });

  describe('liveRedteamConfig temporary file handling', () => {
    const mockConfig = {
      prompts: ['Test prompt'],
      vars: {},
      providers: [{ id: 'test-provider' }],
    };

    it.each([
      { loadedFromCloud: true, directory: '.' },
      { loadedFromCloud: false, directory: path.normalize('/tmp') },
      { loadedFromCloud: undefined, directory: path.normalize('/tmp') },
    ])(
      'writes the live config in $directory for loadedFromCloud=$loadedFromCloud',
      async ({ loadedFromCloud, directory }) => {
        await doRedteamRun({ liveRedteamConfig: mockConfig, loadedFromCloud });

        const [[filename, contents, options]] = vi.mocked(fsPromises.writeFile).mock.calls;
        expect(path.dirname(String(filename))).toBe(directory);
        expect(path.basename(String(filename))).toMatch(/^redteam-.+\.yaml$/);
        expect(contents).toBe('mocked-yaml-content');
        expect(options).toEqual({ flag: 'wx', mode: 0o600 });
        expect(yaml.dump).toHaveBeenCalledWith(mockConfig);
        expect(doGenerateRedteam).toHaveBeenCalledWith(
          expect.objectContaining({ config: filename, output: filename }),
        );
      },
    );

    it('keeps each live config when two runs start in the same millisecond', async () => {
      const disk = await vi.importActual<typeof fsPromises>('fs/promises');
      const realOs = await vi.importActual<typeof os>('os');
      const realYaml = await vi.importActual<typeof yaml>('js-yaml');
      using _clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const directory = await disk.mkdtemp(path.join(realOs.tmpdir(), 'promptfoo-redteam-'));
      vi.mocked(os.tmpdir).mockReturnValue(directory);
      vi.mocked(fsPromises.writeFile).mockImplementation(disk.writeFile);
      vi.mocked(yaml.dump).mockImplementation(realYaml.dump);

      const first = { ...mockConfig, description: 'first run' };
      const second = { ...mockConfig, description: 'second run' };
      // Finish the second run before the first generator reads its config.
      vi.mocked(doGenerateRedteam)
        .mockImplementationOnce(async ({ config }) => {
          await doRedteamRun({ liveRedteamConfig: second });
          expect(yaml.load(await disk.readFile(config!, 'utf8'))).toEqual(first);
          return {};
        })
        .mockImplementationOnce(async ({ config }) => {
          expect(yaml.load(await disk.readFile(config!, 'utf8'))).toEqual(second);
          return {};
        });

      try {
        await doRedteamRun({ liveRedteamConfig: first });
        expect(doGenerateRedteam).toHaveBeenCalledTimes(2);
      } finally {
        await disk.rm(directory, { recursive: true, force: true });
      }
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

    it('logs the live config path while keeping its contents private', async () => {
      const mockLogger = (await import('../../src/logger')).default;
      const privatePrompt = 'private-prompt-for-log-test';
      const apiKey = 'private-provider-key-for-log-test';

      await doRedteamRun({
        liveRedteamConfig: {
          prompts: [privatePrompt],
          providers: [{ id: 'test-provider', config: { apiKey } }],
        },
        loadedFromCloud: true,
        verbose: true,
      });

      const [[expectedPath]] = vi.mocked(fsPromises.writeFile).mock.calls;
      expect(mockLogger.debug).toHaveBeenCalledWith(`Using live config from ${expectedPath}`);
      for (const level of ['debug', 'info', 'warn', 'error'] as const) {
        const messages = JSON.stringify(vi.mocked(mockLogger[level]).mock.calls);
        expect(messages).not.toContain(privatePrompt);
        expect(messages).not.toContain(apiKey);
      }
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
