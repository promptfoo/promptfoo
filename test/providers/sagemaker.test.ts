import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
