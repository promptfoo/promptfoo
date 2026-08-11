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
    { id: 'tempo', endpoint: 'https://example.com/tempo?tenant=example' },
    { id: 'tempo', endpoint: 'https://example.com/tempo#section' },
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

  it('normalizes resource attributes, numeric and textual kinds, and nested values', async () => {
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
    });
    expect(result?.spans[1].attributes?.['otel.span.kind']).toBe('internal');
    expect(mockedFetch).toHaveBeenCalledWith(
      `http://tempo:3200/api/traces/${TRACE_ID}`,
      expect.objectContaining({
        disableTransientRetries: true,
        method: 'GET',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it.each([
    ['standard base64', (id: string) => Buffer.from(id, 'hex').toString('base64')],
    [
      'unpadded base64',
      (id: string) => Buffer.from(id, 'hex').toString('base64').replace(/=+$/, ''),
    ],
    ['uppercase hexadecimal', (id: string) => id.toUpperCase()],
  ])('normalizes %s span and parent identifiers', async (_encoding, encodeId) => {
    const encodedResponse = structuredClone(traceResponse);
    const spans = encodedResponse.batches[0].scopeSpans[0].spans;
    spans[0].spanId = encodeId(spans[0].spanId);
    spans[1].spanId = encodeId(spans[1].spanId);
    spans[1].parentSpanId = encodeId(spans[1].parentSpanId!);
    mockedFetch.mockResolvedValueOnce(response(encodedResponse));

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans).toMatchObject([
      { spanId: '0123456789abcdef' },
      { spanId: '1123456789abcdef', parentSpanId: '0123456789abcdef' },
    ]);
  });

  it.each([
    ['uppercase hexadecimal', TRACE_ID.toUpperCase()],
    ['standard base64', Buffer.from(TRACE_ID, 'hex').toString('base64')],
    ['unpadded base64', Buffer.from(TRACE_ID, 'hex').toString('base64').replace(/=+$/, '')],
  ])('accepts matching %s trace identifiers', async (_encoding, encodedTraceId) => {
    const encodedResponse = structuredClone(traceResponse);
    for (const span of encodedResponse.batches[0].scopeSpans[0].spans) {
      span.traceId = encodedTraceId;
    }
    mockedFetch.mockResolvedValueOnce(response(encodedResponse));

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
  });

  it.each([
    ['a different trace', 'fedcba9876543210fedcba9876543210'],
    ['a malformed trace ID', 'not-a-trace-id'],
    ['a missing trace ID', undefined],
  ])('discards spans belonging to %s while preserving matching spans', async (_reason, traceId) => {
    const mixedResponse = structuredClone(traceResponse);
    const spans = mixedResponse.batches[0].scopeSpans[0].spans;
    spans.unshift({
      ...spans[0],
      spanId: '2123456789abcdef',
      name: 'unrelated.span',
      traceId: traceId as string,
    });
    mockedFetch.mockResolvedValueOnce(response(mixedResponse));

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
  });

  it.each([
    ['empty', ''],
    ['malformed base64', '!!!'],
    ['short hexadecimal', 'abc123'],
    ['all-zero hexadecimal', '0000000000000000'],
    ['all-zero base64', 'AAAAAAAAAAA='],
    ['short base64', 'YWJjZA=='],
    ['overlong base64', 'MDEyMzQ1Njc4'],
    ['non-canonical base64', 'ASNFZ4mrze9='],
  ])('discards spans with %s span identifiers while retaining valid spans', async (_reason, id) => {
    const malformedResponse = structuredClone(traceResponse);
    const spans = malformedResponse.batches[0].scopeSpans[0].spans;
    spans.unshift({ ...spans[0], name: 'malformed.span', spanId: id });
    mockedFetch.mockResolvedValueOnce(response(malformedResponse));

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
  });

  it.each(['!!!', 'abc123', '0000000000000000', 'AAAAAAAAAAA='])(
    'discards spans with an invalid parent identifier: %s',
    async (parentSpanId) => {
      const malformedResponse = structuredClone(traceResponse);
      malformedResponse.batches[0].scopeSpans[0].spans[1].parentSpanId = parentSpanId;
      mockedFetch.mockResolvedValueOnce(response(malformedResponse));

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace(TRACE_ID);

      expect(result?.spans.map((span) => span.name)).toEqual(['target.call']);
    },
  );

  it.each([undefined, null, 42, '', '   '])(
    'discards spans with invalid operation names: %o',
    async (name) => {
      const malformedResponse = structuredClone(traceResponse);
      const spans = malformedResponse.batches[0].scopeSpans[0].spans;
      spans.unshift({ ...spans[0], spanId: '2123456789abcdef', name: name as string });
      mockedFetch.mockResolvedValueOnce(response(malformedResponse));

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace(TRACE_ID);

      expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
    },
  );

  it.each([null, 42, { leaked: 'secret' }, ['invalid']])(
    'discards spans with malformed status messages while preserving valid spans: %o',
    async (message) => {
      const malformedResponse = structuredClone(traceResponse);
      const spans = malformedResponse.batches[0].scopeSpans[0].spans;
      spans.unshift({
        ...spans[0],
        spanId: '2123456789abcdef',
        name: 'malformed.status',
        status: { code: 'STATUS_CODE_ERROR', message },
      } as unknown as (typeof spans)[number]);
      mockedFetch.mockResolvedValueOnce(response(malformedResponse));

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace(TRACE_ID);

      expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
    },
  );

  it('discards spans that finish before they start while retaining valid siblings', async () => {
    const malformedResponse = structuredClone(traceResponse);
    const spans = malformedResponse.batches[0].scopeSpans[0].spans;
    spans.unshift({
      ...spans[0],
      spanId: '2123456789abcdef',
      name: 'malformed.duration',
      startTimeUnixNano: '1704067200000000999',
      endTimeUnixNano: '1704067200000000998',
    } as (typeof spans)[number]);
    mockedFetch.mockResolvedValueOnce(response(malformedResponse));

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
  });

  it.each([
    ['attributes without values', [{ key: 'service.name' }]],
    ['a non-array attribute collection', { key: 'service.name' }],
  ])('isolates batches with %s while preserving valid batches', async (_reason, attributes) => {
    mockedFetch.mockResolvedValueOnce(
      response({
        batches: [
          {
            resource: { attributes },
            scopeSpans: traceResponse.batches[0].scopeSpans,
          },
          traceResponse.batches[0],
        ],
      }),
    );

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.services).toEqual(['target-service']);
    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
  });

  it('isolates malformed scope collections while preserving valid batches and scopes', async () => {
    mockedFetch.mockResolvedValueOnce(
      response({
        batches: [
          {
            resource: { attributes: [] },
            scopeSpans: { spans: traceResponse.batches[0].scopeSpans[0].spans },
          },
          {
            resource: traceResponse.batches[0].resource,
            scopeSpans: [
              null,
              { spans: { invalid: true } },
              traceResponse.batches[0].scopeSpans[0],
            ],
          },
        ],
      }),
    );

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
  });

  it('keeps the first occurrence of duplicate normalized span IDs without consuming the span limit', async () => {
    const originalSpan = traceResponse.batches[0].scopeSpans[0].spans[0];
    const duplicateSpan = {
      ...originalSpan,
      spanId: Buffer.from(originalSpan.spanId, 'hex').toString('base64'),
      name: 'duplicate.operation',
    };
    mockedFetch.mockResolvedValueOnce(
      response({
        batches: [
          {
            resource: traceResponse.batches[0].resource,
            scopeSpans: [{ spans: [originalSpan, duplicateSpan] }],
          },
          {
            resource: traceResponse.batches[0].resource,
            scopeSpans: [{ spans: [traceResponse.batches[0].scopeSpans[0].spans[1]] }],
          },
        ],
      }),
    );

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const result = await provider.fetchTrace(TRACE_ID, { maxSpans: 2 });

    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
    expect(result?.spans.map((span) => span.spanId)).toEqual([
      '0123456789abcdef',
      '1123456789abcdef',
    ]);
  });

  it('retains the earliest spans when unsorted traces exceed the adapter span limit', async () => {
    const originalSpan = traceResponse.batches[0].scopeSpans[0].spans[0];
    const lateSpans = Array.from({ length: 10_000 }, (_, index) => ({
      traceId: TRACE_ID,
      spanId: (index + 1).toString(16).padStart(16, '0'),
      name: `late.operation.${index}`,
      startTimeUnixNano: String(1_704_067_201_000_000_000n + BigInt(index) * 1_000_000n),
    }));
    mockedFetch.mockResolvedValueOnce(
      response({
        batches: [
          {
            resource: { attributes: [] },
            scopeSpans: [{ spans: lateSpans }],
          },
          {
            resource: { attributes: [] },
            scopeSpans: [
              {
                spans: [
                  {
                    ...originalSpan,
                    spanId: 'ffffffffffffffff',
                    name: 'early.operation',
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const result = await provider.fetchTrace(TRACE_ID);

    expect(result?.spans).toHaveLength(10_000);
    expect(result?.spans[0]?.name).toBe('early.operation');
    expect(result?.spans.at(-1)?.name).toBe('late.operation.9998');
  });

  it('rejects compact responses that expand past the normalized attribute budget', async () => {
    const originalSpan = traceResponse.batches[0].scopeSpans[0].spans[0];
    mockedFetch.mockResolvedValueOnce(
      response({
        batches: [
          {
            resource: {
              attributes: [
                { key: 'resource.payload', value: { stringValue: 'x'.repeat(1024 * 1024) } },
              ],
            },
            scopeSpans: [
              {
                spans: Array.from({ length: 11 }, (_, index) => ({
                  ...originalSpan,
                  spanId: (index + 1).toString(16).padStart(16, '0'),
                })),
              },
            ],
          },
        ],
      }),
    );

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });

    const result = await provider.fetchTrace(TRACE_ID).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(result).toBeInstanceOf(TraceProviderError);
    expect(result).toHaveProperty(
      'message',
      'Tempo trace exceeds the maximum normalized attribute size',
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
      headers: { authorization: 'stale-authorization', 'X-Scope-OrgID': 'tenant-a' },
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

    const headers = mockedFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(
      Object.keys(headers).filter((header) => header.toLowerCase() === 'authorization'),
    ).toEqual(['Authorization']);
  });

  it('supports basic authentication', async () => {
    const provider = new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
      auth: { username: 'user', password: 'pass' },
      headers: { AUTHORIZATION: 'stale-authorization' },
    });
    await provider.fetchTrace(TRACE_ID);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Basic dXNlcjpwYXNz' }),
      }),
    );

    const headers = mockedFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(
      Object.keys(headers).filter((header) => header.toLowerCase() === 'authorization'),
    ).toEqual(['Authorization']);
  });

  it('preserves custom authorization headers when no explicit authentication is configured', async () => {
    const provider = new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
      headers: { authorization: 'Custom tenant-credential' },
    });

    await provider.fetchTrace(TRACE_ID);

    expect(mockedFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Custom tenant-credential' }),
      }),
    );
  });

  it('preserves its required JSON Accept header despite case-insensitive custom overrides', async () => {
    const provider = new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
      headers: {
        Accept: 'application/protobuf',
        aCcEpT: 'text/plain',
        'X-Scope-OrgID': 'tenant-a',
      },
    });

    await provider.fetchTrace(TRACE_ID);

    const headers = mockedFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/json');
    expect(Object.keys(headers).filter((header) => header.toLowerCase() === 'accept')).toEqual([
      'Accept',
    ]);
    expect(headers['X-Scope-OrgID']).toBe('tenant-a');
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

  it('cancels oversized streamed responses without buffering the remaining body', async () => {
    const cancel = vi.fn();
    let chunksRead = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          chunksRead += 1;
          controller.enqueue(new Uint8Array(6 * 1024 * 1024));
          if (chunksRead === 3) {
            controller.close();
          }
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    mockedFetch.mockResolvedValueOnce(new Response(stream));

    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });

    await expect(provider.fetchTrace(TRACE_ID)).rejects.toThrow('maximum response size');
    expect(cancel).toHaveBeenCalledOnce();
    expect(chunksRead).toBeLessThan(3);
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
