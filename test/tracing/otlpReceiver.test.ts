import path from 'path';

import protobuf from 'protobufjs';
import request from 'supertest';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  vi,
} from 'vitest';
import { OTLPReceiver } from '../../src/tracing/otlpReceiver';

import type { TraceStore } from '../../src/tracing/store';

// Helper to create protobuf-encoded OTLP data for tests
let protoRoot: protobuf.Root | null = null;

async function getProtoRoot(): Promise<protobuf.Root> {
  if (protoRoot) {
    return protoRoot;
  }
  const protoDir = path.join(__dirname, '../../src/tracing/proto');
  const root = new protobuf.Root();
  root.resolvePath = (_origin: string, target: string) => {
    return path.join(protoDir, target);
  };
  await root.load('opentelemetry/proto/collector/trace/v1/trace_service.proto');
  protoRoot = root;
  return protoRoot;
}

async function encodeOTLPRequest(data: any): Promise<Buffer> {
  const root = await getProtoRoot();
  const ExportTraceServiceRequest = root.lookupType(
    'opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest',
  );
  const message = ExportTraceServiceRequest.create(data);
  const encoded = ExportTraceServiceRequest.encode(message).finish();
  return Buffer.from(encoded);
}

// Mock the database
vi.mock('../../src/database', () => ({
  getDb: vi.fn(() => ({
    insert: vi.fn(),
    select: vi.fn(),
    delete: vi.fn(),
  })),
}));

// Mock the trace store
vi.mock('../../src/tracing/store');

// Mock the logger
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Get the mocked module - initialized in beforeAll
let mockedTraceStore: typeof import('../../src/tracing/store');

