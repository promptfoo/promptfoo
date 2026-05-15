import crypto from 'node:crypto';

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
import {
  PROMPTFOO_RESOURCE_ATTR_PARENT_SPAN_ID,
  PROMPTFOO_RESOURCE_ATTR_TRACE_ID,
} from './resourceAttributes';
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

// Minimal OTLP logs JSON shapes. Full OTEL log signal includes severity,
// observedTimeUnixNano, and more — we only use the fields needed to synthesize
// point-in-time spans under the log's trace.
interface OTLPLogRecord {
  timeUnixNano?: string;
  observedTimeUnixNano?: string;
  traceId?: string;
  spanId?: string;
  severityNumber?: number;
  severityText?: string;
  body?: OTLPAttribute['value'];
  attributes?: OTLPAttribute[];
}

interface OTLPScopeLogs {
  scope?: {
    name: string;
    version?: string;
  };
  logRecords: OTLPLogRecord[];
}

interface OTLPResourceLogs {
  resource?: {
    attributes?: OTLPAttribute[];
  };
  scopeLogs: OTLPScopeLogs[];
}

interface OTLPLogsRequest {
  resourceLogs: OTLPResourceLogs[];
}

// Log event names we don't want cluttering traces (internal, not actionable).
const LOG_EVENT_NAME_DENYLIST: ReadonlySet<string> = new Set(['claude_code.tracing']);
// Nominal span duration for a log-derived span so it renders as a thin bar
// instead of a zero-width point in trace UIs.
const LOG_SPAN_DURATION_MS = 1;
// Max characters of a log body that we're willing to use as a span name when
// no event.name attribute is present — longer bodies would clutter the UI.
const MAX_BODY_AS_NAME_LENGTH = 128;
// OTEL severityNumber >= 17 corresponds to ERROR and above.
const SEVERITY_NUMBER_ERROR = 17;
// Hard cap on the otel.log.body attribute so malicious or overly-chatty SDKs
// can't bloat the trace DB with multi-megabyte log bodies.
const MAX_LOG_BODY_ATTR_LENGTH = 8192;

