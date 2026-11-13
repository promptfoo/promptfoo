/**
 * OTLP Protobuf decoder for trace data
 *
 * Uses protobufjs to decode binary OTLP trace requests sent with
 * Content-Type: application/x-protobuf
 */

import path from 'path';

import protobuf from 'protobufjs';
import { getDirectory } from '../esm';
import logger from '../logger';

let exportRequestType: Promise<protobuf.Type> | undefined;

async function loadExportTraceServiceRequestType(): Promise<protobuf.Type> {
  logger.debug('[Protobuf] Loading OTLP proto definitions');
  // getDirectory() points at src/ in development and dist/src/ in packaged builds.
  const protoDir = path.join(getDirectory(), 'tracing', 'proto');
  logger.debug(`[Protobuf] Proto directory: ${protoDir}`);
  const root = new protobuf.Root();
  root.resolvePath = (_origin: string, target: string) => path.join(protoDir, target);
  await root.load('opentelemetry/proto/collector/trace/v1/trace_service.proto');
  const type = root.lookupType('opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest');
  logger.debug('[Protobuf] Successfully loaded OTLP proto definitions');
  return type;
}

function getExportTraceServiceRequestType(): Promise<protobuf.Type> {
  return (exportRequestType ??= loadExportTraceServiceRequestType().catch((error) => {
    exportRequestType = undefined;
    logger.error(`[Protobuf] Failed to load proto definitions: ${error}`);
    throw error;
  }));
}

/**
 * Decoded OTLP attribute value
 */
export interface DecodedAttributeValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: number | Long;
  doubleValue?: number;
  arrayValue?: { values: DecodedAttributeValue[] };
  kvlistValue?: { values: DecodedAttribute[] };
  bytesValue?: Uint8Array;
}

/**
 * Decoded OTLP attribute
 */
export interface DecodedAttribute {
  key: string;
  value: DecodedAttributeValue;
}

/**
 * Decoded OTLP span status
 */
export interface DecodedStatus {
  code?: number;
  message?: string;
}

/**
 * Decoded OTLP span
 */
export interface DecodedSpan {
  traceId: Uint8Array;
  spanId: Uint8Array;
  parentSpanId?: Uint8Array;
  name: string;
  kind?: number;
  startTimeUnixNano: Long | number;
  endTimeUnixNano?: Long | number;
  attributes?: DecodedAttribute[];
  status?: DecodedStatus;
  events?: any[];
  links?: any[];
  droppedAttributesCount?: number;
  droppedEventsCount?: number;
  droppedLinksCount?: number;
  traceState?: string;
  flags?: number;
}

/**
 * Decoded OTLP scope
 */
export interface DecodedScope {
  name?: string;
  version?: string;
  attributes?: DecodedAttribute[];
}

/**
 * Decoded OTLP scope spans
 */
export interface DecodedScopeSpans {
  scope?: DecodedScope;
  spans: DecodedSpan[];
  schemaUrl?: string;
}

/**
 * Decoded OTLP resource
 */
export interface DecodedResource {
  attributes?: DecodedAttribute[];
  droppedAttributesCount?: number;
}

/**
 * Decoded OTLP resource spans
 */
export interface DecodedResourceSpans {
  resource?: DecodedResource;
  scopeSpans: DecodedScopeSpans[];
  schemaUrl?: string;
}

/**
 * Decoded ExportTraceServiceRequest
 */
export interface DecodedExportTraceServiceRequest {
  resourceSpans: DecodedResourceSpans[];
}

// Long type from protobufjs
interface Long {
  low: number;
  high: number;
  unsigned: boolean;
  toNumber(): number;
  toString(): string;
}

/**
 * Convert a Uint8Array to a hex string
 */
export function bytesToHex(bytes: Uint8Array | undefined, expectedLength: number): string {
  if (!bytes || bytes.length === 0) {
    return '0'.repeat(expectedLength);
  }
  return Buffer.from(bytes).toString('hex').padStart(expectedLength, '0');
}

/**
 * Decode a binary OTLP ExportTraceServiceRequest
 *
 * @param data - The binary protobuf data
 * @returns The decoded request object
 */
export async function decodeExportTraceServiceRequest(
  data: Buffer | Uint8Array,
): Promise<DecodedExportTraceServiceRequest> {
  const messageType = await getExportTraceServiceRequestType();

  try {
    // Decode the protobuf message
    const message = messageType.decode(data instanceof Buffer ? new Uint8Array(data) : data);

    // Convert to plain JavaScript object
    const decoded = messageType.toObject(message, {
      longs: Number, // Convert longs to numbers (may lose precision for very large values)
      bytes: Uint8Array, // Keep bytes as Uint8Array
      defaults: true, // Include default values
      arrays: true, // Always use arrays for repeated fields
    }) as DecodedExportTraceServiceRequest;

    logger.debug(
      `[Protobuf] Decoded ExportTraceServiceRequest with ${decoded.resourceSpans?.length || 0} resource spans`,
    );

    return decoded;
  } catch (error) {
    logger.error(`[Protobuf] Failed to decode ExportTraceServiceRequest: ${error}`);
    throw new Error(`Invalid protobuf data: ${error instanceof Error ? error.message : error}`);
  }
}

/** Encode an OTLP JSON-shaped trace payload for a protobuf-only HTTP receiver. */
export async function encodeExportTraceServiceRequest(
  request: Record<string, unknown>,
): Promise<Buffer> {
  const messageType = await getExportTraceServiceRequestType();

  try {
    const message = messageType.fromObject(request);
    return Buffer.from(messageType.encode(message).finish());
  } catch (error) {
    logger.error(`[Protobuf] Failed to encode ExportTraceServiceRequest: ${error}`);
    throw new Error(`Invalid trace data: ${error instanceof Error ? error.message : error}`);
  }
}
