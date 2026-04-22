import * as fs from 'fs';
import * as os from 'os';
import path from 'path';

import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
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
vi.mock('../../src/commands/eval', async (importOriginal) => {
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

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, 'mocked-yaml-content');
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
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
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
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
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
      expect(fs.writeFileSync).toHaveBeenNthCalledWith(1, firstExpectedPath, 'mocked-yaml-content');
      expect(fs.writeFileSync).toHaveBeenNthCalledWith(
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
      await doRedteamRun({});

      expect(initVerboseToggle).toHaveBeenCalled();
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

      await doRedteamRun({});

      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should call cleanup function when no test cases are generated', async () => {
      const mockCleanup = vi.fn();
      vi.mocked(initVerboseToggle).mockReturnValue(mockCleanup);
      vi.mocked(doGenerateRedteam).mockResolvedValue(null);

      await doRedteamRun({});

      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should handle null cleanup function gracefully', async () => {
      vi.mocked(initVerboseToggle).mockReturnValue(null);

      // Should not throw
      await expect(doRedteamRun({})).resolves.not.toThrow();
    });

    it('should not call cleanup when initVerboseToggle returns null', async () => {
      vi.mocked(initVerboseToggle).mockReturnValue(null);

      await doRedteamRun({});

      // Just verifying no errors - cleanup should be handled gracefully
      expect(initVerboseToggle).toHaveBeenCalled();
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
        await doRedteamRun({ strict: true });
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
