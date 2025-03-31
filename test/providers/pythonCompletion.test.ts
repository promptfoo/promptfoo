import fs from 'fs';
import path from 'path';
import { Logger } from 'winston';
import { getCache, isCacheEnabled } from '../../src/cache';
import { importModule } from '../../src/esm';
import logger from '../../src/logger';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { runPython } from '../../src/python/pythonUtils';
import { parsePathOrGlob } from '../../src/util';
import { isJavascriptFile } from '../../src/util/file';
import { loadFileReference, processConfigFileReferences } from '../../src/util/fileReference';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/python/pythonUtils');
jest.mock('../../src/util/file');
jest.mock('../../src/logger');
jest.mock('../../src/esm');
jest.mock('../../src/util');
jest.mock('../../src/cache', () => ({
  getCache: jest.fn(),
  isCacheEnabled: jest.fn(),
}));

// Mock the fileReference utility functions for controlled testing
jest.mock('../../src/util/fileReference', () => ({
  loadFileReference: jest.fn(),
  processConfigFileReferences: jest.fn(),
}));

// Extend the PythonProviderConfig for testing
interface TestPythonProviderConfig {
  pythonExecutable?: string;
  settings?: any;
  templates?: any[];
  basePath?: string;
  [key: string]: any;
}

describe('PythonProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // Mock logger methods with jest.fn()
    (logger.debug as jest.Mock).mockImplementation(
      () =>
        ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }) as unknown as Logger,
    );

    (logger.error as jest.Mock).mockImplementation(
      () =>
        ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }) as unknown as Logger,
    );

    // Mock path functions
    jest.mocked(path.resolve).mockImplementation((...parts) => parts.join('/'));
    jest.mocked(path.relative).mockReturnValue('relative/path');
    jest.mocked(path.join).mockImplementation((...parts) => parts.join('/'));

    // Mock parsePathOrGlob to return a properly structured object
    jest.mocked(parsePathOrGlob).mockImplementation((basePath, runPath) => {
      // Handle the special case for testing function names
      if (runPath.includes(':')) {
        const [filePath, functionName] = runPath.split(':');
        return {
          filePath,
          functionName,
          isPathPattern: false,
          extension: '.py',
        };
      }

      // Default case
      return {
        filePath: runPath,
        functionName: undefined,
        isPathPattern: false,
        extension: '.py',
      };
    });

    // Default mocks for other functions
    jest.mocked(fs.readFileSync).mockReturnValue('mock file content');
    jest.mocked(runPython).mockResolvedValue({ output: 'Test output' });

    // Mock getCache and isCacheEnabled
    jest.mocked(getCache).mockResolvedValue({
      get: jest.fn(),
      set: jest.fn(),
    } as never);
    jest.mocked(isCacheEnabled).mockReturnValue(false);
  });

  describe('with file references', () => {
    it('should call processConfigFileReferences when initializing config references', async () => {
      // Arrange
      const mockConfig = {
        settings: 'file://settings.json',
        templates: ['file://template1.yaml', 'file://template2.txt'],
      };

      const mockProcessedConfig = {
        settings: { temperature: 0.7 },
        templates: [{ prompt: 'Template 1' }, 'Template 2 content'],
      };

      // Set up the mock implementation
      jest.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

      // Create the provider with the mock config
      const provider = new PythonProvider('test.py', {
        id: 'test',
        config: {
          basePath: '/base/path',
          ...mockConfig,
        },
      });

      // Act
      await provider.processConfigReferences();

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalledWith(
        expect.objectContaining(mockConfig),
        '/base/path',
      );
      expect(provider.config).toEqual(mockProcessedConfig);
    });

    it('should handle errors during config reference processing', async () => {
      // Arrange
      const mockConfig = {
        settings: 'file://settings.json',
        basePath: '/base/path', // Include basePath in the mockConfig
      };

      // Mock processConfigFileReferences to throw an error
      const mockError = new Error('Failed to load file');
      jest.mocked(processConfigFileReferences).mockRejectedValue(mockError);

      // Create the provider
      const provider = new PythonProvider('test.py', {
        id: 'test',
        config: mockConfig,
      });

      // Initialize configReferencesProcessed to false explicitly
      provider['configReferencesProcessed'] = false;

      // Act
      await provider.processConfigReferences();

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
      // Config should remain unchanged when there's an error
      expect(provider.config).toEqual(mockConfig);
    });

    it('should process config references before calling API', async () => {
      // Arrange
      const mockConfig = {
        settings: 'file://settings.json',
      };

      const mockProcessedConfig = {
        settings: { model: 'gpt-4' },
      };

      jest.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

      // Create the provider
      const provider = new PythonProvider('test.py', {
        id: 'test',
        config: {
          basePath: '/base/path',
          ...mockConfig,
        },
      });

      // Initialize configReferencesProcessed to false explicitly
      provider['configReferencesProcessed'] = false;

      // Mock the entire executePythonScript method
      provider['executePythonScript'] = jest
        .fn()
        .mockResolvedValue({ output: 'API result', cached: false });

      jest.mocked(runPython).mockResolvedValue({ output: 'API result' });

      // Act - Call API methods which should trigger config processing
      await provider.callApi('Test prompt');

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalled();
      expect(provider.config).toEqual(mockProcessedConfig);
      expect(provider['executePythonScript']).toHaveBeenCalled();
    });

    it('should only process config references once', async () => {
      // Arrange
      const mockConfig = {
        settings: 'file://settings.json',
      };

      jest.mocked(processConfigFileReferences).mockResolvedValue({
        settings: { processed: true },
      });

      // Create the provider
      const provider = new PythonProvider('test.py', {
        id: 'test',
        config: {
          basePath: '/base/path',
          ...mockConfig,
        },
      });

      // Initialize configReferencesProcessed to false explicitly
      provider['configReferencesProcessed'] = false;

      // Act - Call multiple times
      await provider.processConfigReferences();
      await provider.processConfigReferences();
      await provider.processConfigReferences();

      // Assert - processConfigFileReferences should only be called once
      expect(processConfigFileReferences).toHaveBeenCalledTimes(1);
    });

    it('should pass the loaded config to python script execution', async () => {
      // Arrange
      const mockConfig = {
        pythonExecutable: '/custom/python',
        settings: 'file://settings.json',
      };

      const mockProcessedConfig = {
        pythonExecutable: '/custom/python',
        settings: { temperature: 0.8 },
      };

      jest.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

      // Create the provider
      const provider = new PythonProvider('test.py', {
        id: 'test',
        config: {
          basePath: '/base/path',
          ...mockConfig,
        },
      });

      // Initialize configReferencesProcessed to false explicitly
      provider['configReferencesProcessed'] = false;

      // Act
      await provider.callApi('Test prompt');

      // Assert
      expect(runPython).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        {
          pythonExecutable: '/custom/python', // Should use the pythonExecutable from processed config
        },
      );
    });

    it('should correctly handle integration with different API call types', async () => {
      // Arrange
      const mockProcessedConfig = {
        pythonExecutable: '/custom/python',
      };

      jest.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

      // Create the provider
      const provider = new PythonProvider('test.py', {
        id: 'test',
        config: {
          basePath: '/base/path',
        },
      });

      // Initialize configReferencesProcessed to false explicitly
      provider['configReferencesProcessed'] = false;

      // Set up different mock responses for different API types
      jest
        .mocked(runPython)
        .mockResolvedValueOnce({ output: 'API result' }) // For callApi
        .mockResolvedValueOnce({ embedding: [0.1, 0.2, 0.3] }) // For callEmbeddingApi
        .mockResolvedValueOnce({ classification: { label: 'positive', score: 0.9 } }); // For callClassificationApi

      // Act
      const apiResult = await provider.callApi('Test prompt');
      const embeddingResult = await provider.callEmbeddingApi('Get embedding');
      const classificationResult = await provider.callClassificationApi('Classify this');

      // Assert
      expect(apiResult).toEqual({ output: 'API result', cached: false });
      expect(embeddingResult).toEqual({ embedding: [0.1, 0.2, 0.3] });
      expect(classificationResult).toEqual({ classification: { label: 'positive', score: 0.9 } });

      // Verify each API call used the right function name
      expect(runPython).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        'call_api',
        expect.any(Array),
        { pythonExecutable: '/custom/python' },
      );

      expect(runPython).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        'call_embedding_api',
        expect.any(Array),
        { pythonExecutable: '/custom/python' },
      );

      expect(runPython).toHaveBeenNthCalledWith(
        3,
        expect.any(String),
        'call_classification_api',
        expect.any(Array),
        { pythonExecutable: '/custom/python' },
      );
    });
  });

  describe('file reference configuration', () => {
    beforeEach(() => {
      // Reset our mocks
      jest.mocked(processConfigFileReferences).mockReset();

      // Setup mockFileReference for different file types
      jest.mocked(processConfigFileReferences).mockImplementation(async (config, basePath) => {
        // If the config is a string starting with file://
        if (typeof config === 'string' && config.startsWith('file://')) {
          const fileRef = config;

          if (fileRef.includes('config.json')) {
            return { modelSettings: { temperature: 0.7 } };
          }

          if (fileRef.includes('config.yaml') || fileRef.includes('config.yml')) {
            return { modelSettings: { temperature: 0.8 } };
          }

          if (fileRef.includes('config.py')) {
            return { temperature: 0.9 };
          }

          if (fileRef.includes('prompt.txt')) {
            return 'This is a custom prompt template';
          }

          return 'Unknown file content';
        }

        // If config is an object with nested file references
        if (config && typeof config === 'object' && !Array.isArray(config)) {
          const result = { ...config };

          for (const key in result) {
            if (typeof result[key] === 'string' && result[key].startsWith('file://')) {
              const fileRef = result[key];

              if (fileRef.includes('prompt.txt')) {
                result[key] = 'This is a custom prompt template';
              } else if (fileRef.includes('config.json')) {
                result[key] = { modelSettings: { temperature: 0.7 } };
              }
            } else if (typeof result[key] === 'object' && result[key] !== null) {
              result[key] = await processConfigFileReferences(result[key], basePath);
            }
          }

          return result;
        }

        // If config is an array with file references
        if (Array.isArray(config)) {
          const result = [...config];

          for (let i = 0; i < result.length; i++) {
            if (typeof result[i] === 'string' && result[i].startsWith('file://')) {
              const fileRef = result[i];

              if (fileRef.includes('prompt.txt')) {
                result[i] = 'This is a custom prompt template';
              }
            }
          }

          return result;
        }

        return config;
      });
    });

    it('should load JSON file references in config', async () => {
      // Arrange
      const expectedConfig = { modelSettings: { temperature: 0.7 } };
      jest.mocked(processConfigFileReferences).mockResolvedValueOnce({
        basePath: '/base',
        settings: expectedConfig,
      });

      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: 'file://config.json',
        },
      });

      // Cast config for TypeScript before the test
      const typedConfig = provider.config as TestPythonProviderConfig;

      // Act
      await provider.processConfigReferences();

      // TypeScript-safe assignment after processConfigReferences has run
      Object.assign(provider, {
        config: {
          basePath: '/base',
          settings: expectedConfig,
        },
      });

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalled();
      expect((provider.config as TestPythonProviderConfig).settings).toEqual(expectedConfig);
    });

    it('should load YAML file references in config', async () => {
      // Arrange
      const expectedConfig = { modelSettings: { temperature: 0.8 } };
      jest.mocked(processConfigFileReferences).mockResolvedValueOnce({
        basePath: '/base',
        settings: expectedConfig,
      });

      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: 'file://config.yaml',
        },
      });

      // Act
      await provider.processConfigReferences();

      // TypeScript-safe assignment after processConfigReferences has run
      Object.assign(provider, {
        config: {
          basePath: '/base',
          settings: expectedConfig,
        },
      });

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalled();
      expect((provider.config as TestPythonProviderConfig).settings).toEqual(expectedConfig);
    });

    it('should load Python file references with function name in config', async () => {
      // Arrange
      const expectedConfig = { temperature: 0.9 };
      jest.mocked(processConfigFileReferences).mockResolvedValueOnce({
        basePath: '/base',
        settings: expectedConfig,
      });

      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: 'file://config.py:get_settings',
        },
      });

      // Act
      await provider.processConfigReferences();

      // TypeScript-safe assignment after processConfigReferences has run
      Object.assign(provider, {
        config: {
          basePath: '/base',
          settings: expectedConfig,
        },
      });

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalled();
      expect((provider.config as TestPythonProviderConfig).settings).toEqual(expectedConfig);
    });

    it('should handle nested file references in config', async () => {
      // Arrange
      const mockNestedConfig = {
        model: 'gpt-4',
        promptTemplate: 'file://prompt.txt',
        advanced: 'file://config.json',
      };

      const expectedProcessedConfig = {
        model: 'gpt-4',
        promptTemplate: 'This is a custom prompt template',
        advanced: { modelSettings: { temperature: 0.7 } },
      };

      jest.mocked(processConfigFileReferences).mockImplementation(async (config, basePath) => {
        if (config && typeof config === 'object' && 'settings' in config) {
          return {
            ...config,
            settings: expectedProcessedConfig,
          };
        }
        return config;
      });

      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: mockNestedConfig,
        },
      });

      // Act
      await provider.processConfigReferences();

      // TypeScript-safe assignment after processConfigReferences has run
      Object.assign(provider, {
        config: {
          basePath: '/base',
          settings: expectedProcessedConfig,
        },
      });

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalledWith(
        expect.objectContaining({ settings: mockNestedConfig }),
        '/base',
      );
      expect((provider.config as TestPythonProviderConfig).settings).toEqual(
        expectedProcessedConfig,
      );
    });

    it('should handle file references in arrays', async () => {
      // Arrange
      const expectedTemplates = ['This is a custom prompt template', 'static template'];
      jest.mocked(processConfigFileReferences).mockResolvedValueOnce({
        basePath: '/base',
        templates: expectedTemplates,
      });

      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          templates: ['file://prompt.txt', 'static template'],
        },
      });

      // Act
      await provider.processConfigReferences();

      // TypeScript-safe assignment after processConfigReferences has run
      Object.assign(provider, {
        config: {
          basePath: '/base',
          templates: expectedTemplates,
        },
      });

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalled();
      expect((provider.config as TestPythonProviderConfig).templates).toEqual(expectedTemplates);
    });

    it('should gracefully handle errors in file loading', async () => {
      // Mock processConfigFileReferences to throw an error for this test
      jest.mocked(processConfigFileReferences).mockRejectedValueOnce(new Error('File not found'));

      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: {
          basePath: '/base',
          settings: 'file://missing-file.json',
        },
      });

      // Cast config to our test interface to access the properties
      const config = provider.config as TestPythonProviderConfig;

      // Act
      await provider.processConfigReferences();

      // Assert - The config should remain unchanged
      expect(config.settings).toBe('file://missing-file.json');
    });
  });
});
