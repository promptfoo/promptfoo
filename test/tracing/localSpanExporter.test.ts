import { ExportResultCode } from '@opentelemetry/core';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSpanExporter } from '../../src/tracing/localSpanExporter';
import { createDeferred } from '../util/utils';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-node';

// Mock the store module
const mockAddSpans = vi.fn();
const mockTraceStore = {
  addSpans: mockAddSpans,
};

vi.mock('../../src/tracing/store', () => ({
  getTraceStore: vi.fn(() => mockTraceStore),
}));

// Mock logger
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('LocalSpanExporter', () => {
  let exporter: LocalSpanExporter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAddSpans.mockResolvedValue({ stored: true });
    exporter = new LocalSpanExporter();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  function createMockSpan(
    overrides: Partial<{
      traceId: string;
      spanId: string;
      parentSpanId: string;
      name: string;
      startTime: [number, number];
      endTime: [number, number];
      attributes: Record<string, unknown>;
      resourceAttributes: Record<string, unknown>;
      status: { code: number; message?: string };
    }> = {},
  ): ReadableSpan {
    const traceId = overrides.traceId ?? 'trace-id-123';
    return {
      spanContext: () => ({
        traceId,
        spanId: overrides.spanId ?? 'span-id-456',
        traceFlags: 1,
        isRemote: false,
      }),
      // OpenTelemetry SDK 2.x uses parentSpanContext instead of parentSpanId
      parentSpanContext: overrides.parentSpanId
        ? { traceId, spanId: overrides.parentSpanId, traceFlags: 1, isRemote: false }
        : undefined,
      name: overrides.name ?? 'test-span',
      startTime: overrides.startTime ?? [1000, 500000000], // 1000.5 seconds
      endTime: overrides.endTime ?? [1001, 200000000], // 1001.2 seconds
      attributes: overrides.attributes ?? { 'test.attr': 'value' },
      status: overrides.status ?? { code: 1 },
      kind: 2, // CLIENT
      links: [],
      events: [],
      resource: { attributes: overrides.resourceAttributes ?? {} },
      instrumentationLibrary: { name: 'test' },
      duration: [0, 700000000],
      ended: true,
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    } as unknown as ReadableSpan;
  }

  // Helper to wrap callback-based export in a promise
  function exportSpans(spans: ReadableSpan[]): Promise<{ code: number; error?: Error }> {
    return new Promise((resolve) => {
      exporter.export(spans, resolve);
    });
  }

  describe('export', () => {
    it('should export empty span array successfully', async () => {
      const result = await exportSpans([]);

      expect(result.code).toBe(ExportResultCode.SUCCESS);
      expect(mockAddSpans).not.toHaveBeenCalled();
    });

    it('should export single span to trace store', async () => {
      const span = createMockSpan();

      const result = await exportSpans([span]);

      expect(result.code).toBe(ExportResultCode.SUCCESS);
      expect(mockAddSpans).toHaveBeenCalledWith(
        'trace-id-123',
        [
          expect.objectContaining({
            spanId: 'span-id-456',
            name: 'test-span',
          }),
        ],
        expect.objectContaining({ skipTraceCheck: false, warnIfMissingTrace: false }),
      );
    });

    it('should group spans by trace ID', async () => {
      const span1 = createMockSpan({
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'span-one',
      });
      const span2 = createMockSpan({
        traceId: 'trace-1',
        spanId: 'span-2',
        name: 'span-two',
      });
      const span3 = createMockSpan({
        traceId: 'trace-2',
        spanId: 'span-3',
        name: 'span-three',
      });

      const result = await exportSpans([span1, span2, span3]);

      expect(result.code).toBe(ExportResultCode.SUCCESS);
      expect(mockAddSpans).toHaveBeenCalledTimes(2);

      // First call for trace-1 with 2 spans
      expect(mockAddSpans).toHaveBeenNthCalledWith(
        1,
        'trace-1',
        expect.arrayContaining([
          expect.objectContaining({ spanId: 'span-1' }),
          expect.objectContaining({ spanId: 'span-2' }),
        ]),
        expect.objectContaining({ skipTraceCheck: false, warnIfMissingTrace: false }),
      );

      // Second call for trace-2 with 1 span
      expect(mockAddSpans).toHaveBeenNthCalledWith(
        2,
        'trace-2',
        [expect.objectContaining({ spanId: 'span-3' })],
        expect.objectContaining({ skipTraceCheck: false, warnIfMissingTrace: false }),
      );
    });

    it('retries once when the trace record is not visible yet', async () => {
      vi.useFakeTimers();
      try {
        const span = createMockSpan();

        mockAddSpans
          .mockResolvedValueOnce({ stored: false, reason: 'Trace trace-id-123 not found' })
          .mockResolvedValueOnce({ stored: true });

        const resultPromise = exportSpans([span]);
        await vi.advanceTimersByTimeAsync(50);
        const result = await resultPromise;

        expect(result.code).toBe(ExportResultCode.SUCCESS);
        expect(mockAddSpans).toHaveBeenCalledTimes(2);
        expect(mockAddSpans).toHaveBeenNthCalledWith(
          1,
          'trace-id-123',
          [expect.objectContaining({ spanId: 'span-id-456' })],
          expect.objectContaining({ skipTraceCheck: false, warnIfMissingTrace: false }),
        );
        expect(mockAddSpans).toHaveBeenNthCalledWith(
          2,
          'trace-id-123',
          [expect.objectContaining({ spanId: 'span-id-456' })],
          expect.objectContaining({ skipTraceCheck: false, warnIfMissingTrace: false }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should convert span times to milliseconds', async () => {
      const span = createMockSpan({
        startTime: [100, 500000000], // 100.5 seconds
        endTime: [101, 750000000], // 101.75 seconds
      });

      const result = await exportSpans([span]);

      expect(result.code).toBe(ExportResultCode.SUCCESS);
      expect(mockAddSpans).toHaveBeenCalledWith(
        expect.any(String),
        [
          expect.objectContaining({
            // Milliseconds: seconds * 1000 + nanoseconds / 1_000_000
            startTime: 100 * 1e3 + 500000000 / 1e6, // 100500 ms
            endTime: 101 * 1e3 + 750000000 / 1e6, // 101750 ms
          }),
        ],
        expect.any(Object),
      );
    });

    it('reports skipped orphan spans to the affected row when the exporter otherwise succeeds', async () => {
      vi.useFakeTimers();
      try {
        const release = exporter.trackTrace('trace-id-123');
        mockAddSpans.mockResolvedValue({ stored: false, reason: 'Missing trace record' });
        const result = exportSpans([createMockSpan()]);
        await vi.advanceTimersByTimeAsync(50);
        expect((await result).code).toBe(ExportResultCode.SUCCESS);
        await expect(exporter.forceFlush('trace-id-123')).rejects.toThrow('Missing trace record');
        release();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should include parent span ID when present', async () => {
      const span = createMockSpan({
        parentSpanId: 'parent-span-id',
      });

      const result = await exportSpans([span]);

      expect(result.code).toBe(ExportResultCode.SUCCESS);
      expect(mockAddSpans).toHaveBeenCalledWith(
        expect.any(String),
        [
          expect.objectContaining({
            parentSpanId: 'parent-span-id',
          }),
        ],
        expect.any(Object),
      );
    });

    it('should include span attributes', async () => {
      const span = createMockSpan({
        attributes: {
          'gen_ai.provider.name': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.usage.input_tokens': 100,
        },
      });

      const result = await exportSpans([span]);

      expect(result.code).toBe(ExportResultCode.SUCCESS);
      expect(mockAddSpans).toHaveBeenCalledWith(
        expect.any(String),
        [
          expect.objectContaining({
            attributes: {
              'gen_ai.provider.name': 'openai',
              'gen_ai.request.model': 'gpt-4',
              'gen_ai.usage.input_tokens': 100,
            },
          }),
        ],
        expect.any(Object),
      );
    });

    it('preserves resource attributes and lets span attributes override matching keys', async () => {
      const span = createMockSpan({
        resourceAttributes: {
          'service.name': 'configured-promptfoo-service',
          'service.version': '1.2.3',
          'deployment.environment': 'resource',
        },
        attributes: {
          'deployment.environment': 'span',
          'gen_ai.provider.name': 'openai',
        },
      });

      await exportSpans([span]);

      expect(mockAddSpans).toHaveBeenCalledWith(
        expect.any(String),
        [
          expect.objectContaining({
            attributes: {
              'service.name': 'configured-promptfoo-service',
              'service.version': '1.2.3',
              'deployment.environment': 'span',
              'gen_ai.provider.name': 'openai',
            },
          }),
        ],
        expect.any(Object),
      );
    });

    it('should include status code and message', async () => {
      const span = createMockSpan({
        status: { code: 2, message: 'Error occurred' },
      });

      const result = await exportSpans([span]);

      expect(result.code).toBe(ExportResultCode.SUCCESS);
      expect(mockAddSpans).toHaveBeenCalledWith(
        expect.any(String),
        [
          expect.objectContaining({
            statusCode: 2,
            statusMessage: 'Error occurred',
          }),
        ],
        expect.any(Object),
      );
    });

    it('should return FAILED on export error', async () => {
      const span = createMockSpan();
      const error = new Error('Database error');

      mockAddSpans.mockRejectedValue(error);

      const result = await exportSpans([span]);

      expect(result.code).toBe(ExportResultCode.FAILED);
      expect(result.error).toBe(error);
    });

    it('should continue exporting other traces if one fails', async () => {
      const span1 = createMockSpan({ traceId: 'trace-1', spanId: 'span-1' });
      const span2 = createMockSpan({ traceId: 'trace-2', spanId: 'span-2' });

      mockAddSpans
        .mockRejectedValueOnce(new Error('First trace failed'))
        .mockResolvedValueOnce({ stored: true });

      // Even with one failure, we still attempt all exports
      const _result = await exportSpans([span1, span2]);

      // Both traces were attempted
      expect(mockAddSpans).toHaveBeenCalledTimes(2);
    });
  });

  describe('shutdown', () => {
    it('should resolve successfully', async () => {
      await expect(exporter.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('forceFlush', () => {
    it('should resolve successfully', async () => {
      await expect(exporter.forceFlush()).resolves.toBeUndefined();
    });
  });

  it('remembers a failed trace group through later success and forgets it on release', async () => {
    const release = exporter.trackTrace('affected');
    const releaseAgain = exporter.trackTrace('affected');
    const releaseHealthy = exporter.trackTrace('healthy');
    const failure = new Error('SQLITE_BUSY');
    mockAddSpans.mockRejectedValueOnce(failure);
    const affected = createMockSpan({ traceId: 'affected' });
    const healthy = createMockSpan({ traceId: 'healthy' });
    const mixed = await exportSpans([affected, healthy]);
    expect(mixed.code).toBe(ExportResultCode.FAILED);
    expect((await exportSpans([affected])).code).toBe(ExportResultCode.SUCCESS);
    release();
    release();
    await expect(exporter.forceFlush('healthy')).resolves.toBeUndefined();
    await expect(exporter.forceFlush('affected')).rejects.toBe(failure);
    releaseAgain();
    const releaseFresh = exporter.trackTrace('affected');
    await expect(exporter.forceFlush('affected')).resolves.toBeUndefined();
    releaseFresh();
    releaseHealthy();
  });

  it('withholds only unfinished trace groups when one batch times out', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OTEL_BSP_EXPORT_TIMEOUT', '20');
    try {
      exporter = new LocalSpanExporter();
      const ids = ['saved', 'stalled', 'unstarted'];
      const releases = ids.map((id) => exporter.trackTrace(id));
      const stalled = createDeferred<{ stored: boolean }>();
      const started = createDeferred<void>();
      mockAddSpans.mockResolvedValueOnce({ stored: true }).mockImplementationOnce(() => {
        started.resolve();
        return stalled.promise;
      });
      const exported = exportSpans(ids.map((traceId) => createMockSpan({ traceId })));
      await started.promise;
      // The first group is already available even while the second write remains queued.
      await expect(exporter.forceFlush('saved')).resolves.toBeUndefined();
      const drains = Promise.allSettled(ids.map((id) => exporter.forceFlush(id)));
      await vi.advanceTimersByTimeAsync(21);
      expect((await exported).code).toBe(ExportResultCode.FAILED);
      expect(await drains).toEqual([
        { status: 'fulfilled', value: undefined },
        { status: 'rejected', reason: expect.objectContaining({ name: 'TimeoutError' }) },
        { status: 'rejected', reason: expect.objectContaining({ name: 'TimeoutError' }) },
      ]);
      stalled.resolve({ stored: true });
      await vi.advanceTimersByTimeAsync(1);
      await expect(exporter.forceFlush('stalled')).rejects.toThrow('Local span export timed out');
      for (const release of releases) {
        release();
      }
    } finally {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    }
  });

  it('bounds flush and shutdown when an already dispatched write stalls', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OTEL_BSP_EXPORT_TIMEOUT', '20');
    try {
      exporter = new LocalSpanExporter();
      const deadline = Date.now() + 20;
      const queued = createDeferred<{ stored: boolean }>();
      mockAddSpans.mockReturnValueOnce(queued.promise);
      const finished = vi.fn();
      exporter.export([createMockSpan(), createMockSpan({ traceId: 'later-trace' })], finished);
      const drains = Promise.allSettled([exporter.forceFlush(), exporter.shutdown()]);
      await vi.advanceTimersByTimeAsync(21);
      expect(finished).toHaveBeenCalledOnce();
      expect(finished).toHaveBeenCalledWith({
        code: ExportResultCode.FAILED,
        error: expect.objectContaining({ name: 'TimeoutError' }),
      });
      expect(await drains).toEqual([
        { status: 'rejected', reason: expect.objectContaining({ name: 'TimeoutError' }) },
        { status: 'rejected', reason: expect.objectContaining({ name: 'TimeoutError' }) },
      ]);
      const options = mockAddSpans.mock.calls[0][2];
      expect(options.deadline).toBe(deadline);
      expect(options.abortSignal.aborted).toBe(true);
      // A database operation may settle long after the export callback. Don't start another.
      queued.resolve({ stored: true });
      await vi.advanceTimersByTimeAsync(1);
      expect(mockAddSpans).toHaveBeenCalledOnce();
      expect(finished).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    }
  });

  it('reports the expired batch when a synchronous write outlasts its timer', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OTEL_BSP_EXPORT_TIMEOUT', '20');
    try {
      exporter = new LocalSpanExporter();
      const deadline = Date.now() + 20;
      mockAddSpans.mockImplementationOnce(async () => {
        vi.setSystemTime(deadline);
        return { stored: true };
      });
      const result = await exportSpans([createMockSpan()]);
      expect(result.code).toBe(ExportResultCode.FAILED);
      expect(result.error?.name).toBe('TimeoutError');
    } finally {
      vi.unstubAllEnvs();
      vi.useRealTimers();
    }
  });

  it.each(['forceFlush', 'shutdown'] as const)(
    'waits for an already dispatched batch on %s',
    async (method) => {
      const started = createDeferred<void>();
      const write = createDeferred<{ stored: boolean }>();
      mockAddSpans.mockImplementationOnce(() => {
        started.resolve();
        return write.promise;
      });
      const provider = new NodeTracerProvider({
        spanProcessors: [
          new BatchSpanProcessor(exporter, { maxQueueSize: 1, maxExportBatchSize: 1 }),
        ],
      });
      provider.getTracer('test').startSpan('already-dispatched').end();
      try {
        await started.promise;
        // Once the processor dispatches a batch, it is absent from its flush queue.
        const drained = vi.fn();
        const pending = (method === 'shutdown' ? provider.shutdown() : exporter.forceFlush()).then(
          drained,
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(drained).not.toHaveBeenCalled();
        write.resolve({ stored: true });
        await pending;
        expect(drained).toHaveBeenCalledOnce();
      } finally {
        write.resolve({ stored: true });
        await provider.shutdown();
      }
    },
  );
});
