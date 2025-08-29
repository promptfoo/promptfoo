import fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import * as path from 'path';

import logger from '../../../src/logger';
import { extractEnvPathFromConfigs } from '../../../src/util/config/envPath';

jest.mock('fs');
jest.mock('glob');
jest.mock('js-yaml');
jest.mock('../../../src/logger');

// Mock process.cwd to return predictable path
const mockCwd = jest.spyOn(process, 'cwd').mockReturnValue('/test');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockGlobSync = globSync as jest.MockedFunction<typeof globSync>;
const mockYaml = yaml as jest.Mocked<typeof yaml>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('extractEnvPathFromConfigs', () => {
  let mockPathResolve: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset all mock implementations to ensure clean state
    mockCwd.mockReturnValue('/test');
    mockGlobSync.mockReset();
    mockFs.readFileSync.mockReset();
    mockYaml.load.mockReset();
    mockLogger.debug.mockReset();
    
    // Mock path.resolve to return predictable paths
    mockPathResolve = jest.spyOn(path, 'resolve').mockImplementation((_base, relative) => `/test/${relative}`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when no config paths provided', () => {
    it('should return undefined for undefined config paths', () => {
      const result = extractEnvPathFromConfigs(undefined);
      expect(result).toBeUndefined();
      expect(mockGlobSync).not.toHaveBeenCalled();
    });

    it('should return undefined for empty array', () => {
      const result = extractEnvPathFromConfigs([]);
      expect(result).toBeUndefined();
      expect(mockGlobSync).not.toHaveBeenCalled();
    });
  });

  describe('when config paths provided', () => {
    it('should extract envPath from single config file', () => {
      mockGlobSync.mockReturnValue(['/test/config.yaml']);
      mockFs.readFileSync.mockReturnValue('commandLineOptions:\n  envPath: /path/to/.env');
      mockYaml.load.mockReturnValue({
        commandLineOptions: {
          envPath: '/path/to/.env',
        },
      });

      const result = extractEnvPathFromConfigs('config.yaml');

      expect(result).toBe('/path/to/.env');
      expect(mockGlobSync).toHaveBeenCalledWith(
        expect.stringContaining('config.yaml'),
        { windowsPathsNoEscape: true }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Using envPath from config: /path/to/.env');
    });

    it('should extract envPath from array of config files', () => {
      mockGlobSync
        .mockReturnValueOnce(['/test/config1.yaml'])
        .mockReturnValueOnce(['/test/config2.yaml']);
      
      mockFs.readFileSync
        .mockReturnValueOnce('# no envPath here')
        .mockReturnValueOnce('commandLineOptions:\n  envPath: /second/.env');
      
      mockYaml.load
        .mockReturnValueOnce({}) // First config has no commandLineOptions
        .mockReturnValueOnce({
          commandLineOptions: {
            envPath: '/second/.env',
          },
        });

      const result = extractEnvPathFromConfigs(['config1.yaml', 'config2.yaml']);

      expect(result).toBe('/second/.env');
      expect(mockGlobSync).toHaveBeenCalledTimes(2);
    });

    it('should return first envPath found from multiple configs', () => {
      mockGlobSync
        .mockReturnValueOnce(['/test/config1.yaml'])
        .mockReturnValueOnce(['/test/config2.yaml']);
      
      mockFs.readFileSync
        .mockReturnValueOnce('commandLineOptions:\n  envPath: /first/.env')
        .mockReturnValueOnce('commandLineOptions:\n  envPath: /second/.env');
      
      mockYaml.load
        .mockReturnValueOnce({
          commandLineOptions: { envPath: '/first/.env' },
        })
        .mockReturnValueOnce({
          commandLineOptions: { envPath: '/second/.env' },
        });

      const result = extractEnvPathFromConfigs(['config1.yaml', 'config2.yaml']);

      expect(result).toBe('/first/.env');
      // Should only call globSync once since first config has envPath
      expect(mockGlobSync).toHaveBeenCalledTimes(1);
    });

    it('should handle config with no commandLineOptions section', () => {
      mockGlobSync.mockReturnValue(['/test/config.yaml']);
      mockFs.readFileSync.mockReturnValue('prompts:\n  - "test prompt"');
      mockYaml.load.mockReturnValue({
        prompts: ['test prompt'],
      });

      const result = extractEnvPathFromConfigs('config.yaml');

      expect(result).toBeUndefined();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Using envPath'));
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', () => {
      mockGlobSync.mockReturnValue(['/test/config.yaml']);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const result = extractEnvPathFromConfigs('config.yaml');

      expect(result).toBeUndefined();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Using envPath'));
    });

    it('should handle YAML parsing errors gracefully', () => {
      mockGlobSync.mockReturnValue(['/test/config.yaml']);
      mockFs.readFileSync.mockReturnValue('invalid: yaml: content:');
      mockYaml.load.mockImplementation(() => {
        throw new Error('Invalid YAML');
      });

      const result = extractEnvPathFromConfigs('config.yaml');

      expect(result).toBeUndefined();
      expect(mockLogger.debug).not.toHaveBeenCalledWith(expect.stringContaining('Using envPath'));
    });

    it('should handle glob sync errors gracefully', () => {
      mockGlobSync.mockImplementation(() => {
        throw new Error('Glob error');
      });

      const result = extractEnvPathFromConfigs('config.yaml');

      expect(result).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to pre-extract envPath from config')
      );
    });

    it('should handle no files found by glob', () => {
      mockGlobSync.mockReturnValue([]);

      const result = extractEnvPathFromConfigs('nonexistent.yaml');

      expect(result).toBeUndefined();
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should continue processing after individual file errors', () => {
      mockGlobSync.mockReturnValue(['/test/config1.yaml', '/test/config2.yaml']);
      mockFs.readFileSync
        .mockImplementationOnce(() => {
          throw new Error('First file error');
        })
        .mockReturnValueOnce('commandLineOptions:\n  envPath: /second/.env');
      
      mockYaml.load.mockReturnValue({
        commandLineOptions: {
          envPath: '/second/.env',
        },
      });

      const result = extractEnvPathFromConfigs('pattern*.yaml');

      expect(result).toBe('/second/.env');
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('cross-platform support', () => {
    it('should use windowsPathsNoEscape option for glob', () => {
      mockGlobSync.mockReturnValue([]);

      extractEnvPathFromConfigs('config.yaml');

      expect(mockGlobSync).toHaveBeenCalledWith(
        expect.stringContaining('config.yaml'),
        { windowsPathsNoEscape: true }
      );
    });

    it('should handle glob patterns correctly', () => {
      mockGlobSync.mockReturnValue(['/test/config1.yaml', '/test/config2.yaml']);
      mockFs.readFileSync.mockReturnValue('commandLineOptions:\n  envPath: /pattern/.env');
      mockYaml.load.mockReturnValue({
        commandLineOptions: {
          envPath: '/pattern/.env',
        },
      });

      const result = extractEnvPathFromConfigs('config*.yaml');

      expect(result).toBe('/pattern/.env');
      expect(mockGlobSync).toHaveBeenCalledWith(
        expect.stringContaining('config*.yaml'),
        { windowsPathsNoEscape: true }
      );
    });
  });
});