import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addSpans: vi.fn(),
  createTraceProvider: vi.fn(),
  getSpans: vi.fn(),
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
import { sanitizeTraceAttributes } from '../../src/tracing/sanitizeAttributes';
import { isRelevantSpan, matchesSpanFilter } from '../../src/tracing/spanFilter';
import { extractTraceIdFromTraceparent, fetchTraceContext } from '../../src/tracing/traceContext';

import type { SpanData, TraceSpanQueryOptions } from '../../src/tracing/store';

const providerConfig = { id: 'tempo' as const, endpoint: 'http://tempo:3200' };
const storedSpans: SpanData[] = [];

function mockExternalTrace(spans: SpanData[], traceId = 'trace-1') {
  const fetchTrace = vi.fn().mockResolvedValue({ fetchedAt: 123, spans, traceId });
  mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });
  return fetchTrace;
}

describe('fetchTraceContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storedSpans.length = 0;
    mocks.addSpans.mockImplementation(async (_traceId: string, spans: SpanData[]) => {
      storedSpans.push(...spans);
      return { stored: true };
    });
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
    mocks.getTraceStore.mockReturnValue({ addSpans: mocks.addSpans, getSpans: mocks.getSpans });
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
      maxSpans: 50,
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
      },
    ]);

    await fetchTraceContext('trace-1', {
      providerConfig,
      queryDelay: 0,
      maxRetries: 0,
      redactAttributes: ['authorization', 'pin'],
    });

    expect(storedSpans).toEqual([
      expect.objectContaining({
        name: 'request used [REDACTED]',
        statusMessage: 'account pin [REDACTED] failed',
        attributes: {
          nested: { authorization: '[REDACTED]' },
          'account.pin': '[REDACTED]',
        },
      }),
    ]);
  });

  it('stores large traces in database-safe batches', async () => {
    const spans = Array.from({ length: 501 }, (_, index) => ({
      spanId: String(index),
      name: 'target.call',
      startTime: index,
    }));
    mockExternalTrace(spans);

    await fetchTraceContext('trace-1', { providerConfig, queryDelay: 0, maxRetries: 0 });

    expect(mocks.addSpans).toHaveBeenCalledTimes(2);
    expect(mocks.addSpans.mock.calls[0][1]).toHaveLength(500);
    expect(mocks.addSpans.mock.calls[1][1]).toHaveLength(1);
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
