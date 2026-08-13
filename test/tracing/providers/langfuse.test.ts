import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { LangfuseProvider } from '../../../src/tracing/providers/langfuse';
import { TraceProviderError } from '../../../src/tracing/providers/types';
import { isRelevantSpan } from '../../../src/tracing/spanFilter';
import { getToolNameFromAttributes } from '../../../src/tracing/toolAttributes';
import { fetchWithProxy } from '../../../src/util/fetch/index';

const mockedFetch = vi.mocked(fetchWithProxy);
const TRACE_ID = '0123456789abcdef0123456789abcdef';
const config = {
  id: 'langfuse' as const,
  endpoint: 'https://cloud.langfuse.com',
  auth: { username: 'pk-public', password: 'sk-secret' },
};

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

const observations = [
  {
    id: 'root-span',
    traceId: TRACE_ID,
    parentObservationId: null,
    name: 'customer.request',
    type: 'SPAN',
    startTime: '2024-01-01T00:00:00.000Z',
    endTime: '2024-01-01T00:00:01.000Z',
    level: 'DEFAULT',
    metadata: { 'service.name': 'customer-agent', tenant: 'team-west' },
    input: '{"prompt":"hello"}',
    output: '{"text":"world"}',
  },
  {
    id: 'generation-span',
    traceId: TRACE_ID,
    parentObservationId: 'root-span',
    name: 'chat gpt-4o',
    type: 'GENERATION',
    startTime: '2024-01-01T00:00:00.100Z',
    endTime: '2024-01-01T00:00:00.500Z',
    level: 'ERROR',
    statusMessage: 'model unavailable',
    providedModelName: 'gpt-4o',
    modelParameters: { temperature: 0.2 },
    usageDetails: { input: 98, output: 68, total: 166 },
    inputUsage: 98,
    outputUsage: 68,
    totalUsage: 166,
    inputCost: 0.00049,
    outputCost: 0.00204,
    totalCost: 0.00253,
  },
];

