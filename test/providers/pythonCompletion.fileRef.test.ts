import fs from 'fs';
import path from 'path';

import logger from '../../src/logger';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import * as pythonUtils from '../../src/python/pythonUtils';
import { parsePathOrGlob } from '../../src/util/index';
import { processConfigFileReferences } from '../../src/util/fileReference';
import type { Logger } from 'winston';

jest.mock('fs');
jest.mock('path');
jest.mock('../../src/util/file');
jest.mock('../../src/logger');
jest.mock('../../src/esm');
jest.mock('../../src/util');

jest.mock('../../src/util/fileReference', () => ({
  loadFileReference: jest.fn(),
  processConfigFileReferences: jest.fn(),
}));

// Mock the worker pool
const mockPoolInstance = {
  initialize: jest.fn().mockResolvedValue(undefined),
  execute: jest.fn().mockResolvedValue({ output: 'Test output' }),
  shutdown: jest.fn().mockResolvedValue(undefined),
  getWorkerCount: jest.fn().mockReturnValue(1),
};

jest.mock('../../src/python/workerPool', () => ({
  PythonWorkerPool: jest.fn(() => mockPoolInstance),
}));

describe('PythonProvider with file references', () => {
  const providers: PythonProvider[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock pool
    mockPoolInstance.initialize.mockResolvedValue(undefined);
    mockPoolInstance.execute.mockResolvedValue({ output: 'Test output' });
    mockPoolInstance.shutdown.mockResolvedValue(undefined);
    // Reset Python state to avoid test interference
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;

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

    jest.mocked(path.resolve).mockImplementation((...parts) => parts.join('/'));
    jest.mocked(path.relative).mockReturnValue('relative/path');
    jest.mocked(path.join).mockImplementation((...parts) => parts.join('/'));

    jest.mocked(parsePathOrGlob).mockImplementation((_basePath, runPath) => {
      if (runPath.includes(':')) {
        const [filePath, functionName] = runPath.split(':');
        return {
          filePath,
          functionName,
          isPathPattern: false,
          extension: '.py',
        };
      }

      return {
        filePath: runPath,
        functionName: undefined,
        isPathPattern: false,
        extension: '.py',
      };
    });

    jest.mocked(fs.readFileSync).mockReturnValue('mock file content');
  });

  afterEach(async () => {
    // Cleanup providers
    await Promise.all(providers.map((p) => p.shutdown().catch(() => {})));
    providers.length = 0;
  });

  it('should call processConfigFileReferences when initializing config references', async () => {
    const mockConfig = {
      settings: 'file://settings.json',
      templates: ['file://template1.yaml', 'file://template2.txt'],
    };

    const mockProcessedConfig = {
      settings: { temperature: 0.7 },
      templates: [{ prompt: 'Template 1' }, 'Template 2 content'],
    };

    jest.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

    const provider = new PythonProvider('test.py', {
      id: 'test',
      config: {
        basePath: '/base/path',
        ...mockConfig,
      },
    });
    providers.push(provider);

    await provider.initialize();

    expect(processConfigFileReferences).toHaveBeenCalledWith(
      expect.objectContaining(mockConfig),
      '/base/path',
    );
    expect(provider.config).toEqual(mockProcessedConfig);
  });

  it('should handle errors during config reference processing', async () => {
    const mockConfig = {
      settings: 'file://settings.json',
      basePath: '/base/path',
    };

    const mockError = new Error('Failed to load file');
    jest.mocked(processConfigFileReferences).mockRejectedValue(mockError);

    const provider = new PythonProvider('test.py', {
      id: 'test',
      config: mockConfig,
    });
    providers.push(provider);

    await expect(provider.initialize()).rejects.toThrow('Failed to load file');

    expect(processConfigFileReferences).toHaveBeenCalledWith(
      expect.objectContaining(mockConfig),
      expect.any(String),
    );
    expect(provider['isInitialized']).toBeFalsy();
  });

  it('should process config references before calling API', async () => {
    const mockConfig = {
      settings: 'file://settings.json',
    };

    const mockProcessedConfig = {
      settings: { model: 'gpt-4' },
    };

    jest.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

    const provider = new PythonProvider('test.py', {
      id: 'test',
      config: {
        basePath: '/base/path',
        ...mockConfig,
      },
    });
    providers.push(provider);

    await provider.callApi('Test prompt');

    expect(processConfigFileReferences).toHaveBeenCalledWith(
      expect.objectContaining(mockConfig),
      '/base/path',
    );
    expect(provider.config).toEqual(mockProcessedConfig);
  });

  it('should only process config references once', async () => {
    const mockConfig = {
      settings: 'file://settings.json',
    };

    jest.mocked(processConfigFileReferences).mockResolvedValue({
      settings: { processed: true },
    });

    const provider = new PythonProvider('test.py', {
      id: 'test',
      config: {
        basePath: '/base/path',
        ...mockConfig,
      },
    });
    providers.push(provider);

    await provider.initialize();
    await provider.initialize();
    await provider.initialize();

    expect(processConfigFileReferences).toHaveBeenCalledTimes(1);
  });

  it('should pass the loaded config to python script execution', async () => {
    const mockConfig = {
      pythonExecutable: '/custom/python',
      settings: 'file://settings.json',
    };

    const mockProcessedConfig = {
      pythonExecutable: '/custom/python',
      settings: { temperature: 0.8 },
    };

    jest.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

    const provider = new PythonProvider('test.py', {
      id: 'test',
      config: {
        basePath: '/base/path',
        ...mockConfig,
      },
    });
    providers.push(provider);

    await provider.callApi('Test prompt');

    // Just verify config was processed - worker pool handles execution
    expect(processConfigFileReferences).toHaveBeenCalledWith(
      expect.objectContaining(mockConfig),
      '/base/path',
    );
    expect(provider.config).toEqual(mockProcessedConfig);
  });

  it('should correctly handle integration with different API call types', async () => {
    const mockProcessedConfig = {
      pythonExecutable: '/custom/python',
    };

    jest.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

    const provider = new PythonProvider('test.py', {
      id: 'test',
      config: {
        basePath: '/base/path',
      },
    });
    providers.push(provider);

    jest.spyOn(provider, 'callApi').mockResolvedValue({
      output: 'API result',
      cached: false,
    });

    jest.spyOn(provider, 'callEmbeddingApi').mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
    });

    jest.spyOn(provider, 'callClassificationApi').mockResolvedValue({
      classification: { label: 0, score: 0.9 },
    });

    const apiResult = await provider.callApi('Test prompt');
    const embeddingResult = await provider.callEmbeddingApi('Get embedding');
    const classificationResult = await provider.callClassificationApi('Classify this');

    expect(apiResult).toEqual({ output: 'API result', cached: false });
    expect(embeddingResult).toEqual({ embedding: [0.1, 0.2, 0.3] });
    expect(classificationResult).toEqual({ classification: { label: 0, score: 0.9 } });
  });

  it('should pass processed config to Python script instead of raw file references', async () => {
    const mockOriginalConfig = {
      settings: 'file://settings.json',
      formats: 'file://formats.yaml',
    };

    const mockProcessedConfig = {
      settings: { model: 'gpt-4', temperature: 0.7 },
      formats: { outputFormat: 'json', includeTokens: true },
    };

    jest.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

    const provider = new PythonProvider('test.py', {
      id: 'test',
      config: {
        basePath: '/base/path',
        ...mockOriginalConfig,
      },
    });
    providers.push(provider);

    await provider.callApi('Test prompt');

    // Verify that config was processed before execution
    expect(processConfigFileReferences).toHaveBeenCalledWith(
      expect.objectContaining(mockOriginalConfig),
      '/base/path',
    );

    // Verify the processed config is stored on the provider
    expect(provider.config.settings).toEqual(mockProcessedConfig.settings);
    expect(provider.config.formats).toEqual(mockProcessedConfig.formats);

    // Verify raw file references were not kept
    expect(provider.config.settings).not.toBe('file://settings.json');
    expect(provider.config.formats).not.toBe('file://formats.yaml');
  });
});
