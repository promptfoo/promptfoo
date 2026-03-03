/**
 * OTLP Receiver implemented with Hono.
 * Alternative implementation for environments that prefer Hono.
 */

import http from 'node:http';

import { Hono } from 'hono';
import logger from '../logger';
import { normalizeGenAISpanAttributes } from './genaiTracer';
import {
  bytesToHex,
  type DecodedAttribute,
  type DecodedExportTraceServiceRequest,
  decodeExportTraceServiceRequest,
} from './protobuf';
import { getTraceStore, type ParsedTrace, type SpanData, type TraceStore } from './store';

interface OTLPAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
    arrayValue?: { values: any[] };
    kvlistValue?: { values: OTLPAttribute[] };
  };
}

interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes?: OTLPAttribute[];
  status?: {
    code: number;
    message?: string;
  };
}

interface OTLPScopeSpan {
  scope?: {
    name: string;
    version?: string;
  };
  spans: OTLPSpan[];
}

interface OTLPResourceSpan {
  resource?: {
    attributes?: OTLPAttribute[];
  };
  scopeSpans: OTLPScopeSpan[];
}

interface OTLPTraceRequest {
  resourceSpans: OTLPResourceSpan[];
}

const SPAN_KIND_MAP: Record<number, string> = {
  0: 'unspecified',
  1: 'internal',
  2: 'server',
  3: 'client',
  4: 'producer',
  5: 'consumer',
};

export class OTLPReceiverHono {
  private app: Hono;
  private traceStore: TraceStore;
  private port?: number;
  private server?: http.Server;

  constructor() {
    this.app = new Hono();
    this.traceStore = getTraceStore();
    logger.debug('[OtlpReceiverHono] Initializing OTLP receiver');
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // OTLP HTTP endpoint for traces
    this.app.post('/v1/traces', async (c) => {
      const contentType = c.req.header('content-type') || 'unknown';
      logger.debug(`[OtlpReceiverHono] Received trace request: ${contentType}`);
      logger.debug('[OtlpReceiverHono] Starting to process traces');

      const isJson = contentType === 'application/json';
      const isProtobuf = contentType === 'application/x-protobuf';

      if (!isJson && !isProtobuf) {
        return c.json({ error: 'Unsupported content type' }, 415);
      }

      try {
        let traces: ParsedTrace[] = [];

        if (isJson) {
          logger.debug('[OtlpReceiverHono] Parsing OTLP JSON request');
          const body = await c.req.json();
          logger.debug(
            `[OtlpReceiverHono] Request body: ${JSON.stringify(body).substring(0, 500)}...`,
          );
          traces = this.parseOTLPJSONRequest(body);
        } else if (isProtobuf) {
          logger.debug('[OtlpReceiverHono] Parsing OTLP protobuf request');
          const body = await c.req.arrayBuffer();
          logger.debug(`[OtlpReceiverHono] Request body size: ${body.byteLength} bytes`);
          traces = await this.parseOTLPProtobufRequest(Buffer.from(body));
        }
        logger.debug(`[OtlpReceiverHono] Parsed ${traces.length} traces from request`);

        // Group spans by trace ID and extract metadata
        const spansByTrace = new Map<string, SpanData[]>();
        const traceInfoById = new Map<string, { evaluationId?: string; testCaseId?: string }>();

        for (const trace of traces) {
          if (!spansByTrace.has(trace.traceId)) {
            spansByTrace.set(trace.traceId, []);

            const evaluationId = trace.span.attributes?.['evaluation.id'] as string | undefined;
            const testCaseId = trace.span.attributes?.['test.case.id'] as string | undefined;

            const info = traceInfoById.get(trace.traceId) ?? {};
            if (evaluationId) {
              info.evaluationId = evaluationId;
            }
            if (testCaseId) {
              info.testCaseId = testCaseId;
            }
            traceInfoById.set(trace.traceId, info);
          }
          spansByTrace.get(trace.traceId)!.push(trace.span);
        }
        logger.debug(`[OtlpReceiverHono] Grouped spans into ${spansByTrace.size} traces`);

        // Create trace records
        for (const [traceId, info] of traceInfoById) {
          try {
            logger.debug(`[OtlpReceiverHono] Creating trace record for ${traceId}`);
            await this.traceStore.createTrace({
              traceId,
              evaluationId: info.evaluationId || '',
              testCaseId: info.testCaseId || '',
            });
          } catch (error) {
            logger.debug(`[OtlpReceiverHono] Trace ${traceId} may already exist: ${error}`);
          }
        }

        // Store spans for each trace
        for (const [traceId, spans] of spansByTrace) {
          logger.debug(`[OtlpReceiverHono] Storing ${spans.length} spans for trace ${traceId}`);
          await this.traceStore.addSpans(traceId, spans, { skipTraceCheck: true });
        }

        logger.debug('[OtlpReceiverHono] Successfully processed traces');
        return c.json({ partialSuccess: {} });
      } catch (error) {
        logger.error(`[OtlpReceiverHono] Failed to process OTLP traces: ${error}`);
        logger.error(
          `[OtlpReceiverHono] Error stack: ${error instanceof Error ? error.stack : 'No stack'}`,
        );

        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.toLowerCase().includes('invalid protobuf')) {
          return c.json({ error: errorMessage }, 400);
        }

        return c.json({ error: 'Internal server error' }, 500);
      }
    });

