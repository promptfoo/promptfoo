import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateGoogleCost } from '../../../src/providers/google/util';
import { VertexChatProvider, VertexEmbeddingProvider } from '../../../src/providers/google/vertex';
import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';

function mockRequest(provider: VertexEmbeddingProvider, data: unknown) {
  const request = vi.fn().mockResolvedValue({ data });
  vi.spyOn(provider, 'getClientWithCredentials').mockResolvedValue({
    request,
  } as unknown as JSONClient);
  vi.spyOn(provider, 'getProjectId').mockResolvedValue('test-project');
  return request;
}

beforeEach(() => {
  vi.stubEnv('VERTEX_REGION', undefined);
  vi.stubEnv('GOOGLE_CLOUD_LOCATION', undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Vertex embeddings request contracts', () => {
  it('passes task, title, dimensions and truncation to text prediction models', async () => {
    const provider = new VertexEmbeddingProvider('gemini-embedding-001', {
      config: {
        taskType: 'RETRIEVAL_DOCUMENT',
        title: 'Manual',
        outputDimensionality: 768,
        autoTruncate: true,
      },
    });
    const request = mockRequest(provider, {
      predictions: [{ embeddings: { values: [0.1, 0.2], statistics: { token_count: 4 } } }],
    });
    expect(await provider.callEmbeddingApi('document text')).toEqual({
      embedding: [0.1, 0.2],
      tokenUsage: { total: 4, numRequests: 1 },
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-embedding-001:predict',
        method: 'POST',
        timeout: expect.any(Number),
        data: {
          instances: [
            { content: 'document text', task_type: 'RETRIEVAL_DOCUMENT', title: 'Manual' },
          ],
          parameters: { autoTruncate: true, outputDimensionality: 768 },
        },
      }),
    );
  });

  it.each(['gemini-embedding-2', 'gemini-embedding-2-preview'])(
    'uses embedContent and usage metadata for %s',
    async (model) => {
      const provider = new VertexEmbeddingProvider(model, {
        config: { outputDimensionality: 768 },
      });
      const request = mockRequest(provider, {
        embedding: { values: [0.3, 0.4] },
        usageMetadata: { promptTokenCount: 3, totalTokenCount: 3 },
      });
      const controller = new AbortController();
      expect(
        await provider.callEmbeddingApi('task: search result | query: text', undefined, {
          abortSignal: controller.signal,
        }),
      ).toEqual({ embedding: [0.3, 0.4], tokenUsage: { total: 3, prompt: 3, numRequests: 1 } });
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: `https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/${model}:embedContent`,
          data: {
            content: { parts: [{ text: 'task: search result | query: text' }] },
            embedContentConfig: { outputDimensionality: 768 },
          },
          signal: controller.signal,
        }),
      );
    },
  );

  it('does not invent token usage when embedContent omits metadata', async () => {
    const provider = new VertexEmbeddingProvider('gemini-embedding-2');
    const request = mockRequest(provider, { embedding: { values: [0.1] } });
    const result = await provider.callEmbeddingApi('text');
    expect(result.tokenUsage?.total).toBeUndefined();
    expect(request.mock.calls[0][0].data).toEqual({ content: { parts: [{ text: 'text' }] } });
  });

  it.each([{ taskType: 'RETRIEVAL_QUERY' }, { title: 'Title' }, { autoTruncate: false }])(
    'rejects unsupported Embedding 2 config before authentication: %j',
    async (config) => {
      const provider = new VertexEmbeddingProvider('gemini-embedding-2', { config });
      const request = mockRequest(provider, {});
      await expect(provider.callEmbeddingApi('text')).rejects.toThrow('does not support');
      expect(provider.getClientWithCredentials).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each([{}, { embedding: { values: [] } }])(
    'rejects missing or empty vectors: %j',
    async (data) => {
      const provider = new VertexEmbeddingProvider('gemini-embedding-2');
      mockRequest(provider, data);
      await expect(provider.callEmbeddingApi('text')).rejects.toThrow('No valid embeddings');
    },
  );

  it('preserves API failures and cancellation', async () => {
    const provider = new VertexEmbeddingProvider('gemini-embedding-2');
    const request = mockRequest(provider, {});
    request.mockRejectedValue(new Error('permission denied'));
    await expect(provider.callEmbeddingApi('text')).rejects.toThrow('permission denied');
    const controller = new AbortController();
    controller.abort(new Error('evaluation cancelled'));
    await expect(
      provider.callEmbeddingApi('text', undefined, { abortSignal: controller.signal }),
    ).rejects.toThrow('evaluation cancelled');
  });

  it('preserves explicit and provider-scoped locations and host overrides', () => {
    const provider = new VertexEmbeddingProvider('gemini-embedding-2', {
      env: { GOOGLE_CLOUD_LOCATION: 'eu' },
    });
    expect(provider.getRegion()).toBe('eu');
    expect(provider.getApiHost()).toBe('aiplatform.eu.rep.googleapis.com');
    const explicit = new VertexEmbeddingProvider('gemini-embedding-2', {
      config: { region: 'us', apiHost: 'custom.example.com' },
      env: { VERTEX_REGION: 'eu' },
    });
    expect(explicit.getRegion()).toBe('us');
    expect(explicit.getApiHost()).toBe('custom.example.com');
  });
});

describe('Vertex Flash Cyber catalog', () => {
  it('defaults to global and keeps the explicit US location', () => {
    expect(new VertexChatProvider('gemini-3.8-flash-cyber').getRegion()).toBe('global');
    expect(
      new VertexChatProvider('gemini-3.8-flash-cyber', { config: { region: 'us' } }).getRegion(),
    ).toBe('us');
  });

  it.each([Date.UTC(2026, 9, 9), Date.UTC(2027, 0, 1)])(
    'uses Vertex rates without the public Flash introductory discount at %s',
    (now) => {
      vi.spyOn(Date, 'now').mockReturnValue(now);
      expect(
        calculateGoogleCost('gemini-3.8-flash-cyber', { region: 'global' }, 1000, 500, true),
      ).toBeCloseTo(0.00525, 10);
      expect(
        calculateGoogleCost('gemini-3.8-flash-cyber', { region: 'us' }, 1000, 500, true),
      ).toBeCloseTo(0.005775, 10);
      expect(calculateGoogleCost('gemini-3.8-flash-cyber', {}, 1000, 500, false)).toBeUndefined();
    },
  );
});

describe('Gemini API redirected model pricing', () => {
  it('prices the native 3.5 alias as 3.6 after the redirect without changing Vertex', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(Date.UTC(2026, 9, 7));
    expect(calculateGoogleCost('gemini-3.5-flash', {}, 1000, 500)).toBeCloseTo(0.006, 10);
    now.mockReturnValue(Date.UTC(2026, 9, 8));
    expect(calculateGoogleCost('gemini-3.5-flash', {}, 1000, 500)).toBeCloseTo(0.002625, 10);
    expect(
      calculateGoogleCost('gemini-3.5-flash', { region: 'global' }, 1000, 500, true),
    ).toBeCloseTo(0.006, 10);
    now.mockReturnValue(Date.UTC(2027, 0, 1));
    expect(calculateGoogleCost('gemini-3.5-flash', {}, 1000, 500)).toBeCloseTo(0.00525, 10);
  });
});
