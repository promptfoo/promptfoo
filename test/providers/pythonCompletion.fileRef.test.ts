import fs from 'fs';
import path from 'path';
import type { Logger } from 'winston';
import logger from '../../src/logger';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { runPython } from '../../src/python/pythonUtils';
import type { CallApiContextParams } from '../../src/types';
import { parsePathOrGlob } from '../../src/util';
import { processConfigFileReferences } from '../../src/util/fileReference';

jest.mock('fs');
jest.mock('path');
jest.mock('../../src/python/pythonUtils');
jest.mock('../../src/util/file');
jest.mock('../../src/logger');
jest.mock('../../src/esm');
jest.mock('../../src/util');

jest.mock('../../src/util/fileReference', () => ({
  loadFileReference: jest.fn(),
  processConfigFileReferences: jest.fn(),
}));

describe('PythonProvider with file references', () => {
  beforeEach(() => {
    jest.resetAllMocks();

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

    jest.mocked(parsePathOrGlob).mockImplementation((basePath, runPath) => {
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
    jest.mocked(runPython).mockResolvedValue({ output: 'Test output' });
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

    await provider.processConfigReferences();

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

    provider['configReferencesProcessed'] = false;

    await provider.processConfigReferences();

    expect(processConfigFileReferences).toHaveBeenCalledWith(
      expect.objectContaining(mockConfig),
      expect.any(String),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error processing file references'),
    );
    expect(provider.config).toEqual(mockConfig);
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

    provider['configReferencesProcessed'] = false;

    const mockResult = { output: 'API result', cached: false };
    const _originalMethod = provider['executePythonScript'];
    const executePythonScriptMock = jest.fn((prompt, context, apiType) =>
      Promise.resolve(mockResult),
    );

    provider['executePythonScript'] = executePythonScriptMock;

    jest.mocked(runPython).mockResolvedValue({ output: 'API result' });

    await provider.callApi('Test prompt');

    expect(processConfigFileReferences).toHaveBeenCalledWith(
      expect.objectContaining(mockConfig),
      '/base/path',
    );
    expect(provider.config).toEqual(mockProcessedConfig);
    expect(executePythonScriptMock).toHaveBeenCalledWith('Test prompt', undefined, 'call_api');
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

    provider['configReferencesProcessed'] = false;

    await provider.processConfigReferences();
    await provider.processConfigReferences();
    await provider.processConfigReferences();

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

    provider['configReferencesProcessed'] = false;

    const runPythonMock = jest.mocked(runPython);
    runPythonMock.mockClear();
    runPythonMock.mockResolvedValue({ output: 'API result' });

    await provider.callApi('Test prompt');

    expect(runPythonMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      {
        pythonExecutable: '/custom/python',
      },
    );
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

    provider['configReferencesProcessed'] = false;

    const runPythonMock = jest.mocked(runPython);
    runPythonMock.mockClear();

    runPythonMock.mockImplementation(async () => ({ output: 'API result' }));

    const callApiSpy = jest.spyOn(provider, 'callApi');
    callApiSpy.mockResolvedValue({ output: 'API result', cached: false });

    const callEmbeddingSpy = jest.spyOn(provider, 'callEmbeddingApi');
    callEmbeddingSpy.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

    const callClassificationSpy = jest.spyOn(provider, 'callClassificationApi');
    callClassificationSpy.mockResolvedValue({ classification: { label: 0, score: 0.9 } });

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

    const runPythonMock = jest.mocked(runPython);
    runPythonMock.mockClear();

    type OptionsType = {
      config: {
        settings: Record<string, any>;
        formats: Record<string, any>;
      };
    };

    type ArgsType = [string, OptionsType, CallApiContextParams | undefined];

    interface MockRunPythonResult {
      output: string;
      args: ArgsType;
    }

    runPythonMock.mockImplementation(async (scriptPath, method, args) => {
      return {
        output: 'Success',
        args: args as ArgsType,
      } as MockRunPythonResult;
    });

    await provider.callApi('Test prompt');

    expect(runPythonMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );

    const argsPassedToRunPython = runPythonMock.mock.calls[0][2] as ArgsType;

    expect(argsPassedToRunPython).toBeDefined();
    expect(argsPassedToRunPython.length).toBeGreaterThan(1);

    const optionsPassedToPython = argsPassedToRunPython[1];

    expect(optionsPassedToPython).toBeDefined();
    expect(optionsPassedToPython.config).toBeDefined();
    expect(optionsPassedToPython.config.settings).toEqual(mockProcessedConfig.settings);
    expect(optionsPassedToPython.config.formats).toEqual(mockProcessedConfig.formats);

    expect(optionsPassedToPython.config.settings).not.toBe('file://settings.json');
    expect(optionsPassedToPython.config.formats).not.toBe('file://formats.yaml');
  });
});
