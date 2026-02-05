import { ExportResultCode } from '@opentelemetry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSpanExporter } from '../../src/tracing/localSpanExporter';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

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
      // SDK 2.x uses parentSpanContext instead of parentSpanId
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
      resource: { attributes: {} },
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
        { skipTraceCheck: false },
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
      expect(mockAddSpans).toHaveBeenCalledWith(
        'trace-1',
        expect.arrayContaining([
          expect.objectContaining({ spanId: 'span-1' }),
          expect.objectContaining({ spanId: 'span-2' }),
        ]),
        { skipTraceCheck: false },
      );

      // Second call for trace-2 with 1 span
      expect(mockAddSpans).toHaveBeenCalledWith(
        'trace-2',
        [expect.objectContaining({ spanId: 'span-3' })],
        { skipTraceCheck: false },
      );
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
          'gen_ai.system': 'openai',
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
              'gen_ai.system': 'openai',
              'gen_ai.request.model': 'gpt-4',
              'gen_ai.usage.input_tokens': 100,
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
});
