import express from 'express';
import logger from '../logger';
import {
  bytesToHex,
  type DecodedAttribute,
  type DecodedExportTraceServiceRequest,
  type DecodedResourceSpans,
  type DecodedScopeSpans,
  type DecodedSpan,
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

type OTLPFormat = 'json' | 'protobuf';

interface OTLPReceiverOptions {
  acceptFormats?: OTLPFormat[];
}

interface TraceInfo {
  evaluationId?: string;
  testCaseId?: string;
}

interface GroupedTraces {
  spansByTrace: Map<string, SpanData[]>;
  traceInfoById: Map<string, TraceInfo>;
}

const SPAN_KIND_MAP: Record<number, string> = {
  0: 'unspecified',
  1: 'internal',
  2: 'server',
  3: 'client',
  4: 'producer',
  5: 'consumer',
};

const DEFAULT_ACCEPT_FORMATS: OTLPFormat[] = ['json', 'protobuf'];
const OTLP_CONTENT_TYPES: Record<OTLPFormat, string> = {
  json: 'application/json',
  protobuf: 'application/x-protobuf',
};

function normalizeAcceptFormats(acceptFormats?: OTLPFormat[]): OTLPFormat[] {
  const normalized = [...new Set(acceptFormats ?? DEFAULT_ACCEPT_FORMATS)];
  return normalized.length > 0 ? normalized : [...DEFAULT_ACCEPT_FORMATS];
}

function getRequestFormat(contentType: string | string[] | undefined): OTLPFormat | null {
  const rawContentType = Array.isArray(contentType) ? contentType[0] : contentType;
  const mimeType = rawContentType?.split(';', 1)[0]?.trim().toLowerCase();

  if (mimeType === OTLP_CONTENT_TYPES.json) {
    return 'json';
  }

  if (mimeType === OTLP_CONTENT_TYPES.protobuf) {
    return 'protobuf';
  }

  return null;
}

export class OTLPReceiver {
  private app: express.Application;
  private acceptFormats: OTLPFormat[];
  private traceStore: TraceStore;
  private port?: number;
  private server?: any; // http.Server type

  constructor(options: OTLPReceiverOptions = {}) {
    this.app = express();
    this.acceptFormats = normalizeAcceptFormats(options.acceptFormats);
    this.traceStore = getTraceStore();
    logger.debug('[OtlpReceiver] Initializing OTLP receiver');
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Reject disabled content types before any body parser runs.
    this.app.use('/v1/traces', (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      const format = getRequestFormat(req.headers['content-type']);
      if (!format || !this.acceptFormats.includes(format)) {
        res.status(415).json({ error: 'Unsupported content type' });
        return;
      }

      next();
    });

    // Keep parser selection dynamic so setAcceptFormats() still works on the singleton receiver.
    this.app.use(
      '/v1/traces',
      express.json({
        limit: '10mb',
        type: (req) =>
          this.acceptFormats.includes('json') &&
          getRequestFormat(req.headers['content-type']) === 'json',
      }),
    );
    this.app.use(
      '/v1/traces',
      express.raw({
        limit: '10mb',
        type: (req) =>
          this.acceptFormats.includes('protobuf') &&
          getRequestFormat(req.headers['content-type']) === 'protobuf',
      }),
    );
    logger.debug('[OtlpReceiver] Middleware configured for accepted OTLP formats');
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

      const format = getRequestFormat(contentType);

      if (!format || !this.acceptFormats.includes(format)) {
        res.status(415).json({ error: 'Unsupported content type' });
        return;
      }

      try {
        const traces = await this.parseIncomingRequest(format, req.body);
        logger.debug(`[OtlpReceiver] Parsed ${traces.length} traces from request`);
        await this.persistTraces(this.groupTraces(traces));

        // OTLP success response
        res.status(200).json({ partialSuccess: {} });
        logger.debug('[OtlpReceiver] Successfully processed traces');
      } catch (error) {
        this.handleProcessingError(error, res);
      }
    });

    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      logger.debug('[OtlpReceiver] Health check requested');
      res.status(200).json({ status: 'ok' });
    });

    // OTLP service info endpoint
    this.app.get('/v1/traces', (_req, res) => {
      res.status(200).json({
        service: 'promptfoo-otlp-receiver',
        version: '1.0.0',
        supported_formats: this.acceptFormats,
      });
    });

    // Debug endpoint to check receiver status
    this.app.get('/debug/status', async (_req, res) => {
      res.status(200).json({
        status: 'running',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        port: this.port || 4318,
      });
    });

    // Global error handler
    this.app.use((error: any, _req: any, res: any, _next: any) => {
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

  private async parseIncomingRequest(format: OTLPFormat, body: unknown): Promise<ParsedTrace[]> {
    if (format === 'json') {
      logger.debug('[OtlpReceiver] Parsing OTLP JSON request');
      logger.debug(`[OtlpReceiver] Request body: ${JSON.stringify(body).substring(0, 500)}...`);
      return this.parseOTLPJSONRequest(body as OTLPTraceRequest);
    }

    logger.debug('[OtlpReceiver] Parsing OTLP protobuf request');
    logger.debug(
      `[OtlpReceiver] Request body size: ${(body as Buffer | undefined)?.length || 0} bytes`,
    );
    return this.parseOTLPProtobufRequest(body as Buffer);
  }

  private groupTraces(traces: ParsedTrace[]): GroupedTraces {
    const spansByTrace = new Map<string, SpanData[]>();
    const traceInfoById = new Map<string, TraceInfo>();

    for (const trace of traces) {
      const spans = spansByTrace.get(trace.traceId) ?? [];
      spans.push(trace.span);
      spansByTrace.set(trace.traceId, spans);
      this.recordTraceInfo(traceInfoById, trace);
    }

    logger.debug(`[OtlpReceiver] Grouped spans into ${spansByTrace.size} traces`);

    return { spansByTrace, traceInfoById };
  }

  private recordTraceInfo(traceInfoById: Map<string, TraceInfo>, trace: ParsedTrace): void {
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

  private async persistTraces({ spansByTrace, traceInfoById }: GroupedTraces): Promise<void> {
    await this.createTraceRecords(traceInfoById);
    await this.storeSpans(spansByTrace);
  }

  private async createTraceRecords(traceInfoById: Map<string, TraceInfo>): Promise<void> {
    for (const [traceId, info] of traceInfoById) {
      try {
        logger.debug(`[OtlpReceiver] Creating trace record for ${traceId}`);
        await this.traceStore.createTrace({
          traceId,
          evaluationId: info.evaluationId || '',
          testCaseId: info.testCaseId || '',
        });
      } catch (error) {
        // Trace might already exist, which is fine
        logger.debug(`[OtlpReceiver] Trace ${traceId} may already exist: ${error}`);
      }
    }
  }

  private async storeSpans(spansByTrace: Map<string, SpanData[]>): Promise<void> {
    for (const [traceId, spans] of spansByTrace) {
      logger.debug(`[OtlpReceiver] Storing ${spans.length} spans for trace ${traceId}`);
      await this.traceStore.addSpans(traceId, spans, { skipTraceCheck: true });
    }
  }

  private handleProcessingError(error: unknown, res: express.Response): void {
    logger.error(`[OtlpReceiver] Failed to process OTLP traces: ${error}`);
    logger.error(
      `[OtlpReceiver] Error stack: ${error instanceof Error ? error.stack : 'No stack'}`,
    );

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.toLowerCase().includes('invalid protobuf')) {
      res.status(400).json({ error: errorMessage });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
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
          const spanKindName = SPAN_KIND_MAP[span.kind] ?? 'unspecified';
          const attributes: Record<string, any> = {
            ...resourceAttributes,
            ...this.parseAttributes(span.attributes),
            'otel.scope.name': scopeSpan.scope?.name,
            'otel.scope.version': scopeSpan.scope?.version,
            'otel.span.kind': spanKindName,
            'otel.span.kind_code': span.kind,
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

  private async parseOTLPProtobufRequest(body: Buffer): Promise<ParsedTrace[]> {
    const decoded: DecodedExportTraceServiceRequest = await decodeExportTraceServiceRequest(body);

    logger.debug(
      `[OtlpReceiver] Parsing protobuf request with ${decoded.resourceSpans?.length || 0} resource spans`,
    );

    return (decoded.resourceSpans || []).flatMap((resourceSpan) =>
      this.parseDecodedResourceSpan(resourceSpan),
    );
  }

  private parseDecodedResourceSpan(resourceSpan: DecodedResourceSpans): ParsedTrace[] {
    const resourceAttributes = this.parseDecodedAttributes(resourceSpan.resource?.attributes);
    logger.debug(
      `[OtlpReceiver] Parsed ${Object.keys(resourceAttributes).length} resource attributes from protobuf`,
    );

    return (resourceSpan.scopeSpans || []).flatMap((scopeSpan) =>
      (scopeSpan.spans || []).map((span) =>
        this.createDecodedParsedTrace(resourceAttributes, scopeSpan, span),
      ),
    );
  }

  private createDecodedParsedTrace(
    resourceAttributes: Record<string, any>,
    scopeSpan: DecodedScopeSpans,
    span: DecodedSpan,
  ): ParsedTrace {
    const traceId = bytesToHex(span.traceId, 32);
    const spanId = bytesToHex(span.spanId, 16);
    const parentSpanId = span.parentSpanId?.length ? bytesToHex(span.parentSpanId, 16) : undefined;

    logger.debug(
      `[OtlpReceiver] Processing protobuf span: ${span.name} (${spanId}) in trace ${traceId}`,
    );

    const spanKindCode = span.kind ?? 0;
    const spanKindName = SPAN_KIND_MAP[spanKindCode] ?? 'unspecified';

    return {
      traceId,
      span: {
        spanId,
        parentSpanId,
        name: span.name,
        startTime: this.toMilliseconds(span.startTimeUnixNano) ?? 0,
        endTime: this.toMilliseconds(span.endTimeUnixNano),
        attributes: {
          ...resourceAttributes,
          ...this.parseDecodedAttributes(span.attributes),
          'otel.scope.name': scopeSpan.scope?.name,
          'otel.scope.version': scopeSpan.scope?.version,
          'otel.span.kind': spanKindName,
          'otel.span.kind_code': spanKindCode,
        },
        statusCode: span.status?.code,
        statusMessage: span.status?.message,
      },
    };
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

  listen(port: number = 4318, host: string = '127.0.0.1'): Promise<void> {
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

  setAcceptFormats(acceptFormats?: OTLPFormat[]): void {
    this.acceptFormats = normalizeAcceptFormats(acceptFormats);
  }

  private toMilliseconds(
    value: DecodedSpan['startTimeUnixNano'] | DecodedSpan['endTimeUnixNano'],
  ): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    return Number(value) / 1_000_000;
  }
}

// Singleton instance
let otlpReceiver: OTLPReceiver | null = null;

function getOTLPReceiver(options?: OTLPReceiverOptions): OTLPReceiver {
  if (otlpReceiver) {
    otlpReceiver.setAcceptFormats(options?.acceptFormats);
    return otlpReceiver;
  }

  otlpReceiver = new OTLPReceiver(options);
  return otlpReceiver;
}

export async function startOTLPReceiver(
  port?: number,
  host?: string,
  acceptFormats?: OTLPFormat[],
): Promise<void> {
  logger.debug('[OtlpReceiver] Starting receiver through startOTLPReceiver function');
  const receiver = getOTLPReceiver({ acceptFormats });
  await receiver.listen(port, host);
}

export async function stopOTLPReceiver(): Promise<void> {
  logger.debug('[OtlpReceiver] Stopping receiver through stopOTLPReceiver function');
  if (otlpReceiver) {
    await otlpReceiver.stop();
    otlpReceiver = null;
  }
}
