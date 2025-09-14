import fs from 'fs';
import path from 'path';

import { getCache, isCacheEnabled } from '../../src/cache';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { runPython } from '../../src/python/pythonUtils';

jest.mock('../../src/python/pythonUtils');
jest.mock('../../src/cache');
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/util', () => ({
  ...jest.requireActual('../../src/util'),
  parsePathOrGlob: jest.fn((basePath, runPath) => {
    // Handle the special case for testing function names
    if (runPath === 'script.py:custom_function') {
      return {
        filePath: 'script.py',
        functionName: 'custom_function',
        isPathPattern: false,
        extension: '.py',
      };
    }

    // Default case
    return {
      filePath: runPath,
      functionName: undefined,
      isPathPattern: false,
      extension: path.extname(runPath),
    };
  }),
}));

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
        ['test prompt', { config: {} }, { someContext: true }],
        { pythonExecutable: undefined },
      );
      expect(result).toEqual({ output: 'test output', cached: false });
    });

    describe('error handling', () => {
      it('should throw a specific error when Python script returns invalid result', async () => {
        const provider = new PythonProvider('script.py');
        mockRunPython.mockResolvedValue({ invalidKey: 'invalid value' });

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Python script `call_api` function must return a dict with an `output` string/object or `error` string, instead got: {"invalidKey":"invalid value"}',
        );
      });

      it('should not throw an error when Python script returns a valid error', async () => {
        const provider = new PythonProvider('script.py');
        mockRunPython.mockResolvedValue({ error: 'valid error message' });

        await expect(provider.callApi('test prompt')).resolves.not.toThrow();
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
          "Cannot use 'in' operator to search for 'output' in string result",
        );
      });

      it('should not throw an error when Python script returns a valid output', async () => {
        const provider = new PythonProvider('script.py');
        mockRunPython.mockResolvedValue({ output: 'valid output' });

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
        ['test prompt', { config: {} }],
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
        ['test prompt', { config: {} }],
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
        'python:undefined:default:call_api:5633d479dfae75ba7a78914ee380fa202bd6126e7c6b7c22e3ebc9e1a6ddc871:test prompt:undefined:undefined',
      );
      expect(mockRunPython).not.toHaveBeenCalled();
      expect(result).toEqual({ output: 'cached result', cached: true });
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
        'python:undefined:default:call_api:5633d479dfae75ba7a78914ee380fa202bd6126e7c6b7c22e3ebc9e1a6ddc871:test prompt:undefined:undefined',
        '{"output":"new result"}',
      );
    });

    it('should properly transform token usage in cached results', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: jest.fn().mockResolvedValue(
          JSON.stringify({
            output: 'cached result with token usage',
            tokenUsage: {
              prompt: 10,
              completion: 15,
              total: 25,
            },
          }),
        ),
        set: jest.fn(),
      };
      jest.mocked(mockGetCache).mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockRunPython).not.toHaveBeenCalled();
      expect(result).toEqual({
        output: 'cached result with token usage',
        cached: true,
        tokenUsage: {
          cached: 25,
          total: 25,
        },
      });
    });

    it('should preserve cached=false for fresh results with token usage', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);
      mockRunPython.mockResolvedValue({
        output: 'fresh result with token usage',
        tokenUsage: {
          prompt: 12,
          completion: 18,
          total: 30,
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: 'fresh result with token usage',
        cached: false,
        tokenUsage: {
          prompt: 12,
          completion: 18,
          total: 30,
        },
      });
    });

    it('should handle missing token usage in cached results', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: jest.fn().mockResolvedValue(
          JSON.stringify({
            output: 'cached result with no token usage',
          }),
        ),
        set: jest.fn(),
      };
      jest.mocked(mockGetCache).mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockRunPython).not.toHaveBeenCalled();
      expect(result.tokenUsage).toBeUndefined();
      expect(result.cached).toBe(true);
    });

    it('should handle zero token usage in cached results', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: jest.fn().mockResolvedValue(
          JSON.stringify({
            output: 'cached result with zero token usage',
            tokenUsage: {
              prompt: 0,
              completion: 0,
              total: 0,
            },
          }),
        ),
        set: jest.fn(),
      };
      jest.mocked(mockGetCache).mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockRunPython).not.toHaveBeenCalled();
      expect(result.tokenUsage).toEqual({
        cached: 0,
        total: 0,
      });
      expect(result.cached).toBe(true);
    });

    it('should not cache results with errors', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);
      mockRunPython.mockResolvedValue({
        error: 'This is an error message',
        output: null,
      });

      await provider.callApi('test prompt');

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should properly use different cache keys for different function names', async () => {
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);
      mockRunPython.mockResolvedValue({ output: 'test output' });

      // Create providers with different function names
      const defaultProvider = new PythonProvider('script.py');
      const customProvider = new PythonProvider('script.py:custom_function');

      // Call the APIs with the same prompt
      await defaultProvider.callApi('test prompt');
      await customProvider.callApi('test prompt');

      // Verify different cache keys were used
      const cacheSetCalls = mockCache.set.mock.calls;
      expect(cacheSetCalls).toHaveLength(2);

      // The first call should contain 'default' in the cache key
      expect(cacheSetCalls[0][0]).toContain(':default:');

      // The second call should contain the custom function name
      expect(cacheSetCalls[1][0]).toContain(':custom_function:');
    });
  });
});
