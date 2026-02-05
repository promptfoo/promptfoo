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

// Cached protobuf root
let protoRoot: protobuf.Root | null = null;
let ExportTraceServiceRequest: protobuf.Type | null = null;

/**
 * Get the path to the proto files directory.
 * This works correctly in both development (tsx) and production (bundled) environments.
 */
function getProtoDir(): string {
  // getDirectory() returns the src/ or dist/src/ directory
  // Proto files are in src/tracing/proto/ or dist/src/tracing/proto/
  return path.join(getDirectory(), 'tracing', 'proto');
}

/**
 * Load and cache the OTLP proto definitions
 */
async function loadProtoDefinitions(): Promise<protobuf.Root> {
  if (protoRoot) {
    return protoRoot;
  }

  logger.debug('[Protobuf] Loading OTLP proto definitions');

  const protoDir = getProtoDir();
  logger.debug(`[Protobuf] Proto directory: ${protoDir}`);

  try {
    // Create a new Root with the proto directory as the include path
    // This allows imports like "opentelemetry/proto/trace/v1/trace.proto" to resolve correctly
    const root = new protobuf.Root();

    // Configure the root to resolve imports from the proto directory
    root.resolvePath = (_origin: string, target: string) => {
      // Always resolve imports relative to the proto root directory
      return path.join(protoDir, target);
    };

    // Load the main trace service proto which imports the others
    await root.load('opentelemetry/proto/collector/trace/v1/trace_service.proto');

    protoRoot = root;
    logger.debug('[Protobuf] Successfully loaded OTLP proto definitions');
    return protoRoot;
  } catch (error) {
    logger.error(`[Protobuf] Failed to load proto definitions: ${error}`);
    throw error;
  }
}

/**
 * Get the ExportTraceServiceRequest message type
 */
async function getExportTraceServiceRequestType(): Promise<protobuf.Type> {
  if (ExportTraceServiceRequest) {
    return ExportTraceServiceRequest;
  }

  const root = await loadProtoDefinitions();
  ExportTraceServiceRequest = root.lookupType(
    'opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest',
  );

  return ExportTraceServiceRequest;
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
 * Convert a Long or number to a JavaScript number
 */
export function longToNumber(value: Long | number | undefined): number {
  if (value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  // It's a Long object
  return value.toNumber();
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

/**
 * Initialize the protobuf loader (preload proto definitions)
 * Call this at startup for faster first request handling
 */
export async function initializeProtobuf(): Promise<void> {
  await loadProtoDefinitions();
  await getExportTraceServiceRequestType();
  logger.debug('[Protobuf] Protobuf decoder initialized');
}
