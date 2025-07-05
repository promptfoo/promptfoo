import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import path from 'path';
import { doGenerateRedteam } from '../../src/redteam/commands/generate';
import { doRedteamRun } from '../../src/redteam/shared';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { loadDefaultConfig } from '../../src/util/config/default';
import FakeDataFactory from '../factories/data/fakeDataFactory';

jest.mock('../../src/redteam/commands/generate');
jest.mock('../../src/commands/eval', () => ({
  doEval: jest.fn().mockResolvedValue({
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
}));
jest.mock('../../src/util/apiHealth');
jest.mock('../../src/util/config/default');
jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  setLogCallback: jest.fn(),
  setLogLevel: jest.fn(),
}));
jest.mock('../../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn(() => 'test@example.com'),
  setUserEmail: jest.fn(),
  getAuthor: jest.fn(() => 'test@example.com'),
  promptForEmailUnverified: jest.fn().mockResolvedValue(undefined),
  checkEmailStatusOrExit: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/telemetry', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue(undefined),
  saveConsent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/share', () => ({
  createShareableUrl: jest.fn().mockResolvedValue('http://example.com'),
}));
jest.mock('../../src/util', () => ({
  isRunningUnderNpx: jest.fn(() => false),
  setupEnv: jest.fn(),
}));
jest.mock('fs');
jest.mock('js-yaml');
jest.mock('os');

describe('doRedteamRun', () => {
  const mockDate = new Date('2023-01-01T00:00:00.000Z');
  let dateNowSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();

    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());
    jest.mocked(checkRemoteHealth).mockResolvedValue({ status: 'OK', message: 'Healthy' });
    jest.mocked(loadDefaultConfig).mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: 'promptfooconfig.yaml',
    });
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(os.tmpdir).mockReturnValue('/tmp');
    jest.mocked(fs.mkdirSync).mockImplementation(() => '');
    jest.mocked(fs.writeFileSync).mockImplementation(() => {});
    jest.mocked(yaml.dump).mockReturnValue('mocked-yaml-content');
    jest.mocked(doGenerateRedteam).mockResolvedValue({});
  });

  afterEach(() => {
    jest.resetAllMocks();
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
      const mockLogger = jest.requireMock('../../src/logger').default;

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
});
