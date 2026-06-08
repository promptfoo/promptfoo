import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type FetchWithCacheResult, fetchWithCache } from '../../../src/cache';
import {
  createJsonCachedOpenAiClient,
  createOpenAiClient,
  isSdkUploadCapabilityProbe,
} from '../../../src/providers/openai/client';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

const fetchWithCacheMock = vi.mocked(fetchWithCache);

function createCachedResponse(
  data: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' },
): FetchWithCacheResult<unknown> {
  return {
    cached: false,
    data,
    headers,
    status: 200,
    statusText: 'OK',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchWithCacheMock.mockReset();
});

describe('createJsonCachedOpenAiClient', () => {
  it('deduplicates concurrent SDK requests with distinct internal abort controllers', async () => {
    let resolveRequest: (response: FetchWithCacheResult<unknown>) => void = () => {};
    const upstreamRequest = new Promise<FetchWithCacheResult<unknown>>((resolve) => {
      resolveRequest = resolve;
    });
    const noSignal = Symbol('no-signal');
    const inflightRequests = new Map<
      AbortSignal | symbol,
      Promise<FetchWithCacheResult<unknown>>
    >();
    let upstreamRequestCount = 0;

    fetchWithCacheMock.mockImplementation((_url, init = {}) => {
      const headers = new Headers(init.headers);
      const shouldDedupeAbortableRequests = Array.from(headers.keys()).some((headerName) =>
        headerName.startsWith('x-stainless-'),
      );
      const inflightKey = shouldDedupeAbortableRequests ? noSignal : (init.signal ?? noSignal);
      let inflightRequest = inflightRequests.get(inflightKey);
      if (!inflightRequest) {
        upstreamRequestCount += 1;
        inflightRequest = upstreamRequest;
        inflightRequests.set(inflightKey, inflightRequest);
      }
      return inflightRequest;
    });

    const first = createJsonCachedOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
    });
    const second = createJsonCachedOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
    });

    const firstRequest = first.client.models.list();
    const secondRequest = second.client.models.list();

    await vi.waitFor(() => expect(fetchWithCacheMock).toHaveBeenCalledTimes(2));
    expect(upstreamRequestCount).toBe(1);
    expect(fetchWithCacheMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchWithCacheMock.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchWithCacheMock.mock.calls[0][4]).toBe(false);

    resolveRequest(createCachedResponse({ object: 'list', data: [] }));
    const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest]);
    expect(firstResult.data).toEqual([]);
    expect(secondResult.data).toEqual([]);
  });

  it('reconstructs cached JSON with JSON representation headers', async () => {
    fetchWithCacheMock.mockResolvedValue(
      createCachedResponse(
        {
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4o-mini',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello' },
              finish_reason: 'stop',
            },
          ],
        },
        {
          'content-encoding': 'gzip',
          'content-length': '0',
          'content-type': 'text/plain',
          'transfer-encoding': 'chunked',
        },
      ),
    );
    const { client } = createJsonCachedOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://gateway.example.com/v1',
    });

    const { data, response } = await client.chat.completions
      .create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say hello' }],
      })
      .withResponse();

    expect(data.choices[0].message.content).toBe('Hello');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('transfer-encoding')).toBeNull();
  });

  it('preserves caller cancellation while sharing the underlying cache request', async () => {
    fetchWithCacheMock.mockImplementation((_url, init = {}) => {
      return new Promise<FetchWithCacheResult<unknown>>((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    });
    const controller = new AbortController();
    const { client } = createJsonCachedOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
    });

    const request = client.models.list({ signal: controller.signal });
    await vi.waitFor(() => expect(fetchWithCacheMock).toHaveBeenCalledTimes(1));
    expect(fetchWithCacheMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchWithCacheMock.mock.calls[0][4]).toBe(false);

    controller.abort();
    await expect(request).rejects.toThrow(/aborted/i);
  });
});

describe('createOpenAiClient', () => {
  it('disables SDK retries by default', () => {
    const client = createOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
    });

    expect(client.maxRetries).toBe(0);
  });

  it('preserves explicit SDK retry overrides', () => {
    const client = createOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
      maxRetries: 3,
    });

    expect(client.maxRetries).toBe(3);
  });

  it('preserves caller Authorization headers when missing API keys are allowed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ object: 'list', data: [] }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createOpenAiClient({
      allowMissingApiKey: true,
      baseURL: 'https://gateway.example.com/v1',
      fetch: fetchMock as typeof globalThis.fetch,
      headers: {
        Authorization: 'Bearer gateway-token',
      },
    });

    await client.models.list();

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(requestInit.headers).get('authorization')).toBe('Bearer gateway-token');
  });

  it('ignores SDK-only ambient org, project, and custom header defaults', async () => {
    const restoreEnv = mockProcessEnv({
      OPENAI_ORG_ID: 'ambient-org',
      OPENAI_PROJECT_ID: 'ambient-project',
      OPENAI_CUSTOM_HEADERS: 'X-Ambient-Header: should-not-leak',
    });

    try {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ object: 'list', data: [] }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
      const client = createOpenAiClient({
        apiKey: 'test-key',
        baseURL: 'https://api.openai.com/v1',
        fetch: fetchMock as typeof globalThis.fetch,
      });

      await client.models.list();

      const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = new Headers(requestInit.headers);
      expect(headers.get('authorization')).toBe('Bearer test-key');
      expect(headers.get('openai-organization')).toBeNull();
      expect(headers.get('openai-project')).toBeNull();
      expect(headers.get('x-ambient-header')).toBeNull();
    } finally {
      restoreEnv();
    }
  });
});

describe('isSdkUploadCapabilityProbe', () => {
  it('matches the SDK data: probe in its current form', () => {
    expect(isSdkUploadCapabilityProbe('data:,')).toBe(true);
  });

  it('matches data: URLs with payloads so future SDK probe variants still bypass cache', () => {
    expect(isSdkUploadCapabilityProbe('data:text/plain;base64,SGVsbG8=')).toBe(true);
    expect(isSdkUploadCapabilityProbe('data:application/json,%7B%7D')).toBe(true);
  });

  it('does not match regular HTTP URLs', () => {
    expect(isSdkUploadCapabilityProbe('https://api.openai.com/v1/chat/completions')).toBe(false);
    expect(isSdkUploadCapabilityProbe('http://localhost:8080/v1/responses')).toBe(false);
  });
});
