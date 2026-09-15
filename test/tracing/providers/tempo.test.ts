import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/index', () => ({ fetchWithProxy: vi.fn() }));
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
              events: [
                {
                  name: 'tool event',
                  timeUnixNano: '1704067200500000000',
                  attributes: [{ key: 'command', value: { stringValue: 'echo fixture' } }],
                },
              ],
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

  it.each(['resource', 'scope', 'span', 'event', 'event count'])(
    'rejects Tempo snapshots with dropped %s evidence',
    async (source) => {
      const data = structuredClone(traceResponse);
      const batch = data.batches[0];
      const scope = batch.scopeSpans[0];
      const span = scope.spans[0];
      const item =
        source === 'resource'
          ? batch.resource
          : source === 'scope'
            ? scope.scope
            : source === 'event'
              ? span.events![0]
              : span;
      Object.assign(
        item,
        source === 'event count' ? { droppedEventsCount: 1 } : { droppedAttributesCount: 1 },
      );
      mockedFetch.mockResolvedValueOnce(response(data));
      await expect(
        new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' }).fetchTrace(TRACE_ID),
      ).rejects.toMatchObject({ invalidEvidence: true });
    },
  );

  it('rejects malformed event attributes instead of dropping them', async () => {
    const data = structuredClone(traceResponse);
    data.batches[0].scopeSpans[0].spans[0].events![0].attributes.push(null as any);
    mockedFetch.mockResolvedValueOnce(response(data));
    await expect(
      new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' }).fetchTrace(TRACE_ID),
    ).rejects.toMatchObject({ invalidEvidence: true });
  });

  it.each(
    ['resource', 'span', 'event', 'nested event'].flatMap((location) =>
      [
        undefined,
        null,
        { stringValue: false },
        { boolValue: 'false' },
        { doubleValue: '0' },
        { intValue: [1] },
        { boolValue: false, stringValue: 'allowed' },
        { unsupportedValue: 'allowed' },
      ].map((value) => ({ location, value })),
    ),
  )('rejects malformed $location AnyValue $value', async ({ location, value }) => {
    const attributes = [{ key: 'guardrail.triggered', value }];
    const span = traceResponse.batches[0].scopeSpans[0].spans[0];
    mockedFetch.mockResolvedValueOnce(
      response({
        batches: [
          {
            resource: { attributes: location === 'resource' ? attributes : [] },
            scopeSpans: [
              {
                spans: [
                  {
                    ...span,
                    attributes: location === 'span' ? attributes : [],
                    events: [
                      {
                        name: 'guardrail update_seat',
                        timeUnixNano: '1704067200500000000',
                        attributes:
                          location === 'nested event'
                            ? [{ key: 'details', value: { kvlistValue: { values: attributes } } }]
                            : location === 'event'
                              ? attributes
                              : [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    await expect(
      new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' }).fetchTrace(TRACE_ID),
    ).rejects.toMatchObject({ name: 'TraceProviderError', retryable: false });
  });

  it.each([
    { field: 'name', change: { name: ' ' } },
    { field: 'timestamp', change: { startTimeUnixNano: 'invalid' } },
    { field: 'interval', change: { endTimeUnixNano: '1' } },
    { field: 'status message', change: { status: { message: 3 } } },
    { field: 'span ID', change: { spanId: '!!!' } },
    { field: 'parent ID', change: { parentSpanId: '!!!' } },
  ])('marks a malformed $field as invalid evidence despite a valid sibling', async ({ change }) => {
    const data = structuredClone(traceResponse);
    Object.assign(data.batches[0].scopeSpans[0].spans[0], change);
    mockedFetch.mockResolvedValueOnce(response(data));
    await expect(
      new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' }).fetchTrace(TRACE_ID),
    ).rejects.toMatchObject({ name: 'TraceProviderError', invalidEvidence: true });
  });

  it.each(['attributes', 'status', 'events', 'equivalent'])(
    'compares repeated span IDs with %s',
    async (change) => {
      const data = structuredClone(traceResponse);
      const spans = data.batches[0].scopeSpans[0].spans;
      const duplicate = structuredClone(spans[0]);
      if (change === 'attributes') {
        duplicate.attributes = [{ key: 'unsafe', value: { intValue: '1' } }];
      }
      if (change === 'status') {
        duplicate.status = { code: 'STATUS_CODE_ERROR' };
      }
      if (change === 'events') {
        duplicate.events = [];
      }
      if (change === 'equivalent') {
        duplicate.attributes!.reverse();
      }
      spans.push(duplicate);
      mockedFetch.mockResolvedValueOnce(response(data));
      const result = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' }).fetchTrace(
        TRACE_ID,
      );
      if (change === 'equivalent') {
        expect((await result)?.spans).toHaveLength(2);
      } else {
        await expect(result).rejects.toMatchObject({
          name: 'TraceProviderError',
          invalidEvidence: true,
        });
      }
    },
  );

  it('retains empty AnyValues after JSON persistence', async () => {
    const attributes = [{ key: 'guardrail.triggered', value: {} }];
    const span = traceResponse.batches[0].scopeSpans[0].spans[0];
    mockedFetch.mockResolvedValueOnce(
      response({
        batches: [
          {
            resource: { attributes: [{ key: 'resource.unknown', value: {} }] },
            scopeSpans: [
              {
                spans: [
                  {
                    ...span,
                    attributes,
                    events: [
                      {
                        name: 'guardrail update_seat',
                        timeUnixNano: '1704067200500000000',
                        attributes: [
                          { key: 'details', value: { kvlistValue: { values: attributes } } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const result = await new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
    }).fetchTrace(TRACE_ID);
    const persisted = JSON.parse(JSON.stringify(result));
    expect(persisted.spans[0].attributes).toMatchObject({
      'resource.unknown': null,
      'guardrail.triggered': null,
    });
    expect(persisted.spans[0].events[0].attributes).toEqual({
      details: { 'guardrail.triggered': null },
    });
  });

  it('preserves shadowed resource secrets needed to redact retained events', async () => {
    const secret = 'PRIVATE_TEMPO_RESOURCE_EVENT_SECRET';
    const span = traceResponse.batches[0].scopeSpans[0].spans[0];
    mockedFetch.mockResolvedValueOnce(
      response({
        batches: [
          {
            resource: { attributes: [{ key: 'authorization', value: { stringValue: secret } }] },
            scopeSpans: [
              {
                spans: [
                  {
                    ...span,
                    attributes: [{ key: 'authorization', value: { stringValue: 'safe' } }],
                    events: [
                      {
                        name: `echo ${secret}`,
                        timeUnixNano: '1704067200500000000',
                        attributes: [{ key: 'detail', value: { stringValue: secret } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const result = await new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
    }).fetchTrace(TRACE_ID);
    expect(result?.spans[0].attributes).toMatchObject({
      authorization: 'safe',
      'otel.resource.attributes': [{ authorization: secret }],
    });
    expect(result?.spans[0].events?.[0].attributes?.detail).toBe(secret);
  });

  it.each(['coerced', 'missing-value'])(
    'rejects ambiguous event keys with %s entries',
    async (kind) => {
      const data = structuredClone(traceResponse);
      const event = data.batches[0].scopeSpans[0].spans[0].events![0];
      Object.assign(event, {
        attributes:
          kind === 'coerced'
            ? [
                { key: 1, value: { stringValue: 'private' } },
                { key: '1', value: { stringValue: 'public' } },
              ]
            : [
                { key: 'authorization' },
                { key: 'authorization', value: { stringValue: 'public' } },
              ],
      });
      mockedFetch.mockResolvedValue(response(data));
      await expect(
        new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' }).fetchTrace(TRACE_ID),
      ).rejects.toThrow(/attribute keys/i);
    },
  );

  it('preserves exact span nanoseconds for guardrail ordering', async () => {
    const data = structuredClone(traceResponse);
    const span = data.batches[0].scopeSpans[0].spans[0];
    span.startTimeUnixNano = '1700000000000000000';
    span.endTimeUnixNano = '1700000000000000100';
    mockedFetch.mockResolvedValue(response(data));
    const result = await new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
    }).fetchTrace(TRACE_ID);
    expect(result?.spans[0].attributes).toMatchObject({
      'otel.span.start_time_unix_nano': span.startTimeUnixNano,
      'otel.span.end_time_unix_nano': span.endTimeUnixNano,
    });
  });

  it.each(['resource', 'span', 'event', 'nested event', 'array event'])(
    'rejects duplicate %s attributes before they can hide a redaction source',
    async (location) => {
      const secret = 'PRIVATE_DUPLICATE_TEMPO_ATTRIBUTE';
      const duplicates = [
        { key: 'authorization', value: { stringValue: secret } },
        { key: 'authorization', value: { stringValue: 'ordinary' } },
      ];
      const nested = { kvlistValue: { values: duplicates } };
      const eventAttributes =
        location === 'nested event'
          ? [{ key: 'details', value: nested }]
          : location === 'array event'
            ? [{ key: 'details', value: { arrayValue: { values: [nested] } } }]
            : duplicates;
      const batch = traceResponse.batches[0];
      const span = batch.scopeSpans[0].spans[0];
      mockedFetch.mockResolvedValueOnce(
        response({
          batches: [
            {
              resource: { attributes: location === 'resource' ? duplicates : [] },
              scopeSpans: [
                {
                  spans: [
                    {
                      ...span,
                      attributes: location === 'span' ? duplicates : [],
                      events: [
                        {
                          name: `echo ${secret}`,
                          timeUnixNano: '1704067200500000000',
                          attributes: location.includes('event') ? eventAttributes : [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
      await expect(
        new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' }).fetchTrace(TRACE_ID),
      ).rejects.toMatchObject({
        message: 'Invalid OTLP payload: duplicate attribute keys',
        retryable: false,
      });
    },
  );

  it.each([undefined, '0', 'bad-clock'])(
    'rejects a verifier event with an invalid timestamp: %s',
    async (timeUnixNano) => {
      const data = structuredClone(traceResponse);
      data.batches[0].scopeSpans[0].spans[0].events = [
        {
          name: 'agentic verifier finding',
          timeUnixNano,
          attributes: [
            {
              key: 'agenticEvidence',
              value: {
                stringValue: JSON.stringify({
                  pluginId: 'agentic:approval-continuity',
                  findings: [{ kind: 'approval-continuity' }],
                }),
              },
            },
          ],
        },
      ] as any;
      mockedFetch.mockResolvedValue(response(data));
      await expect(
        new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' }).fetchTrace(TRACE_ID),
      ).rejects.toMatchObject({ invalidEvidence: true });
    },
  );

  it('preserves sub-millisecond event order', async () => {
    const data = structuredClone(traceResponse);
    data.batches[0].scopeSpans[0].spans[0].events = [
      { name: 'tool update_seat', timeUnixNano: '1704067200000000200', attributes: [] },
      { name: 'guardrail update_seat', timeUnixNano: '1704067200000000300', attributes: [] },
    ];
    mockedFetch.mockResolvedValue(response(data));
    const result = await new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
    }).fetchTrace(TRACE_ID);
    expect(result?.spans[0].events).toHaveLength(2);
    expect(result!.spans[0].events!.map((event) => event.timestampNanos)).toEqual([
      '1704067200000000200',
      '1704067200000000300',
    ]);
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
      events: [
        {
          name: 'tool event',
          timestamp: 1704067200500,
          timestampNanos: '1704067200500000000',
          attributes: { command: 'echo fixture' },
        },
      ],
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

  it.each([{ kvlistValue: { values: [null] } }, { arrayValue: { values: [null] } }])(
    'rejects malformed nested event attributes: %j',
    async (value) => {
      const data = structuredClone(traceResponse);
      data.batches[0].scopeSpans[0].spans[0].events!.unshift({
        name: 'broken event',
        timeUnixNano: '1704067200500000000',
        attributes: [{ key: 'broken', value: value as any }],
      });
      mockedFetch.mockResolvedValueOnce(response(data));
      await expect(
        new TempoProvider({
          id: 'tempo',
          endpoint: 'http://tempo:3200',
        }).fetchTrace(TRACE_ID),
      ).rejects.toBeInstanceOf(TraceProviderError);
    },
  );

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

  it('ignores spans from another trace while preserving matching spans', async () => {
    const data = structuredClone(traceResponse);
    const spans = data.batches[0].scopeSpans[0].spans;
    spans.unshift({ ...spans[0], spanId: '2123456789abcdef', traceId: 'f'.repeat(32) });
    mockedFetch.mockResolvedValueOnce(response(data));
    const result = await new TempoProvider({
      id: 'tempo',
      endpoint: 'http://tempo:3200',
    }).fetchTrace(TRACE_ID);
    expect(result?.spans.map((span) => span.name)).toEqual(['target.call', 'internal.setup']);
  });

  it.each([null, { scopeSpans: {} }, { scopeSpans: [null] }, { scopeSpans: [{ spans: {} }] }])(
    'marks malformed batches and scopes incomplete despite valid siblings: %j',
    async (invalid) => {
      mockedFetch.mockResolvedValueOnce(response({ batches: [invalid, traceResponse.batches[0]] }));
      await expect(
        new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' }).fetchTrace(TRACE_ID),
      ).rejects.toMatchObject({ name: 'TraceProviderError', invalidEvidence: true });
    },
  );

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

  it('preserves the full snapshot so storage can reject an oversized trace atomically', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    const spans = Array.from({ length: 10_001 }, (_, index) => ({
      traceId: TRACE_ID,
      spanId: (index + 1).toString(16).padStart(16, '0'),
      name: 'tool execution',
      startTimeUnixNano: '1000000',
    }));
    mockedFetch.mockResolvedValueOnce(response({ batches: [{ scopeSpans: [{ spans }] }] }));

    const trace = await provider.fetchTrace(TRACE_ID);
    expect(trace?.spans).toHaveLength(10_001);
    expect(trace?.spans.at(-1)?.spanId).toBe(spans.at(-1)?.spanId);
  });

  it('rejects invalid or oversized trace responses', async () => {
    const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
    mockedFetch.mockResolvedValueOnce(response({ unexpected: [] }));
    await expect(provider.fetchTrace(TRACE_ID)).rejects.toThrow('invalid trace response');

    mockedFetch.mockResolvedValueOnce(
      new Response('{}', { headers: { 'content-length': '10485761' } }),
    );
    await expect(provider.fetchTrace(TRACE_ID)).rejects.toMatchObject({
      message: expect.stringContaining('maximum response size'),
      limitExceeded: true,
    });
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

    await expect(provider.fetchTrace(TRACE_ID)).rejects.toMatchObject({
      message: expect.stringContaining('maximum response size'),
      limitExceeded: true,
    });
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