describe('LangfuseProvider', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockImplementation(async () => response({ data: observations, meta: {} }));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    { id: 'langfuse' },
    { ...config, endpoint: 'not-a-url' },
    { ...config, endpoint: 'file:///tmp/traces' },
    { ...config, endpoint: 'https://user:secret@langfuse.example.com' },
    { ...config, endpoint: 'https://langfuse.example.com?token=secret' },
    { ...config, endpoint: 'https://langfuse.example.com#secret' },
    { ...config, endpoint: 'https://langfuse.example.com/token-privateTenantCredential123' },
    { ...config, auth: {} },
    { ...config, auth: { username: 'public-key' } },
    { ...config, auth: { password: 'secret-key' } },
    { ...config, auth: { ...config.auth, token: 'bearer-token' } },
    { ...config, timeout: -1 },
  ] as const)('rejects unsafe or incomplete configuration: %o', (value) => {
    expect(() => new LangfuseProvider(value)).toThrow();
  });

  it.each(['../../admin', 'abc123', '00000000000000000000000000000000'])(
    'rejects invalid OpenTelemetry trace IDs: %s',
    async (traceId) => {
      await expect(new LangfuseProvider(config).fetchTrace(traceId)).rejects.toThrow(
        TraceProviderError,
      );
      expect(mockedFetch).not.toHaveBeenCalled();
    },
  );

  it('retrieves observations, parentage, model metadata, token usage, and costs', async () => {
    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID);

    expect(result).toMatchObject({ traceId: TRACE_ID, services: ['customer-agent'] });
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]).toMatchObject({
      spanId: 'root-span',
      name: 'customer.request',
      startTime: 1704067200000,
      endTime: 1704067201000,
      statusCode: 1,
      attributes: {
        'service.name': 'customer-agent',
        tenant: 'team-west',
        'langfuse.observation.type': 'SPAN',
        'langfuse.input': { prompt: 'hello' },
        'langfuse.output': { text: 'world' },
      },
    });
    expect(result?.spans[1]).toMatchObject({
      parentSpanId: 'root-span',
      name: 'chat gpt-4o',
      statusCode: 2,
      statusMessage: 'model unavailable',
      attributes: {
        'langfuse.observation.type': 'GENERATION',
        'gen_ai.request.model': 'gpt-4o',
        'langfuse.model.parameters': { temperature: 0.2 },
        'langfuse.usage': { input: 98, output: 68, total: 166 },
        'gen_ai.usage.input_tokens': 98,
        'gen_ai.usage.output_tokens': 68,
        'langfuse.usage.total_tokens': 166,
        'langfuse.cost.input': 0.00049,
        'langfuse.cost.output': 0.00204,
        'langfuse.cost.total': 0.00253,
      },
    });

    const [url, options] = mockedFetch.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/api/public/v2/observations');
    expect(new URL(String(url)).searchParams.get('traceId')).toBe(TRACE_ID);
    expect(new URL(String(url)).searchParams.get('fields')).toBe(
      'core,basic,io,metadata,model,usage',
    );
    expect(options).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: {
        Authorization: `Basic ${Buffer.from('pk-public:sk-secret').toString('base64')}`,
      },
    });
  });

  it('preserves reverse-proxy paths and prevents custom headers from overriding authentication', async () => {
    await new LangfuseProvider({
      ...config,
      endpoint: 'https://langfuse.example.com/team-west/',
      headers: { authorization: 'Bearer unexpected', ACCEPT: 'text/plain', 'X-Tenant': 'west' },
    }).fetchTrace(TRACE_ID);

    const [url, options] = mockedFetch.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/team-west/api/public/v2/observations');
    expect(options?.headers).toEqual({
      'X-Tenant': 'west',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from('pk-public:sk-secret').toString('base64')}`,
    });
  });

  it('normalizes Langfuse tool observations for trajectory assertions', async () => {
    mockedFetch.mockResolvedValue(
      response({
        data: [
          {
            id: 'tool-span',
            traceId: TRACE_ID,
            name: 'search',
            type: 'TOOL',
            startTime: '2024-01-01T00:00:00.000Z',
            input: '{"query":"customer orders"}',
          },
        ],
      }),
    );

    const span = (await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0];

    expect(span?.attributes).toMatchObject({
      'langfuse.observation.type': 'TOOL',
      'gen_ai.tool.name': 'search',
      'tool.name': 'search',
      'tool.arguments': '{"query":"customer orders"}',
    });
    expect(getToolNameFromAttributes(span?.attributes)).toBe('search');
    expect(isRelevantSpan(span!)).toBe(true);
  });

  it('omits reserved keys from untrusted observation metadata', async () => {
    const metadata = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"unsafe","prototype":"unsafe","tenant":"west"}',
    );
    mockedFetch.mockResolvedValue(response({ data: [{ ...observations[0], metadata }] }));

    const attributes = (await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0]
      .attributes;

    expect(attributes).toMatchObject({ tenant: 'west' });
    expect(Object.hasOwn(attributes!, '__proto__')).toBe(false);
    expect(Object.hasOwn(attributes!, 'constructor')).toBe(false);
    expect(Object.hasOwn(attributes!, 'prototype')).toBe(false);
  });

  it('normalizes current Langfuse observation cost details', async () => {
    mockedFetch.mockResolvedValue(
      response({
        data: [
          {
            ...observations[1],
            costDetails: { input: 0.001, output: 0.002, total: 0.003 },
          },
        ],
      }),
    );

    expect((await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans[0].attributes).toEqual(
      expect.objectContaining({
        'langfuse.cost.input': 0.001,
        'langfuse.cost.output': 0.002,
        'langfuse.cost.total': 0.003,
      }),
    );
  });

  it('follows Langfuse page-based pagination and deduplicates observations', async () => {
    mockedFetch
      .mockResolvedValueOnce(
        response({ data: [observations[0]], meta: { page: 1, totalPages: 2 } }),
      )
      .mockResolvedValueOnce(response({ data: observations, meta: { page: 2, totalPages: 2 } }));

    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID);

    expect(result?.spans).toHaveLength(2);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(mockedFetch.mock.calls[1][0])).searchParams.get('page')).toBe('2');
  });

  it('keeps a stable page size while fetching a partial final page', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      ...observations[0],
      id: `span-${index}`,
    }));
    mockedFetch
      .mockResolvedValueOnce(response({ data: firstPage, meta: { page: 1, totalPages: 2 } }))
      .mockResolvedValueOnce(
        response({
          data: [{ ...observations[0], id: 'span-1000' }],
          meta: { page: 2, totalPages: 2 },
        }),
      );

    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID, { maxSpans: 1_001 });

    expect(result?.spans).toHaveLength(1_001);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(mockedFetch.mock.calls[0][0])).searchParams.get('limit')).toBe('1000');
    expect(new URL(String(mockedFetch.mock.calls[1][0])).searchParams.get('limit')).toBe('1000');
  });

  it('follows pagination cursors and deduplicates observations across pages', async () => {
    mockedFetch
      .mockResolvedValueOnce(response({ data: [observations[0]], meta: { cursor: 'next-page' } }))
      .mockResolvedValueOnce(response({ data: observations, meta: {} }));

    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID);

    expect(result?.spans).toHaveLength(2);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(mockedFetch.mock.calls[1][0])).searchParams.get('cursor')).toBe(
      'next-page',
    );
  });

  it('rejects repeated pagination cursors', async () => {
    mockedFetch.mockImplementation(async () =>
      response({ data: [observations[0]], meta: { cursor: 'again' } }),
    );

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'repeated pagination cursor',
    );
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('returns null when Langfuse has not indexed the requested trace', async () => {
    mockedFetch.mockResolvedValue(response({ data: [], meta: {} }));

    expect(await new LangfuseProvider(config).fetchTrace(TRACE_ID)).toBeNull();
  });

  it('accepts zero-page pagination metadata for an empty trace lookup', async () => {
    mockedFetch.mockResolvedValue(response({ data: [], meta: { page: 1, totalPages: 0 } }));

    expect(await new LangfuseProvider(config).fetchTrace(TRACE_ID)).toBeNull();
    expect(mockedFetch).toHaveBeenCalledOnce();
  });

  it('returns null when Langfuse does not recognize the requested endpoint', async () => {
    mockedFetch.mockResolvedValue(response({ error: 'not found' }, 404));

    expect(await new LangfuseProvider(config).fetchTrace(TRACE_ID)).toBeNull();
  });

  it.each([408, 429, 500, 503])('marks HTTP %s failures as retryable', async (status) => {
    mockedFetch.mockResolvedValue(response({ error: 'busy' }, status));

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toMatchObject({
      statusCode: status,
      retryable: true,
    });
  });

  it('does not retry invalid credentials', async () => {
    mockedFetch.mockResolvedValue(response({ error: 'unauthorized' }, 401));

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toMatchObject({
      statusCode: 401,
      retryable: false,
    });
  });

  it('filters spans by start time and passes the time filter to Langfuse', async () => {
    const result = await new LangfuseProvider(config).fetchTrace(TRACE_ID, {
      earliestStartTime: 1704067200050,
    });

    expect(result?.spans.map((span) => span.name)).toEqual(['chat gpt-4o']);
    expect(new URL(String(mockedFetch.mock.calls[0][0])).searchParams.get('fromStartTime')).toBe(
      '2024-01-01T00:00:00.050Z',
    );
  });

  it('caps the returned span count and avoids unnecessary pagination', async () => {
    mockedFetch.mockResolvedValue(response({ data: observations, meta: { cursor: 'next-page' } }));

    expect(
      (await new LangfuseProvider(config).fetchTrace(TRACE_ID, { maxSpans: 1 }))?.spans,
    ).toHaveLength(1);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(new URL(String(mockedFetch.mock.calls[0][0])).searchParams.get('limit')).toBe('1');
  });

  it('never sends a non-positive page limit', async () => {
    await new LangfuseProvider(config).fetchTrace(TRACE_ID, { maxSpans: 0 });

    expect(new URL(String(mockedFetch.mock.calls[0][0])).searchParams.get('limit')).toBe('1');
  });

  it('skips malformed, unrelated, and temporally invalid observations', async () => {
    mockedFetch.mockResolvedValue(
      response({
        data: [
          null,
          { ...observations[0], id: '' },
          { ...observations[0], traceId: 'fedcba9876543210fedcba9876543210' },
          { ...observations[0], startTime: 'not-a-date' },
          { ...observations[0], endTime: '2023-12-31T23:59:59.000Z' },
          { ...observations[0], parentObservationId: observations[0].id },
          observations[1],
        ],
      }),
    );

    expect((await new LangfuseProvider(config).fetchTrace(TRACE_ID))?.spans).toEqual([
      expect.objectContaining({ spanId: 'generation-span' }),
    ]);
  });

  it.each([
    { result: 'not observations' },
    { data: observations, meta: { cursor: 123 } },
    { data: observations, meta: { page: 0, totalPages: 2 } },
    { data: observations, meta: { page: 2, totalPages: 1 } },
  ])('rejects malformed Langfuse response payloads: %o', async (payload) => {
    mockedFetch.mockResolvedValue(response(payload));

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      TraceProviderError,
    );
  });

  it('rejects responses larger than the configured safety bound', async () => {
    mockedFetch.mockResolvedValue(
      new Response('{}', { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } }),
    );

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'maximum response size',
    );
  });

  it('applies the response size limit across paginated observation requests', async () => {
    const firstPage = response({
      data: [observations[0]],
      meta: { page: 1, totalPages: 2 },
    });
    const secondPage = new Response('{}', {
      headers: { 'content-length': String(10 * 1024 * 1024) },
    });
    const cancel = vi.spyOn(secondPage.body!, 'cancel');
    mockedFetch.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'maximum response size',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels oversized streamed responses before buffering their contents', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
      },
      cancel,
    });
    mockedFetch.mockResolvedValue(new Response(body, { headers: { 'content-length': '1' } }));

    await expect(new LangfuseProvider(config).fetchTrace(TRACE_ID)).rejects.toThrow(
      'maximum response size',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('forwards evaluation cancellation to the external request', async () => {
    const controller = new AbortController();

    await new LangfuseProvider(config).fetchTrace(TRACE_ID, { abortSignal: controller.signal });

    const requestSignal = mockedFetch.mock.calls[0][1]?.signal;
    expect(requestSignal?.aborted).toBe(false);
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
  });
});
