import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addSpans: vi.fn(),
  createTraceProvider: vi.fn(),
  getSpans: vi.fn(),
  getTraceMetadata: vi.fn(),
  markTraceIncomplete: vi.fn(),
  getTraceStore: vi.fn(),
  isExternalTraceProvider: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../src/logger', () => ({ default: mocks.logger }));
vi.mock('../../src/tracing/providers', () => ({
  createTraceProvider: mocks.createTraceProvider,
  isExternalTraceProvider: mocks.isExternalTraceProvider,
}));
vi.mock('../../src/tracing/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tracing/store')>()),
  getTraceStore: mocks.getTraceStore,
}));

import { TraceProviderError } from '../../src/tracing/providers/types';
import {
  getTraceTextRedactionState,
  sanitizeTraceAttributes,
} from '../../src/tracing/sanitizeAttributes';
import { isRelevantSpan, matchesSpanFilter } from '../../src/tracing/spanFilter';
import { TraceLimitError } from '../../src/tracing/store';
import { extractTraceIdFromTraceparent, fetchTraceContext } from '../../src/tracing/traceContext';

import type { AddSpansOptions, SpanData, TraceSpanQueryOptions } from '../../src/tracing/store';

let providerConfig = { id: 'tempo' as const, endpoint: 'http://tempo:3200' };
const storedSpans: SpanData[] = [];

function mockExternalTrace(spans: SpanData[], traceId = 'trace-1') {
  const fetchTrace = vi.fn().mockResolvedValue({ fetchedAt: 123, spans, traceId });
  mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });
  return fetchTrace;
}

