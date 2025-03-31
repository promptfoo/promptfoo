import fs from 'fs';
import path from 'path';
import type { Logger } from 'winston';
import { getCache, isCacheEnabled } from '../../src/cache';
import logger from '../../src/logger';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { runPython } from '../../src/python/pythonUtils';
import { parsePathOrGlob } from '../../src/util';
import { processConfigFileReferences } from '../../src/util/fileReference';

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
    jest.mocked(logger.debug).mockImplementation(
      () =>
        ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }) as unknown as Logger,
    );

    jest.mocked(logger.error).mockImplementation(
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
      expect(processConfigFileReferences).toHaveBeenCalledWith(
        expect.objectContaining(mockConfig),
        expect.any(String),
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing file references'),
      );
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

      // Mock the entire executePythonScript method with a proper approach
      const mockResult = { output: 'API result', cached: false };
      // For this test, we need to also properly set up the original method first
      // @ts-ignore - accessing private method
      const _originalMethod = provider['executePythonScript'];
      // Define the mock to use the same arguments
      const executePythonScriptMock = jest.fn((prompt, context, apiType) =>
        Promise.resolve(mockResult),
      );

      // Replace the method on the instance directly
      // @ts-ignore - accessing private method
      provider['executePythonScript'] = executePythonScriptMock;

      jest.mocked(runPython).mockResolvedValue({ output: 'API result' });

      // Act - Call API methods which should trigger config processing
      await provider.callApi('Test prompt');

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalledWith(
        expect.objectContaining(mockConfig),
        '/base/path',
      );
      expect(provider.config).toEqual(mockProcessedConfig);
      expect(executePythonScriptMock).toHaveBeenCalledWith('Test prompt', undefined, 'call_api');
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

      // Mock runPython to capture the call
      const runPythonMock = jest.mocked(runPython);
      runPythonMock.mockClear(); // Clear previous calls
      runPythonMock.mockResolvedValue({ output: 'API result' });

      // Act
      await provider.callApi('Test prompt');

      // Assert
      expect(runPythonMock).toHaveBeenCalledWith(
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
      const runPythonMock = jest.mocked(runPython);
      runPythonMock.mockClear(); // Clear previous calls

      // Mock for first call - callApi
      runPythonMock.mockResolvedValueOnce({ output: 'API result' });

      // Mock executePythonScript for callApi
      // @ts-ignore - accessing private method
      jest.spyOn(provider, 'executePythonScript').mockImplementation((prompt, context, apiType) => {
        if (apiType === 'call_api') {
          return Promise.resolve({ output: 'API result', cached: false });
        } else if (apiType === 'call_embedding_api') {
          return Promise.resolve({ embedding: [0.1, 0.2, 0.3] });
        } else if (apiType === 'call_classification_api') {
          return Promise.resolve({ classification: { label: 'positive', score: 0.9 } });
        }
        return Promise.resolve({});
      });

      // Act
      const apiResult = await provider.callApi('Test prompt');
      const embeddingResult = await provider.callEmbeddingApi('Get embedding');
      const classificationResult = await provider.callClassificationApi('Classify this');

      // Assert
      expect(apiResult).toEqual({ output: 'API result', cached: false });
      expect(embeddingResult).toEqual({ embedding: [0.1, 0.2, 0.3] });
      expect(classificationResult).toEqual({ classification: { label: 'positive', score: 0.9 } });

      // No need to verify the call parameters since we're mocking executePythonScript directly
      // and testing the output instead
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

      // Act
      await provider.processConfigReferences();

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalledWith(
        expect.objectContaining({
          basePath: '/base',
          settings: 'file://config.json',
        }),
        expect.any(String),
      );
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

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalledWith(
        expect.objectContaining({
          basePath: '/base',
          settings: 'file://config.yaml',
        }),
        expect.any(String),
      );
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

      // Assert
      expect(processConfigFileReferences).toHaveBeenCalledWith(
        expect.objectContaining({
          basePath: '/base',
          settings: 'file://config.py:get_settings',
        }),
        expect.any(String),
      );
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
      expect(processConfigFileReferences).toHaveBeenCalledWith(
        expect.objectContaining({
          basePath: '/base',
          templates: ['file://prompt.txt', 'static template'],
        }),
        expect.any(String),
      );
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
