import type { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import pkg from '../../package.json';
import { debugCommand, doDebug } from '../../src/commands/debug';
import { getEnvString } from '../../src/envars';
import logger from '../../src/logger';
import { resolveConfigs } from '../../src/util/config/load';

jest.mock('fs');
jest.mock('os');
jest.mock('../../src/envars');
jest.mock('../../src/logger');
jest.mock('../../src/util');
jest.mock('../../src/util/config/load');

describe('debug command', () => {
  const mockProgram = {
    command: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
  } as unknown as Command;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(os.platform).mockReturnValue(os.platform());
    jest.mocked(os.release).mockReturnValue('test-release');
    jest.mocked(os.arch).mockReturnValue('test-arch');
    jest.mocked(getEnvString).mockReturnValue('test-env');
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(resolveConfigs).mockResolvedValue({
      testSuite: { prompts: [], providers: [] },
      config: {},
      basePath: '',
    });
  });

  it('should output debug information', async () => {
    const options = {
      config: 'test-config.yaml',
      defaultConfig: {},
      defaultConfigPath: 'default-config.yaml',
    };

    await doDebug(options);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Promptfoo Debug Information'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        JSON.stringify(
          {
            version: pkg.version,
            platform: {
              os: os.platform(),
              release: 'test-release',
              arch: 'test-arch',
              nodeVersion: process.version,
            },
            env: {
              NODE_ENV: 'test-env',
              httpProxy: 'test-env',
              httpsProxy: 'test-env',
              allProxy: 'test-env',
              noProxy: 'test-env',
              nodeExtra: 'test-env',
              nodeTls: 'test-env',
            },
            configInfo: {
              defaultConfigPath: 'default-config.yaml',
              specifiedConfigPath: 'test-config.yaml',
              configExists: true,
              configContent: {
                testSuite: { prompts: [], providers: [] },
                config: {},
                basePath: '',
              },
            },
          },
          null,
          2,
        ),
      ),
    );
  });

  it('should handle missing config file', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);

    const options = {
      config: undefined,
      defaultConfig: {},
      defaultConfigPath: undefined,
    };

    await doDebug(options);

    const output = jest.mocked(logger.info).mock.calls[1][0];
    expect(output).toContain('"configExists": false');
  });

  it('should handle config loading error', async () => {
    jest.mocked(resolveConfigs).mockRejectedValue(new Error('Config error'));

    const options = {
      config: 'test-config.yaml',
      defaultConfig: {},
      defaultConfigPath: 'default-config.yaml',
    };

    await doDebug(options);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Error loading config: Error: Config error'),
    );
  });

  it('should register debug command with program', () => {
    const mockProgramChained = {
      command: jest.fn().mockReturnThis(),
      description: jest.fn().mockReturnThis(),
      option: jest.fn().mockReturnThis(),
      action: jest.fn().mockReturnThis(),
    };

    jest.mocked(mockProgram.command).mockReturnValue(mockProgramChained as any);

    const defaultConfig = {};
    const defaultConfigPath = 'default-config.yaml';

    debugCommand(mockProgram, defaultConfig, defaultConfigPath);

    expect(mockProgram.command).toHaveBeenCalledWith('debug');
    expect(mockProgramChained.description).toHaveBeenCalledWith(
      'Display debug information for troubleshooting',
    );
    expect(mockProgramChained.option).toHaveBeenCalledWith(
      '-c, --config [path]',
      'Path to configuration file. Defaults to promptfooconfig.yaml',
    );
    expect(mockProgramChained.action).toHaveBeenCalledWith(expect.any(Function));
  });
});