describe('fetchTraceContext', () => {
  it.each([false, true])(
    'reads complete grading evidence despite view filters (external: %s)',
    async (external) => {
      const spans: SpanData[] = [
        { spanId: 'previous', name: 'previous iteration', startTime: 1 },
        {
          spanId: 'clean',
          name: 'target.call',
          startTime: 2,
          attributes: { 'gen_ai.operation.name': 'chat' },
        },
        {
          spanId: 'unsafe',
          name: 'tool update_seat',
          startTime: 3,
          attributes: {
            'tool.name': 'update_seat',
            'agentic.evidence_json': JSON.stringify({ padding: 'x'.repeat(500), finding: true }),
          },
        },
      ];
      mocks.isExternalTraceProvider.mockReturnValue(external);
      if (external) {
        mockExternalTrace(spans);
      } else {
        storedSpans.push(...spans);
      }
      const result = await fetchTraceContext('trace-1', {
        ...(external ? { providerConfig } : {}),
        queryDelay: 0,
        maxRetries: 0,
        earliestStartTime: 2,
        requireComplete: true,
        includeInternalSpans: false,
        maxSpans: 1,
        maxDepth: 1,
        spanFilter: ['target'],
      });
      expect(result?.spans.map((span) => span.spanId)).toEqual(['clean', 'unsafe']);
      expect(result?.spans[1].attributes['agentic.evidence_json']).toBe(
        spans[2].attributes!['agentic.evidence_json'],
      );
      expect(result?.summary?.spans.map((span) => span.spanId)).toEqual(['clean']);
      expect(result?.summary?.insights.join(' ')).not.toContain('update_seat');
      expect(mocks.getSpans).toHaveBeenCalledWith(
        'trace-1',
        expect.objectContaining({
          earliestStartTime: 2,
          includeInternalSpans: true,
          maxSpans: undefined,
          maxDepth: undefined,
          spanFilter: undefined,
          sanitizeAttributes: false,
        }),
      );
    },
  );

  it.each([false, true])(
    'rejects incomplete local traces even with no visible spans (%s)',
    async (hasSpans) => {
      mocks.isExternalTraceProvider.mockReturnValue(false);
      mocks.getTraceMetadata.mockResolvedValue({ promptfooTraceIncomplete: 'limit exceeded' });
      if (hasSpans) {
        storedSpans.push({ spanId: 'clean-prefix', name: 'target.call', startTime: 1 });
      }
      await expect(fetchTraceContext('trace-1', { maxRetries: 0 })).rejects.toThrow(
        TraceLimitError,
      );
    },
  );

  it('rejects previously incomplete external traces before fetching a clean snapshot', async () => {
    const fetchTrace = mockExternalTrace([
      { spanId: 'clean-prefix', name: 'target.call', startTime: 1 },
    ]);
    mocks.getTraceMetadata.mockResolvedValue({ promptfooTraceIncomplete: 'limit exceeded' });
    await expect(
      fetchTraceContext('trace-1', { providerConfig, queryDelay: 0, maxRetries: 0 }),
    ).rejects.toThrow(TraceLimitError);
    expect(fetchTrace).not.toHaveBeenCalled();
  });

  it('persists external response limits and rejects grading without retrying', async () => {
    const fetchTrace = vi
      .fn()
      .mockRejectedValue(new TraceProviderError('Response too large', { limitExceeded: true }));
    mocks.createTraceProvider.mockReturnValue({ id: 'tempo', fetchTrace });
    await expect(
      fetchTraceContext('trace-1', { providerConfig, queryDelay: 0, maxRetries: 2 }),
    ).rejects.toThrow(TraceLimitError);
    expect(fetchTrace).toHaveBeenCalledOnce();
    expect(mocks.markTraceIncomplete).toHaveBeenCalledWith('trace-1');
    expect(mocks.addSpans).not.toHaveBeenCalled();
  });

  it('propagates external snapshot limits without retrying or falling back to absent evidence', async () => {
    const fetchTrace = mockExternalTrace([
      { spanId: 'clean-prefix', name: 'target.call', startTime: 1 },
    ]);
    mocks.addSpans.mockRejectedValue(new TraceLimitError());
    await expect(
      fetchTraceContext('trace-1', { providerConfig, queryDelay: 0, maxRetries: 2 }),
    ).rejects.toThrow(TraceLimitError);
    expect(fetchTrace).toHaveBeenCalledOnce();
  });

  it('distinguishes raw redaction text from persisted redaction history', () => {
    expect(
      getTraceTextRedactionState({}, 'raw', [{ attributes: { note: '[REDACTED]' } }]).incomplete,
    ).toBe(false);
    expect(
      getTraceTextRedactionState({}, 'stored', [
        { attributes: { 'promptfoo.redaction.history': '[REDACTED]' } },
      ]).incomplete,
    ).toBe(true);
  });

  beforeEach(() => {
    vi.resetAllMocks();
    storedSpans.length = 0;
    providerConfig = { id: 'tempo', endpoint: 'http://tempo:3200' };
    mocks.addSpans.mockImplementation(
      async (_traceId: string, spans: SpanData[], options?: AddSpansOptions) => {
        const combined = [...storedSpans, ...spans];
        const sanitized = options?.redactSpans ? options.redactSpans(combined) : combined;
        const byId = new Map<string, SpanData>();
        for (const span of sanitized) {
          if (options?.updateExisting || !byId.has(span.spanId)) {
            byId.set(span.spanId, span);
          }
        }
        storedSpans.splice(0, storedSpans.length, ...byId.values());
        return { stored: true };
      },
    );
    mocks.getSpans.mockImplementation(async (_traceId: string, options: TraceSpanQueryOptions) => {
      let spans = storedSpans.filter((span) => {
        if (options.earliestStartTime && span.startTime < options.earliestStartTime) {
          return false;
        }
        if (options.spanFilter?.length) {
          return matchesSpanFilter(span.name, options.spanFilter);
        }
        return (
          options.includeInternalSpans !== false ||
          isRelevantSpan({ attributes: span.attributes, statusCode: span.statusCode })
        );
      });
      if (options.maxSpans !== undefined) {
        spans = spans.slice(0, options.maxSpans);
      }
      return spans.map((span) => ({
        ...span,
        attributes:
          options.sanitizeAttributes === false
            ? span.attributes
            : sanitizeTraceAttributes(span.attributes),
      }));
    });
    mocks.getTraceStore.mockReturnValue({
      addSpans: mocks.addSpans,
      getSpans: mocks.getSpans,
      getTraceMetadata: mocks.getTraceMetadata,
      markTraceIncomplete: mocks.markTraceIncomplete,
    });
    mocks.isExternalTraceProvider.mockReturnValue(true);
  });

  it('persists the complete trace and delegates filtering to the shared trace store', async () => {
    const internalSpan = {
      spanId: 'internal',
      name: 'internal.setup',
      startTime: 1,
      attributes: { 'otel.span.kind': 'internal' },
    };
    const targetSpan = {
      spanId: 'target',
      name: 'target.call',
      startTime: 2,
      attributes: { 'otel.span.kind': 'client' },
    };
    const fetchTrace = mockExternalTrace([internalSpan, targetSpan]);

    const result = await fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 0,
      maxRetries: 0,
      includeInternalSpans: false,
      maxSpans: 1,
      spanFilter: ['target'],
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-1', undefined);
    expect(mocks.addSpans).toHaveBeenCalledWith('trace-1', [internalSpan, targetSpan], {
      warnIfMissingTrace: false,
      updateExisting: true,
    });
    expect(mocks.getSpans).toHaveBeenCalledWith('trace-1', {
      includeInternalSpans: false,
      maxSpans: 1,
      sanitizeAttributes: true,
      spanFilter: ['target'],
    });
    expect(result?.spans.map((span) => span.name)).toEqual(['target.call']);
  });

  it('keeps meaningful internal external spans before applying the span limit', async () => {
    const spans = [
      {
        spanId: 'http',
        name: 'POST /chat',
        startTime: 1,
        attributes: { 'otel.span.kind': 'server', 'http.request.method': 'POST' },
      },
      {
        spanId: 'handler',
        name: 'request handler',
        startTime: 2,
        attributes: { 'otel.span.kind': 'internal' },
      },
      {
        spanId: 'model',
        name: 'chat gpt-4.1-mini',
        startTime: 3,
        attributes: { 'otel.span.kind': 'internal', 'gen_ai.operation.name': 'chat' },
      },
      {
        spanId: 'tool',
        name: 'execute_tool search',
        startTime: 4,
        attributes: { 'otel.span.kind': 'internal', 'gen_ai.tool.name': 'search' },
      },
    ];
    mockExternalTrace(spans);

    const result = await fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 0,
      maxRetries: 0,
      includeInternalSpans: false,
      maxSpans: 2,
    });

    expect(storedSpans).toEqual(spans);
    expect(result?.spans.map((span) => span.name)).toEqual([
      'chat gpt-4.1-mini',
      'execute_tool search',
    ]);
  });

  it('stores the complete external snapshot before applying an unfiltered span limit', async () => {
    const spans = [
      { spanId: 'first', name: 'target.call', startTime: 1 },
      {
        spanId: 'last',
        name: 'db.query',
        startTime: 2,
        attributes: { 'db.statement': 'unsafe query' },
      },
    ];
    const fetchTrace = mockExternalTrace(spans);
    const result = await fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 0,
      maxRetries: 0,
      includeInternalSpans: true,
      maxSpans: 1,
    });
    expect(fetchTrace).toHaveBeenCalledWith('trace-1', undefined);
    expect(storedSpans).toEqual(spans);
    expect(result?.spans).toHaveLength(1);
  });

  it('applies wildcard filters to externally fetched spans', async () => {
    mockExternalTrace([
      {
        spanId: 'model',
        name: 'chat gpt-4.1-mini',
        startTime: 1,
        attributes: { 'otel.span.kind': 'internal', 'gen_ai.operation.name': 'chat' },
      },
      {
        spanId: 'tool',
        name: 'execute_tool search',
        startTime: 2,
        attributes: { 'otel.span.kind': 'internal', 'gen_ai.tool.name': 'search' },
      },
    ]);

    const result = await fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 0,
      maxRetries: 0,
      includeInternalSpans: false,
      spanFilter: ['*tool*'],
    });

    expect(result?.spans.map((span) => span.name)).toEqual(['execute_tool search']);
  });

  it('uses the trace store time window to isolate a red-team turn', async () => {
    const previousTurn = { spanId: 'previous', name: 'previous.call', startTime: 100 };
    const currentTurn = { spanId: 'current', name: 'current.call', startTime: 200 };
    const fetchTrace = mockExternalTrace([previousTurn, currentTurn]);

    const result = await fetchTraceContext('trace-1', {
      providerConfig,
      earliestStartTime: 150,
      maxRetries: 0,
      queryDelay: 0,
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-1', { earliestStartTime: 150 });
    expect(storedSpans).toEqual([previousTurn, currentTurn]);
    expect(mocks.getSpans).toHaveBeenCalledWith(
      'trace-1',
      expect.objectContaining({ earliestStartTime: 150 }),
    );
    expect(result?.spans.map((span) => span.name)).toEqual(['current.call']);
  });

  it('forwards query bounds and cancellation without exposing store-only options', async () => {
    const controller = new AbortController();
    const fetchTrace = mockExternalTrace([
      { spanId: 'current', name: 'target.call', startTime: 200 },
    ]);

    await fetchTraceContext('trace-1', {
      providerConfig,
      abortSignal: controller.signal,
      earliestStartTime: 150,
      includeInternalSpans: true,
      maxRetries: 0,
      maxSpans: 50,
      queryDelay: 0,
      sanitizeAttributes: false,
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-1', {
      abortSignal: controller.signal,
      earliestStartTime: 150,
    });
  });

  it.each([
    { label: 'internal spans are excluded', filters: { includeInternalSpans: false } },
    { label: 'span names are filtered', filters: { spanFilter: ['*tool*'] } },
  ])('applies the span limit after filtering when $label', async ({ filters }) => {
    const spans = [
      {
        spanId: 'internal',
        name: 'internal.setup',
        startTime: 1,
        attributes: { 'otel.span.kind': 'internal' },
      },
      {
        spanId: 'tool',
        name: 'execute_tool search',
        startTime: 2,
        attributes: { 'gen_ai.tool.name': 'search' },
      },
    ];
    const fetchTrace = vi.fn().mockImplementation(async (_traceId, options) => ({
      fetchedAt: 123,
      spans: options?.maxSpans === undefined ? spans : spans.slice(0, options.maxSpans),
      traceId: 'trace-1',
    }));
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-1', {
      providerConfig,
      maxRetries: 0,
      maxSpans: 1,
      queryDelay: 0,
      ...filters,
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-1', undefined);
    expect(result?.spans.map((span) => span.name)).toEqual(['execute_tool search']);
  });

  it('preserves time bounds and cancellation when the result limit must be applied locally', async () => {
    const controller = new AbortController();
    const fetchTrace = mockExternalTrace([
      { spanId: 'tool', name: 'execute_tool search', startTime: 200 },
    ]);

    await fetchTraceContext('trace-1', {
      providerConfig,
      abortSignal: controller.signal,
      earliestStartTime: 150,
      maxRetries: 0,
      maxSpans: 50,
      queryDelay: 0,
      spanFilter: ['tool'],
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-1', {
      abortSignal: controller.signal,
      earliestStartTime: 150,
    });
  });

  it('discards cyclic parent relationships while preserving valid spans', async () => {
    mockExternalTrace([
      { spanId: 'cycle-a', parentSpanId: 'cycle-b', name: 'cycle.a', startTime: 1 },
      { spanId: 'cycle-b', parentSpanId: 'cycle-a', name: 'cycle.b', startTime: 2 },
      { spanId: 'valid', name: 'target.call', startTime: 3 },
    ]);

    const result = await fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 0,
      maxRetries: 0,
    });

    expect(storedSpans.map((span) => span.spanId)).toEqual(['valid']);
    expect(result?.spans.map((span) => span.name)).toEqual(['target.call']);
  });

  it('replaces overlapping external trace secrets without rewriting redaction markers', async () => {
    mockExternalTrace([
      {
        spanId: 'target',
        name: 'token EE E',
        startTime: 1,
        attributes: { authorization: ['EE', 'E'] },
        events: [{ name: 'token EE E', timestamp: 2, attributes: {} }],
      },
    ]);
    await fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 0,
      maxRetries: 0,
      redactAttributes: ['authorization'],
    });
    expect(storedSpans[0].name).toBe('token [REDACTED] [REDACTED]');
    expect(storedSpans[0].events?.[0].name).toBe('token [REDACTED] [REDACTED]');
  });

  it('redacts external event text when attribute sanitization stops early', async () => {
    const secret = 'PRIVATE_DEEP_EXTERNAL_EVENT';
    let nested: Record<string, unknown> = { authorization: secret };
    for (let depth = 0; depth < 25; depth++) {
      nested = { nested };
    }
    mockExternalTrace([
      {
        spanId: 'target',
        name: `request ${secret}`,
        statusMessage: `failed ${secret}`,
        startTime: 1,
        events: [{ name: `event ${secret}`, timestamp: 2, attributes: nested }],
      },
    ]);
    const result = await fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 0,
      maxRetries: 0,
      redactAttributes: ['authorization'],
    });
    expect(JSON.stringify(storedSpans)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('redacts configured nested and numeric attribute values before persistence', async () => {
    mockExternalTrace([
      {
        spanId: 'target',
        name: 'request used secret-token',
        statusMessage: 'account pin 123456 failed',
        startTime: 1,
        attributes: {
          nested: { authorization: 'secret-token' },
          'account.pin': 123456,
        },
        events: [
          {
            name: 'event event-only-secret',
            timestamp: 2,
            attributes: { customer: { ssn: 'event-only-secret' } },
          },
        ],
      },
    ]);

    await fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 0,
      maxRetries: 0,
      redactAttributes: ['authorization', 'pin', 'ssn'],
    });

    expect(storedSpans).toEqual([
      expect.objectContaining({
        name: 'request used [REDACTED]',
        statusMessage: 'account pin [REDACTED] failed',
        attributes: {
          nested: { authorization: '[REDACTED]' },
          'account.pin': '[REDACTED]',
        },
        events: [
          {
            name: 'event [REDACTED]',
            timestamp: 2,
            attributes: { customer: { ssn: '[REDACTED]' } },
          },
        ],
      }),
    ]);
  });

  it.each([false, true])(
    'redacts sibling event echoes before external storage (JSON: %s)',
    async (serialized) => {
      const secret = 'PRIVATE_EXTERNAL_SIBLING_EVENT';
      mockExternalTrace([
        {
          spanId: 'source',
          name: 'source',
          startTime: 1,
          attributes: {},
          events: [
            {
              name: 'source event',
              timestamp: 2,
              attributes: {
                authorization: serialized ? JSON.stringify({ value: secret }) : secret,
              },
            },
          ],
        },
        {
          spanId: 'echo',
          name: `span ${secret}`,
          startTime: 3,
          attributes: {},
          events: [{ name: `event ${secret}`, timestamp: 4, attributes: {} }],
        },
      ]);
      const result = await fetchTraceContext('trace-1', {
        providerConfig,
        queryDelay: 0,
        maxRetries: 0,
        redactAttributes: ['authorization'],
      });
      expect(result).not.toBeNull();
      expect(JSON.stringify(storedSpans)).not.toContain(secret);
    },
  );

  it.each([
    ['source-first', false],
    ['source-first', true],
    ['echo-first', false],
    ['echo-first', true],
  ] as const)(
    'redacts partial external snapshots in %s order (JSON: %s)',
    async (order, serialized) => {
      const secret = 'PRIVATE_EXTERNAL_PREVIOUS_SNAPSHOT';
      const source = {
        spanId: 'source',
        name: 'source',
        startTime: 1,
        attributes: { authorization: serialized ? JSON.stringify({ token: secret }) : secret },
      };
      const echo = {
        spanId: 'echo',
        name: `request ${secret}`,
        statusMessage: `status ${secret}`,
        startTime: 2,
        events: [{ name: `event ${secret}`, timestamp: 3, attributes: {} }],
      };
      const snapshots = order === 'source-first' ? [[source], [echo]] : [[echo], [source]];
      for (const spans of snapshots) {
        mockExternalTrace(spans);
        await fetchTraceContext('trace-1', {
          providerConfig,
          queryDelay: 0,
          maxRetries: 0,
          redactAttributes: ['authorization'],
        });
      }
      expect(storedSpans).toHaveLength(2);
      expect(JSON.stringify(storedSpans)).not.toContain(secret);
      expect(storedSpans.find((span) => span.spanId === 'echo')?.events?.[0].name).toContain(
        '[REDACTED]',
      );
    },
  );

  it('sanitizes stored event names when a repeated span reveals a secret', async () => {
    const secret = 'PRIVATE_EXTERNAL_REPEATED_SPAN';
    const echo = {
      spanId: 'same',
      name: `span ${secret}`,
      startTime: 1,
      events: [{ name: `event ${secret}`, timestamp: 2, attributes: {} }],
    };
    for (const spans of [[echo], [{ ...echo, attributes: { authorization: secret } }]]) {
      mockExternalTrace(spans);
      await fetchTraceContext('trace-1', {
        providerConfig,
        queryDelay: 0,
        maxRetries: 0,
        redactAttributes: ['authorization'],
      });
    }
    expect(storedSpans).toHaveLength(1);
    expect(JSON.stringify(storedSpans)).not.toContain(secret);
  });

  it.each(['attribute', 'span-name'])(
    'suppresses new text when prior external %s redaction state is unavailable',
    async (field) => {
      storedSpans.push({
        spanId: 'old',
        name: field === 'span-name' ? '[REDACTED]' : 'source',
        startTime: 1,
        attributes: {
          ...(field === 'attribute' ? { authorization: '[REDACTED]' } : {}),
          'promptfoo.redaction.history': '[REDACTED]',
        },
      });
      mockExternalTrace([
        {
          spanId: 'new',
          name: 'PRIVATE_EXTERNAL_UNKNOWN',
          startTime: 2,
          events: [{ name: 'PRIVATE_EXTERNAL_UNKNOWN', timestamp: 3, attributes: {} }],
        },
      ]);
      await fetchTraceContext('trace-1', {
        providerConfig,
        queryDelay: 0,
        maxRetries: 0,
        redactAttributes: ['authorization'],
      });
      expect(JSON.stringify(storedSpans)).not.toContain('PRIVATE_EXTERNAL_UNKNOWN');
    },
  );

  it('redacts the complete external snapshot before storage', async () => {
    const secret = 'PRIVATE_EXTERNAL_LATER_BATCH';
    mockExternalTrace([
      ...Array.from({ length: 500 }, (_, index) => ({
        spanId: String(index),
        name: `span ${secret}`,
        startTime: index,
      })),
      { spanId: 'source', name: 'source', startTime: 501, attributes: { authorization: secret } },
    ]);
    const addSpans = mocks.addSpans.getMockImplementation()!;
    mocks.addSpans.mockImplementation(async (...args) => {
      const result = await addSpans(...args);
      expect(JSON.stringify(storedSpans)).not.toContain(secret);
      return result;
    });
    expect(
      await fetchTraceContext('trace-1', {
        providerConfig,
        queryDelay: 0,
        maxRetries: 0,
        redactAttributes: ['authorization'],
      }),
    ).not.toBeNull();
    expect(storedSpans).toHaveLength(501);
  });

  it('submits the complete external snapshot atomically', async () => {
    const spans = Array.from({ length: 501 }, (_, index) => ({
      spanId: String(index),
      name: 'target.call',
      startTime: index,
    }));
    mockExternalTrace(spans);

    await fetchTraceContext('trace-1', { providerConfig, queryDelay: 0, maxRetries: 0 });

    expect(mocks.addSpans).toHaveBeenCalledOnce();
    expect(mocks.addSpans.mock.calls[0][1]).toHaveLength(501);
  });

  it('waits before the initial request and retries missing traces', async () => {
    vi.useFakeTimers();
    try {
      const fetchTrace = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          fetchedAt: 1,
          traceId: 'trace-1',
          spans: [{ spanId: 'target', name: 'target.call', startTime: 1 }],
        });
      mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

      const resultPromise = fetchTraceContext('trace-1', {
        providerConfig,
        queryDelay: 3000,
        maxRetries: 1,
        retryDelayMs: 500,
      });

      await vi.advanceTimersByTimeAsync(2999);
      expect(fetchTrace).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchTrace).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(499);
      expect(fetchTrace).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);

      expect(await resultPromise).not.toBeNull();
      expect(fetchTrace).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the initial fetch delay without invoking the provider', async () => {
    const controller = new AbortController();
    const fetchTrace = mockExternalTrace([]);
    const resultPromise = fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 60_000,
      abortSignal: controller.signal,
    });
    controller.abort();

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchTrace).not.toHaveBeenCalled();
  });

  it('returns null without retrying permanent provider errors', async () => {
    const fetchTrace = vi
      .fn()
      .mockRejectedValue(new TraceProviderError('unauthorized', { statusCode: 401 }));
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    expect(
      await fetchTraceContext('trace-1', { providerConfig, queryDelay: 0, maxRetries: 3 }),
    ).toBeNull();
    expect(fetchTrace).toHaveBeenCalledOnce();
  });

  it('returns null when spans cannot be persisted', async () => {
    mockExternalTrace([{ spanId: 'target', name: 'target.call', startTime: 1 }]);
    mocks.addSpans.mockResolvedValueOnce({ stored: false });

    expect(
      await fetchTraceContext('trace-1', { providerConfig, queryDelay: 0, maxRetries: 0 }),
    ).toBeNull();
    expect(mocks.getSpans).not.toHaveBeenCalled();
  });

  it('shares simultaneous requests for the same external provider and trace', async () => {
    const fetchTrace = mockExternalTrace([{ spanId: 'target', name: 'target.call', startTime: 1 }]);
    const options = { providerConfig, queryDelay: 0, maxRetries: 0 };

    await Promise.all([
      fetchTraceContext('trace-1', options),
      fetchTraceContext('trace-1', options),
    ]);

    expect(fetchTrace).toHaveBeenCalledOnce();
    expect(mocks.addSpans).toHaveBeenCalledOnce();
  });

  it('continues to read local traces through the existing store path', async () => {
    mocks.isExternalTraceProvider.mockReturnValue(false);
    mocks.getSpans.mockResolvedValueOnce([{ spanId: 'local', name: 'local.call', startTime: 1 }]);

    const result = await fetchTraceContext('trace-1', { maxRetries: 0 });

    expect(result?.spans.map((span) => span.name)).toEqual(['local.call']);
    expect(mocks.createTraceProvider).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'oops-../../admin-nothex-01',
    '00-00000000000000000000000000000000-0123456789abcdef-01',
    '00-0123456789abcdef0123456789abcdef-0000000000000000-01',
  ])('rejects invalid traceparent values: %s', (traceparent) => {
    expect(extractTraceIdFromTraceparent(traceparent)).toBeNull();
  });

  it('normalizes valid traceparent identifiers', () => {
    expect(
      extractTraceIdFromTraceparent('00-0123456789ABCDEF0123456789ABCDEF-0123456789abcdef-01'),
    ).toBe('0123456789abcdef0123456789abcdef');
  });
});
