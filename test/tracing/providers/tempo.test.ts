import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
              events: [
                {
                  name: 'tool.called',
                  timeUnixNano: '1704067200500000000',
                  attributes: [{ key: 'tool.name', value: { stringValue: 'search' } }],
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
    { id: 'tempo', endpoint: 'https://example.com', timeout: -1 },
  ] as const)('rejects unsafe provider configuration: %o', (config) => {
    expect(() => new TempoProvider(config)).toThrow();
  });

  it.each(['../../admin', 'abc123', '00000000000000000000000000000000'])(
    'rejects invalid trace IDs before sending a request: %s',
    async (traceId) => {
      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      await expect(provider.fetchTrace(traceId)).rejects.toThrow(TraceProviderError);
      expect(mockedFetch).not.toHaveBeenCalled();
    },
  );

  it('normalizes resource attributes, numeric and textual kinds, events, and nested values', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200/' });
    const result = await provider.fetchTrace(TRACE_ID);

    expect(result).toMatchObject({ traceId: TRACE_ID, services: ['target-service'] });
    expect(result?.spans).toHaveLength(2);
    expect(result?.spans[0]).toMatchObject({
      name: 'target.call',
      startTime: 1704067200000,
      endTime: 1704067201000,
      statusCode: 1,
      attributes: {
        'service.name': 'target-service',
        'otel.scope.name': 'instrumentation',
        'otel.span.kind_code': 3,
        'gen_ai.usage.total_tokens': 42,
        nested: { enabled: true },
      },
      events: [
        {
          name: 'tool.called',
          timestamp: 1704067200500,
          attributes: { 'tool.name': 'search' },
        },
      ],
    });
    expect(result?.spans[1].attributes?.['otel.span.kind']).toBe('internal');
    expect(mockedFetch).toHaveBeenCalledWith(
      `http://tempo:3200/api/traces/${TRACE_ID}`,
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }),
    );
  });

  it('applies earliest timestamps, safe wildcard filters, and span limits', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });

    expect((await provider.fetchTrace(TRACE_ID, { maxSpans: 1 }))?.spans).toHaveLength(1);
    expect(
      (await provider.fetchTrace(TRACE_ID, { earliestStartTime: 1704067200050 }))?.spans.map(
        (span) => span.name,
      ),
    ).toEqual(['internal.setup']);
    expect(
      (await provider.fetchTrace(TRACE_ID, { spanFilter: ['target.*'] }))?.spans.map(
        (span) => span.name,
      ),
    ).toEqual(['target.call']);
    expect((await provider.fetchTrace(TRACE_ID, { spanFilter: ['target.(call)'] }))?.spans).toEqual(
      [],
    );
  });

  it('forwards bearer authentication, custom headers, and cancellation', async () => {
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

  it('returns null for missing traces and distinguishes retryable HTTP failures', async () => {
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

  it('rejects malformed or oversized responses', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    mockedFetch.mockResolvedValueOnce(response({ unexpected: [] }));
    await expect(provider.fetchTrace(TRACE_ID)).rejects.toThrow('invalid trace response');

    mockedFetch.mockResolvedValueOnce(
      new Response('{}', { headers: { 'content-length': '10485761' } }),
    );
    await expect(provider.fetchTrace(TRACE_ID)).rejects.toThrow('maximum response size');
  });

  it('checks Tempo readiness through the proxy-aware fetch client', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    expect(await provider.healthCheck()).toBe(true);
    expect(mockedFetch).toHaveBeenCalledWith(
      'http://tempo:3200/ready',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    mockedFetch.mockRejectedValueOnce(new Error('offline'));
    expect(await provider.healthCheck()).toBe(false);
  });
});
