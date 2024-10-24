import fs from 'fs';
import path from 'path';
import { getCache, isCacheEnabled } from '../../src/cache';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { runPython } from '../../src/python/pythonUtils';

jest.mock('../../src/python/pythonUtils');
jest.mock('../../src/cache');
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/util', () => {
  const actual = jest.requireActual('../../src/util');
  return {
    ...actual,
    parsePathOrGlob: jest.fn(() => ({
      extension: 'py',
      functionName: undefined,
      isPathPattern: false,
      filePath: '/absolute/path/to/script.py',
    })),
  };
});

describe('PythonProvider', () => {
  const mockRunPython = jest.mocked(runPython);
  const mockGetCache = jest.mocked(jest.mocked(getCache));
  const mockIsCacheEnabled = jest.mocked(isCacheEnabled);
  const mockReadFileSync = jest.mocked(fs.readFileSync);
  const mockResolve = jest.mocked(path.resolve);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCache.mockResolvedValue({
      get: jest.fn(),
      set: jest.fn(),
    } as never);
    mockIsCacheEnabled.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('mock file content');
    mockResolve.mockReturnValue('/absolute/path/to/script.py');
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      const provider = new PythonProvider('script.py', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });

    it('should initialize with python: syntax', () => {
      const provider = new PythonProvider('python:script.py', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });

    it('should initialize with file:// prefix', () => {
      const provider = new PythonProvider('file://script.py', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });

    it('should initialize with file:// prefix and function name', () => {
      const provider = new PythonProvider('file://script.py:function_name', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });
  });

  describe('callApi', () => {
    it('should call executePythonScript with correct parameters', async () => {
      const provider = new PythonProvider('script.py');
      mockRunPython.mockResolvedValue({ output: 'test output' });

      const result = await provider.callApi('test prompt', { someContext: true } as any);

      expect(mockRunPython).toHaveBeenCalledWith(
        expect.any(String),
        'call_api',
        ['test prompt', undefined, { someContext: true }],
        { pythonExecutable: undefined },
      );
      expect(result).toEqual({ output: 'test output' });
    });

    describe('error handling', () => {
      it('should throw a specific error when Python script returns invalid result', async () => {
        const provider = new PythonProvider('script.py');
        mockRunPython.mockResolvedValue({ invalidKey: 'invalid value' });

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Python script `call_api` function must return a dict with an `output` string/object or `error` string, instead got: {"invalidKey":"invalid value"}',
        );
      });

      it('should throw an error if Python script returns invalid result', async () => {
        const provider = new PythonProvider('script.py');
        mockRunPython.mockResolvedValue({ invalidKey: 'invalid value' });

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Python script `call_api` function must return a dict with an `output` string/object or `error` string, instead got: {"invalidKey":"invalid value"}',
        );
      });

      it('should throw an error when Python script returns null', async () => {
        const provider = new PythonProvider('script.py');
        mockRunPython.mockResolvedValue(null as never);

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Python script `call_api` function must return a dict with an `output` string/object or `error` string, instead got: null',
        );
      });

      it('should throw an error when Python script returns a non-object', async () => {
        const provider = new PythonProvider('script.py');
        mockRunPython.mockResolvedValue('string result');

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Python script `call_api` function must return a dict with an `output` string/object or `error` string, instead got: "string result"',
        );
      });

      it('should not throw an error when Python script returns a valid output', async () => {
        const provider = new PythonProvider('script.py');
        mockRunPython.mockResolvedValue({ output: 'valid output' });

        await expect(provider.callApi('test prompt')).resolves.not.toThrow();
      });

      it('should not throw an error when Python script returns a valid error', async () => {
        const provider = new PythonProvider('script.py');
        mockRunPython.mockResolvedValue({ error: 'valid error message' });

        await expect(provider.callApi('test prompt')).resolves.not.toThrow();
      });
    });
  });

  describe('callEmbeddingApi', () => {
    it('should call executePythonScript with correct parameters', async () => {
      const provider = new PythonProvider('script.py');
      mockRunPython.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

      const result = await provider.callEmbeddingApi('test prompt');

      expect(mockRunPython).toHaveBeenCalledWith(
        expect.any(String),
        'call_embedding_api',
        ['test prompt', undefined],
        { pythonExecutable: undefined },
      );
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3] });
    });

    it('should throw an error if Python script returns invalid result', async () => {
      const provider = new PythonProvider('script.py');
      mockRunPython.mockResolvedValue({ invalidKey: 'invalid value' });

      await expect(provider.callEmbeddingApi('test prompt')).rejects.toThrow(
        'The Python script `call_embedding_api` function must return a dict with an `embedding` array or `error` string, instead got {"invalidKey":"invalid value"}',
      );
    });
  });

  describe('callClassificationApi', () => {
    it('should call executePythonScript with correct parameters', async () => {
      const provider = new PythonProvider('script.py');
      mockRunPython.mockResolvedValue({ classification: { label: 'test', score: 0.9 } });

      const result = await provider.callClassificationApi('test prompt');

      expect(mockRunPython).toHaveBeenCalledWith(
        expect.any(String),
        'call_classification_api',
        ['test prompt', undefined],
        { pythonExecutable: undefined },
      );
      expect(result).toEqual({ classification: { label: 'test', score: 0.9 } });
    });

    it('should throw an error if Python script returns invalid result', async () => {
      const provider = new PythonProvider('script.py');
      mockRunPython.mockResolvedValue({ invalidKey: 'invalid value' });

      await expect(provider.callClassificationApi('test prompt')).rejects.toThrow(
        'The Python script `call_classification_api` function must return a dict with a `classification` object or `error` string, instead of {"invalidKey":"invalid value"}',
      );
    });
  });

  describe('caching', () => {
    it('should use cached result when available', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: jest.fn().mockResolvedValue(JSON.stringify({ output: 'cached result' })),
        set: jest.fn(),
      };
      jest.mocked(mockGetCache).mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockCache.get).toHaveBeenCalledWith(
        'python:undefined:call_api:5633d479dfae75ba7a78914ee380fa202bd6126e7c6b7c22e3ebc9e1a6ddc871:test prompt:undefined:undefined',
      );
      expect(mockRunPython).not.toHaveBeenCalled();
      expect(result).toEqual({ output: 'cached result' });
    });

    it('should cache result when cache is enabled', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);
      mockRunPython.mockResolvedValue({ output: 'new result' });

      await provider.callApi('test prompt');

      expect(mockCache.set).toHaveBeenCalledWith(
        'python:undefined:call_api:5633d479dfae75ba7a78914ee380fa202bd6126e7c6b7c22e3ebc9e1a6ddc871:test prompt:undefined:undefined',
        '{"output":"new result"}',
      );
    });
  });
});
