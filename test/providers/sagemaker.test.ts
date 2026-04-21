import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';

// Use vi.hoisted to create mock functions that can be used in vi.mock factories
const { mockSend, mockCacheGet, mockCacheSet, mockIsCacheEnabled } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockCacheGet: vi.fn(),
  mockCacheSet: vi.fn(),
  mockIsCacheEnabled: vi.fn(),
}));

// Create a mock cache object that uses the hoisted mock functions
const mockCacheObject = {
  get: mockCacheGet,
  set: mockCacheSet,
};

// Mock the cache module - this will be used by the dynamic import
vi.mock('../../src/cache', () => ({
  getCache: vi.fn().mockReturnValue(mockCacheObject),
  isCacheEnabled: mockIsCacheEnabled,
}));

// Mock AWS SDK
vi.mock('@aws-sdk/client-sagemaker-runtime', () => ({
  SageMakerRuntimeClient: vi.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  InvokeEndpointCommand: vi.fn().mockImplementation((params) => params),
}));

import {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';

describe('SageMakerCompletionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCacheEnabled.mockReturnValue(false);
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockSend.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('cache flag behavior', () => {
    it('should set cached flag when returning cached response from callApi', async () => {
      const mockCachedResponse = {
        output: 'cached sagemaker response',
        tokenUsage: { total: 50, prompt: 20, completion: 30 },
      };

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));
      mockIsCacheEnabled.mockReturnValue(true);

      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.cached).toBe(true);
      expect(result.output).toBe('cached sagemaker response');
      expect(mockCacheGet).toHaveBeenCalled();
      // Verify tokenUsage.cached is set for cached results
      expect(result.tokenUsage?.cached).toBe(50);
      // Verify API was not called
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should preserve metadata with transformed prompt when returning cached response', async () => {
      const mockCachedResponse = {
        output: 'cached response with metadata',
        tokenUsage: { total: 100 },
        metadata: {
          transformed: true,
          originalPrompt: 'original prompt',
        },
      };

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));
      mockIsCacheEnabled.mockReturnValue(true);

      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result.cached).toBe(true);
      expect(result.metadata?.transformed).toBe(true);
      expect(result.metadata?.originalPrompt).toBe('original prompt');
    });
  });

  describe('payload formatting', () => {
    it('accepts function transforms in config without validation warnings', () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const transformFn = (output: unknown) => String(output).trim();

      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: transformFn,
        },
      });

      expect(provider.transform).toBe(transformFn);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('applies a direct TransformFunction to the prompt via applyTransformation', async () => {
      const transformFn = (prompt: unknown) => `TRANSFORMED:${String(prompt).trim()}`;
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: transformFn,
        },
      });

      const transformed = await provider.applyTransformation('  hello  ');
      expect(transformed).toBe('TRANSFORMED:hello');
    });

    it('evaluates inline string arrow transforms with `prompt` as the identifier', async () => {
      // Pins down why the inline-string branch stays local to sagemaker.ts:
      // the shared util would rename `prompt` to `output` and break user configs.
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: '(prompt) => prompt.toUpperCase()',
        },
      });

      const transformed = await provider.applyTransformation('hello world');
      expect(transformed).toBe('HELLO WORLD');
    });

    it('awaits async inline string arrow transforms', async () => {
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: 'async (prompt) => `${prompt}!`',
        },
      });

      await expect(provider.applyTransformation('hello')).resolves.toBe('hello!');
    });

    it('rethrows errors from a function transform instead of silently running against the untransformed prompt', async () => {
      // Contract change in PR #8441: a user-supplied TransformFunction that throws
      // is a programming error and must surface — string/file transforms keep their
      // legacy best-effort behavior for backward compatibility.
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: (() => {
            throw new Error('boom in transform');
          }) as (prompt: unknown) => string,
        },
      });

      await expect(provider.applyTransformation('hello')).rejects.toThrow('boom in transform');
    });

    it('swallows errors from inline string transforms (legacy best-effort behavior)', async () => {
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: `(prompt) => { throw new Error('string boom'); }`,
        },
      });

      // String transforms preserve the legacy contract: log and fall back to the
      // original prompt. This test guards that we didn't over-rotate the rethrow.
      await expect(provider.applyTransformation('hello')).resolves.toBe('hello');
    });
  });

  describe('callApi with function transforms', () => {
    it('surfaces function-transform failures as a ProviderResponse.error without double-labeling', async () => {
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: (() => {
            throw new Error('transform boom');
          }) as (prompt: unknown) => string,
        },
      });

      const result = await provider.callApi('hello');
      expect(result.output).toBeUndefined();
      // The response error unwraps `transform()`'s wrapper so the user sees a
      // single `SageMaker transform error: <raw>` with no double-labeling.
      // Pin the exact shape rather than negating the wrapper's internal format.
      expect(result.error).toMatch(/^SageMaker transform error: transform boom$/);
    });

    it('falls back to the original prompt when a function transform returns undefined', async () => {
      // `stringifyTransformResult` returns undefined for null/undefined return values,
      // which causes `applyTransformation` to fall back to the original prompt with a
      // debug log. Guard this observable behavior so a future refactor doesn't turn
      // it into an error by accident.
      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'custom',
          transform: (() => undefined) as unknown as (prompt: unknown) => string,
        },
      });

      await expect(provider.applyTransformation('original-prompt')).resolves.toBe(
        'original-prompt',
      );
    });

    it('preserves an explicit maxTokens value of 0', () => {
      vi.stubEnv('AWS_SAGEMAKER_MAX_TOKENS', '1024');

      const provider = new SageMakerCompletionProvider('test-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'openai',
          maxTokens: 0,
        },
      });

      const payload = JSON.parse(provider.formatPayload('Hello'));

      expect(payload.max_tokens).toBe(0);
    });
  });
});

describe('SageMakerEmbeddingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCacheEnabled.mockReturnValue(false);
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockSend.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('cache flag behavior', () => {
    it('should set cached flag when returning cached response from callEmbeddingApi', async () => {
      const mockCachedResponse = {
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        tokenUsage: { prompt: 10, total: 10 },
      };

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));
      mockIsCacheEnabled.mockReturnValue(true);

      const provider = new SageMakerEmbeddingProvider('test-embedding-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'openai',
        },
      });

      const result = await provider.callEmbeddingApi('test input');

      expect(result.cached).toBe(true);
      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(mockCacheGet).toHaveBeenCalled();
      // Verify tokenUsage.cached is set for cached results
      expect(result.tokenUsage?.cached).toBe(10);
      // Verify API was not called
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should preserve all embedding response fields when returning cached response', async () => {
      const mockCachedResponse = {
        embedding: [0.1, 0.2],
        tokenUsage: { prompt: 5, total: 5 },
        cost: 0.0001,
        latencyMs: 150,
      };

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));
      mockIsCacheEnabled.mockReturnValue(true);

      const provider = new SageMakerEmbeddingProvider('test-embedding-endpoint', {
        config: {
          region: 'us-east-1',
          modelType: 'openai',
        },
      });

      const result = await provider.callEmbeddingApi('test input');

      expect(result.cached).toBe(true);
      expect(result.embedding).toEqual([0.1, 0.2]);
      expect(result.cost).toBe(0.0001);
      expect(result.latencyMs).toBe(150);
    });
  });
});