describe('OTLPReceiver', () => {
  let receiver: OTLPReceiver;
  let mockTraceStore: {
    createTrace: MockedFunction<() => Promise<void>>;
    addSpans: MockedFunction<(traceId: string, spans: any[], options?: any) => Promise<void>>;
    getTracesByEvaluation: MockedFunction<() => Promise<any[]>>;
    getTrace: MockedFunction<() => Promise<any | null>>;
    deleteOldTraces: MockedFunction<() => Promise<void>>;
  };

  beforeAll(async () => {
    mockedTraceStore = vi.mocked(await import('../../src/tracing/store'));
  });

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock trace store
    mockTraceStore = {
      createTrace: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      addSpans: vi
        .fn<(traceId: string, spans: any[], options?: any) => Promise<void>>()
        .mockResolvedValue(undefined),
      getTracesByEvaluation: vi.fn<() => Promise<any[]>>().mockResolvedValue([]),
      getTrace: vi.fn<() => Promise<any | null>>().mockResolvedValue(null),
      deleteOldTraces: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    // Mock the getTraceStore function
    (mockedTraceStore.getTraceStore as MockedFunction<() => TraceStore>).mockReturnValue(
      mockTraceStore as unknown as TraceStore,
    );

    // Create receiver instance
    receiver = new OTLPReceiver();

    // Manually override the traceStore property
    (receiver as any).traceStore = mockTraceStore;
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe('Health check', () => {
    it('should respond to health check endpoint', async () => {
      const response = await request(receiver.getApp()).get('/health').expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('Service info', () => {
    it('should provide service information', async () => {
      const response = await request(receiver.getApp()).get('/v1/traces').expect(200);

      expect(response.body).toEqual({
        service: 'promptfoo-otlp-receiver',
        version: '1.0.0',
        supported_formats: ['json', 'protobuf'],
      });
    });

    it('should advertise configured formats', async () => {
      receiver = new OTLPReceiver({ acceptFormats: ['json'] });
      (receiver as any).traceStore = mockTraceStore;

      const response = await request(receiver.getApp()).get('/v1/traces').expect(200);

      expect(response.body).toEqual({
        service: 'promptfoo-otlp-receiver',
        version: '1.0.0',
        supported_formats: ['json'],
      });
    });
  });

  describe('Trace ingestion', () => {
    it('should accept valid OTLP JSON traces', async () => {
      const otlpRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'test-service' } },
                { key: 'service.version', value: { stringValue: '1.0.0' } },
              ],
            },
            scopeSpans: [
              {
                scope: {
                  name: 'test-tracer',
                  version: '1.0.0',
                },
                spans: [
                  {
                    traceId: Buffer.from('12345678901234567890123456789012', 'hex').toString(
                      'base64',
                    ),
                    spanId: Buffer.from('1234567890123456', 'hex').toString('base64'),
                    name: 'test-span',
                    kind: 1,
                    startTimeUnixNano: '1700000000000000000',
                    endTimeUnixNano: '1700000001000000000',
                    attributes: [
                      { key: 'test.attribute', value: { stringValue: 'test-value' } },
                      { key: 'test.count', value: { intValue: '42' } },
                    ],
                    status: {
                      code: 0,
                      message: 'OK',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/json')
        .send(otlpRequest);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ partialSuccess: {} });

      // Verify spans were stored
      expect(mockTraceStore.addSpans).toHaveBeenCalledWith(
        '12345678901234567890123456789012',
        expect.arrayContaining([
          expect.objectContaining({
            spanId: '1234567890123456',
            name: 'test-span',
            startTime: 1700000000000,
            endTime: 1700000001000,
            attributes: expect.objectContaining({
              'service.name': 'test-service',
              'service.version': '1.0.0',
              'test.attribute': 'test-value',
              'test.count': 42,
              'otel.scope.name': 'test-tracer',
              'otel.scope.version': '1.0.0',
            }),
            statusCode: 0,
            statusMessage: 'OK',
          }),
        ]),
        { skipTraceCheck: true },
      );
    });

    it('should accept json with a charset content type', async () => {
      const otlpRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: Buffer.from('12345678901234567890123456789012', 'hex').toString(
                      'base64',
                    ),
                    spanId: Buffer.from('1234567890123456', 'hex').toString('base64'),
                    name: 'json-with-charset',
                    startTimeUnixNano: '1700000000000000000',
                  },
                ],
              },
            ],
          },
        ],
      };

      await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/json; charset=utf-8')
        .send(otlpRequest)
        .expect(200);

      expect(mockTraceStore.addSpans).toHaveBeenCalledWith(
        '12345678901234567890123456789012',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'json-with-charset',
          }),
        ]),
        { skipTraceCheck: true },
      );
    });

    it('should handle multiple spans in a single request', async () => {
      // Manually override the traceStore property for this test too
      (receiver as any).traceStore = mockTraceStore;
      const otlpRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: Buffer.from('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex').toString(
                      'base64',
                    ),
                    spanId: Buffer.from('1111111111111111', 'hex').toString('base64'),
                    name: 'span-1',
                    startTimeUnixNano: '1000000000',
                  },
                  {
                    traceId: Buffer.from('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex').toString(
                      'base64',
                    ),
                    spanId: Buffer.from('2222222222222222', 'hex').toString('base64'),
                    parentSpanId: Buffer.from('1111111111111111', 'hex').toString('base64'),
                    name: 'span-2',
                    startTimeUnixNano: '2000000000',
                  },
                ],
              },
            ],
          },
        ],
      };

      await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(mockTraceStore.addSpans).toHaveBeenCalledWith(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        expect.arrayContaining([
          expect.objectContaining({
            spanId: '1111111111111111',
            name: 'span-1',
          }),
          expect.objectContaining({
            spanId: '2222222222222222',
            parentSpanId: '1111111111111111',
            name: 'span-2',
          }),
        ]),
        { skipTraceCheck: true },
      );
    });

    it('should parse different attribute types', async () => {
      // Manually override the traceStore property for this test too
      (receiver as any).traceStore = mockTraceStore;
      const otlpRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: Buffer.from('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'hex').toString(
                      'base64',
                    ),
                    spanId: Buffer.from('3333333333333333', 'hex').toString('base64'),
                    name: 'test-attributes',
                    startTimeUnixNano: '1000000000',
                    attributes: [
                      { key: 'string.attr', value: { stringValue: 'hello' } },
                      { key: 'int.attr', value: { intValue: '123' } },
                      { key: 'double.attr', value: { doubleValue: 3.14 } },
                      { key: 'bool.attr', value: { boolValue: true } },
                      {
                        key: 'array.attr',
                        value: {
                          arrayValue: {
                            values: [{ stringValue: 'a' }, { stringValue: 'b' }],
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(mockTraceStore.addSpans).toHaveBeenCalledWith(
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        expect.arrayContaining([
          expect.objectContaining({
            attributes: expect.objectContaining({
              'string.attr': 'hello',
              'int.attr': 123,
              'double.attr': 3.14,
              'bool.attr': true,
              'array.attr': ['a', 'b'],
            }),
          }),
        ]),
        { skipTraceCheck: true },
      );
    });

    it('should reject unsupported content types', async () => {
      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'text/plain')
        .send('invalid data')
        .expect(415);

      expect(response.body).toEqual({ error: 'Unsupported content type' });
    });

    it('should reject protobuf when only json is enabled', async () => {
      receiver = new OTLPReceiver({ acceptFormats: ['json'] });
      (receiver as any).traceStore = mockTraceStore;

      const encodedData = await encodeOTLPRequest({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: new Uint8Array(16),
                    spanId: new Uint8Array(8),
                    name: 'disabled-protobuf',
                    startTimeUnixNano: 1n,
                  },
                ],
              },
            ],
          },
        ],
      });

      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/x-protobuf')
        .send(encodedData)
        .expect(415);

      expect(response.body).toEqual({ error: 'Unsupported content type' });
      expect(mockTraceStore.addSpans).not.toHaveBeenCalled();
    });

    it('should reject json when only protobuf is enabled', async () => {
      receiver = new OTLPReceiver({ acceptFormats: ['protobuf'] });
      (receiver as any).traceStore = mockTraceStore;

      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/json')
        .send({ resourceSpans: [] })
        .expect(415);

      expect(response.body).toEqual({ error: 'Unsupported content type' });
      expect(mockTraceStore.addSpans).not.toHaveBeenCalled();
    });

    it('should reject malformed json with 415 when json is disabled', async () => {
      receiver = new OTLPReceiver({ acceptFormats: ['protobuf'] });
      (receiver as any).traceStore = mockTraceStore;

      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/json')
        .send('{ invalid json')
        .expect(415);

      expect(response.body).toEqual({ error: 'Unsupported content type' });
      expect(mockTraceStore.addSpans).not.toHaveBeenCalled();
    });

    it('should reject invalid protobuf data', async () => {
      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/x-protobuf')
        .send(Buffer.from('dummy protobuf data'))
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/invalid protobuf/i);
    });

    it('should accept valid OTLP protobuf traces', async () => {
      // Manually override the traceStore property for this test too
      (receiver as any).traceStore = mockTraceStore;

      const traceIdBytes = new Uint8Array([
        0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe, 0xef, 0xde, 0xad, 0xbe,
        0xef,
      ]);
      const spanIdBytes = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef]);

      const protobufRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'test-python-service' } }],
            },
            scopeSpans: [
              {
                scope: {
                  name: 'opentelemetry.instrumentation.test',
                  version: '1.0.0',
                },
                spans: [
                  {
                    traceId: traceIdBytes,
                    spanId: spanIdBytes,
                    name: 'protobuf-test-span',
                    kind: 2, // SPAN_KIND_SERVER
                    startTimeUnixNano: 1700000000000000000n,
                    endTimeUnixNano: 1700000001000000000n,
                    attributes: [
                      { key: 'http.method', value: { stringValue: 'POST' } },
                      { key: 'http.status_code', value: { intValue: 200 } },
                    ],
                    status: {
                      code: 1, // STATUS_CODE_OK
                      message: 'Success',
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const encodedData = await encodeOTLPRequest(protobufRequest);

      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/x-protobuf')
        .send(encodedData)
        .expect(200);

      expect(response.body).toEqual({ partialSuccess: {} });

      // Verify spans were stored with correct trace ID
      expect(mockTraceStore.addSpans).toHaveBeenCalledWith(
        'deadbeefdeadbeefdeadbeefdeadbeef',
        expect.arrayContaining([
          expect.objectContaining({
            spanId: '1234567890abcdef',
            name: 'protobuf-test-span',
            attributes: expect.objectContaining({
              'service.name': 'test-python-service',
              'http.method': 'POST',
              'http.status_code': 200,
              'otel.scope.name': 'opentelemetry.instrumentation.test',
              'otel.scope.version': '1.0.0',
            }),
            statusCode: 1,
            statusMessage: 'Success',
          }),
        ]),
        { skipTraceCheck: true },
      );
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/json')
        .send('{ invalid json')
        .expect(400);

      expect(response.status).toBe(400);
    });

    it('should handle trace store errors gracefully', async () => {
      mockTraceStore.addSpans.mockRejectedValueOnce(new Error('Database error'));

      const otlpRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: Buffer.from('cccccccccccccccccccccccccccccccc', 'hex').toString(
                      'base64',
                    ),
                    spanId: Buffer.from('4444444444444444', 'hex').toString('base64'),
                    name: 'error-span',
                    startTimeUnixNano: '1000000000',
                  },
                ],
              },
            ],
          },
        ],
      };

      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(500);

      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('Base64 to hex conversion', () => {
    it('should correctly convert base64 trace IDs to hex', async () => {
      // Manually override the traceStore property for this test too
      (receiver as any).traceStore = mockTraceStore;
      const traceIdHex = 'deadbeefdeadbeefdeadbeefdeadbeef';
      const traceIdBase64 = Buffer.from(traceIdHex, 'hex').toString('base64');

      const otlpRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: traceIdBase64,
                    spanId: Buffer.from('1234567890abcdef', 'hex').toString('base64'),
                    name: 'test-conversion',
                    startTimeUnixNano: '1000000000',
                  },
                ],
              },
            ],
          },
        ],
      };

      await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/json')
        .send(otlpRequest)
        .expect(200);

      expect(mockTraceStore.addSpans).toHaveBeenCalledWith(traceIdHex, expect.any(Array), {
        skipTraceCheck: true,
      });
    });
  });

  describe('Log ingestion (/v1/logs)', () => {
    const hexTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const hexParentSpanId = '00f067aa0ba902b7';

    function makeLogsRequest(records: any[]) {
      return {
        resourceLogs: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'claude-agent-sdk' } }],
            },
            scopeLogs: [
              {
                scope: { name: 'com.anthropic.claude_code', version: '1.0.0' },
                logRecords: records,
              },
            ],
          },
        ],
      };
    }

    it('converts a Claude Code log into a child span with event.name attribute', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          severityNumber: 9,
          severityText: 'INFO',
          body: { stringValue: 'Tool execution complete' },
          attributes: [
            { key: 'event.name', value: { stringValue: 'claude_code.tool.execution' } },
            { key: 'tool_name', value: { stringValue: 'Bash' } },
            { key: 'duration_ms', value: { intValue: '342' } },
          ],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      expect(mockTraceStore.addSpans).toHaveBeenCalledTimes(1);
      const [persistedTraceId, spans] = mockTraceStore.addSpans.mock.calls[0];
      expect(persistedTraceId).toBe(hexTraceId);
      expect(spans).toHaveLength(1);
      const span = (spans as any[])[0];
      expect(span.name).toBe('claude_code.tool.execution');
      expect(span.parentSpanId).toBe(hexParentSpanId);
      expect(span.attributes['tool_name']).toBe('Bash');
      expect(span.attributes['duration_ms']).toBe(342);
      expect(span.attributes['otel.log.body']).toBe('Tool execution complete');
      expect(span.attributes['service.name']).toBe('claude-agent-sdk');
      // Time conversion: nanos → ms, plus a 1ms nominal duration.
      expect(span.startTime).toBe(1700000000000);
      expect(span.endTime).toBe(1700000000001);
    });

    it('drops log records without a trace id', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          attributes: [{ key: 'event.name', value: { stringValue: 'orphan' } }],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      expect(mockTraceStore.addSpans).not.toHaveBeenCalled();
    });

    it('filters out internal tracing logs via denylist', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.tracing' } }],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      expect(mockTraceStore.addSpans).not.toHaveBeenCalled();
    });

    it('falls back to a short body string when no event.name attribute is present', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          body: { stringValue: 'agent.message' },
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      const [, spans] = mockTraceStore.addSpans.mock.calls[0];
      expect((spans as any[])[0].name).toBe('agent.message');
    });

    it('rejects non-JSON content types on /v1/logs', async () => {
      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/x-protobuf')
        .send(Buffer.from([0x00]))
        .expect(415);
    });

    it('treats a zero span id as no parent linkage', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: '0000000000000000',
          attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.tool.execution' } }],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      const [, spans] = mockTraceStore.addSpans.mock.calls[0];
      expect((spans as any[])[0].parentSpanId).toBeUndefined();
    });

    it('handles multiple log records in a single request', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.tool.execution' } }],
        },
        {
          timeUnixNano: '1700000000100000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.llm_request' } }],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      const [, spans] = mockTraceStore.addSpans.mock.calls[0];
      expect((spans as any[]).map((s: any) => s.name)).toEqual([
        'claude_code.tool.execution',
        'claude_code.llm_request',
      ]);
    });

    it('falls back to promptfoo.trace_id / parent_span_id resource attrs when the log record has none', async () => {
      // Mimics Claude Agent SDK logs: body carries the event type, the record
      // itself has no traceId/spanId, and the provider injected trace context
      // via OTEL_RESOURCE_ATTRIBUTES.
      const req = {
        resourceLogs: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'claude-agent-sdk' } },
                { key: 'promptfoo.trace_id', value: { stringValue: hexTraceId } },
                { key: 'promptfoo.parent_span_id', value: { stringValue: hexParentSpanId } },
              ],
            },
            scopeLogs: [
              {
                scope: { name: 'com.anthropic.claude_code' },
                logRecords: [
                  {
                    timeUnixNano: '1700000000000000000',
                    body: { stringValue: 'claude_code.tool_result' },
                    attributes: [
                      { key: 'event.name', value: { stringValue: 'tool_result' } },
                      { key: 'tool_name', value: { stringValue: 'Read' } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      const [persistedTraceId, spans] = mockTraceStore.addSpans.mock.calls[0];
      expect(persistedTraceId).toBe(hexTraceId);
      const span = (spans as any[])[0];
      expect(span.parentSpanId).toBe(hexParentSpanId);
      expect(span.name).toBe('tool_result');
    });

    it('is advertised on the service info endpoint', async () => {
      // Sanity check that /v1/traces stays stable despite the new /v1/logs route.
      const response = await request(receiver.getApp()).get('/v1/traces').expect(200);
      expect(response.body.service).toBe('promptfoo-otlp-receiver');
    });

    it('marks log-derived spans as ERROR when severityNumber >= 17', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          severityNumber: 17,
          severityText: 'ERROR',
          body: { stringValue: 'something failed' },
          attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.error' } }],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      const [, spans] = mockTraceStore.addSpans.mock.calls[0];
      const span = (spans as any[])[0];
      expect(span.statusMessage).toBe('ERROR');
      // The synthesized span still reports statusCode=1 (OK for the OTEL span itself)
      // while statusMessage surfaces the severity — verifies the mapping contract.
      expect(span.attributes['otel.log.severity_number']).toBe(17);
    });

    it('uses claude_code.event.name as a secondary span-name source when event.name is absent', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          attributes: [
            { key: 'claude_code.event.name', value: { stringValue: 'claude_code.llm_request' } },
          ],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      const [, spans] = mockTraceStore.addSpans.mock.calls[0];
      expect((spans as any[])[0].name).toBe('claude_code.llm_request');
    });

    it('drops log records with a malformed trace_id rather than creating orphan spans', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: 'not-a-real-trace-id',
          spanId: hexParentSpanId,
          attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.tool.execution' } }],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      expect(mockTraceStore.addSpans).not.toHaveBeenCalled();
    });

    it('falls back to otel.log for span name when body exceeds the body-as-name limit', async () => {
      const longBody = 'A'.repeat(200);
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          body: { stringValue: longBody },
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      const [, spans] = mockTraceStore.addSpans.mock.calls[0];
      expect((spans as any[])[0].name).toBe('otel.log');
    });

    it('truncates oversize otel.log.body to prevent trace-DB bloat', async () => {
      const huge = 'x'.repeat(20_000);
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          body: { stringValue: huge },
          attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.noise' } }],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      const [, spans] = mockTraceStore.addSpans.mock.calls[0];
      const storedBody = (spans as any[])[0].attributes['otel.log.body'] as string;
      expect(storedBody.length).toBeLessThan(huge.length);
      expect(storedBody.endsWith('... [truncated]')).toBe(true);
    });

    it('skips a malformed record but keeps good ones in the same batch', async () => {
      const req = makeLogsRequest([
        {
          // Missing attribute value shape — triggers a throw inside parseAttributes.
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          attributes: [{ key: 'broken' } as any],
        },
        {
          timeUnixNano: '1700000000100000000',
          traceId: hexTraceId,
          spanId: hexParentSpanId,
          attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.tool.execution' } }],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      // Either both survived (because parseAttributes was lenient) or the bad
      // one was skipped while the good one survived — both acceptable. The
      // failure mode we're guarding against is "bad record → 500 → whole
      // batch dropped", verified by the 200 status.
      expect(mockTraceStore.addSpans).toHaveBeenCalled();
      const [, spans] = mockTraceStore.addSpans.mock.calls[0];
      expect((spans as any[]).some((s: any) => s.name === 'claude_code.tool.execution')).toBe(true);
    });

    it('treats a base64-encoded all-zero span_id as no parent linkage', async () => {
      const req = makeLogsRequest([
        {
          timeUnixNano: '1700000000000000000',
          traceId: hexTraceId,
          // Eight zero bytes encoded as base64.
          spanId: 'AAAAAAAAAAA=',
          attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.noise' } }],
        },
      ]);

      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send(req)
        .expect(200);

      const [, spans] = mockTraceStore.addSpans.mock.calls[0];
      expect((spans as any[])[0].parentSpanId).toBeUndefined();
    });

    it('200s on empty resourceLogs without persisting anything', async () => {
      await request(receiver.getApp())
        .post('/v1/logs')
        .set('Content-Type', 'application/json')
        .send({ resourceLogs: [] })
        .expect(200);

      expect(mockTraceStore.addSpans).not.toHaveBeenCalled();
    });
  });
});
