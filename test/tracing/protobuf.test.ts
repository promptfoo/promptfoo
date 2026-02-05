import path from 'path';

import protobuf from 'protobufjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  bytesToHex,
  decodeExportTraceServiceRequest,
  initializeProtobuf,
  longToNumber,
} from '../../src/tracing/protobuf';

// Mock the logger
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create protobuf-encoded OTLP data
let protoRoot: protobuf.Root | null = null;
let ExportTraceServiceRequest: protobuf.Type | null = null;

async function getProtoRoot(): Promise<protobuf.Root> {
  if (protoRoot) {
    return protoRoot;
  }
  const protoDir = path.join(__dirname, '../../src/tracing/proto');

  // Create a new Root with the proto directory as the include path
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
  if (!ExportTraceServiceRequest) {
    ExportTraceServiceRequest = root.lookupType(
      'opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest',
    );
  }
  const message = ExportTraceServiceRequest.create(data);
  const encoded = ExportTraceServiceRequest.encode(message).finish();
  return Buffer.from(encoded);
}

describe('Protobuf decoding', () => {
  beforeAll(async () => {
    // Initialize proto definitions for faster subsequent tests
    await initializeProtobuf();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe('bytesToHex', () => {
    it('should convert Uint8Array to hex string', () => {
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      expect(bytesToHex(bytes, 8)).toBe('deadbeef');
    });

    it('should pad short hex strings to expected length', () => {
      const bytes = new Uint8Array([0x00, 0x01]);
      expect(bytesToHex(bytes, 8)).toBe('00000001');
    });

    it('should return zeros for undefined input', () => {
      expect(bytesToHex(undefined, 8)).toBe('00000000');
    });

    it('should return zeros for empty array', () => {
      expect(bytesToHex(new Uint8Array([]), 8)).toBe('00000000');
    });

    it('should handle full trace ID length', () => {
      const bytes = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34, 0x56, 0x78, 0x90,
        0x12,
      ]);
      expect(bytesToHex(bytes, 32)).toBe('12345678901234567890123456789012');
    });
  });

  describe('longToNumber', () => {
    it('should return 0 for undefined', () => {
      expect(longToNumber(undefined)).toBe(0);
    });

    it('should return number as-is', () => {
      expect(longToNumber(12345)).toBe(12345);
    });

    it('should convert Long-like object to number', () => {
      const longValue = {
        low: 1000,
        high: 0,
        unsigned: false,
        toNumber: () => 1000,
        toString: () => '1000',
      };
      expect(longToNumber(longValue)).toBe(1000);
    });
  });

  describe('decodeExportTraceServiceRequest', () => {
    it('should decode a simple protobuf trace request', async () => {
      const traceIdBytes = new Uint8Array([
        0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
        0x99,
      ]);
      const spanIdBytes = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);

      const testData = {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }],
            },
            scopeSpans: [
              {
                scope: {
                  name: 'test-tracer',
                  version: '1.0.0',
                },
                spans: [
                  {
                    traceId: traceIdBytes,
                    spanId: spanIdBytes,
                    name: 'test-span',
                    kind: 1,
                    startTimeUnixNano: 1700000000000000000n,
                    endTimeUnixNano: 1700000001000000000n,
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

      const encoded = await encodeOTLPRequest(testData);
      const decoded = await decodeExportTraceServiceRequest(encoded);

      expect(decoded.resourceSpans).toHaveLength(1);
      expect(decoded.resourceSpans[0].scopeSpans).toHaveLength(1);
      expect(decoded.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);

      const span = decoded.resourceSpans[0].scopeSpans[0].spans[0];
      expect(span.name).toBe('test-span');
      expect(span.kind).toBe(1);
    });

    it('should decode multiple spans', async () => {
      const traceIdBytes = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd,
        0xef,
      ]);

      const testData = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: traceIdBytes,
                    spanId: new Uint8Array([0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]),
                    name: 'span-1',
                    startTimeUnixNano: 1000000000n,
                  },
                  {
                    traceId: traceIdBytes,
                    spanId: new Uint8Array([0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22]),
                    parentSpanId: new Uint8Array([0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]),
                    name: 'span-2',
                    startTimeUnixNano: 2000000000n,
                  },
                ],
              },
            ],
          },
        ],
      };

      const encoded = await encodeOTLPRequest(testData);
      const decoded = await decodeExportTraceServiceRequest(encoded);

      const spans = decoded.resourceSpans[0].scopeSpans[0].spans;
      expect(spans).toHaveLength(2);
      expect(spans[0].name).toBe('span-1');
      expect(spans[1].name).toBe('span-2');
    });

    it('should decode different attribute types', async () => {
      const traceIdBytes = new Uint8Array([
        0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
        0x99,
      ]);
      const spanIdBytes = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);

      const testData = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: traceIdBytes,
                    spanId: spanIdBytes,
                    name: 'test-attributes',
                    startTimeUnixNano: 1000000000n,
                    attributes: [
                      { key: 'string.attr', value: { stringValue: 'hello' } },
                      { key: 'int.attr', value: { intValue: 123 } },
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

      const encoded = await encodeOTLPRequest(testData);
      const decoded = await decodeExportTraceServiceRequest(encoded);

      const span = decoded.resourceSpans[0].scopeSpans[0].spans[0];
      expect(span.attributes).toBeDefined();

      // Check that attributes are present
      const attrs = span.attributes!;
      expect(attrs.find((a) => a.key === 'string.attr')?.value?.stringValue).toBe('hello');
      expect(attrs.find((a) => a.key === 'int.attr')?.value?.intValue).toBe(123);
      expect(attrs.find((a) => a.key === 'double.attr')?.value?.doubleValue).toBeCloseTo(3.14);
      expect(attrs.find((a) => a.key === 'bool.attr')?.value?.boolValue).toBe(true);
      expect(attrs.find((a) => a.key === 'array.attr')?.value?.arrayValue?.values).toHaveLength(2);
    });

    it('should decode resource attributes', async () => {
      const traceIdBytes = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd,
        0xef,
      ]);
      const spanIdBytes = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);

      const testData = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'my-service' } },
                { key: 'service.version', value: { stringValue: '2.0.0' } },
                { key: 'telemetry.sdk.name', value: { stringValue: 'opentelemetry' } },
              ],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: traceIdBytes,
                    spanId: spanIdBytes,
                    name: 'test-span',
                    startTimeUnixNano: 1000000000n,
                  },
                ],
              },
            ],
          },
        ],
      };

      const encoded = await encodeOTLPRequest(testData);
      const decoded = await decodeExportTraceServiceRequest(encoded);

      const resourceAttrs = decoded.resourceSpans[0].resource?.attributes;
      expect(resourceAttrs).toBeDefined();
      expect(resourceAttrs!.find((a) => a.key === 'service.name')?.value?.stringValue).toBe(
        'my-service',
      );
      expect(resourceAttrs!.find((a) => a.key === 'service.version')?.value?.stringValue).toBe(
        '2.0.0',
      );
    });

    it('should throw error for invalid protobuf data', async () => {
      const invalidData = Buffer.from('not valid protobuf data');

      await expect(decodeExportTraceServiceRequest(invalidData)).rejects.toThrow(
        /invalid protobuf/i,
      );
    });

    it('should handle empty resourceSpans', async () => {
      const testData = {
        resourceSpans: [],
      };

      const encoded = await encodeOTLPRequest(testData);
      const decoded = await decodeExportTraceServiceRequest(encoded);

      expect(decoded.resourceSpans).toEqual([]);
    });

    it('should handle Buffer input', async () => {
      const traceIdBytes = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x90, 0xab, 0xcd,
        0xef,
      ]);
      const spanIdBytes = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);

      const testData = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: traceIdBytes,
                    spanId: spanIdBytes,
                    name: 'test-span',
                    startTimeUnixNano: 1000000000n,
                  },
                ],
              },
            ],
          },
        ],
      };

      const encoded = await encodeOTLPRequest(testData);
      // Pass as Buffer instead of Uint8Array
      const decoded = await decodeExportTraceServiceRequest(Buffer.from(encoded));

      expect(decoded.resourceSpans).toHaveLength(1);
      expect(decoded.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('test-span');
    });
  });
});
