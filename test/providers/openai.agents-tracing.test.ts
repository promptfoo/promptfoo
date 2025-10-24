import { jest } from '@jest/globals';
import type { Trace, Span } from '@openai/agents';
import { OTLPTracingExporter } from '../../src/providers/openai/agents-tracing';

// Mock dependencies
jest.mock('../../src/util/fetch', () => ({
  fetchWithProxy: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('OTLPTracingExporter', () => {
  // Get mock after jest.mock() has been processed
  let fetchWithProxy: jest.MockedFunction<typeof import('../../src/util/fetch').fetchWithProxy>;

  beforeAll(() => {
    const fetchModule = require('../../src/util/fetch');
    fetchWithProxy = fetchModule.fetchWithProxy as jest.MockedFunction<typeof import('../../src/util/fetch').fetchWithProxy>;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock implementation
    fetchWithProxy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should use default OTLP endpoint', () => {
      const exporter = new OTLPTracingExporter();
      expect(exporter['otlpEndpoint']).toBe('http://localhost:4318');
    });

    it('should accept custom OTLP endpoint', () => {
      const exporter = new OTLPTracingExporter({
        otlpEndpoint: 'http://custom:9000',
      });
      expect(exporter['otlpEndpoint']).toBe('http://custom:9000');
    });

    it('should store evaluation and test case IDs', () => {
      const exporter = new OTLPTracingExporter({
        evaluationId: 'eval-123',
        testCaseId: 'test-456',
      });
      expect(exporter['evaluationId']).toBe('eval-123');
      expect(exporter['testCaseId']).toBe('test-456');
    });
  });

  describe('export', () => {
    it('should not export if items array is empty', async () => {
      const exporter = new OTLPTracingExporter();
      await exporter.export([]);
      expect(fetchWithProxy).not.toHaveBeenCalled();
    });

    it('should export spans to OTLP endpoint', async () => {
      fetchWithProxy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);

      const mockSpan: Span<any> = {
        type: 'trace.span',
        traceId: 'trace_abc123',
        spanId: 'span_def456',
        parentId: null,
        name: 'test-span',
        startedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
        endedAt: new Date('2024-01-01T00:00:01Z').toISOString(),
        spanData: { type: 'agent', name: 'Test Agent' },
        error: null,
      } as any;

      const exporter = new OTLPTracingExporter({
        otlpEndpoint: 'http://test:4318',
      });

      await exporter.export([mockSpan]);

      expect(fetchWithProxy).toHaveBeenCalledWith(
        'http://test:4318/v1/traces',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        }),
      );
    });

    it('should handle fetch errors gracefully', async () => {
      fetchWithProxy.mockRejectedValue(new Error('Network error'));

      const mockSpan: Span<any> = {
        type: 'trace.span',
        traceId: 'trace_abc',
        spanId: 'span_def',
        parentId: null,
        name: 'test-span',
        startedAt: new Date().toISOString(),
        spanData: {},
        error: null,
      } as any;

      const exporter = new OTLPTracingExporter();

      // Should not throw
      await expect(exporter.export([mockSpan])).resolves.not.toThrow();
    });

    it('should filter out non-span items', async () => {
      fetchWithProxy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);

      const mockTrace: Trace = { type: 'trace', traceId: 'trace_123' } as any;
      const mockSpan: Span<any> = {
        type: 'trace.span',
        traceId: 'trace_123',
        spanId: 'span_456',
        parentId: null,
        name: 'test-span',
        startedAt: new Date().toISOString(),
        spanData: {},
        error: null,
      } as any;

      const exporter = new OTLPTracingExporter();
      await exporter.export([mockTrace, mockSpan]);

      const callArg = fetchWithProxy.mock.calls[0][1] as any;
      const payload = JSON.parse(callArg.body as string);

      // Should only have 1 span, not the trace item
      expect(payload.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);
    });
  });

  describe('OTLP transformation', () => {
    it('should transform span to OTLP format', async () => {
      fetchWithProxy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);

      const mockSpan: Span<any> = {
        type: 'trace.span',
        traceId: 'trace_abc123def456',
        spanId: 'span_789012',
        parentId: 'span_parent',
        name: 'agent-span',
        startedAt: '2024-01-01T00:00:00.000Z',
        endedAt: '2024-01-01T00:00:01.000Z',
        spanData: {
          type: 'agent',
          name: 'Weather Agent',
          model: 'gpt-4o-mini',
        },
        error: null,
      } as any;

      const exporter = new OTLPTracingExporter({
        evaluationId: 'eval-123',
        testCaseId: 'test-456',
      });

      await exporter.export([mockSpan]);

      const callArg = fetchWithProxy.mock.calls[0][1] as any;
      const payload = JSON.parse(callArg.body as string);

      expect(payload).toMatchObject({
        resourceSpans: [
          {
            resource: {
              attributes: expect.arrayContaining([
                { key: 'service.name', value: { stringValue: 'promptfoo-agents' } },
                { key: 'evaluation.id', value: { stringValue: 'eval-123' } },
                { key: 'test.case.id', value: { stringValue: 'test-456' } },
              ]),
            },
            scopeSpans: [
              {
                scope: {
                  name: 'openai-agents-js',
                  version: '0.1.0',
                },
                spans: expect.arrayContaining([
                  expect.objectContaining({
                    name: 'agent-span',
                    kind: 1,
                  }),
                ]),
              },
            ],
          },
        ],
      });
    });

    it('should handle span with error', async () => {
      fetchWithProxy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);

      const mockSpan: Span<any> = {
        type: 'trace.span',
        traceId: 'trace_abc',
        spanId: 'span_def',
        parentId: null,
        name: 'error-span',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        spanData: {},
        error: { message: 'Test error' },
      } as any;

      const exporter = new OTLPTracingExporter();
      await exporter.export([mockSpan]);

      const callArg = fetchWithProxy.mock.calls[0][1] as any;
      const payload = JSON.parse(callArg.body as string);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];

      expect(span.status).toEqual({
        code: 2, // ERROR
        message: 'Test error',
      });
    });

    it('should strip trace_ and span_ prefixes from IDs', async () => {
      fetchWithProxy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);

      const mockSpan: Span<any> = {
        type: 'trace.span',
        traceId: 'trace_abc123def456789012345678901234',
        spanId: 'span_1234567890123456',
        parentId: 'span_parent12345678',
        name: 'test',
        startedAt: new Date().toISOString(),
        spanData: {},
        error: null,
      } as any;

      const exporter = new OTLPTracingExporter();
      await exporter.export([mockSpan]);

      const callArg = fetchWithProxy.mock.calls[0][1] as any;
      const payload = JSON.parse(callArg.body as string);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];

      // IDs should be base64 encoded after stripping prefixes
      expect(span.traceId).toBeTruthy();
      expect(span.spanId).toBeTruthy();
      expect(span.parentSpanId).toBeTruthy();
    });

    it('should convert timestamps to nanoseconds', async () => {
      fetchWithProxy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);

      const startTime = new Date('2024-01-01T00:00:00.000Z');
      const endTime = new Date('2024-01-01T00:00:01.000Z');

      const mockSpan: Span<any> = {
        type: 'trace.span',
        traceId: 'trace_abc',
        spanId: 'span_def',
        parentId: null,
        name: 'test',
        startedAt: startTime.toISOString(),
        endedAt: endTime.toISOString(),
        spanData: {},
        error: null,
      } as any;

      const exporter = new OTLPTracingExporter();
      await exporter.export([mockSpan]);

      const callArg = fetchWithProxy.mock.calls[0][1] as any;
      const payload = JSON.parse(callArg.body as string);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];

      // Convert ms to ns (multiply by 1,000,000)
      expect(span.startTimeUnixNano).toBe(String(startTime.getTime() * 1_000_000));
      expect(span.endTimeUnixNano).toBe(String(endTime.getTime() * 1_000_000));
    });

    it('should map span attributes', async () => {
      fetchWithProxy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);

      const mockSpan: Span<any> = {
        type: 'trace.span',
        traceId: 'trace_abc',
        spanId: 'span_def',
        parentId: null,
        name: 'test',
        startedAt: new Date().toISOString(),
        spanData: {
          type: 'function',
          name: 'get_weather',
          input: { city: 'Tokyo' },
          output: { temperature: '20°C' },
        },
        error: null,
      } as any;

      const exporter = new OTLPTracingExporter();
      await exporter.export([mockSpan]);

      const callArg = fetchWithProxy.mock.calls[0][1] as any;
      const payload = JSON.parse(callArg.body as string);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];

      // Should have attributes for all span data (excluding name and type)
      expect(span.attributes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'agent.input' }),
          expect.objectContaining({ key: 'agent.output' }),
        ]),
      );
    });

    it('should handle missing endTime', async () => {
      fetchWithProxy.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as any);

      const mockSpan: Span<any> = {
        type: 'trace.span',
        traceId: 'trace_abc',
        spanId: 'span_def',
        parentId: null,
        name: 'test',
        startedAt: new Date().toISOString(),
        endedAt: undefined,
        spanData: {},
        error: null,
      } as any;

      const exporter = new OTLPTracingExporter();
      await exporter.export([mockSpan]);

      const callArg = fetchWithProxy.mock.calls[0][1] as any;
      const payload = JSON.parse(callArg.body as string);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];

      expect(span.endTimeUnixNano).toBeUndefined();
    });
  });
});