function truncateLogBody(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  if (value.length <= MAX_LOG_BODY_ATTR_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_LOG_BODY_ATTR_LENGTH - 15)}... [truncated]`;
}

// OTEL span_id is 16 hex chars / 8 bytes; base64 form is 11 chars + optional '='.
// An all-zero 8-byte value encodes to "AAAAAAAAAAA=" (or "AAAAAAAAAAAA"), which
// would otherwise pass a `[1-9a-f]` scan since 'A' is in the hex alphabet.
const BASE64_ZERO_SPAN_ID = /^A{11,12}=?$/;
function isZeroSpanId(id: string): boolean {
  return /^0+$/.test(id) || BASE64_ZERO_SPAN_ID.test(id);
}

function randomSpanId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function getStringAttribute(attributes: Record<string, any>, key: string): string | undefined {
  const value = attributes[key];
  return typeof value === 'string' ? value : undefined;
}

function resolveLogSpanName(attributes: Record<string, any>, bodyValue: unknown): string {
  // Prefer the OTEL "event.name" semantic convention, which Claude Code sets
  // to values like "claude_code.tool.execution".
  const eventName = attributes['event.name'] ?? attributes['claude_code.event.name'];
  if (typeof eventName === 'string' && eventName.length > 0) {
    return eventName;
  }
  if (
    typeof bodyValue === 'string' &&
    bodyValue.length > 0 &&
    bodyValue.length <= MAX_BODY_AS_NAME_LENGTH
  ) {
    return bodyValue;
  }
  return 'otel.log';
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

    // /v1/logs accepts JSON only. Claude Agent SDK emits most useful telemetry
    // (tool executions, API requests, interactions) as OTEL logs, not spans;
    // we materialize each log record as a zero-ish-duration span so the
    // Traces tab can render them under the evaluation trace.
    this.app.use('/v1/logs', (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      const format = getRequestFormat(req.headers['content-type']);
      if (format !== 'json') {
        res.status(415).json({
          error: 'Only application/json is supported for /v1/logs',
        });
        return;
      }
      next();
    });
    this.app.use(
      '/v1/logs',
      express.json({
        limit: '10mb',
        type: (req) => getRequestFormat(req.headers['content-type']) === 'json',
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

    // OTLP HTTP endpoint for logs (JSON only). Each log record becomes a span
    // parented to the span it was emitted from, so SDK-internal events show up
    // in the Traces tab alongside provider and tool spans.
    this.app.post('/v1/logs', async (req, res) => {
      logger.debug('[OtlpReceiver] Received logs request');
      try {
        const traces = this.parseOTLPLogsJSONRequest(req.body as OTLPLogsRequest);
        logger.debug(`[OtlpReceiver] Parsed ${traces.length} logs into span records`);
        if (traces.length > 0) {
          await this.persistTraces(this.groupTraces(traces));
        }
        res.status(200).json({ partialSuccess: {} });
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
      if (!info.evaluationId || !info.testCaseId) {
        logger.debug(`[OtlpReceiver] Skipping trace record creation for unlinked trace ${traceId}`);
        continue;
      }

      try {
        logger.debug(`[OtlpReceiver] Creating trace record for ${traceId}`);
        await this.traceStore.createTrace({
          traceId,
          evaluationId: info.evaluationId,
          testCaseId: info.testCaseId,
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
      await this.traceStore.addSpans(traceId, spans, {
        skipTraceCheck: false,
        warnIfMissingTrace: false,
      });
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

  private parseOTLPLogsJSONRequest(body: OTLPLogsRequest): ParsedTrace[] {
    const traces: ParsedTrace[] = [];
    const resourceLogs = body?.resourceLogs ?? [];
    logger.debug(`[OtlpReceiver] Parsing logs request with ${resourceLogs.length} resource logs`);

    for (const resourceLog of resourceLogs) {
      const resourceAttributes = this.parseAttributes(resourceLog.resource?.attributes);
      for (const scopeLog of resourceLog.scopeLogs ?? []) {
        for (const log of scopeLog.logRecords ?? []) {
          // Log-and-skip on a per-record basis so one malformed record can't
          // drop the entire batch (the SDK often batches dozens per flush).
          try {
            const parsed = this.logRecordToParsedTrace(log, scopeLog, resourceAttributes);
            if (parsed) {
              traces.push(parsed);
            }
          } catch (err) {
            logger.warn(
              `[OtlpReceiver] Skipping malformed log record in scope ${scopeLog.scope?.name ?? '(unknown)'}: ${err}`,
            );
          }
        }
      }
    }

    return traces;
  }

  private logRecordToParsedTrace(
    log: OTLPLogRecord,
    scopeLog: OTLPScopeLogs,
    resourceAttributes: Record<string, any>,
  ): ParsedTrace | null {
    // Prefer an inline traceId on the log record (set when the SDK propagated
    // TRACEPARENT into its logs context). Fall back to the resource attribute
    // promptfoo.trace_id — the claude-agent-sdk provider injects this via
    // OTEL_RESOURCE_ATTRIBUTES because Claude Code's logs signal does not
    // inherit TRACEPARENT. Without either, we can't link anywhere useful.
    const rawTraceId =
      log.traceId ?? getStringAttribute(resourceAttributes, PROMPTFOO_RESOURCE_ATTR_TRACE_ID);
    if (!rawTraceId) {
      logger.debug(
        `[OtlpReceiver] Dropping log: no traceId and no ${PROMPTFOO_RESOURCE_ATTR_TRACE_ID} resource attribute (scope=${scopeLog.scope?.name ?? 'unknown'}). Ensure TRACEPARENT is propagated or OTEL_RESOURCE_ATTRIBUTES is set by the provider.`,
      );
      return null;
    }
    const traceId = this.convertId(rawTraceId, 32);
    // convertId is lenient and returns garbage on shape mismatch; skip the
    // record rather than orphaning a span under a nonexistent trace.
    if (traceId.length !== 32 || !/^[0-9a-f]+$/.test(traceId)) {
      logger.debug(`[OtlpReceiver] Dropping log: invalid trace_id shape '${rawTraceId}'`);
      return null;
    }

    const attributes: Record<string, any> = {
      ...resourceAttributes,
      ...this.parseAttributes(log.attributes),
      'otel.scope.name': scopeLog.scope?.name,
      'otel.scope.version': scopeLog.scope?.version,
      'otel.log.severity_number': log.severityNumber,
      'otel.log.severity_text': log.severityText,
    };

    const bodyValue = log.body ? this.parseAttributeValue(log.body) : undefined;
    const name = resolveLogSpanName(attributes, bodyValue);

    if (LOG_EVENT_NAME_DENYLIST.has(name)) {
      logger.debug(`[OtlpReceiver] Dropping log: event '${name}' is in the denylist`);
      return null;
    }

    if (bodyValue !== undefined) {
      attributes['otel.log.body'] = truncateLogBody(bodyValue);
    }

    const timeNano = log.timeUnixNano ?? log.observedTimeUnixNano;
    const startTime = timeNano ? Number(timeNano) / 1_000_000 : Date.now();
    const endTime = startTime + LOG_SPAN_DURATION_MS;

    // Log's own span_id is the span the log was emitted from, so that span
    // becomes our synthesized span's parent. Fall back to the resource-level
    // promptfoo.parent_span_id the provider injected. We mint a fresh 16-hex
    // span id so multiple logs within the same span don't collide on
    // (trace_id, span_id).
    const hasValidInlineSpanId = !!log.spanId && !isZeroSpanId(log.spanId);
    const rawParentSpanId = hasValidInlineSpanId
      ? log.spanId
      : getStringAttribute(resourceAttributes, PROMPTFOO_RESOURCE_ATTR_PARENT_SPAN_ID);
    const parentSpanId = rawParentSpanId ? this.convertId(rawParentSpanId, 16) : undefined;

    const severityIsError =
      typeof log.severityNumber === 'number' && log.severityNumber >= SEVERITY_NUMBER_ERROR;

    return {
      traceId,
      span: {
        spanId: randomSpanId(),
        parentSpanId,
        name,
        startTime,
        endTime,
        attributes,
        // OTEL logs don't carry a span status; treat as OK unless severity indicates error.
        statusCode: 1,
        statusMessage: severityIsError ? log.severityText : undefined,
      },
    };
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
