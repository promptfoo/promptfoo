import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { OTLPReceiver } from '../../src/tracing/otlpReceiver';

import type { TraceStore } from '../../src/tracing/store';

// Mock the database
jest.mock('../../src/database', () => ({
  getDb: jest.fn(() => ({
    insert: jest.fn(),
    select: jest.fn(),
    delete: jest.fn(),
  })),
}));

// Mock the trace store
jest.mock('../../src/tracing/store');

// Mock the logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('../../src/logger', () => ({
  default: mockLogger,
}));

// Import the mocked module after mocking
const mockedTraceStore = jest.requireMock('../../src/tracing/store') as {
  getTraceStore: jest.MockedFunction<() => TraceStore>;
};

describe('OTLPReceiver', () => {
  let receiver: OTLPReceiver;
  let mockTraceStore: jest.Mocked<TraceStore>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock trace store
    mockTraceStore = {
      createTrace: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      addSpans: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      getTracesByEvaluation: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
      getTrace: jest.fn<() => Promise<any | null>>().mockResolvedValue(null),
      deleteOldTraces: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TraceStore>;

    // Mock the getTraceStore function
    mockedTraceStore.getTraceStore.mockReturnValue(mockTraceStore);

    // Create receiver instance
    receiver = new OTLPReceiver();

    // Manually override the traceStore property
    (receiver as any).traceStore = mockTraceStore;
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

    it('should handle protobuf format with appropriate message', async () => {
      const response = await request(receiver.getApp())
        .post('/v1/traces')
        .set('Content-Type', 'application/x-protobuf')
        .send(Buffer.from('dummy protobuf data'))
        .expect(415);

      expect(response.body).toEqual({ error: 'Protobuf format not yet supported' });
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
});
