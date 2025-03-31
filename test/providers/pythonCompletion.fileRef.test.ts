import fs from 'fs';
import path from 'path';
import type { Logger } from 'winston';
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

// Mock the fileReference utility functions for controlled testing
jest.mock('../../src/util/fileReference', () => ({
  loadFileReference: jest.fn(),
  processConfigFileReferences: jest.fn(),
}));

describe('PythonProvider with file references', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // Mock logger methods with jest.fn()
    (jest.mocked(logger.debug)).mockImplementation(
      () =>
        ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }) as unknown as Logger,
    );

    (jest.mocked(logger.error)).mockImplementation(
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
  });

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
    jest.spyOn(provider, 'executePythonScript').mockImplementation()
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
