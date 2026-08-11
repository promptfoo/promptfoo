import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addSpans: vi.fn(),
  createTraceProvider: vi.fn(),
  getSpans: vi.fn(),
  getTraceStore: vi.fn(),
  isExternalTraceProvider: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../src/logger', () => ({
  default: mocks.logger,
}));

vi.mock('../../src/tracing/providers', () => ({
  createTraceProvider: mocks.createTraceProvider,
  isExternalTraceProvider: mocks.isExternalTraceProvider,
}));

vi.mock('../../src/tracing/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tracing/store')>()),
  getTraceStore: mocks.getTraceStore,
}));

import { extractTraceIdFromTraceparent, fetchTraceContext } from '../../src/tracing/traceContext';

describe('fetchTraceContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.addSpans.mockResolvedValue({ stored: true });
    mocks.getTraceStore.mockReturnValue({
      addSpans: mocks.addSpans,
      getSpans: mocks.getSpans,
    });
    mocks.isExternalTraceProvider.mockReturnValue(true);
  });

  it('fetches external traces before applying local filters and limits', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 123,
      spans: [
        {
          spanId: 'internal-span',
          name: 'internal.setup',
          startTime: 1,
          attributes: { 'otel.span.kind': 'internal' },
        },
        {
          spanId: 'target-span',
          name: 'target.call',
          startTime: 2,
          attributes: { 'otel.span.kind': 'client' },
        },
      ],
      traceId: 'trace-1',
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-1', {
      includeInternalSpans: false,
      maxRetries: 0,
      maxSpans: 1,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
      sanitizeAttributes: false,
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-1', undefined);
    expect(result?.spans.map((span) => span.name)).toEqual(['target.call']);
    expect(mocks.addSpans).toHaveBeenCalledWith(
      'trace-1',
      [expect.objectContaining({ name: 'target.call' })],
      { warnIfMissingTrace: false },
    );
  });

  it('passes earliestStartTime to the external provider', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 456,
      spans: [
        {
          spanId: 'span-1',
          name: 'target.call',
          startTime: 100,
          attributes: { 'otel.span.kind': 'client' },
        },
      ],
      traceId: 'trace-2',
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    await fetchTraceContext('trace-2', {
      earliestStartTime: 100,
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-2', { earliestStartTime: 100 });
  });

  it.each([
    {
      name: 'self-referential parents without a depth limit',
      cyclicSpans: [{ spanId: 'cycle-1', parentSpanId: 'cycle-1' }],
      maxDepth: undefined,
    },
    {
      name: 'two-span parent cycles',
      cyclicSpans: [
        { spanId: 'cycle-1', parentSpanId: 'cycle-2' },
        { spanId: 'cycle-2', parentSpanId: 'cycle-1' },
      ],
      maxDepth: 10,
    },
    {
      name: 'longer parent cycles',
      cyclicSpans: [
        { spanId: 'cycle-1', parentSpanId: 'cycle-2' },
        { spanId: 'cycle-2', parentSpanId: 'cycle-3' },
        { spanId: 'cycle-3', parentSpanId: 'cycle-1' },
      ],
      maxDepth: 10,
    },
  ])('discards $name while retaining unrelated valid spans', async ({ cyclicSpans, maxDepth }) => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 123,
      traceId: 'trace-cycle',
      spans: [
        ...cyclicSpans.map((span, index) => ({
          ...span,
          name: `malformed.${index}`,
          startTime: index,
        })),
        {
          spanId: 'cycle-descendant',
          parentSpanId: 'cycle-1',
          name: 'malformed.descendant',
          startTime: 10,
        },
        { spanId: 'valid-root', name: 'target.call', startTime: 20 },
        {
          spanId: 'valid-child',
          parentSpanId: 'valid-root',
          name: 'tool.execute',
          startTime: 30,
        },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-cycle', {
      maxDepth,
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
      sanitizeAttributes: false,
    });

    expect(result?.spans.map(({ name, depth }) => ({ name, depth }))).toEqual([
      { name: 'target.call', depth: 0 },
      { name: 'tool.execute', depth: 1 },
    ]);
    expect(mocks.addSpans).toHaveBeenCalledWith(
      'trace-cycle',
      [
        expect.objectContaining({ spanId: 'valid-root' }),
        expect.objectContaining({ spanId: 'valid-child' }),
      ],
      { warnIfMissingTrace: false },
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      `[TraceContext] Skipping ${cyclicSpans.length + 1} spans with cyclic parent relationships`,
    );
  });

  it('returns null when an external provider cannot be initialized', async () => {
    mocks.createTraceProvider.mockImplementation(() => {
      throw new Error('Unknown trace provider id: jaeger');
    });

    const result = await fetchTraceContext('trace-3', {
      maxRetries: 0,
      providerConfig: { id: 'jaeger', endpoint: 'http://jaeger:16686' },
      queryDelay: 0,
    });

    expect(result).toBeNull();
    expect(mocks.addSpans).not.toHaveBeenCalled();
  });

  it('recognizes numeric client span kinds and uses the shared redaction policy', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 1,
      traceId: 'trace-4',
      spans: [
        {
          spanId: 'client',
          name: 'target.call',
          startTime: 1,
          attributes: {
            'otel.span.kind_code': 3,
            'gen_ai.usage.total_tokens': 12,
            'X-API-Key': 'secret',
            customer_email: 'private@example.com',
          },
        },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-4', {
      includeInternalSpans: false,
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
      redactAttributes: ['email'],
    });

    expect(result?.spans).toHaveLength(1);
    expect(result?.spans[0]).toMatchObject({
      kind: 'client',
      attributes: {
        'gen_ai.usage.total_tokens': 12,
        'X-API-Key': '<redacted>',
        customer_email: '[REDACTED]',
      },
    });
  });

  it('waits before the first fetch and uses the retry delay for later attempts', async () => {
    vi.useFakeTimers();
    try {
      const fetchTrace = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          fetchedAt: 1,
          spans: [{ spanId: 'a', name: 'target.call', startTime: 1 }],
          traceId: 'trace-5',
        });
      mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

      const resultPromise = fetchTraceContext('trace-5', {
        maxRetries: 1,
        providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
        queryDelay: 3000,
        retryDelayMs: 500,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchTrace).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2999);
      expect(fetchTrace).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchTrace).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(499);
      expect(fetchTrace).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await resultPromise).not.toBeNull();
      expect(fetchTrace).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the initial query delay before fetching', async () => {
    const controller = new AbortController();
    const fetchTrace = vi.fn();
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const resultPromise = fetchTraceContext('trace-6-initial', {
      abortSignal: controller.signal,
      maxRetries: 1,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 60_000,
    });
    controller.abort();

    await expect(resultPromise).rejects.toThrow('cancelled by user');
    expect(fetchTrace).not.toHaveBeenCalled();
  });

  it('stops retrying immediately when the evaluation is cancelled', async () => {
    const controller = new AbortController();
    const fetchTrace = vi.fn().mockResolvedValue(null);
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const resultPromise = fetchTraceContext('trace-6', {
      abortSignal: controller.signal,
      maxRetries: 1,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
      retryDelayMs: 60_000,
    });
    await vi.waitFor(() => expect(fetchTrace).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(resultPromise).rejects.toThrow('cancelled by user');
  });

  it('shares concurrent requests for the same external provider and trace', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 1,
      spans: [{ spanId: 'a', name: 'target.call', startTime: 1 }],
      traceId: 'trace-7',
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });
    const providerConfig = { id: 'tempo' as const, endpoint: 'http://tempo:3200' };

    await Promise.all([
      fetchTraceContext('trace-7', { maxRetries: 0, providerConfig, queryDelay: 0 }),
      fetchTraceContext('trace-7', { maxRetries: 0, providerConfig, queryDelay: 0 }),
    ]);

    expect(fetchTrace).toHaveBeenCalledTimes(1);
    expect(mocks.addSpans).toHaveBeenCalledTimes(1);
  });

  it.each([
    '',
    'oops-../../admin-nothex-01',
    '00-00000000000000000000000000000000-0123456789abcdef-01',
    '00-0123456789abcdef0123456789abcdef-0000000000000000-01',
  ])('rejects malformed or all-zero traceparent values: %s', (traceparent) => {
    expect(extractTraceIdFromTraceparent(traceparent)).toBeNull();
  });

  it('extracts and normalizes valid W3C trace IDs', () => {
    expect(
      extractTraceIdFromTraceparent('00-0123456789ABCDEF0123456789ABCDEF-0123456789abcdef-01'),
    ).toBe('0123456789abcdef0123456789abcdef');
  });
});
