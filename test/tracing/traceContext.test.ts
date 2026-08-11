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

  it('persists complete external traces before applying reader-specific filters and limits', async () => {
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
        {
          spanId: 'another-target-span',
          name: 'target.another',
          startTime: 3,
          attributes: { 'otel.span.kind': 'client' },
        },
        {
          spanId: 'nested-target-span',
          parentSpanId: 'target-span',
          name: 'target.nested',
          startTime: 4,
          attributes: { 'otel.span.kind': 'client' },
        },
      ],
      traceId: 'trace-1',
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-1', {
      includeInternalSpans: false,
      maxRetries: 0,
      maxDepth: 1,
      maxSpans: 1,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
      sanitizeAttributes: false,
      spanFilter: ['target'],
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-1', undefined);
    expect(result?.spans.map((span) => span.name)).toEqual(['target.call']);
    expect(mocks.addSpans).toHaveBeenCalledWith(
      'trace-1',
      [
        expect.objectContaining({ name: 'internal.setup' }),
        expect.objectContaining({ name: 'target.call' }),
        expect.objectContaining({ name: 'target.another' }),
        expect.objectContaining({ name: 'target.nested' }),
      ],
      { warnIfMissingTrace: false },
    );
  });

  it('allows evaluator and target clocks to differ when filtering external spans', async () => {
    const iterationStart = 1_700_000_000_000;
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 456,
      spans: [
        {
          spanId: 'span-1',
          name: 'target.call',
          startTime: iterationStart - 30_000,
          attributes: { 'otel.span.kind': 'client' },
        },
      ],
      traceId: 'trace-2',
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    await fetchTraceContext('trace-2', {
      earliestStartTime: iterationStart,
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-2', {
      earliestStartTime: iterationStart - 60_000,
    });
  });

  it('does not pass negative timestamp bounds to an external provider', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 456,
      spans: [{ spanId: 'span-1', name: 'target.call', startTime: 10 }],
      traceId: 'trace-early-timestamp',
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    await fetchTraceContext('trace-early-timestamp', {
      earliestStartTime: 100,
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(fetchTrace).toHaveBeenCalledWith('trace-early-timestamp', {
      earliestStartTime: 0,
    });
  });

  it('keeps earlier red-team turns out of later turn summaries despite clock skew', async () => {
    const iterationStart = 1_700_000_000_000;
    const firstTurnSpan = {
      spanId: 'turn-1',
      name: 'tool.first-turn',
      startTime: iterationStart - 30_000,
    };
    const secondTurnSpan = {
      spanId: 'turn-2',
      name: 'tool.second-turn',
      startTime: iterationStart - 25_000,
    };
    const fetchTrace = vi
      .fn()
      .mockResolvedValueOnce({
        fetchedAt: iterationStart,
        spans: [firstTurnSpan],
        traceId: 'trace-multiple-turns',
      })
      .mockResolvedValueOnce({
        fetchedAt: iterationStart + 5_000,
        spans: [firstTurnSpan, secondTurnSpan],
        traceId: 'trace-multiple-turns',
      });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });
    const providerConfig = { id: 'tempo' as const, endpoint: 'http://tempo:3200' };

    const firstTurn = await fetchTraceContext('trace-multiple-turns', {
      earliestStartTime: iterationStart,
      maxRetries: 0,
      providerConfig,
      queryDelay: 0,
    });
    const secondTurn = await fetchTraceContext('trace-multiple-turns', {
      earliestStartTime: iterationStart + 5_000,
      maxRetries: 0,
      providerConfig,
      queryDelay: 0,
    });

    expect(firstTurn?.spans.map(({ name }) => name)).toEqual(['tool.first-turn']);
    expect(secondTurn?.spans.map(({ name }) => name)).toEqual(['tool.second-turn']);
    expect(mocks.addSpans.mock.calls[1][1]).toEqual([firstTurnSpan, secondTurnSpan]);
  });

  it('evicts the least recently used completed trace when turn tracking reaches its bound', async () => {
    const fetchTrace = vi.fn(async (traceId: string) => ({
      fetchedAt: 1,
      traceId,
      spans: [{ spanId: `${traceId}-span`, name: 'target.call', startTime: 1 }],
    }));
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });
    const providerConfig = { id: 'tempo' as const, endpoint: 'http://tempo:3200' };
    const fetchOptions = {
      earliestStartTime: 1,
      maxRetries: 0,
      providerConfig,
      queryDelay: 0,
    };

    for (let index = 0; index < 64; index++) {
      await fetchTraceContext(`trace-${index}`, fetchOptions);
    }

    expect(await fetchTraceContext('trace-0', fetchOptions)).toBeNull();
    await fetchTraceContext('trace-64', fetchOptions);

    expect(await fetchTraceContext('trace-0', fetchOptions)).toBeNull();
    expect(await fetchTraceContext('trace-1', fetchOptions)).toMatchObject({
      spans: [expect.objectContaining({ spanId: 'trace-1-span' })],
    });
  });

  it('waits for a new turn span when the backend initially returns only earlier turns', async () => {
    const firstTurnSpan = { spanId: 'turn-1', name: 'tool.first-turn', startTime: 1 };
    const secondTurnSpan = { spanId: 'turn-2', name: 'tool.second-turn', startTime: 2 };
    const fetchTrace = vi
      .fn()
      .mockResolvedValueOnce({ fetchedAt: 1, spans: [firstTurnSpan], traceId: 'trace-turn-retry' })
      .mockResolvedValueOnce({ fetchedAt: 2, spans: [firstTurnSpan], traceId: 'trace-turn-retry' })
      .mockResolvedValueOnce({
        fetchedAt: 3,
        spans: [firstTurnSpan, secondTurnSpan],
        traceId: 'trace-turn-retry',
      });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });
    const providerConfig = { id: 'tempo' as const, endpoint: 'http://tempo:3200' };

    await fetchTraceContext('trace-turn-retry', {
      earliestStartTime: 1,
      maxRetries: 0,
      providerConfig,
      queryDelay: 0,
    });
    const secondTurn = await fetchTraceContext('trace-turn-retry', {
      earliestStartTime: 2,
      maxRetries: 1,
      retryDelayMs: 0,
      providerConfig,
      queryDelay: 0,
    });

    expect(fetchTrace).toHaveBeenCalledTimes(3);
    expect(secondTurn?.spans.map(({ name }) => name)).toEqual(['tool.second-turn']);
  });

  it.each([
    {
      name: 'internal spans are excluded',
      options: { includeInternalSpans: false },
      ineligibleSpan: {
        spanId: 'internal-span',
        name: 'internal.setup',
        startTime: 1,
        attributes: { 'otel.span.kind': 'internal' },
      },
    },
    {
      name: 'span names do not match the requested filter',
      options: { spanFilter: ['tool.*'] },
      ineligibleSpan: {
        spanId: 'http-span',
        name: 'POST /chat',
        startTime: 1,
        attributes: { 'otel.span.kind': 'server' },
      },
    },
  ])('retries when only $name have arrived', async ({ options, ineligibleSpan }) => {
    const toolSpan = {
      spanId: 'tool-span',
      name: 'tool.search',
      startTime: 2,
      attributes: { 'otel.span.kind': 'client' },
    };
    const fetchTrace = vi
      .fn()
      .mockResolvedValueOnce({
        fetchedAt: 1,
        spans: [ineligibleSpan],
        traceId: 'trace-filtered-retry',
      })
      .mockResolvedValueOnce({
        fetchedAt: 2,
        spans: [ineligibleSpan, toolSpan],
        traceId: 'trace-filtered-retry',
      });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-filtered-retry', {
      ...options,
      maxRetries: 1,
      retryDelayMs: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(fetchTrace).toHaveBeenCalledTimes(2);
    expect(result?.spans.map(({ name }) => name)).toEqual(['tool.search']);
    expect(mocks.addSpans).toHaveBeenNthCalledWith(1, 'trace-filtered-retry', [ineligibleSpan], {
      warnIfMissingTrace: false,
    });
    expect(mocks.addSpans).toHaveBeenNthCalledWith(
      2,
      'trace-filtered-retry',
      [ineligibleSpan, toolSpan],
      { warnIfMissingTrace: false },
    );
  });

  it('persists filtered spans even when no eligible span arrives before retries end', async () => {
    const internalSpan = {
      spanId: 'internal-span',
      name: 'internal.setup',
      startTime: 1,
      attributes: { 'otel.span.kind': 'internal' },
    };
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 1,
      spans: [internalSpan],
      traceId: 'trace-filtered-exhausted',
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-filtered-exhausted', {
      includeInternalSpans: false,
      maxRetries: 1,
      retryDelayMs: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(fetchTrace).toHaveBeenCalledTimes(2);
    expect(result).toBeNull();
    expect(mocks.addSpans).toHaveBeenCalledTimes(2);
  });

  it('persists large external traces in bounded batches', async () => {
    const spans = Array.from({ length: 1_201 }, (_, index) => ({
      spanId: `span-${index}`,
      name: `target.call.${index}`,
      startTime: index,
    }));
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 123,
      spans,
      traceId: 'trace-large',
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-large', {
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(result?.spans).toHaveLength(1_201);
    expect(mocks.addSpans).toHaveBeenCalledTimes(3);
    expect(mocks.addSpans.mock.calls.map(([, batch]) => batch.length)).toEqual([500, 500, 201]);
    expect(mocks.addSpans).toHaveBeenNthCalledWith(1, 'trace-large', spans.slice(0, 500), {
      warnIfMissingTrace: false,
    });
    expect(mocks.addSpans).toHaveBeenNthCalledWith(2, 'trace-large', spans.slice(500, 1_000), {
      warnIfMissingTrace: false,
      skipTraceCheck: true,
    });
  });

  it('computes depths iteratively when deeply nested spans sort before their ancestors', async () => {
    const spans = Array.from({ length: 10_000 }, (_, index) => ({
      spanId: `span-${String(9_999 - index).padStart(4, '0')}`,
      ...(index > 0 && {
        parentSpanId: `span-${String(10_000 - index).padStart(4, '0')}`,
      }),
      name: `target.level.${index}`,
      startTime: 1,
    }));
    mocks.createTraceProvider.mockReturnValue({
      fetchTrace: vi.fn().mockResolvedValue({
        fetchedAt: 123,
        spans,
        traceId: 'trace-deep-tree',
      }),
      id: 'tempo',
    });

    const result = await fetchTraceContext('trace-deep-tree', {
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(result?.spans).toHaveLength(10_000);
    expect(result?.spans[0]).toMatchObject({ spanId: 'span-0000', depth: 9_999 });
    expect(result?.spans.at(-1)).toMatchObject({ spanId: 'span-9999', depth: 0 });
  });

  it('stops batching when the trace does not exist in the local store', async () => {
    const spans = Array.from({ length: 501 }, (_, index) => ({
      spanId: `span-${index}`,
      name: `target.call.${index}`,
      startTime: index,
    }));
    mocks.addSpans.mockResolvedValue({ stored: false, reason: 'Trace not found' });
    mocks.createTraceProvider.mockReturnValue({
      fetchTrace: vi.fn().mockResolvedValue({ fetchedAt: 123, spans, traceId: 'trace-missing' }),
      id: 'tempo',
    });

    await fetchTraceContext('trace-missing', {
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(mocks.addSpans).toHaveBeenCalledOnce();
  });

  it('orders external spans by start time before applying the reader span limit', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 123,
      traceId: 'trace-unsorted',
      spans: [
        { spanId: 'late-span', name: 'target.late', startTime: 30 },
        { spanId: 'early-span', name: 'target.early', startTime: 10 },
        { spanId: 'middle-span', name: 'target.middle', startTime: 20 },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-unsorted', {
      maxRetries: 0,
      maxSpans: 2,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(result?.spans.map(({ name }) => name)).toEqual(['target.early', 'target.middle']);
    expect(mocks.addSpans.mock.calls[0][1].map(({ name }: { name: string }) => name)).toEqual([
      'target.late',
      'target.early',
      'target.middle',
    ]);
  });

  it('calculates span depth after excluded ancestors are removed', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 123,
      traceId: 'trace-filtered-depth',
      spans: [
        {
          spanId: 'internal-parent',
          name: 'internal.setup',
          startTime: 1,
          attributes: { 'otel.span.kind': 'internal' },
        },
        {
          spanId: 'target-child',
          parentSpanId: 'internal-parent',
          name: 'target.call',
          startTime: 2,
          attributes: { 'otel.span.kind': 'client' },
        },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-filtered-depth', {
      includeInternalSpans: false,
      maxDepth: 1,
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(result?.spans.map(({ name, depth }) => ({ name, depth }))).toEqual([
      { name: 'target.call', depth: 0 },
    ]);
    expect(mocks.addSpans.mock.calls[0][1]).toHaveLength(2);
  });

  it('uses span IDs to order operations with identical start times consistently', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 123,
      traceId: 'trace-tied-start-times',
      spans: [
        { spanId: 'z-span', name: 'target.second', startTime: 10 },
        { spanId: 'a-span', name: 'target.first', startTime: 10 },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-tied-start-times', {
      maxRetries: 0,
      maxSpans: 1,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(result?.spans.map(({ name }) => name)).toEqual(['target.first']);
  });

  it('matches wildcard span filters without changing plain substring filters', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 123,
      traceId: 'trace-wildcards',
      spans: [
        { spanId: 'chat-span', name: 'chat gpt-4.1-mini', startTime: 1 },
        { spanId: 'tool-span', name: 'execute_tool search', startTime: 2 },
        { spanId: 'other-span', name: 'POST /chat', startTime: 3 },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-wildcards', {
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
      spanFilter: ['CHAT*', '*tool*'],
    });

    expect(result?.spans.map(({ name }) => name)).toEqual([
      'chat gpt-4.1-mini',
      'execute_tool search',
    ]);
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
    const longToolArguments = 'argument-value '.repeat(40);
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
            'gen_ai.tool.call.arguments': longToolArguments,
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
        'gen_ai.tool.call.arguments': `${longToolArguments.slice(0, 400)}…`,
      },
    });
    expect(mocks.addSpans).toHaveBeenCalledWith(
      'trace-4',
      [
        expect.objectContaining({
          attributes: {
            'otel.span.kind_code': 3,
            'gen_ai.usage.total_tokens': 12,
            'X-API-Key': 'secret',
            customer_email: '[REDACTED]',
            'gen_ai.tool.call.arguments': longToolArguments,
          },
        }),
      ],
      { warnIfMissingTrace: false },
    );
  });

  it('redacts span fields that echo explicitly redacted attribute values before persistence', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 1,
      traceId: 'trace-redacted-echo',
      spans: [
        {
          spanId: 'redacted-echo',
          name: 'Bearer echoed-secret',
          statusCode: 2,
          statusMessage: 'Bearer echoed-secret',
          startTime: 1,
          attributes: {
            authorization: 'Bearer echoed-secret',
            safe: 'visible',
          },
        },
        {
          spanId: 'safe-sibling',
          name: 'safe.operation',
          statusMessage: 'ordinary failure',
          startTime: 2,
          attributes: { authorization: 'Bearer another-secret' },
        },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-redacted-echo', {
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
      redactAttributes: ['authorization'],
    });

    expect(mocks.addSpans).toHaveBeenCalledWith(
      'trace-redacted-echo',
      [
        expect.objectContaining({
          name: '[REDACTED]',
          statusMessage: '[REDACTED]',
          attributes: { authorization: '[REDACTED]', safe: 'visible' },
        }),
        expect.objectContaining({
          name: 'safe.operation',
          statusMessage: 'ordinary failure',
          attributes: { authorization: '[REDACTED]' },
        }),
      ],
      { warnIfMissingTrace: false },
    );
    expect(JSON.stringify(result)).not.toContain('echoed-secret');
    expect(JSON.stringify(result)).not.toContain('another-secret');
  });

  it('redacts truncated span fields that echo explicitly redacted attribute values', async () => {
    const fullSecret = `Bearer ${'private-credential-'.repeat(100)}`;
    const truncatedSecret = `${fullSecret.slice(0, 1023)}…`;
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 1,
      traceId: 'trace-truncated-redacted-echo',
      spans: [
        {
          spanId: 'truncated-redacted-echo',
          name: truncatedSecret,
          statusMessage: truncatedSecret,
          startTime: 1,
          attributes: { authorization: fullSecret },
        },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-truncated-redacted-echo', {
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
      redactAttributes: ['authorization'],
    });

    expect(mocks.addSpans).toHaveBeenCalledWith(
      'trace-truncated-redacted-echo',
      [
        expect.objectContaining({
          name: '[REDACTED]',
          statusMessage: '[REDACTED]',
          attributes: { authorization: '[REDACTED]' },
        }),
      ],
      { warnIfMissingTrace: false },
    );
    expect(JSON.stringify(result)).not.toContain('private-credential');
  });

  it('redacts span fields that echo nested or array-backed redacted attribute values', async () => {
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 1,
      traceId: 'trace-nested-redacted-echo',
      spans: [
        {
          spanId: 'nested-redacted-echo',
          name: 'nested-secret',
          statusMessage: 'array-secret',
          startTime: 1,
          attributes: {
            http: { authorization: 'nested-secret', method: 'GET' },
            events: [{ authorization: 'array-secret', name: 'safe-event' }],
          },
        },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-nested-redacted-echo', {
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
      redactAttributes: ['authorization'],
    });

    expect(mocks.addSpans).toHaveBeenCalledWith(
      'trace-nested-redacted-echo',
      [
        expect.objectContaining({
          name: '[REDACTED]',
          statusMessage: '[REDACTED]',
          attributes: {
            http: { authorization: '[REDACTED]', method: 'GET' },
            events: [{ authorization: '[REDACTED]', name: 'safe-event' }],
          },
        }),
      ],
      { warnIfMissingTrace: false },
    );
    expect(JSON.stringify(result)).not.toContain('nested-secret');
    expect(JSON.stringify(result)).not.toContain('array-secret');
  });

  it('persists unsanitized span attributes when no explicit storage redactions are configured', async () => {
    const longToolArguments = 'argument-value '.repeat(40);
    const fetchTrace = vi.fn().mockResolvedValue({
      fetchedAt: 1,
      traceId: 'trace-raw',
      spans: [
        {
          spanId: 'tool-span',
          name: 'execute_tool search',
          startTime: 1,
          attributes: {
            authorization: 'Bearer private-token',
            'gen_ai.tool.call.arguments': longToolArguments,
          },
        },
      ],
    });
    mocks.createTraceProvider.mockReturnValue({ fetchTrace, id: 'tempo' });

    const result = await fetchTraceContext('trace-raw', {
      maxRetries: 0,
      providerConfig: { id: 'tempo', endpoint: 'http://tempo:3200' },
      queryDelay: 0,
    });

    expect(result?.spans[0].attributes).toEqual({
      authorization: '<redacted>',
      'gen_ai.tool.call.arguments': `${longToolArguments.slice(0, 400)}…`,
    });
    expect(mocks.addSpans).toHaveBeenCalledWith(
      'trace-raw',
      [
        expect.objectContaining({
          attributes: {
            authorization: 'Bearer private-token',
            'gen_ai.tool.call.arguments': longToolArguments,
          },
        }),
      ],
      { warnIfMissingTrace: false },
    );
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

    await expect(resultPromise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'cancelled by user',
      cause: controller.signal.reason,
    });
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

    await expect(resultPromise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'cancelled by user',
      cause: controller.signal.reason,
    });
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
    '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01-extra',
    'ff-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    '01-0123456789abcdef0123456789abcdef-0123456789abcdef-0g-extra',
  ])('rejects malformed or all-zero traceparent values: %s', (traceparent) => {
    expect(extractTraceIdFromTraceparent(traceparent)).toBeNull();
  });

  it('extracts and normalizes valid W3C trace IDs', () => {
    expect(
      extractTraceIdFromTraceparent('00-0123456789ABCDEF0123456789ABCDEF-0123456789abcdef-01'),
    ).toBe('0123456789abcdef0123456789abcdef');
  });

  it('accepts future W3C traceparent versions with additional fields', () => {
    expect(
      extractTraceIdFromTraceparent(
        '01-0123456789abcdef0123456789abcdef-0123456789abcdef-01-extra-field',
      ),
    ).toBe('0123456789abcdef0123456789abcdef');
  });
});
