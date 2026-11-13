import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import protobuf from 'protobufjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bytesToHex,
  decodeExportTraceServiceRequest,
  encodeExportTraceServiceRequest,
} from '../../src/tracing/protobuf';
import { encodeOTLPRequest } from './otlpRequestFixture';

// Mock the logger
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Protobuf decoding', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it('shares first schema loads and retries after a missing type is repaired', async () => {
    vi.resetModules();
    const esm = await import('../../src/esm');
    const codec = await import('../../src/tracing/protobuf');
    const dir = await mkdtemp(path.join(tmpdir(), 'promptfoo-otlp-schema-'));
    const protoDir = path.join(dir, 'tracing/proto');
    const serviceDir = path.join(protoDir, 'opentelemetry/proto/collector/trace/v1');
    const originalProtoDir = path.join(esm.getDirectory(), 'tracing/proto');
    vi.spyOn(esm, 'getDirectory').mockReturnValue(dir);
    const load = vi.spyOn(protobuf.Root.prototype, 'load');
    try {
      await mkdir(serviceDir, { recursive: true });
      await writeFile(
        path.join(serviceDir, 'trace_service.proto'),
        'syntax="proto3"; message Other {}',
      );
      await Promise.all([
        expect(codec.decodeExportTraceServiceRequest(Buffer.alloc(0))).rejects.toThrow(
          'no such type',
        ),
        expect(codec.encodeExportTraceServiceRequest({})).rejects.toThrow('no such type'),
      ]);
      expect(load).toHaveBeenCalledTimes(1);

      await cp(originalProtoDir, protoDir, { recursive: true });
      const [decoded, encoded] = await Promise.all([
        codec.decodeExportTraceServiceRequest(Buffer.alloc(0)),
        codec.encodeExportTraceServiceRequest({}),
      ]);
      expect(decoded.resourceSpans).toEqual([]);
      expect(encoded).toHaveLength(0);
      await codec.decodeExportTraceServiceRequest(encoded);
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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

  describe('decodeExportTraceServiceRequest', () => {
    it('round-trips OTLP JSON payloads through the shared protobuf encoder', async () => {
      const request = {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'promptfoo' } }],
            },
            scopeSpans: [
              {
                scope: { name: 'openai-agents-js' },
                spans: [
                  {
                    traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex').toString(
                      'base64',
                    ),
                    spanId: Buffer.from('0123456789abcdef', 'hex').toString('base64'),
                    name: 'chat gpt-4.1',
                    kind: 3,
                    startTimeUnixNano: '1715000000000000000',
                    attributes: [
                      { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4.1' } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const encoded = await encodeExportTraceServiceRequest(request);
      const decoded = await decodeExportTraceServiceRequest(encoded);
      const span = decoded.resourceSpans[0].scopeSpans[0].spans[0];

      expect(Buffer.isBuffer(encoded)).toBe(true);
      expect(bytesToHex(span.traceId, 32)).toBe('0123456789abcdef0123456789abcdef');
      expect(bytesToHex(span.spanId, 16)).toBe('0123456789abcdef');
      expect(span.name).toBe('chat gpt-4.1');
      expect(span.attributes).toEqual([expect.objectContaining({ key: 'gen_ai.request.model' })]);
    });

    it('decodes a trace serialized by the OpenTelemetry JavaScript SDK', async () => {
      // @opentelemetry/otlp-transformer 0.300.0 ProtobufTraceSerializer; independent of our schema.
      const encoded = Buffer.from(
        'Co0BCiIKHgoMc2VydmljZS5uYW1lEg4KDHRlc3Qtc2VydmljZRAAEmcKFAoLdGVzdC10cmFjZXISBTEuMC4wEk8KEKq7zN3u' +
          '/wARIjNEVWZ3iJkSCBEiM0RVZneIKgl0ZXN0LXNwYW4wATkAACo2/pyXF0EAysRx/pyXF1AAYABwAHoGEgJPSxgAhQEBAQAA',
        'base64',
      );
      const decoded = await decodeExportTraceServiceRequest(encoded);

      expect(decoded.resourceSpans).toHaveLength(1);
      expect(decoded.resourceSpans[0].scopeSpans).toHaveLength(1);
      expect(decoded.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);

      const span = decoded.resourceSpans[0].scopeSpans[0].spans[0];
      expect(bytesToHex(span.traceId, 32)).toBe('aabbccddeeff00112233445566778899');
      expect(bytesToHex(span.spanId, 16)).toBe('1122334455667788');
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

      const encoded = encodeOTLPRequest(testData);
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

      const encoded = encodeOTLPRequest(testData);
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

      const encoded = encodeOTLPRequest(testData);
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

    it('rejects a nested message whose declared length crosses its parent boundary', async () => {
      // resourceSpans has one byte of payload, but its nested scopeSpans
      // field declares an empty message after that boundary.
      const malformed = Uint8Array.from([0x0a, 0x01, 0x12, 0x00]);

      await expect(decodeExportTraceServiceRequest(malformed)).rejects.toThrow(/invalid protobuf/i);
    });

    it.each([
      { field: 'resourceSpans message', prefix: [0x0a] },
      { field: 'resource schema URL string', prefix: [0x0a, 0x06, 0x1a] },
      { field: 'span trace ID bytes', prefix: [0x0a, 0x0a, 0x12, 0x08, 0x12, 0x06, 0x0a] },
      { field: 'unknown length-delimited field', prefix: [0x7a] },
    ])('rejects an overflowing length prefix for $field', async ({ prefix }) => {
      // 2^32 must not wrap to a zero-byte field or message.
      const malformed = Uint8Array.from([...prefix, 0x80, 0x80, 0x80, 0x80, 0x10]);
      await expect(decodeExportTraceServiceRequest(malformed)).rejects.toThrow(
        'Invalid protobuf data: invalid length encoding',
      );
      await expect(decodeExportTraceServiceRequest(Buffer.from(malformed))).rejects.toThrow(
        'Invalid protobuf data: invalid length encoding',
      );
    });

    it('should handle empty resourceSpans', async () => {
      const testData = {
        resourceSpans: [],
      };

      const encoded = encodeOTLPRequest(testData);
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

      const encoded = encodeOTLPRequest(testData);
      // Pass as Buffer instead of Uint8Array
      const decoded = await decodeExportTraceServiceRequest(Buffer.from(encoded));

      expect(decoded.resourceSpans).toHaveLength(1);
      expect(decoded.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('test-span');
    });
  });
});
