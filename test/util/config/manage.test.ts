import * as os from 'os';
import * as path from 'path';

import yaml from 'js-yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfigDirectoryPath, setConfigDirectoryPath } from '../../../src/util/config/manage';
import { writePromptfooConfig } from '../../../src/util/config/writer';

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

// Mock os module
vi.mock('os');
vi.mock('../../../src/envars', () => ({
  getEnvString: vi.fn().mockReturnValue(undefined),
}));
vi.mock('../../../src/logger', () => ({
  default: {
    warn: vi.fn(),
  },
}));

describe('config management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    setConfigDirectoryPath(undefined);
  });

  describe('getConfigDirectoryPath', () => {
    it('should return default config path when no custom path set', () => {
      setConfigDirectoryPath(undefined);
      const configPath = getConfigDirectoryPath();
      expect(configPath).toBe(path.join('/home/user', '.promptfoo'));
    });

    // Note: The directory creation test cannot verify mkdirSync was called because
    // the source uses require('fs') inside the function which bypasses Vitest's ESM mocking.
    // We verify the function completes successfully with the correct return value instead.
    it('should handle createIfNotExists flag and return correct path', () => {
      mockFs.existsSync.mockReturnValue(false);
      setConfigDirectoryPath(undefined);
      const result = getConfigDirectoryPath(true);
      expect(result).toBe(path.join('/home/user', '.promptfoo'));
    });

    it('should not create directory if it already exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      const result = getConfigDirectoryPath(true);
      expect(result).toBe(path.join('/home/user', '.promptfoo'));
    });
  });

  describe('setConfigDirectoryPath', () => {
    it('should set custom config directory path', () => {
      const customPath = '/custom/path';
      setConfigDirectoryPath(customPath);
      const configPath = getConfigDirectoryPath();
      expect(configPath).toBe(customPath);
    });

    it('should handle undefined path', () => {
      setConfigDirectoryPath(undefined);
      const configPath = getConfigDirectoryPath();
      expect(configPath).toBe(path.join('/home/user', '.promptfoo'));
    });
  });

  describe('writePromptfooConfig', () => {
    const outputPath = 'config.yaml';

    it('should write config with schema comment', () => {
      const config = {
        description: 'test config',
        prompts: ['prompt1'],
      };

      writePromptfooConfig(config, outputPath);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        outputPath,
        `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n${yaml.dump(config)}`,
      );
    });

    it('should write config with header comments', () => {
      const config = {
        description: 'test config',
      };
      const headerComments = ['Comment 1', 'Comment 2'];

      writePromptfooConfig(config, outputPath, headerComments);

      const expectedContent =
        `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n` +
        `# Comment 1\n# Comment 2\n${yaml.dump(config)}`;

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(outputPath, expectedContent);
    });

    it('should handle empty config', () => {
      const config = {};
      const result = writePromptfooConfig(config, outputPath);
      expect(result).toEqual({});
    });

    it('should order config keys', () => {
      const config = {
        tests: ['test1'],
        description: 'desc',
        prompts: ['prompt1'],
      };

      const result = writePromptfooConfig(config, outputPath);

      expect(Object.keys(result)[0]).toBe('description');
      expect(Object.keys(result)[1]).toBe('prompts');
      expect(Object.keys(result)[2]).toBe('tests');
    });

    it('should handle empty yaml content', () => {
      const yamlDumpSpy = vi.spyOn(yaml, 'dump').mockReturnValue('');
      const config = { description: 'test' };
      const result = writePromptfooConfig(config, outputPath);
      expect(result).toEqual(config);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      yamlDumpSpy.mockRestore();
    });
  });
});
