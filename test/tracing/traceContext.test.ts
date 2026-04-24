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
  sleep: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: mocks.logger,
}));

vi.mock('../../src/util/time', () => ({
  sleep: mocks.sleep,
}));

vi.mock('../../src/tracing/providers', () => ({
  createTraceProvider: mocks.createTraceProvider,
  isExternalTraceProvider: mocks.isExternalTraceProvider,
}));

vi.mock('../../src/tracing/store', () => ({
  getTraceStore: mocks.getTraceStore,
}));

import { fetchTraceContext } from '../../src/tracing/traceContext';

describe('fetchTraceContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addSpans.mockResolvedValue({ stored: true });
    mocks.getTraceStore.mockReturnValue({
      addSpans: mocks.addSpans,
      getSpans: mocks.getSpans,
    });
    mocks.isExternalTraceProvider.mockReturnValue(true);
    mocks.sleep.mockResolvedValue(undefined);
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
      { skipTraceCheck: true },
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
});
