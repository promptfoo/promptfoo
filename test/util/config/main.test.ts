import * as fs from 'fs';
import yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import logger from '../../../src/logger';
import type { UnifiedConfig } from '../../../src/types';
import {
  getConfigDirectoryPath,
  setConfigDirectoryPath,
  writePromptfooConfig,
} from '../../../src/util/config/manage';

jest.mock('os');
jest.mock('fs');
jest.mock('js-yaml');
jest.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('config', () => {
  const mockHomedir = '/mock/home';
  const defaultConfigPath = path.join(mockHomedir, '.promptfoo');

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(os.homedir).mockReturnValue(mockHomedir);
    jest.mocked(fs.existsSync).mockReturnValue(false);
    delete process.env.PROMPTFOO_CONFIG_DIR;
    setConfigDirectoryPath(undefined);
  });

  afterEach(() => {
    setConfigDirectoryPath(undefined);
  });

  describe('getConfigDirectoryPath', () => {
    it('returns default path when no custom path is set', () => {
      expect(getConfigDirectoryPath()).toBe(defaultConfigPath);
    });

    it('does not create directory when createIfNotExists is false', () => {
      getConfigDirectoryPath(false);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('creates directory when createIfNotExists is true and directory does not exist', () => {
      getConfigDirectoryPath(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith(defaultConfigPath, { recursive: true });
    });

    it('does not create directory when it already exists', () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      getConfigDirectoryPath(true);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('setConfigDirectoryPath', () => {
    it('updates the config directory path', () => {
      const newPath = '/new/config/path';
      setConfigDirectoryPath(newPath);
      expect(getConfigDirectoryPath()).toBe(newPath);
    });

    it('overrides the environment variable', () => {
      const envPath = '/env/path';
      const newPath = '/new/path';
      process.env.PROMPTFOO_CONFIG_DIR = envPath;
      setConfigDirectoryPath(newPath);
      expect(getConfigDirectoryPath()).toBe(newPath);
    });
  });
});

describe('writePromptfooConfig', () => {
  const mockOutputPath = '/mock/output/path.yaml';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('writes a basic config to the specified path', () => {
    const mockConfig: Partial<UnifiedConfig> = { description: 'Test config' };
    const mockYaml = 'description: Test config\n';
    jest.mocked(yaml.dump).mockReturnValue(mockYaml);

    writePromptfooConfig(mockConfig, mockOutputPath);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      mockOutputPath,
      `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n${mockYaml}`,
    );
  });

  it('orders the keys of the config correctly', () => {
    const mockConfig: Partial<UnifiedConfig> = {
      tests: [{ assert: [{ type: 'equals', value: 'test assertion' }] }],
      description: 'Test config',
      prompts: ['prompt1'],
      providers: ['provider1'],
      defaultTest: { assert: [{ type: 'equals', value: 'default assertion' }] },
    };

    writePromptfooConfig(mockConfig, mockOutputPath);

    const dumpCall = jest.mocked(yaml.dump).mock.calls[0][0];
    const keys = Object.keys(dumpCall);
    expect(keys).toEqual(['description', 'prompts', 'providers', 'defaultTest', 'tests']);
  });

  it('uses js-yaml to dump the config with skipInvalid option', () => {
    const mockConfig: Partial<UnifiedConfig> = { description: 'Test config' };

    writePromptfooConfig(mockConfig, mockOutputPath);

    expect(yaml.dump).toHaveBeenCalledWith(expect.anything(), { skipInvalid: true });
  });

  it('handles empty config', () => {
    const mockConfig: Partial<UnifiedConfig> = {};

    writePromptfooConfig(mockConfig, mockOutputPath);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('Warning: config is empty, skipping write');
  });

  it('preserves all fields of the UnifiedConfig', () => {
    const mockConfig: Partial<UnifiedConfig> = {
      description: 'Full config test',
      prompts: ['prompt1', 'prompt2'],
      providers: ['provider1', 'provider2'],
      defaultTest: { assert: [{ type: 'equals', value: 'default assertion' }] },
      tests: [
        { assert: [{ type: 'equals', value: 'test assertion 1' }] },
        { assert: [{ type: 'equals', value: 'test assertion 2' }] },
      ],
      outputPath: './output',
    };

    writePromptfooConfig(mockConfig, mockOutputPath);

    const dumpCall = jest.mocked(yaml.dump).mock.calls[0][0];
    expect(dumpCall).toEqual(expect.objectContaining(mockConfig));
  });

  it('handles config with undefined values', () => {
    const mockConfig: Partial<UnifiedConfig> = {
      description: 'Config with undefined',
      prompts: undefined,
      providers: ['provider1'],
    };

    writePromptfooConfig(mockConfig, mockOutputPath);

    const dumpCall = jest.mocked(yaml.dump).mock.calls[0][0];
    expect(dumpCall).toHaveProperty('description', 'Config with undefined');
    expect(dumpCall).toHaveProperty('providers', ['provider1']);
    expect(dumpCall).not.toHaveProperty('prompts');
  });
});
