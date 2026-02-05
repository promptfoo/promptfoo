import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../src/cache';
import { RubyProvider } from '../../src/providers/rubyCompletion';
import * as rubyUtils from '../../src/ruby/rubyUtils';
import { runRuby } from '../../src/ruby/rubyUtils';

const fsMocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
}));

const pathMocks = vi.hoisted(() => {
  const actualPath = require('path') as typeof import('path');
  return {
    extname: vi.fn(actualPath.extname),
    resolve: vi.fn(actualPath.resolve),
  };
});

vi.mock('../../src/ruby/rubyUtils', async () => {
  const actual = await vi.importActual<typeof import('../../src/ruby/rubyUtils')>(
    '../../src/ruby/rubyUtils',
  );
  return {
    ...actual,
    runRuby: vi.fn(),
  };
});

vi.mock('../../src/cache', async () => {
  const actual = await vi.importActual<typeof import('../../src/cache')>('../../src/cache');
  return {
    ...actual,
    getCache: vi.fn(),
    isCacheEnabled: vi.fn(),
  };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    ...fsMocks,
    default: { ...actual, ...fsMocks },
  };
});

vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    ...pathMocks,
    default: { ...actual, ...pathMocks },
  };
});

vi.mock('../../src/util', async () => {
  const actual = await vi.importActual<typeof import('../../src/util')>('../../src/util');
  return {
    ...actual,
    parsePathOrGlob: vi.fn((_basePath, runPath) => {
      // Handle the special case for testing function names
      if (runPath === 'script.rb:custom_function') {
        return {
          filePath: 'script.rb',
          functionName: 'custom_function',
          isPathPattern: false,
          extension: '.rb',
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

describe('RubyProvider', () => {
  const mockRunRuby = vi.mocked(runRuby);
  const mockGetCache = vi.mocked(vi.mocked(getCache));
  const mockIsCacheEnabled = vi.mocked(isCacheEnabled);
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  const mockResolve = vi.mocked(path.resolve);

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocked implementations to avoid test interference
    mockRunRuby.mockReset();
    // Reset Ruby state to avoid test interference
    rubyUtils.state.cachedRubyPath = null;
    rubyUtils.state.validationPromise = null;
    rubyUtils.state.validatingPath = null;
    mockGetCache.mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
    } as never);
    mockIsCacheEnabled.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('mock file content');
    mockResolve.mockReturnValue('/absolute/path/to/script.rb');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      const provider = new RubyProvider('script.rb', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });

    it('should initialize with ruby: syntax', () => {
      const provider = new RubyProvider('ruby:script.rb', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });

    it('should initialize with file:// prefix', () => {
      const provider = new RubyProvider('file://script.rb', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });

    it('should initialize with file:// prefix and function name', () => {
      const provider = new RubyProvider('file://script.rb:function_name', {
        id: 'testId',
        config: { basePath: '/base' },
      });
      expect(provider.id()).toBe('testId');
    });
  });

  describe('callApi', () => {
    it('should call executeRubyScript with correct parameters', async () => {
      const provider = new RubyProvider('script.rb');
      mockRunRuby.mockResolvedValue({ output: 'test output' });

      const result = await provider.callApi('test prompt', { someContext: true } as any);

      expect(mockRunRuby).toHaveBeenCalledWith(
        expect.any(String),
        'call_api',
        ['test prompt', { config: {} }, { someContext: true }],
        { rubyExecutable: undefined },
      );
      expect(result).toEqual({ output: 'test output', cached: false });
    });

    describe('error handling', () => {
      it('should throw a specific error when Ruby script returns invalid result', async () => {
        const provider = new RubyProvider('script.rb');
        mockRunRuby.mockResolvedValue({ invalidKey: 'invalid value' });

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Ruby script `call_api` function must return a hash with an `output` string/object or `error` string, instead got: {"invalidKey":"invalid value"}',
        );
      });

      it('should not throw an error when Ruby script returns a valid error', async () => {
        const provider = new RubyProvider('script.rb');
        mockRunRuby.mockResolvedValue({ error: 'valid error message' });

        await expect(provider.callApi('test prompt')).resolves.not.toThrow();
      });

      it('should throw an error when Ruby script returns null', async () => {
        const provider = new RubyProvider('script.rb');
        mockRunRuby.mockResolvedValue(null as never);

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Ruby script `call_api` function must return a hash with an `output` string/object or `error` string, instead got: null',
        );
      });

      it('should throw an error when Ruby script returns a non-object', async () => {
        const provider = new RubyProvider('script.rb');
        mockRunRuby.mockResolvedValue('string result');

        await expect(provider.callApi('test prompt')).rejects.toThrow(
          'The Ruby script `call_api` function must return a hash with an `output` string/object or `error` string, instead got: "string result"',
        );
      });

      it('should not throw an error when Ruby script returns a valid output', async () => {
        const provider = new RubyProvider('script.rb');
        mockRunRuby.mockResolvedValue({ output: 'valid output' });

        await expect(provider.callApi('test prompt')).resolves.not.toThrow();
      });
    });
  });

  describe('callEmbeddingApi', () => {
    it('should call executeRubyScript with correct parameters', async () => {
      const provider = new RubyProvider('script.rb');
      mockRunRuby.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

      const result = await provider.callEmbeddingApi('test prompt');

      expect(mockRunRuby).toHaveBeenCalledWith(
        expect.any(String),
        'call_embedding_api',
        ['test prompt', { config: {} }],
        { rubyExecutable: undefined },
      );
      expect(result).toEqual({ embedding: [0.1, 0.2, 0.3] });
    });

    it('should throw an error if Ruby script returns invalid result', async () => {
      const provider = new RubyProvider('script.rb');
      mockRunRuby.mockResolvedValue({ invalidKey: 'invalid value' });

      await expect(provider.callEmbeddingApi('test prompt')).rejects.toThrow(
        'The Ruby script `call_embedding_api` function must return a hash with an `embedding` array or `error` string, instead got {"invalidKey":"invalid value"}',
      );
    });
  });

  describe('callClassificationApi', () => {
    it('should call executeRubyScript with correct parameters', async () => {
      const provider = new RubyProvider('script.rb');
      mockRunRuby.mockResolvedValue({ classification: { label: 'test', score: 0.9 } });

      const result = await provider.callClassificationApi('test prompt');

      expect(mockRunRuby).toHaveBeenCalledWith(
        expect.any(String),
        'call_classification_api',
        ['test prompt', { config: {} }],
        { rubyExecutable: undefined },
      );
      expect(result).toEqual({ classification: { label: 'test', score: 0.9 } });
    });

    it('should throw an error if Ruby script returns invalid result', async () => {
      const provider = new RubyProvider('script.rb');
      mockRunRuby.mockResolvedValue({ invalidKey: 'invalid value' });

      await expect(provider.callClassificationApi('test prompt')).rejects.toThrow(
        'The Ruby script `call_classification_api` function must return a hash with a `classification` object or `error` string, instead of {"invalidKey":"invalid value"}',
      );
    });
  });

  describe('caching', () => {
    it('should use cached result when available', async () => {
      const provider = new RubyProvider('script.rb');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: vi.fn().mockResolvedValue(JSON.stringify({ output: 'cached result' })),
        set: vi.fn(),
      };
      vi.mocked(mockGetCache).mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockCache.get).toHaveBeenCalledWith(
        'ruby:script.rb:default:call_api:5633d479dfae75ba7a78914ee380fa202bd6126e7c6b7c22e3ebc9e1a6ddc871:test prompt:undefined:undefined',
      );
      expect(mockRunRuby).not.toHaveBeenCalled();
      expect(result).toEqual({ output: 'cached result', cached: true });
    });

    it('should cache result when cache is enabled', async () => {
      const provider = new RubyProvider('script.rb');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);
      mockRunRuby.mockResolvedValue({ output: 'new result' });

      await provider.callApi('test prompt');

      expect(mockCache.set).toHaveBeenCalledWith(
        'ruby:script.rb:default:call_api:5633d479dfae75ba7a78914ee380fa202bd6126e7c6b7c22e3ebc9e1a6ddc871:test prompt:undefined:undefined',
        '{"output":"new result"}',
      );
    });

    it('should properly transform token usage in cached results', async () => {
      const provider = new RubyProvider('script.rb');
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
      vi.mocked(mockGetCache).mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockRunRuby).not.toHaveBeenCalled();
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
      const provider = new RubyProvider('script.rb');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);
      mockRunRuby.mockResolvedValue({
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
      const provider = new RubyProvider('script.rb');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: vi.fn().mockResolvedValue(
          JSON.stringify({
            output: 'cached result with no token usage',
          }),
        ),
        set: vi.fn(),
      };
      vi.mocked(mockGetCache).mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockRunRuby).not.toHaveBeenCalled();
      expect(result.tokenUsage).toBeUndefined();
      expect(result.cached).toBe(true);
    });

    it('should handle zero token usage in cached results', async () => {
      const provider = new RubyProvider('script.rb');
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
      vi.mocked(mockGetCache).mockResolvedValue(mockCache as never);

      const result = await provider.callApi('test prompt');

      expect(mockRunRuby).not.toHaveBeenCalled();
      expect(result.tokenUsage).toEqual({
        cached: 0,
        total: 0,
        numRequests: 1,
      });
      expect(result.cached).toBe(true);
    });

    it('should not cache results with errors', async () => {
      const provider = new RubyProvider('script.rb');
      mockIsCacheEnabled.mockReturnValue(true);
      const mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };
      mockGetCache.mockResolvedValue(mockCache as never);
      mockRunRuby.mockResolvedValue({
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
      mockRunRuby.mockResolvedValue({ output: 'test output' });

      // Create providers with different function names
      const defaultProvider = new RubyProvider('script.rb');
      const customProvider = new RubyProvider('script.rb:custom_function');

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
