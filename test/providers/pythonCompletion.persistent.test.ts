import fs from 'fs';
import path from 'path';

import { PersistentPythonManager } from '../../src/python/persistentPythonManager';
import { PythonProvider } from '../../src/providers/pythonCompletion';

// Mock dependencies
jest.mock('../../src/cache');
jest.mock('../../src/python/persistentPythonManager');
jest.mock('../../src/python/pythonUtils');
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/util', () => ({
  ...jest.requireActual('../../src/util'),
  parsePathOrGlob: jest.fn((basePath, runPath) => ({
    filePath: runPath,
    functionName: undefined,
    isPathPattern: false,
    extension: '.py',
  })),
}));

const mockPersistentManager = jest.mocked(PersistentPythonManager);
const mockFs = jest.mocked(fs);
const mockPath = jest.mocked(path);

describe('PythonProvider Persistent Mode', () => {
  let provider: PythonProvider;
  let mockManagerInstance: jest.Mocked<PersistentPythonManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock file system operations
    mockFs.readFileSync = jest.fn().mockReturnValue('mock file content');
    mockPath.resolve = jest.fn().mockReturnValue('/absolute/path/to/script.py');
    mockPath.relative = jest.fn().mockReturnValue('script.py');
    mockPath.join = jest.fn().mockReturnValue('/path/to/script.py');

    // Mock persistent manager
    mockManagerInstance = {
      initialize: jest.fn().mockResolvedValue(undefined),
      callMethod: jest.fn(),
      shutdown: jest.fn(),
      isHealthy: true,
      stats: {
        isHealthy: true,
        isInitialized: true,
        pendingRequests: 0,
        restartCount: 0,
        processId: 12345,
      },
    } as any;

    mockPersistentManager.mockImplementation(() => mockManagerInstance);

    provider = new PythonProvider('script.py', {
      id: 'test-provider',
      config: { basePath: '/test', persistent: true },
    });
  });

  describe('initialization', () => {
    it('should initialize persistent manager by default', async () => {
      await provider.initialize();

      expect(mockPersistentManager).toHaveBeenCalledWith('/absolute/path/to/script.py', {
        pythonExecutable: undefined,
        persistentIdleTimeout: undefined,
        maxRestarts: undefined,
        concurrency: undefined,
      });
      expect(mockManagerInstance.initialize).toHaveBeenCalled();
    });

    it('should not initialize persistent manager when disabled', async () => {
      provider = new PythonProvider('script.py', {
        id: 'test-provider',
        config: { basePath: '/test', persistent: false },
      });

      await provider.initialize();

      expect(mockPersistentManager).not.toHaveBeenCalled();
    });

    it('should pass configuration to persistent manager', async () => {
      provider = new PythonProvider('script.py', {
        id: 'test-provider',
        config: {
          basePath: '/test',
          pythonExecutable: '/custom/python',
          persistentIdleTimeout: 60000,
          maxRestarts: 5,
          concurrency: 'async',
        },
      });

      await provider.initialize();

      expect(mockPersistentManager).toHaveBeenCalledWith('/absolute/path/to/script.py', {
        pythonExecutable: '/custom/python',
        persistentIdleTimeout: 60000,
        maxRestarts: 5,
        concurrency: 'async',
      });
    });

    it('should handle initialization failures', async () => {
      mockManagerInstance.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(provider.initialize()).rejects.toThrow('Init failed');
      expect(mockManagerInstance.shutdown).toHaveBeenCalled();
    });
  });

  describe('method calls with persistent mode', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should use persistent manager for callApi', async () => {
      mockManagerInstance.callMethod.mockResolvedValue({
        output: 'persistent response',
        cached: false,
      });

      const result = await provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test' },
        vars: { test: 'value' },
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      });

      expect(mockManagerInstance.callMethod).toHaveBeenCalledWith(
        'call_api',
        [
          'test prompt',
          expect.any(Object),
          expect.objectContaining({
            vars: { test: 'value' },
            traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          }),
        ],
        expect.any(Object),
        expect.objectContaining({
          vars: { test: 'value' },
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        }),
      );

      expect(result).toEqual({
        output: 'persistent response',
        cached: false,
      });
    });

    it('should use persistent manager for callEmbeddingApi', async () => {
      mockManagerInstance.callMethod.mockResolvedValue({
        embedding: [0.1, 0.2, 0.3],
      });

      const result = await provider.callEmbeddingApi('test text');

      expect(mockManagerInstance.callMethod).toHaveBeenCalledWith(
        'call_embedding_api',
        ['test text', expect.any(Object)],
        expect.any(Object),
        expect.any(Object),
      );

      expect(result).toEqual({
        embedding: [0.1, 0.2, 0.3],
      });
    });

    it('should use persistent manager for callClassificationApi', async () => {
      mockManagerInstance.callMethod.mockResolvedValue({
        classification: { label: 'positive', confidence: 0.9 },
      });

      const result = await provider.callClassificationApi('test text');

      expect(mockManagerInstance.callMethod).toHaveBeenCalledWith(
        'call_classification_api',
        ['test text', expect.any(Object)],
        expect.any(Object),
        expect.any(Object),
      );

      expect(result).toEqual({
        classification: { label: 'positive', confidence: 0.9 },
      });
    });

    it('should handle custom function names', async () => {
      // First clear the mock to reset call history
      jest.clearAllMocks();

      // Mock parsePathOrGlob to return function name before creating provider
      const { parsePathOrGlob } = require('../../src/util');
      parsePathOrGlob.mockReturnValue({
        filePath: 'script.py',
        functionName: 'custom_function',
        isPathPattern: false,
        extension: '.py',
      });

      provider = new PythonProvider('script.py:custom_function', {
        id: 'test-provider',
        config: { basePath: '/test', persistent: true },
      });

      // Mock manager instance for new provider
      mockManagerInstance = {
        initialize: jest.fn().mockResolvedValue(undefined),
        callMethod: jest.fn(),
        shutdown: jest.fn(),
        isHealthy: true,
        stats: {
          isHealthy: true,
          isInitialized: true,
          pendingRequests: 0,
          restartCount: 0,
          processId: 12345,
        },
      } as any;

      mockPersistentManager.mockImplementation(() => mockManagerInstance);

      await provider.initialize();

      mockManagerInstance.callMethod.mockResolvedValue({
        output: 'custom response',
      });

      await provider.callApi('test prompt');

      expect(mockManagerInstance.callMethod).toHaveBeenCalledWith(
        'custom_function',
        expect.any(Array),
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('fallback behavior', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should fallback to traditional execution when persistent manager is unhealthy', async () => {
      Object.defineProperty(mockManagerInstance, 'isHealthy', { value: false, configurable: true });

      // Mock traditional execution
      const { runPython } = require('../../src/python/pythonUtils');
      runPython.mockResolvedValue({ output: 'fallback response' });

      const _result = await provider.callApi('test prompt');

      expect(mockManagerInstance.callMethod).not.toHaveBeenCalled();
      expect(runPython).toHaveBeenCalled();
    });

    it('should fallback when persistent execution fails', async () => {
      mockManagerInstance.callMethod.mockRejectedValue(new Error('Persistent failed'));

      // Mock traditional execution
      const { runPython } = require('../../src/python/pythonUtils');
      runPython.mockResolvedValue({ output: 'fallback response' });

      const _result = await provider.callApi('test prompt');

      expect(mockManagerInstance.callMethod).toHaveBeenCalled();
      expect(runPython).toHaveBeenCalled();
    });

    it('should log warnings when falling back', async () => {
      mockManagerInstance.callMethod.mockRejectedValue(new Error('Connection lost'));

      const { runPython } = require('../../src/python/pythonUtils');
      runPython.mockResolvedValue({ output: 'fallback response' });

      const loggerSpy = jest.spyOn(require('../../src/logger').default, 'warn');

      await provider.callApi('test prompt');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Persistent mode failed, falling back'),
      );
    });
  });

  describe('context serialization', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should serialize context for persistent execution', async () => {
      mockManagerInstance.callMethod.mockResolvedValue({ output: 'response' });

      const context = {
        prompt: { raw: 'test prompt', label: 'test' },
        vars: { test: 'value' },
        traceparent: '00-trace-id-parent-id-01',
        evaluationId: 'eval-123',
        testCaseId: 'test-456',
        getCache: () => 'non-serializable',
        logger: { info: () => {} } as any,
      };

      await provider.callApi('test prompt', context);

      // Should remove non-serializable properties
      const callArgs = mockManagerInstance.callMethod.mock.calls[0];
      const passedContext = callArgs[3];

      expect(passedContext).toEqual({
        prompt: { raw: 'test prompt', label: 'test' },
        vars: { test: 'value' },
        traceparent: '00-trace-id-parent-id-01',
        evaluationId: 'eval-123',
        testCaseId: 'test-456',
      });

      expect(passedContext).not.toHaveProperty('getCache');
      expect(passedContext).not.toHaveProperty('logger');
    });

    it('should preserve tracing fields', async () => {
      mockManagerInstance.callMethod.mockResolvedValue({ output: 'response' });

      const context = {
        prompt: { raw: 'test prompt', label: 'test' },
        vars: {},
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        tracestate: 'vendor=value',
        evaluationId: 'eval-789',
        testCaseId: 'test-abc',
      };

      await provider.callApi('test prompt', context);

      const callArgs = mockManagerInstance.callMethod.mock.calls[0];
      const passedContext = callArgs[3];

      expect(passedContext).toMatchObject({
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        tracestate: 'vendor=value',
        evaluationId: 'eval-789',
        testCaseId: 'test-abc',
      });
    });
  });

  describe('caching behavior', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should use separate cache keys for persistent mode', async () => {
      const { getCache, isCacheEnabled } = require('../../src/cache');
      const mockCache = { get: jest.fn(), set: jest.fn() };

      getCache.mockResolvedValue(mockCache);
      isCacheEnabled.mockReturnValue(true);
      mockCache.get.mockResolvedValue(null); // No cached result

      mockManagerInstance.callMethod.mockResolvedValue({
        output: 'fresh response',
        cached: false,
      });

      await provider.callApi('test prompt');

      expect(mockCache.get).toHaveBeenCalledWith(expect.stringContaining('python-persistent:'));
    });

    it('should return cached results correctly', async () => {
      const { getCache, isCacheEnabled } = require('../../src/cache');
      const mockCache = { get: jest.fn(), set: jest.fn() };

      getCache.mockResolvedValue(mockCache);
      isCacheEnabled.mockReturnValue(true);

      const cachedResult = {
        output: 'cached response',
        tokenUsage: { total: 100 },
      };

      mockCache.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: 'cached response',
        cached: true,
        tokenUsage: { cached: 100, total: 100 },
      });

      expect(mockManagerInstance.callMethod).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should shutdown persistent manager on cleanup', () => {
      provider.cleanup();

      expect(mockManagerInstance.shutdown).toHaveBeenCalled();
    });

    it('should handle cleanup when no persistent manager exists', () => {
      provider = new PythonProvider('script.py', {
        config: { persistent: false },
      });

      expect(() => provider.cleanup()).not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should validate persistent execution results', async () => {
      // Test that validation error is thrown for invalid persistent results
      // This will cause fallback, so let's test the validation in isolation
      const { isCacheEnabled } = require('../../src/cache');
      isCacheEnabled.mockReturnValue(false);

      mockManagerInstance.callMethod.mockResolvedValue({
        invalid: 'response without output or error',
      });

      // The persistent execution will fail validation and fall back
      // So we test that the fallback happens and a warning is logged
      const { runPython } = require('../../src/python/pythonUtils');
      runPython.mockResolvedValue({ output: 'fallback worked' });

      const result = await provider.callApi('test prompt');
      expect(result).toEqual({ output: 'fallback worked', cached: false });

      // Verify that persistent manager was called but failed validation
      expect(mockManagerInstance.callMethod).toHaveBeenCalled();
      expect(runPython).toHaveBeenCalled();
    });

    it('should handle async/sync compatibility errors', async () => {
      // Disable cache to ensure we hit the fallback
      const { isCacheEnabled } = require('../../src/cache');
      isCacheEnabled.mockReturnValue(false);

      mockManagerInstance.callMethod.mockRejectedValue(
        new Error('RuntimeError: cannot be called from a running event loop'),
      );

      const { runPython } = require('../../src/python/pythonUtils');
      runPython.mockResolvedValue({ output: 'fallback response' });

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({ output: 'fallback response', cached: false });
    });

    it('should preserve error context with tracing information', async () => {
      // Disable cache to ensure we hit the persistent manager
      const { isCacheEnabled } = require('../../src/cache');
      isCacheEnabled.mockReturnValue(false);

      mockManagerInstance.callMethod.mockResolvedValue({
        error: 'Function failed',
        traceparent: '00-trace-id-parent-id-01',
        evaluationId: 'eval-123',
      });

      const result = await provider.callApi('test prompt', {
        prompt: { raw: 'test prompt', label: 'test' },
        vars: {},
        traceparent: '00-trace-id-parent-id-01',
        evaluationId: 'eval-123',
      });

      expect(result).toMatchObject({
        error: 'Function failed',
        traceparent: '00-trace-id-parent-id-01',
        evaluationId: 'eval-123',
      });
    });
  });
});
