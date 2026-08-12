import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/index', () => ({ fetchWithProxy: vi.fn() }));
vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import logger from '../../../src/logger';
import { TempoProvider } from '../../../src/tracing/providers/tempo';
import { TraceProviderError } from '../../../src/tracing/providers/types';
import { fetchWithProxy } from '../../../src/util/fetch/index';

const mockedFetch = vi.mocked(fetchWithProxy);
const TRACE_ID = '0123456789abcdef0123456789abcdef';

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

const traceResponse = {
  batches: [
    {
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: 'target-service' } }],
      },
      scopeSpans: [
        {
          scope: { name: 'instrumentation' },
          spans: [
            {
              traceId: TRACE_ID,
              spanId: '0123456789abcdef',
              name: 'target.call',
              kind: 3,
              startTimeUnixNano: '1704067200000000000',
              endTimeUnixNano: '1704067201000000000',
              attributes: [
                { key: 'gen_ai.usage.total_tokens', value: { intValue: '42' } },
                {
                  key: 'nested',
                  value: {
                    kvlistValue: {
                      values: [{ key: 'enabled', value: { boolValue: true } }],
                    },
                  },
                },
              ],
              status: { code: 'STATUS_CODE_OK' },
            },
            {
              traceId: TRACE_ID,
              spanId: '1123456789abcdef',
              parentSpanId: '0123456789abcdef',
              name: 'internal.setup',
              kind: 'SPAN_KIND_INTERNAL',
              startTimeUnixNano: '1704067200100000000',
            },
          ],
        },
      ],
    },
  ],
};

