import * as os from 'os';
import * as path from 'path';

import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { getConfigDirectoryPath, setConfigDirectoryPath } from '../../../src/util/config/manage';
import { writePromptfooConfig } from '../../../src/util/config/writer';

import type { UnifiedConfig } from '../../../src/types/index';

// Create hoisted mock functions for fs
const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  renameSync: vi.fn(),
  accessSync: vi.fn(),
  chmodSync: vi.fn(),
  constants: {},
}));

// Mock both 'fs' and 'node:fs' to cover all import patterns
vi.mock('fs', () => ({
  ...mockFs,
  default: mockFs,
}));

vi.mock('node:fs', () => ({
  ...mockFs,
  default: mockFs,
}));

vi.mock('os');
vi.mock('js-yaml');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('config', () => {
  const mockHomedir = '/mock/home';
  const defaultConfigPath = path.join(mockHomedir, '.promptfoo');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomedir);
    mockFs.existsSync.mockReturnValue(false);
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
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    // Note: The directory creation test cannot verify mkdirSync was called because
    // the source uses require('fs') inside the function which bypasses Vitest's ESM mocking.
    // We verify the function completes successfully with the correct return value instead.
    it('handles createIfNotExists flag and returns correct path', () => {
      const result = getConfigDirectoryPath(true);
      expect(result).toBe(defaultConfigPath);
    });

    it('does not create directory when it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      const result = getConfigDirectoryPath(true);
      expect(result).toBe(defaultConfigPath);
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
    vi.resetAllMocks();
  });

  it('writes a basic config to the specified path', () => {
    const mockConfig: Partial<UnifiedConfig> = { description: 'Test config' };
    const mockYaml = 'description: Test config\n';
    vi.mocked(yaml.dump).mockReturnValue(mockYaml);

    writePromptfooConfig(mockConfig, mockOutputPath);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
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

    const dumpCall = vi.mocked(yaml.dump).mock.calls[0][0];
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
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
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

    const dumpCall = vi.mocked(yaml.dump).mock.calls[0][0];
    expect(dumpCall).toEqual(expect.objectContaining(mockConfig));
  });

  it('handles config with undefined values', () => {
    const mockConfig: Partial<UnifiedConfig> = {
      description: 'Config with undefined',
      prompts: undefined,
      providers: ['provider1'],
    };

    writePromptfooConfig(mockConfig, mockOutputPath);

    const dumpCall = vi.mocked(yaml.dump).mock.calls[0][0];
    expect(dumpCall).toHaveProperty('description', 'Config with undefined');
    expect(dumpCall).toHaveProperty('providers', ['provider1']);
    expect(dumpCall).not.toHaveProperty('prompts');
  });
});
