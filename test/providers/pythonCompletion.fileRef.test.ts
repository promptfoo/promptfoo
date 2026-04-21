import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import * as pythonUtils from '../../src/python/pythonUtils';
import { processConfigFileReferences } from '../../src/util/fileReference';
import { parsePathOrGlob } from '../../src/util/index';
import type { Logger } from 'winston';

vi.mock('fs');
vi.mock('path');
vi.mock('../../src/util/file');
vi.mock('../../src/logger');
vi.mock('../../src/util');

vi.mock('../../src/util/fileReference', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    loadFileReference: vi.fn(),
    processConfigFileReferences: vi.fn(),
  };
});

const mocks = vi.hoisted(() => {
  const mockPoolInstance = {
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({ output: 'Test output' }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    getWorkerCount: vi.fn().mockReturnValue(1),
  };
  const PythonWorkerPoolMock = vi.fn(function () {
    return mockPoolInstance as any;
  });
  const importModuleMock = vi.fn();
  const isEsmModuleMock = vi.fn();

  return { mockPoolInstance, PythonWorkerPoolMock, importModuleMock, isEsmModuleMock };
});

vi.mock('../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: mocks.importModuleMock,
    isEsmModule: mocks.isEsmModuleMock,
  };
});

vi.mock('../../src/python/workerPool', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    PythonWorkerPool: mocks.PythonWorkerPoolMock,
  };
});

describe('PythonProvider with file references', () => {
  const mockPoolInstance = mocks.mockPoolInstance;
  const providers: PythonProvider[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock pool
    mocks.PythonWorkerPoolMock.mockClear();
    mockPoolInstance.initialize.mockReset();
    mockPoolInstance.initialize.mockResolvedValue(undefined);
    mockPoolInstance.execute.mockReset();
    mockPoolInstance.execute.mockResolvedValue({ output: 'Test output' });
    mockPoolInstance.shutdown.mockReset();
    mockPoolInstance.shutdown.mockResolvedValue(undefined);
    mockPoolInstance.getWorkerCount.mockReset();
    mockPoolInstance.getWorkerCount.mockReturnValue(1);
    // Reset Python state to avoid test interference
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;

    vi.mocked(logger.debug).mockImplementation(function () {
      return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Logger;
    });

    vi.mocked(logger.error).mockImplementation(function () {
      return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Logger;
    });

    vi.mocked(path.resolve).mockImplementation(function (...parts) {
      return parts.join('/');
    });
    vi.mocked(path.relative).mockImplementation(function () {
      return 'relative/path';
    });
    vi.mocked(path.join).mockImplementation(function (...parts) {
      return parts.join('/');
    });

    vi.mocked(parsePathOrGlob).mockImplementation(function (_basePath, runPath) {
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

    vi.mocked(fs.readFileSync).mockImplementation(function () {
      return 'mock file content';
    });
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

    vi.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

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
    vi.mocked(processConfigFileReferences).mockRejectedValue(mockError);

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

    vi.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

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

    vi.mocked(processConfigFileReferences).mockResolvedValue({
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

    vi.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

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

    vi.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

    const provider = new PythonProvider('test.py', {
      id: 'test',
      config: {
        basePath: '/base/path',
      },
    });
    providers.push(provider);

    vi.spyOn(provider, 'callApi').mockResolvedValue({
      output: 'API result',
      cached: false,
    });

    vi.spyOn(provider, 'callEmbeddingApi').mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
    });

    vi.spyOn(provider, 'callClassificationApi').mockResolvedValue({
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

    vi.mocked(processConfigFileReferences).mockResolvedValue(mockProcessedConfig);

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
