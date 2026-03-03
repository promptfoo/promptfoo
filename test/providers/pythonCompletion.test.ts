import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../src/cache';
import cliState from '../../src/cliState';
import logger from '../../src/logger';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { PythonProvider } from '../../src/providers/pythonCompletion';
import * as pythonUtils from '../../src/python/pythonUtils';
import { getConfiguredPythonPath, getEnvInt } from '../../src/python/pythonUtils';
import { PythonWorkerPool } from '../../src/python/workerPool';
import type { Mock } from 'vitest';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../src/python/pythonUtils');
vi.mock('../../src/cache');
vi.mock('fs');
vi.mock('path');
vi.mock('../../src/util', async () => {
  const actual = await vi.importActual<typeof import('../../src/util')>('../../src/util');
  return {
    ...actual,
    parsePathOrGlob: vi.fn((_basePath, runPath) => {
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
  };
});

const workerPoolMocks = vi.hoisted(() => {
  const mockPoolInstance = {
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn(),
    getWorkerCount: vi.fn().mockReturnValue(1),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  const PythonWorkerPoolMock = vi.fn(function () {
    return mockPoolInstance as any;
  });

  return { mockPoolInstance, PythonWorkerPoolMock };
});

vi.mock('../../src/python/workerPool', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    PythonWorkerPool: workerPoolMocks.PythonWorkerPoolMock,
  };
});

describe('PythonProvider', () => {
  const mockPythonWorkerPool = vi.mocked(PythonWorkerPool);
  const mockGetCache = vi.mocked(getCache);
  const mockIsCacheEnabled = vi.mocked(isCacheEnabled);
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  const mockResolve = vi.mocked(path.resolve);
  const mockGetEnvInt = vi.mocked(getEnvInt);
  const mockGetConfiguredPythonPath = vi.mocked(getConfiguredPythonPath);
  const mockPoolInstance = workerPoolMocks.mockPoolInstance as {
    initialize: Mock;
    execute: Mock;
    getWorkerCount: Mock;
    shutdown: Mock;
  };
  const PythonWorkerPoolMock = workerPoolMocks.PythonWorkerPoolMock;

  beforeEach(() => {
    vi.clearAllMocks();
    PythonWorkerPoolMock.mockClear();
    mockPoolInstance.initialize.mockReset();
    mockPoolInstance.initialize.mockResolvedValue(undefined);
    mockPoolInstance.execute.mockReset();
    mockPoolInstance.getWorkerCount.mockReset();
    mockPoolInstance.getWorkerCount.mockReturnValue(1);
    mockPoolInstance.shutdown.mockReset();
    mockPoolInstance.shutdown.mockResolvedValue(undefined);

    // Reset getEnvInt mock implementation (clears mockReturnValueOnce queue)
    mockGetEnvInt.mockReset();
    mockGetEnvInt.mockReturnValue(undefined);

    // Reset getConfiguredPythonPath mock - default to passthrough behavior
    mockGetConfiguredPythonPath.mockReset();
    mockGetConfiguredPythonPath.mockImplementation((configPath) => configPath);

    // Reset Python state to avoid test interference
    pythonUtils.state.cachedPythonPath = null;
    pythonUtils.state.validationPromise = null;
    mockGetCache.mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
    } as never);
    mockIsCacheEnabled.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('mock file content');
    mockResolve.mockReturnValue('/absolute/path/to/script.py');

    // Reset cliState.maxConcurrency before each test
    cliState.maxConcurrency = undefined;
  });

  afterEach(() => {
    // Ensure cliState is cleaned up after each test
    cliState.maxConcurrency = undefined;
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

    it('should not mutate the caller context when sanitizing', async () => {
      const provider = new PythonProvider('script.py');
      mockPoolInstance.execute.mockResolvedValue({ output: 'test output' });

      const originalProvider = {
        id: () => 'test-target',
        callApi: vi.fn(),
      };
      const context: any = {
        someContext: true,
        originalProvider,
        logger: { debug: vi.fn() },
        getCache: vi.fn(),
        filters: { uppercase: () => '' },
      };

      await provider.callApi('test prompt', context);

      // Input context is preserved for callers that reuse it across turns.
      expect(context.originalProvider).toBe(originalProvider);
      expect(context.logger).toBeDefined();
      expect(context.getCache).toBeDefined();
      expect(context.filters).toBeDefined();

      // Python invocation still receives a sanitized context payload.
      expect(mockPoolInstance.execute).toHaveBeenCalledWith('call_api', [
        'test prompt',
        { config: {} },
        { someContext: true },
      ]);
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
        get: vi.fn().mockResolvedValue(JSON.stringify({ output: 'cached result' })),
        set: vi.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);

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
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
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
        get: vi.fn().mockResolvedValue(
          JSON.stringify({
            output: 'cached result with token usage',
            tokenUsage: {
              prompt: 10,
              completion: 15,
              total: 25,
            },
          }),
        ),
        set: vi.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockPoolInstance.execute).not.toHaveBeenCalled();
      expect(result).toEqual({
        output: 'cached result with token usage',
        cached: true,
        tokenUsage: {
          cached: 25,
          total: 25,
          numRequests: 1,
        },
      });
    });

    it('should preserve cached=false for fresh results with token usage', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
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
          numRequests: 1,
        },
      });
    });

    it('should handle missing token usage in cached results', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: vi.fn().mockResolvedValue(
          JSON.stringify({
            output: 'cached result with no token usage',
          }),
        ),
        set: vi.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockPoolInstance.execute).not.toHaveBeenCalled();
      expect(result.tokenUsage).toBeUndefined();
      expect(result.cached).toBe(true);
    });

    it('should handle zero token usage in cached results', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: vi.fn().mockResolvedValue(
          JSON.stringify({
            output: 'cached result with zero token usage',
            tokenUsage: {
              prompt: 0,
              completion: 0,
              total: 0,
            },
          }),
        ),
        set: vi.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockPoolInstance.execute).not.toHaveBeenCalled();
      expect(result.tokenUsage).toEqual({
        cached: 0,
        total: 0,
        numRequests: 1,
      });
      expect(result.cached).toBe(true);
    });

    it('should not cache results with errors', async () => {
      const provider = new PythonProvider('script.py');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
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
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
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

      // Mock getConfiguredPythonPath to return the config value
      mockGetConfiguredPythonPath.mockReturnValue('/usr/bin/python3');

      const provider = new PythonProvider('script.py', {
        config: {
          basePath: process.cwd(),
          pythonExecutable: '/usr/bin/python3',
        },
      });
      await provider.initialize();

      expect(mockGetConfiguredPythonPath).toHaveBeenCalledWith('/usr/bin/python3');
      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        1,
        '/usr/bin/python3',
        undefined,
      );
    });

    it('should use PROMPTFOO_PYTHON when config.pythonExecutable is not set', async () => {
      // Reset mocks
      mockGetEnvInt.mockReset();
      mockGetEnvInt.mockReturnValue(undefined);

      // Mock getConfiguredPythonPath to return the env var value when config is undefined
      mockGetConfiguredPythonPath.mockReturnValue('/venv/bin/python3');

      const provider = new PythonProvider('script.py', {
        config: {
          basePath: process.cwd(),
          // Note: pythonExecutable is NOT set
        },
      });
      await provider.initialize();

      // getConfiguredPythonPath should be called with undefined (no config)
      expect(mockGetConfiguredPythonPath).toHaveBeenCalledWith(undefined);
      // Worker pool should receive the env var value from getConfiguredPythonPath
      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        1,
        '/venv/bin/python3', // from PROMPTFOO_PYTHON via getConfiguredPythonPath
        undefined,
      );
    });

    it('should prioritize config.pythonExecutable over PROMPTFOO_PYTHON', async () => {
      // Reset mocks
      mockGetEnvInt.mockReset();
      mockGetEnvInt.mockReturnValue(undefined);

      // Mock getConfiguredPythonPath to return the config value (simulating priority)
      mockGetConfiguredPythonPath.mockReturnValue('/config/python3');

      const provider = new PythonProvider('script.py', {
        config: {
          basePath: process.cwd(),
          pythonExecutable: '/config/python3',
        },
      });
      await provider.initialize();

      // getConfiguredPythonPath should be called with the config value
      expect(mockGetConfiguredPythonPath).toHaveBeenCalledWith('/config/python3');
      // Worker pool should receive the config value
      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        1,
        '/config/python3',
        undefined,
      );
    });

    it('should pass undefined to worker pool when neither config nor env var is set', async () => {
      // Reset mocks
      mockGetEnvInt.mockReset();
      mockGetEnvInt.mockReturnValue(undefined);

      // Mock getConfiguredPythonPath to return undefined (neither config nor env var set)
      mockGetConfiguredPythonPath.mockReturnValue(undefined);

      const provider = new PythonProvider('script.py', {
        config: {
          basePath: process.cwd(),
        },
      });
      await provider.initialize();

      expect(mockGetConfiguredPythonPath).toHaveBeenCalledWith(undefined);
      expect(mockPythonWorkerPool).toHaveBeenCalledWith(
        expect.stringContaining('script.py'),
        'call_api',
        1,
        undefined, // Falls back to default in worker
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

    describe('cliState.maxConcurrency integration', () => {
      it('should use cliState.maxConcurrency when config and env var are not set', async () => {
        mockGetEnvInt.mockReset();
        mockGetEnvInt.mockReturnValue(undefined);

        // Set cliState.maxConcurrency (simulating -j flag)
        cliState.maxConcurrency = 8;

        const provider = new PythonProvider('script.py');
        await provider.initialize();

        expect(mockPythonWorkerPool).toHaveBeenCalledWith(
          expect.stringContaining('script.py'),
          'call_api',
          8, // from cliState.maxConcurrency
          undefined,
          undefined,
        );
      });

      it('should prioritize PROMPTFOO_PYTHON_WORKERS over cliState.maxConcurrency', async () => {
        mockGetEnvInt.mockReset();
        mockGetEnvInt.mockReturnValue(3); // PROMPTFOO_PYTHON_WORKERS=3

        // Set cliState.maxConcurrency (simulating -j flag)
        cliState.maxConcurrency = 8;

        const provider = new PythonProvider('script.py');
        await provider.initialize();

        // Env var should take priority over cliState
        expect(mockPythonWorkerPool).toHaveBeenCalledWith(
          expect.stringContaining('script.py'),
          'call_api',
          3, // from env var, not cliState's 8
          undefined,
          undefined,
        );
      });

      it('should prioritize config.workers over cliState.maxConcurrency', async () => {
        mockGetEnvInt.mockReset();
        mockGetEnvInt.mockReturnValue(undefined);

        // Set cliState.maxConcurrency (simulating -j flag)
        cliState.maxConcurrency = 8;

        const provider = new PythonProvider('script.py', {
          config: {
            basePath: process.cwd(),
            workers: 2,
          },
        });
        await provider.initialize();

        // config.workers should take priority over cliState
        expect(mockPythonWorkerPool).toHaveBeenCalledWith(
          expect.stringContaining('script.py'),
          'call_api',
          2, // from config, not cliState's 8
          undefined,
          undefined,
        );
      });

      it('should default to 1 worker when cliState.maxConcurrency is undefined', async () => {
        mockGetEnvInt.mockReset();
        mockGetEnvInt.mockReturnValue(undefined);

        // Ensure cliState.maxConcurrency is undefined (default state)
        cliState.maxConcurrency = undefined;

        const provider = new PythonProvider('script.py');
        await provider.initialize();

        expect(mockPythonWorkerPool).toHaveBeenCalledWith(
          expect.stringContaining('script.py'),
          'call_api',
          1, // default when nothing is set
          undefined,
          undefined,
        );
      });

      it('should warn and use 1 when cliState.maxConcurrency is invalid (< 1)', async () => {
        mockGetEnvInt.mockReset();
        mockGetEnvInt.mockReturnValue(undefined);

        // Set invalid cliState.maxConcurrency
        cliState.maxConcurrency = 0;

        const provider = new PythonProvider('script.py');
        await provider.initialize();

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Invalid worker count 0 from -j flag'),
        );
        expect(mockPythonWorkerPool).toHaveBeenCalledWith(
          expect.stringContaining('script.py'),
          'call_api',
          1, // clamped to 1
          undefined,
          undefined,
        );
      });

      it('should warn and use 1 when config.workers is invalid (< 1)', async () => {
        mockGetEnvInt.mockReset();
        mockGetEnvInt.mockReturnValue(undefined);

        const provider = new PythonProvider('script.py', {
          config: {
            basePath: process.cwd(),
            workers: -1,
          },
        });
        await provider.initialize();

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Invalid worker count -1 in config'),
        );
        expect(mockPythonWorkerPool).toHaveBeenCalledWith(
          expect.stringContaining('script.py'),
          'call_api',
          1, // clamped to 1
          undefined,
          undefined,
        );
      });

      it('should warn and use 1 when PROMPTFOO_PYTHON_WORKERS is invalid (< 1)', async () => {
        mockGetEnvInt.mockReset();
        mockGetEnvInt.mockReturnValue(0); // Invalid env var value

        const provider = new PythonProvider('script.py');
        await provider.initialize();

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Invalid worker count 0 in PROMPTFOO_PYTHON_WORKERS'),
        );
        expect(mockPythonWorkerPool).toHaveBeenCalledWith(
          expect.stringContaining('script.py'),
          'call_api',
          1, // clamped to 1
          undefined,
          undefined,
        );
      });
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
