import { OAuth2Client } from 'google-auth-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateGoogleCost } from '../../../src/providers/google/util';
import { VertexChatProvider, VertexEmbeddingProvider } from '../../../src/providers/google/vertex';
import { mockProcessEnv } from '../../util/utils';
import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';

function mockRequest(provider: VertexEmbeddingProvider, data: unknown) {
  const request = vi.fn().mockResolvedValue({ data });
  vi.spyOn(provider, 'getClientWithCredentials').mockResolvedValue({
    request,
    transporter: { defaults: {} },
  } as unknown as JSONClient);
  vi.spyOn(provider, 'getProjectId').mockResolvedValue('test-project');
  return request;
}

let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = mockProcessEnv({
    VERTEX_REGION: undefined,
    GOOGLE_CLOUD_LOCATION: undefined,
    VERTEX_API_HOST: undefined,
    REQUEST_TIMEOUT_MS: '5000',
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreEnv();
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
      ).toEqual({
        embedding: [0.3, 0.4],
        tokenUsage: { total: 3, prompt: 3, numRequests: 1 },
        cost: expect.closeTo(0.0000006, 12),
      });
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

  it.each([
    { name: 'prompt-only usage', usage: { promptTokenCount: 1000 }, config: {}, cost: 0.0002 },
    {
      name: 'input usage rather than total',
      usage: { promptTokenCount: 1000, totalTokenCount: 9000 },
      config: { region: 'eu' },
      cost: 0.0002,
    },
    { name: 'zero usage', usage: { promptTokenCount: 0 }, config: {}, cost: 0 },
    { name: 'unknown input usage', usage: { totalTokenCount: 1000 }, config: {}, cost: undefined },
    { name: 'absent usage', usage: undefined, config: {}, cost: undefined },
    {
      name: 'input cost override',
      usage: { promptTokenCount: 1000 },
      config: { inputCost: 0.000001 },
      cost: 0.001,
    },
    {
      name: 'cost override',
      usage: { promptTokenCount: 1000 },
      config: { cost: 0.000002 },
      cost: 0.002,
    },
    {
      name: 'zero cost override',
      usage: { promptTokenCount: 1000 },
      config: { inputCost: 0 },
      cost: 0,
    },
  ])('reports Embedding 2 cost for $name', async ({ usage, config, cost }) => {
    const provider = new VertexEmbeddingProvider('gemini-embedding-2', { config });
    mockRequest(provider, { embedding: { values: [0.1] }, usageMetadata: usage });
    const result = await provider.callEmbeddingApi('text');
    if (cost === undefined) {
      expect(result.cost).toBeUndefined();
    } else {
      expect(result.cost).toBeCloseTo(cost, 12);
    }
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

describe('Vertex embedding SDK cancellation', () => {
  function createSdkProvider(model = 'gemini-embedding-2') {
    const provider = new VertexEmbeddingProvider(model);
    const data =
      model === 'gemini-embedding-2'
        ? { embedding: { values: [0.1, 0.2] } }
        : { predictions: [{ embeddings: { values: [0.1, 0.2] } }] };
    const adapter = vi.fn().mockResolvedValue({ data, status: 200, headers: new Headers() });
    const client = new OAuth2Client({ transporterOptions: { adapter } });
    client.setCredentials({ access_token: 'test-token', expiry_date: Date.now() + 3_600_000 });
    vi.spyOn(provider, 'getClientWithCredentials').mockResolvedValue(
      client as unknown as JSONClient,
    );
    vi.spyOn(provider, 'getProjectId').mockResolvedValue('test-project');
    return { provider, client, adapter };
  }

  it.each([
    ['gemini-embedding-001', 'credential lookup'],
    ['gemini-embedding-2', 'credential lookup'],
    ['gemini-embedding-001', 'project lookup'],
    ['gemini-embedding-2', 'project lookup'],
    ['gemini-embedding-001', 'OAuth refresh'],
    ['gemini-embedding-2', 'OAuth refresh'],
  ])('stops waiting for %s during %s without late dispatch', async (model, phase) => {
    vi.useFakeTimers();
    const { provider, client, adapter } = createSdkProvider(model);
    const controller = new AbortController();
    const reason = new Error('evaluation cancelled');
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waitForAuth = async () => {
      entered();
      await gate;
    };
    if (phase === 'credential lookup') {
      vi.mocked(provider.getClientWithCredentials).mockImplementationOnce(async () => {
        await waitForAuth();
        return client as unknown as JSONClient;
      });
    } else if (phase === 'project lookup') {
      vi.mocked(provider.getProjectId).mockImplementationOnce(async () => {
        await waitForAuth();
        return 'test-project';
      });
    } else {
      client.setCredentials({ access_token: 'expired-token', expiry_date: Date.now() - 1 });
      client.refreshHandler = async () => {
        await waitForAuth();
        return { access_token: 'refreshed-token', expiry_date: Date.now() + 3_600_000 };
      };
    }

    const rejected = vi.fn();
    const pending = provider
      .callEmbeddingApi('text', undefined, { abortSignal: controller.signal })
      .catch(rejected);
    try {
      await started;
      controller.abort(reason);
      await vi.advanceTimersByTimeAsync(0);
      expect(rejected).toHaveBeenCalledExactlyOnceWith(reason);
      expect(adapter).not.toHaveBeenCalled();
    } finally {
      release();
      await pending;
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(adapter).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, 1000])('preserves SDK timeout %s before the fallback', async (timeout) => {
    const { provider, client, adapter } = createSdkProvider();
    client.transporter.defaults.timeout = timeout;

    await provider.callEmbeddingApi('text');

    expect(adapter.mock.calls[0][0].timeout).toBe(timeout ?? 5000);
    expect(client.transporter.defaults.timeout).toBe(timeout);
  });

  it('preserves the configured SDK adapter for an uncancelled request', async () => {
    const { provider, adapter } = createSdkProvider();
    const controller = new AbortController();

    const result = await provider.callEmbeddingApi('text', undefined, {
      abortSignal: controller.signal,
    });

    expect(result.embedding).toEqual([0.1, 0.2]);
    expect(adapter).toHaveBeenCalledOnce();
    expect(adapter.mock.calls[0][0].headers.get('authorization')).toBe('Bearer test-token');
  });

  it('keeps cancellation isolated between requests sharing an OAuth client', async () => {
    const { provider, client, adapter } = createSdkProvider();
    const cancelled = new AbortController();
    const active = new AbortController();
    const reason = new Error('only one evaluation cancelled');
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let refreshes = 0;
    client.setCredentials({ access_token: 'expired-token', expiry_date: Date.now() - 1 });
    client.refreshHandler = async () => {
      if (++refreshes === 2) {
        entered();
      }
      await gate;
      return { access_token: 'refreshed-token', expiry_date: Date.now() + 3_600_000 };
    };
    const first = provider.callEmbeddingApi('cancelled', undefined, {
      abortSignal: cancelled.signal,
    });
    const second = provider.callEmbeddingApi('active', undefined, { abortSignal: active.signal });
    const settled = Promise.allSettled([first, second]);
    await started;
    cancelled.abort(reason);
    release();
    const results = await settled;

    expect(results[0]).toEqual({ status: 'rejected', reason });
    expect(results[1].status).toBe('fulfilled');
    expect(adapter).toHaveBeenCalledOnce();
    expect(adapter.mock.calls[0][0].data.content.parts[0].text).toBe('active');
    expect(client.transporter.defaults.adapter).toBe(adapter);
  });

  it.each(['caller', 'timeout'])(
    'preserves %s cancellation after a timed-out SDK retry backoff',
    async (source) => {
      vi.useFakeTimers();
      const { provider, client } = createSdkProvider();
      const caller = new AbortController();
      const firstDeadline = new AbortController();
      const retryDeadline = new AbortController();
      const reason = new Error(`${source} cancelled`);
      vi.spyOn(AbortSignal, 'timeout')
        .mockReturnValueOnce(firstDeadline.signal)
        .mockReturnValueOnce(retryDeadline.signal);
      let entered!: () => void;
      let retrySignal: AbortSignal | undefined;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({}, { status: 503 }))
        .mockImplementationOnce(
          async (_url, options) =>
            new Promise((_resolve, reject) => {
              retrySignal = options?.signal ?? undefined;
              retrySignal?.addEventListener('abort', () => reject(retrySignal!.reason), {
                once: true,
              });
              entered();
            }),
        );
      delete client.transporter.defaults.adapter;
      client.transporter.defaults.fetchImplementation = fetchMock;
      client.transporter.defaults.retryConfig = {
        retry: 1,
        httpMethodsToRetry: ['POST'],
        retryBackoff: async () => {
          firstDeadline.abort(new DOMException('attempt timed out', 'TimeoutError'));
        },
      };

      const pending = provider.callEmbeddingApi('text', undefined, {
        abortSignal: caller.signal,
      });
      const rejected = expect(pending).rejects.toThrow(reason.message);
      try {
        await started;
        (source === 'caller' ? caller : retryDeadline).abort(reason);
        await rejected;
        expect(retrySignal?.aborted).toBe(true);
        expect(retrySignal?.reason).toBe(reason);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(caller.signal.aborted).toBe(source === 'caller');
      } finally {
        retryDeadline.abort(reason);
        await vi.advanceTimersByTimeAsync(0);
      }
    },
  );

  it.each(['caller', 'timeout'])('preserves %s cancellation after dispatch', async (source) => {
    const { provider, adapter } = createSdkProvider();
    const caller = new AbortController();
    const deadline = new AbortController();
    const reason = new Error(`${source} cancelled`);
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    adapter.mockImplementation(
      async ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          entered();
        }),
    );
    const pending = provider.callEmbeddingApi('text', undefined, { abortSignal: caller.signal });
    const rejected = expect(pending).rejects.toThrow(reason.message);
    await started;
    (source === 'caller' ? caller : deadline).abort(reason);
    await rejected;

    expect(adapter).toHaveBeenCalledOnce();
    expect(AbortSignal.timeout).toHaveBeenCalledWith(expect.any(Number));
    expect(caller.signal.aborted).toBe(source === 'caller');
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