describe('TempoProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedFetch.mockImplementation(async () => response(traceResponse));
  });

  it.each([
    { id: 'tempo' },
    { id: 'tempo', endpoint: 'not-a-url' },
    { id: 'tempo', endpoint: 'file:///tmp/traces' },
    { id: 'tempo', endpoint: 'https://user:secret@example.com' },
    { id: 'tempo', endpoint: 'https://example.com/tempo?token=secret' },
    { id: 'tempo', endpoint: 'https://example.com/tempo#section' },
    { id: 'tempo', endpoint: 'https://example.com', timeout: -1 },
  ] as const)('rejects invalid endpoint configuration: %o', (config) => {
    expect(() => new TempoProvider(config)).toThrow();
  });

  it('fetches and normalizes OpenTelemetry trace spans', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200/' });

    const result = await provider.fetchTrace(TRACE_ID);

    expect(result).toMatchObject({ traceId: TRACE_ID, services: ['target-service'] });
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]).toMatchObject({
      spanId: '0123456789abcdef',
      name: 'target.call',
      startTime: 1704067200000,
      endTime: 1704067201000,
      statusCode: 1,
      attributes: {
        'service.name': 'target-service',
        'otel.scope.name': 'instrumentation',
        'otel.span.kind': 'client',
        'otel.span.kind_code': 3,
        'gen_ai.usage.total_tokens': 42,
        nested: { enabled: true },
      },
    });
    expect(result?.spans[1]).toMatchObject({
      spanId: '1123456789abcdef',
      parentSpanId: '0123456789abcdef',
      attributes: { 'otel.span.kind': 'internal' },
    });
    expect(mockedFetch).toHaveBeenCalledWith(
      `http://tempo:3200/api/traces/${TRACE_ID}`,
      expect.objectContaining({
        disableTransientRetries: true,
        redirect: 'error',
        method: 'GET',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('accepts canonical base64 span identifiers', async () => {
    const encodedResponse = structuredClone(traceResponse);
    for (const span of encodedResponse.batches[0].scopeSpans[0].spans) {
      span.spanId = Buffer.from(span.spanId, 'hex').toString('base64');
      if (span.parentSpanId) {
        span.parentSpanId = Buffer.from(span.parentSpanId, 'hex').toString('base64');
      }
    }
    mockedFetch.mockResolvedValueOnce(response(encodedResponse));
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });

    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans.map((span) => span.spanId)).toEqual([
      '0123456789abcdef',
      '1123456789abcdef',
    ]);
  });

  it.each(['../../admin', 'abc123', '00000000000000000000000000000000'])(
    'rejects invalid trace identifiers before requesting Tempo: %s',
    async (traceId) => {
      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      await expect(provider.fetchTrace(traceId)).rejects.toBeInstanceOf(TraceProviderError);
      expect(mockedFetch).not.toHaveBeenCalled();
    },
  );

  it('drops malformed or unrelated spans while preserving valid siblings', async () => {
    const mixedResponse = structuredClone(traceResponse);
    const spans = mixedResponse.batches[0].scopeSpans[0].spans;
    spans.unshift(
      { ...spans[0], spanId: '!!!', name: 'malformed.span' },
      { ...spans[0], spanId: '2123456789abcdef', traceId: 'f'.repeat(32) },
      {
        ...spans[1],
        spanId: '3123456789abcdef',
        parentSpanId: '!!!',
      } as (typeof spans)[number],
    );
    mockedFetch.mockResolvedValueOnce(response(mixedResponse));
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });

    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith('[TempoProvider] Skipped 3 malformed spans');
  });

  it('skips malformed batches and scopes while preserving valid siblings', async () => {
    const validBatch = structuredClone(traceResponse.batches[0]);
    mockedFetch.mockResolvedValueOnce(
      response({
        batches: [
          null,
          { scopeSpans: {} },
          {
            ...validBatch,
            scopeSpans: [null, { spans: {} }, ...validBatch.scopeSpans],
          },
        ],
      }),
    );
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });

    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
    expect(result?.services).toEqual(['target-service']);
    expect(logger.warn).toHaveBeenCalledWith('[TempoProvider] Skipped 4 malformed spans');
  });

  it('forwards bearer authentication, tenant headers, and cancellation', async () => {
    const controller = new AbortController();
    const provider = new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
      auth: { token: 'secret-token' },
      headers: { 'X-Scope-OrgID': 'tenant-a' },
      timeout: 250,
    });

    await provider.fetchTrace(TRACE_ID, { abortSignal: controller.signal });

    expect(mockedFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
          'X-Scope-OrgID': 'tenant-a',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('supports basic authentication', async () => {
    const provider = new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
      auth: { username: 'user', password: 'pass' },
    });

    await provider.fetchTrace(TRACE_ID);

    expect(mockedFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Basic dXNlcjpwYXNz' }),
      }),
    );
  });

  it('classifies missing, permanent, and retryable HTTP responses', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    mockedFetch.mockResolvedValueOnce(response({}, 404));
    expect(await provider.fetchTrace(TRACE_ID)).toBeNull();

    mockedFetch.mockResolvedValueOnce(response({}, 401));
    await expect(provider.fetchTrace(TRACE_ID)).rejects.toMatchObject({
      statusCode: 401,
      retryable: false,
    });

    mockedFetch.mockResolvedValueOnce(response({}, 503));
    await expect(provider.fetchTrace(TRACE_ID)).rejects.toMatchObject({
      statusCode: 503,
      retryable: true,
    });
  });

  it('rejects invalid or oversized trace responses', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    mockedFetch.mockResolvedValueOnce(response({ unexpected: [] }));
    await expect(provider.fetchTrace(TRACE_ID)).rejects.toThrow('invalid trace response');

    mockedFetch.mockResolvedValueOnce(
      new Response('{}', { headers: { 'content-length': '10485761' } }),
    );
    await expect(provider.fetchTrace(TRACE_ID)).rejects.toThrow('maximum response size');
  });

  it('cancels oversized streamed responses before buffering their contents', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
      },
      cancel,
    });
    mockedFetch.mockResolvedValueOnce(new Response(body, { headers: { 'content-length': '1' } }));
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });

    await expect(provider.fetchTrace(TRACE_ID)).rejects.toThrow('maximum response size');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('checks readiness through the proxy-aware client without following redirects', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });

    expect(await provider.healthCheck()).toBe(true);
    expect(mockedFetch).toHaveBeenCalledWith(
      'http://tempo:3200/ready',
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
    );

    mockedFetch.mockRejectedValueOnce(new Error('offline'));
    expect(await provider.healthCheck()).toBe(false);
  });
});
