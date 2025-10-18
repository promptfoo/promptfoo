import fs from 'fs';
import path from 'path';

import { getCache, isCacheEnabled } from '../../src/cache';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import { providerRegistry } from '../../src/providers/providerRegistry';
import * as pythonUtils from '../../src/python/pythonUtils';
import { getEnvInt } from '../../src/python/pythonUtils';
import { PythonWorkerPool } from '../../src/python/workerPool';

jest.mock('../../src/python/pythonUtils');
jest.mock('../../src/python/workerPool');
jest.mock('../../src/cache');
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/util', () => ({
  ...jest.requireActual('../../src/util'),
  parsePathOrGlob: jest.fn((_basePath, runPath) => {
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
  const mockPythonWorkerPool = jest.mocked(PythonWorkerPool);
  const mockGetCache = jest.mocked(jest.mocked(getCache));
  const mockIsCacheEnabled = jest.mocked(isCacheEnabled);
  const mockReadFileSync = jest.mocked(fs.readFileSync);
  const mockResolve = jest.mocked(path.resolve);
  const mockGetEnvInt = jest.mocked(getEnvInt);

  let mockPoolInstance: {
    initialize: jest.Mock;
    execute: jest.Mock;
    getWorkerCount: jest.Mock;
    shutdown: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock pool instance
    mockPoolInstance = {
      initialize: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn(),
      getWorkerCount: jest.fn().mockReturnValue(1),
      shutdown: jest.fn().mockResolvedValue(undefined),
    };

    // Mock the PythonWorkerPool constructor to return our mock instance
    mockPythonWorkerPool.mockImplementation(() => mockPoolInstance as any);

    // Mock getEnvInt to return undefined by default
    mockGetEnvInt.mockReturnValue(undefined);

    // Reset Python state to avoid test interference
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;
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
      mockPoolInstance.execute.mockResolvedValue({ output: 'test output' });

      const result = await provider.callApi('test prompt', { someContext: true } as any);

      expect(mockPoolInstance.execute).toHaveBeenCalledWith('call_api', [
        'test prompt',
        { config: {} },
        { someContext: true },
      ]);
      expect(result).toEqual({ output: 'test output', cached: false });
    });

    describe('error handling', () => {
      it('should throw a specific error when Python script returns invalid result', async () => {
        const provider = new PythonProvider('script.py');
        mockPoolInstance.execute.mockResolvedValue({ invalidKey: 'invalid value' });

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Python script `call_api` function must return a dict with an `output` string/object or `error` string, instead got: {"invalidKey":"invalid value"}',
        );
      });

      it('should not throw an error when Python script returns a valid error', async () => {
        const provider = new PythonProvider('script.py');
        mockPoolInstance.execute.mockResolvedValue({ error: 'valid error message' });

        await expect(provider.callApi('test prompt')).resolves.not.toThrow();
      });

      it('should throw an error when Python script returns null', async () => {
        const provider = new PythonProvider('script.py');
        mockPoolInstance.execute.mockResolvedValue(null as never);

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Python script `call_api` function must return a dict with an `output` string/object or `error` string, instead got: null',
        );
      });

      it('should throw an error when Python script returns a non-object', async () => {
        const provider = new PythonProvider('script.py');
        mockPoolInstance.execute.mockResolvedValue('string result');

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          "Cannot use 'in' operator to search for 'output' in string result",
        );
      });

      it('should not throw an error when Python script returns a valid output', async () => {
        const provider = new PythonProvider('script.py');
        mockPoolInstance.execute.mockResolvedValue({ output: 'valid output' });

        await expect(provider.callApi('test prompt')).resolves.not.toThrow();
      });
    });
  });

  describe('callEmbeddingApi', () => {
    it('should call executePythonScript with correct parameters', async () => {
      const provider = new PythonProvider('script.py');
      mockPoolInstance.execute.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

      const result = await provider.callEmbeddingApi('test prompt');

      expect(mockPoolInstance.execute).toHaveBeenCalledWith('call_embedding_api', [
        'test prompt',
        { config: {} },
      ]);
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3] });
    });

    it('should throw an error if Python script returns invalid result', async () => {
      const provider = new PythonProvider('script.py');
      mockPoolInstance.execute.mockResolvedValue({ invalidKey: 'invalid value' });

      await expect(provider.callEmbeddingApi('test prompt')).rejects.toThrow(
        'The Python script `call_embedding_api` function must return a dict with an `embedding` array or `error` string, instead got {"invalidKey":"invalid value"}',
      );
    });
  });

  describe('callClassificationApi', () => {
    it('should call executePythonScript with correct parameters', async () => {
      const provider = new PythonProvider('script.py');
      mockPoolInstance.execute.mockResolvedValue({ classification: { label: 'test', score: 0.9 } });

      const result = await provider.callClassificationApi('test prompt');

      expect(mockPoolInstance.execute).toHaveBeenCalledWith('call_classification_api', [
        'test prompt',
        { config: {} },
      ]);
      expect(result).toEqual({ classification: { label: 'test', score: 0.9 } });
    });

    it('should throw an error if Python script returns invalid result', async () => {
      const provider = new PythonProvider('script.py');
      mockPoolInstance.execute.mockResolvedValue({ invalidKey: 'invalid value' });

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
      expect(mockPoolInstance.execute).not.toHaveBeenCalled();
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
      mockPoolInstance.execute.mockResolvedValue({ output: 'new result' });

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

      expect(mockPoolInstance.execute).not.toHaveBeenCalled();
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
      mockPoolInstance.execute.mockResolvedValue({
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

      expect(mockPoolInstance.execute).not.toHaveBeenCalled();
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

      expect(mockPoolInstance.execute).not.toHaveBeenCalled();
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
      mockPoolInstance.execute.mockResolvedValue({
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
      mockPoolInstance.execute.mockResolvedValue({ output: 'test output' });

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

  describe('worker pool integration', () => {
    it('should initialize worker pool with default worker count', async () => {
      const provider = new PythonProvider('script.py');
      await provider.initialize();

      // Verify pool was created with correct parameters
      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        1, // default worker count
        undefined, // pythonExecutable
        undefined, // timeout
      );
      expect(mockPoolInstance.initialize).toHaveBeenCalled();
    });

    it('should support configurable worker count via config', async () => {
      const provider = new PythonProvider('script.py', {
        config: {
          basePath: process.cwd(),
          workers: 4,
        },
      });
      await provider.initialize();

      // Verify pool was created with 4 workers
      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        4, // configured worker count
        undefined,
        undefined,
      );
    });

    it('should support configurable worker count via environment variable', async () => {
      // Mock getEnvInt to return 3
      mockGetEnvInt.mockReturnValueOnce(3);

      const provider = new PythonProvider('script.py');
      await provider.initialize();

      // Verify pool was created with 3 workers from env
      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        3, // env worker count
        undefined,
        undefined,
      );
    });

    it('should prioritize config.workers over environment variable', async () => {
      // Mock getEnvInt to return 3
      mockGetEnvInt.mockReturnValueOnce(3);

      const provider = new PythonProvider('script.py', {
        config: {
          basePath: process.cwd(),
          workers: 5,
        },
      });
      await provider.initialize();

      // Verify config takes priority (getEnvInt should not even be called)
      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        5, // config worker count (not env's 3)
        undefined,
        undefined,
      );
    });

    it('should pass pythonExecutable to worker pool', async () => {
      // Reset mock completely
      mockGetEnvInt.mockReset();
      mockGetEnvInt.mockReturnValue(undefined);

      const provider = new PythonProvider('script.py', {
        config: {
          basePath: process.cwd(),
          pythonExecutable: '/usr/bin/python3',
        },
      });
      await provider.initialize();

      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        1,
        '/usr/bin/python3',
        undefined,
      );
    });

    it('should pass timeout to worker pool', async () => {
      // Reset mock completely
      mockGetEnvInt.mockReset();
      mockGetEnvInt.mockReturnValue(undefined);

      const provider = new PythonProvider('script.py', {
        config: {
          basePath: process.cwd(),
          timeout: 300000,
        },
      });
      await provider.initialize();

      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        1,
        undefined,
        300000,
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup worker pool on shutdown', async () => {
      const provider = new PythonProvider('script.py', {
        config: { basePath: process.cwd() },
      });

      await provider.initialize();
      expect((provider as any).pool).not.toBeNull();

      await provider.shutdown();
      expect((provider as any).pool).toBeNull();
      expect(mockPoolInstance.shutdown).toHaveBeenCalled();
    });

    it('should register provider for global cleanup', async () => {
      const provider = new PythonProvider('script.py', {
        config: { basePath: process.cwd() },
      });

      await provider.initialize();

      // Provider should be registered
      expect((providerRegistry as any).providers.has(provider)).toBe(true);

      await provider.shutdown();

      // Should be unregistered
      expect((providerRegistry as any).providers.has(provider)).toBe(false);
    });

    it('should set isInitialized to false after shutdown', async () => {
      const provider = new PythonProvider('script.py', {
        config: { basePath: process.cwd() },
      });

      await provider.initialize();
      expect((provider as any).isInitialized).toBe(true);

      await provider.shutdown();
      expect((provider as any).isInitialized).toBe(false);
    });
  });
});
