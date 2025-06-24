import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';

// Mock the logger to avoid any issues
jest.doMock('../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Use the existing mock from __mocks__/database.ts
jest.doMock('../../src/database');

// Create a spy for the TraceStore.addSpans method
const addSpansSpy = jest.mocked(jest.fn());

// Mock the TraceStore, but keep the logic simple
jest.doMock('../../src/tracing/store', () => {
  const actual = jest.requireActual('../../src/tracing/store') as any;

  class MockTraceStore {
    async createTrace() {
      return Promise.resolve();
    }

    async addSpans(traceId: string, spans: any[]) {
      // Call the spy so we can verify it was called
      await addSpansSpy(traceId, spans);
      return Promise.resolve();
    }

    async getTracesByEvaluation() {
      return Promise.resolve([]);
    }

    async getTrace() {
      return Promise.resolve(null);
    }

    async deleteOldTraces() {
      return Promise.resolve();
    }
  }

  return {
    ...actual,
    TraceStore: MockTraceStore,
    getTraceStore: jest.fn(() => new MockTraceStore()),
  };
});

// Dynamic import after mocking
let OTLPReceiver: any;

describe('OTLPReceiver', () => {
  let receiver: any;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    addSpansSpy.mockClear();
    addSpansSpy.mockResolvedValue(undefined);

    // Dynamic import after mocking
    if (!OTLPReceiver) {
      const module = await import('../../src/tracing/otlpReceiver');
      OTLPReceiver = module.OTLPReceiver;
    }

    // Create receiver instance
    receiver = new OTLPReceiver();
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
      // Temporarily modify the error handling to catch the actual error
      const originalConsoleError = console.error;
      let capturedError: any = null;

      console.error = (message: string, error?: any) => {
        if (message.includes('[OtlpReceiver] Failed to process OTLP traces')) {
          capturedError = error;
        }
        originalConsoleError(message, error);
      };

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

      // Restore original console.error
      console.error = originalConsoleError;

      if (response.status !== 200) {
        console.error('Error response:', response.status, response.body);
        if (capturedError) {
          console.error('Captured error:', capturedError);
        }
      }
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ partialSuccess: {} });

      // Verify spans were stored
      expect(addSpansSpy).toHaveBeenCalledWith(
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
      );
    });

    it('should handle multiple spans in a single request', async () => {
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

      expect(addSpansSpy).toHaveBeenCalledWith(
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
      );
    });

    it('should parse different attribute types', async () => {
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

      expect(addSpansSpy).toHaveBeenCalledWith(
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
      addSpansSpy.mockRejectedValue(new Error('Database error'));

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

      expect(addSpansSpy).toHaveBeenCalledWith(traceIdHex, expect.any(Array));
    });
  });
});