    // Health check endpoint
    this.app.get('/health', (c) => {
      logger.debug('[OtlpReceiverHono] Health check requested');
      return c.json({ status: 'ok' });
    });

    // OTLP service info endpoint
    this.app.get('/v1/traces', (c) => {
      return c.json({
        service: 'promptfoo-otlp-receiver',
        version: '1.0.0',
        supported_formats: ['json', 'protobuf'],
      });
    });

    // Debug endpoint
    this.app.get('/debug/status', (c) => {
      return c.json({
        status: 'running',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        port: this.port || 4318,
      });
    });

    // Global error handler
    this.app.onError((error, c) => {
      logger.error(`[OtlpReceiverHono] Global error handler: ${error}`);
      logger.error(`[OtlpReceiverHono] Error stack: ${error.stack}`);

      if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return c.json({ error: 'Invalid JSON' }, 400);
      }

      return c.json({ error: 'Internal server error' }, 500);
    });
  }

  private parseOTLPJSONRequest(body: OTLPTraceRequest): ParsedTrace[] {
    const traces: ParsedTrace[] = [];
    logger.debug(
      `[OtlpReceiverHono] Parsing request with ${body.resourceSpans?.length || 0} resource spans`,
    );

    for (const resourceSpan of body.resourceSpans) {
      const resourceAttributes = this.parseAttributes(resourceSpan.resource?.attributes);
      logger.debug(
        `[OtlpReceiverHono] Parsed ${Object.keys(resourceAttributes).length} resource attributes`,
      );

      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          const traceId = this.convertId(span.traceId, 32);
          const spanId = this.convertId(span.spanId, 16);
          const parentSpanId = span.parentSpanId
            ? this.convertId(span.parentSpanId, 16)
            : undefined;
          logger.debug(
            `[OtlpReceiverHono] Processing span: ${span.name} (${spanId}) in trace ${traceId}`,
          );

          const spanKindName = SPAN_KIND_MAP[span.kind] ?? 'unspecified';
          const attributes: Record<string, any> = {
            ...resourceAttributes,
            ...this.parseAttributes(span.attributes),
            'otel.scope.name': scopeSpan.scope?.name,
            'otel.scope.version': scopeSpan.scope?.version,
            'otel.span.kind': spanKindName,
            'otel.span.kind_code': span.kind,
          };
          const normalizedSpanName = this.normalizeGenAISpan(span.name, attributes);

          traces.push({
            traceId,
            span: {
              spanId,
              parentSpanId,
              name: normalizedSpanName,
              startTime: Number(span.startTimeUnixNano) / 1_000_000,
              endTime: span.endTimeUnixNano ? Number(span.endTimeUnixNano) / 1_000_000 : undefined,
              attributes,
              statusCode: span.status?.code,
              statusMessage: span.status?.message,
            },
          });
        }
      }
    }

    return traces;
  }

  private async parseOTLPProtobufRequest(body: Buffer): Promise<ParsedTrace[]> {
    const traces: ParsedTrace[] = [];

    const decoded: DecodedExportTraceServiceRequest = await decodeExportTraceServiceRequest(body);

    logger.debug(
      `[OtlpReceiverHono] Parsing protobuf request with ${decoded.resourceSpans?.length || 0} resource spans`,
    );

    for (const resourceSpan of decoded.resourceSpans || []) {
      const resourceAttributes = this.parseDecodedAttributes(resourceSpan.resource?.attributes);
      logger.debug(
        `[OtlpReceiverHono] Parsed ${Object.keys(resourceAttributes).length} resource attributes from protobuf`,
      );

      for (const scopeSpan of resourceSpan.scopeSpans || []) {
        for (const span of scopeSpan.spans || []) {
          const traceId = bytesToHex(span.traceId, 32);
          const spanId = bytesToHex(span.spanId, 16);
          const parentSpanId = span.parentSpanId?.length
            ? bytesToHex(span.parentSpanId, 16)
            : undefined;

          logger.debug(
            `[OtlpReceiverHono] Processing protobuf span: ${span.name} (${spanId}) in trace ${traceId}`,
          );

          const spanKindName = SPAN_KIND_MAP[span.kind ?? 0] ?? 'unspecified';
          const attributes: Record<string, any> = {
            ...resourceAttributes,
            ...this.parseDecodedAttributes(span.attributes),
            'otel.scope.name': scopeSpan.scope?.name,
            'otel.scope.version': scopeSpan.scope?.version,
            'otel.span.kind': spanKindName,
            'otel.span.kind_code': span.kind ?? 0,
          };
          const normalizedSpanName = this.normalizeGenAISpan(span.name, attributes);

          const startTimeNano =
            typeof span.startTimeUnixNano === 'number'
              ? span.startTimeUnixNano
              : Number(span.startTimeUnixNano);
          const endTimeNano = span.endTimeUnixNano
            ? typeof span.endTimeUnixNano === 'number'
              ? span.endTimeUnixNano
              : Number(span.endTimeUnixNano)
            : undefined;

          traces.push({
            traceId,
            span: {
              spanId,
              parentSpanId,
              name: normalizedSpanName,
              startTime: startTimeNano / 1_000_000,
              endTime: endTimeNano ? endTimeNano / 1_000_000 : undefined,
              attributes,
              statusCode: span.status?.code,
              statusMessage: span.status?.message,
            },
          });
        }
      }
    }

    return traces;
  }

  private normalizeGenAISpan(spanName: string, attributes: Record<string, unknown>): string {
    return normalizeGenAISpanAttributes(spanName, attributes);
  }

  private parseDecodedAttributes(attributes?: DecodedAttribute[]): Record<string, any> {
    if (!attributes) {
      return {};
    }

    const result: Record<string, any> = {};

    for (const attr of attributes) {
      const value = this.parseDecodedAttributeValue(attr.value);
      if (value !== undefined) {
        result[attr.key] = value;
      }
    }

    return result;
  }

  private parseDecodedAttributeValue(value: DecodedAttribute['value']): any {
    if (!value) {
      return undefined;
    }
    if (value.stringValue !== undefined) {
      return value.stringValue;
    }
    if (value.intValue !== undefined) {
      return typeof value.intValue === 'number' ? value.intValue : Number(value.intValue);
    }
    if (value.doubleValue !== undefined) {
      return value.doubleValue;
    }
    if (value.boolValue !== undefined) {
      return value.boolValue;
    }
    if (value.bytesValue !== undefined) {
      return Buffer.from(value.bytesValue).toString('base64');
    }
    if (value.arrayValue?.values) {
      return value.arrayValue.values.map((v) => this.parseDecodedAttributeValue(v));
    }
    if (value.kvlistValue?.values) {
      const kvMap: Record<string, any> = {};
      for (const kv of value.kvlistValue.values) {
        kvMap[kv.key] = this.parseDecodedAttributeValue(kv.value);
      }
      return kvMap;
    }
    return undefined;
  }

  private parseAttributes(attributes?: OTLPAttribute[]): Record<string, any> {
    if (!attributes) {
      return {};
    }

    const result: Record<string, any> = {};

    for (const attr of attributes) {
      const value = this.parseAttributeValue(attr.value);
      if (value !== undefined) {
        result[attr.key] = value;
      }
    }

    return result;
  }

  private parseAttributeValue(value: OTLPAttribute['value']): any {
    if (value.stringValue !== undefined) {
      return value.stringValue;
    }
    if (value.intValue !== undefined) {
      return Number(value.intValue);
    }
    if (value.doubleValue !== undefined) {
      return value.doubleValue;
    }
    if (value.boolValue !== undefined) {
      return value.boolValue;
    }
    if (value.arrayValue?.values) {
      return value.arrayValue.values.map((v) => this.parseAttributeValue(v));
    }
    if (value.kvlistValue?.values) {
      const kvMap: Record<string, any> = {};
      for (const kv of value.kvlistValue.values) {
        kvMap[kv.key] = this.parseAttributeValue(kv.value);
      }
      return kvMap;
    }
    return undefined;
  }

  private convertId(id: string, expectedHexLength: number): string {
    logger.debug(
      `[OtlpReceiverHono] Converting ID: ${id} (length: ${id.length}, expected hex length: ${expectedHexLength})`,
    );

    if (id.length === expectedHexLength && /^[0-9a-f]+$/i.test(id)) {
      logger.debug(`[OtlpReceiverHono] ID is already hex format`);
      return id.toLowerCase();
    }

    try {
      const buffer = Buffer.from(id, 'base64');
      const hex = buffer.toString('hex');
      logger.debug(`[OtlpReceiverHono] Base64 decoded: ${id} -> ${hex} (${buffer.length} bytes)`);

      const utf8String = buffer.toString('utf8');
      if (utf8String.length === expectedHexLength && /^[0-9a-f]+$/i.test(utf8String)) {
        logger.debug(`[OtlpReceiverHono] Detected hex string encoded as UTF-8: ${utf8String}`);
        return utf8String.toLowerCase();
      }

      if (hex.length === expectedHexLength) {
        return hex;
      }

      logger.warn(
        `[OtlpReceiverHono] Unexpected ID format: ${id} -> ${hex} (expected ${expectedHexLength} hex chars)`,
      );
      return id.toLowerCase();
    } catch (error) {
      logger.error(`[OtlpReceiverHono] Failed to convert ID: ${error}`);
      return id.toLowerCase();
    }
  }

  /**
   * Convert Hono app to Node.js HTTP handler for standalone server mode.
   */
  private honoToNodeHandler() {
    return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
      try {
        const protocol = 'http';
        const host = req.headers.host || 'localhost';
        const url = `${protocol}://${host}${req.url}`;

        let body: Buffer | undefined;
        if (req.method && !['GET', 'HEAD'].includes(req.method)) {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks);
        }

        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) {
            if (Array.isArray(value)) {
              value.forEach((v) => headers.append(key, v));
            } else {
              headers.set(key, value);
            }
          }
        }

        const request = new Request(url, {
          method: req.method || 'GET',
          headers,
          body: body ? new Uint8Array(body) : undefined,
        });

        const response = await this.app.fetch(request);

        res.statusCode = response.status;

        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });

        if (response.body) {
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              res.write(value);
            }
          } finally {
            reader.releaseLock();
          }
        }

        res.end();
      } catch (error) {
        logger.error(
          `[OtlpReceiverHono] Request handling error: ${error instanceof Error ? error.message : error}`,
        );
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    };
  }

  listen(port: number = 4318, host: string = '127.0.0.1'): Promise<void> {
    this.port = port;
    logger.debug(`[OtlpReceiverHono] Starting receiver on ${host}:${port}`);

    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.honoToNodeHandler());
      this.server.listen(port, host, () => {
        logger.info(`[OtlpReceiverHono] Listening on http://${host}:${port}`);
        logger.debug('[OtlpReceiverHono] Receiver fully initialized and ready to accept traces');
        resolve();
      });

      this.server.on('error', (error: Error) => {
        logger.error(`[OtlpReceiverHono] Failed to start: ${error}`);
        reject(error);
      });
    });
  }

  stop(): Promise<void> {
    logger.debug('[OtlpReceiverHono] Stopping receiver');
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('[OtlpReceiverHono] Server stopped');
          this.server = undefined;
          resolve();
        });
      } else {
        logger.debug('[OtlpReceiverHono] No server to stop');
        resolve();
      }
    });
  }

  getApp(): Hono {
    return this.app;
  }
}

// Singleton instance
let otlpReceiverHono: OTLPReceiverHono | null = null;

function getOTLPReceiverHono(): OTLPReceiverHono {
  if (!otlpReceiverHono) {
    otlpReceiverHono = new OTLPReceiverHono();
  }
  return otlpReceiverHono;
}

export async function startOTLPReceiverHono(port?: number, host?: string): Promise<void> {
  logger.debug('[OtlpReceiverHono] Starting receiver through startOTLPReceiverHono function');
  const receiver = getOTLPReceiverHono();
  await receiver.listen(port, host);
}

export async function stopOTLPReceiverHono(): Promise<void> {
  logger.debug('[OtlpReceiverHono] Stopping receiver through stopOTLPReceiverHono function');
  if (otlpReceiverHono) {
    await otlpReceiverHono.stop();
    otlpReceiverHono = null;
  }
}
