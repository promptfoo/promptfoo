import express from 'express';
import logger from '../logger';
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
  traceId: string; // Base64 encoded
  spanId: string; // Base64 encoded
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

export class OTLPReceiver {
  private app: express.Application;
  private traceStore: TraceStore;
  private port?: number;
  private server?: any; // http.Server type

  constructor() {
    this.app = express();
    this.traceStore = getTraceStore();
    logger.debug('[OtlpReceiver] Initializing OTLP receiver');
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Support both JSON and protobuf (for now, we'll focus on JSON)
    this.app.use(express.json({ limit: '10mb', type: 'application/json' }));
    this.app.use(express.raw({ type: 'application/x-protobuf', limit: '10mb' }));
    logger.debug('[OtlpReceiver] Middleware configured for JSON and protobuf');
  }

  private setupRoutes(): void {
    // OTLP HTTP endpoint for traces
    this.app.post('/v1/traces', async (req, res) => {
      const contentType = req.headers['content-type'] || 'unknown';
      const bodySize = req.body ? JSON.stringify(req.body).length : 0;
      logger.debug(
        `[OtlpReceiver] Received trace request: ${req.headers['content-type']} with ${bodySize} bytes`,
      );
      logger.debug('[OtlpReceiver] Starting to process traces');

      // Check content type first before processing
      if (contentType === 'application/json') {
        // Continue with JSON processing
      } else if (contentType === 'application/x-protobuf') {
        logger.warn('Protobuf format not yet supported, please use JSON');
        res.status(415).json({ error: 'Protobuf format not yet supported' });
        return;
      } else {
        res.status(415).json({ error: 'Unsupported content type' });
        return;
      }

      try {
        let traces: ParsedTrace[] = [];

        // We already validated content type above, so this must be JSON
        logger.debug('[OtlpReceiver] Parsing OTLP JSON request');
        logger.debug(
          `[OtlpReceiver] Request body: ${JSON.stringify(req.body).substring(0, 500)}...`,
        );
        traces = this.parseOTLPJSONRequest(req.body);
        logger.debug(`[OtlpReceiver] Parsed ${traces.length} traces from request`);

        // Group spans by trace ID
        const spansByTrace = new Map<string, SpanData[]>();
        for (const trace of traces) {
          if (!spansByTrace.has(trace.traceId)) {
            spansByTrace.set(trace.traceId, []);
          }
          spansByTrace.get(trace.traceId)!.push(trace.span);
        }
        logger.debug(`[OtlpReceiver] Grouped spans into ${spansByTrace.size} traces`);

        // Store spans for each trace
        for (const [traceId, spans] of spansByTrace) {
          logger.debug(`[OtlpReceiver] Storing ${spans.length} spans for trace ${traceId}`);
          await this.traceStore.addSpans(traceId, spans, { skipTraceCheck: true });
        }

        // OTLP success response
        res.status(200).json({ partialSuccess: {} });
        logger.debug('[OtlpReceiver] Successfully processed traces');
      } catch (error) {
        logger.error(`[OtlpReceiver] Failed to process OTLP traces: ${error}`);
        logger.error(
          `[OtlpReceiver] Error stack: ${error instanceof Error ? error.stack : 'No stack'}`,
        );
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      logger.debug('[OtlpReceiver] Health check requested');
      res.status(200).json({ status: 'ok' });
    });

    // OTLP service info endpoint
    this.app.get('/v1/traces', (req, res) => {
      res.status(200).json({
        service: 'promptfoo-otlp-receiver',
        version: '1.0.0',
        supported_formats: ['json'], // 'protobuf' will be added in phase 2
      });
    });

    // Debug endpoint to check receiver status
    this.app.get('/debug/status', async (req, res) => {
      res.status(200).json({
        status: 'running',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        port: this.port || 4318,
      });
    });

    // Global error handler
    this.app.use((error: any, req: any, res: any, next: any) => {
      logger.error(`[OtlpReceiver] Global error handler: ${error}`);
      logger.error(`[OtlpReceiver] Error stack: ${error.stack}`);

      // Handle JSON parsing errors
      if (error instanceof SyntaxError && 'body' in error) {
        res.status(400).json({ error: 'Invalid JSON' });
        return;
      }

      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private parseOTLPJSONRequest(body: OTLPTraceRequest): ParsedTrace[] {
    const traces: ParsedTrace[] = [];
    logger.debug(
      `[OtlpReceiver] Parsing request with ${body.resourceSpans?.length || 0} resource spans`,
    );

    for (const resourceSpan of body.resourceSpans) {
      // Extract resource attributes if needed
      const resourceAttributes = this.parseAttributes(resourceSpan.resource?.attributes);
      logger.debug(
        `[OtlpReceiver] Parsed ${Object.keys(resourceAttributes).length} resource attributes`,
      );

      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          // Convert IDs - handle both hex strings and base64 encoded binary
          const traceId = this.convertId(span.traceId, 32); // 32 hex chars = 16 bytes
          const spanId = this.convertId(span.spanId, 16); // 16 hex chars = 8 bytes
          const parentSpanId = span.parentSpanId
            ? this.convertId(span.parentSpanId, 16)
            : undefined;
          logger.debug(
            `[OtlpReceiver] Processing span: ${span.name} (${spanId}) in trace ${traceId}`,
          );

          // Parse attributes
          const attributes = {
            ...resourceAttributes,
            ...this.parseAttributes(span.attributes),
            'otel.scope.name': scopeSpan.scope?.name,
            'otel.scope.version': scopeSpan.scope?.version,
          };

          traces.push({
            traceId,
            span: {
              spanId,
              parentSpanId,
              name: span.name,
              startTime: Number(span.startTimeUnixNano) / 1_000_000, // Convert to ms
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
      `[OtlpReceiver] Converting ID: ${id} (length: ${id.length}, expected hex length: ${expectedHexLength})`,
    );

    // Check if it's already a hex string of the expected length
    if (id.length === expectedHexLength && /^[0-9a-f]+$/i.test(id)) {
      logger.debug(`[OtlpReceiver] ID is already hex format`);
      return id.toLowerCase();
    }

    // Try base64 decoding
    try {
      const buffer = Buffer.from(id, 'base64');
      const hex = buffer.toString('hex');
      logger.debug(`[OtlpReceiver] Base64 decoded: ${id} -> ${hex} (${buffer.length} bytes)`);

      // Check if the decoded value looks like it was originally a hex string encoded as UTF-8
      const utf8String = buffer.toString('utf8');
      if (utf8String.length === expectedHexLength && /^[0-9a-f]+$/i.test(utf8String)) {
        logger.debug(`[OtlpReceiver] Detected hex string encoded as UTF-8: ${utf8String}`);
        return utf8String.toLowerCase();
      }

      // If the resulting hex is the expected length, return it
      if (hex.length === expectedHexLength) {
        return hex;
      }

      // Otherwise, something's wrong
      logger.warn(
        `[OtlpReceiver] Unexpected ID format: ${id} -> ${hex} (expected ${expectedHexLength} hex chars)`,
      );
      return id.toLowerCase();
    } catch (error) {
      logger.error(`[OtlpReceiver] Failed to convert ID: ${error}`);
      return id.toLowerCase();
    }
  }

  listen(port: number = 4318, host: string = '0.0.0.0'): Promise<void> {
    this.port = port;
    logger.debug(`[OtlpReceiver] Starting receiver on ${host}:${port}`);

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, host, () => {
        logger.info(`[OtlpReceiver] Listening on http://${host}:${port}`);
        logger.debug('[OtlpReceiver] Receiver fully initialized and ready to accept traces');
        resolve();
      });

      this.server.on('error', (error: Error) => {
        logger.error(`[OtlpReceiver] Failed to start: ${error}`);
        reject(error);
      });
    });
  }

  stop(): Promise<void> {
    logger.debug('[OtlpReceiver] Stopping receiver');
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('[OtlpReceiver] Server stopped');
          this.server = undefined;
          resolve();
        });
      } else {
        logger.debug('[OtlpReceiver] No server to stop');
        resolve();
      }
    });
  }

  getApp(): express.Application {
    return this.app;
  }
}

// Singleton instance
let otlpReceiver: OTLPReceiver | null = null;

function getOTLPReceiver(): OTLPReceiver {
  if (!otlpReceiver) {
    otlpReceiver = new OTLPReceiver();
  }
  return otlpReceiver;
}

export async function startOTLPReceiver(port?: number, host?: string): Promise<void> {
  logger.debug('[OtlpReceiver] Starting receiver through startOTLPReceiver function');
  const receiver = getOTLPReceiver();
  await receiver.listen(port, host);
}

export async function stopOTLPReceiver(): Promise<void> {
  logger.debug('[OtlpReceiver] Stopping receiver through stopOTLPReceiver function');
  if (otlpReceiver) {
    await otlpReceiver.stop();
    otlpReceiver = null;
  }
}
