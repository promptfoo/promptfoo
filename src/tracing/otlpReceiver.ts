import { randomBytes } from 'crypto';

import express from 'express';
import logger from '../logger';
import {
  type OTLPLogsRequest,
  type OTLPTraceRequest,
  validateOTLPLogsRequest,
  validateOTLPTraceRequest,
} from './otlpSchemas';
import {
  bytesToHex,
  type DecodedAttribute,
  type DecodedExportLogsServiceRequest,
  type DecodedExportTraceServiceRequest,
  type DecodedLogRecord,
  decodeExportLogsServiceRequest,
  decodeExportTraceServiceRequest,
} from './protobuf';
import { getTraceStore, type ParsedTrace, type SpanData, type TraceStore } from './store';

interface OTLPAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string | number;
    doubleValue?: number;
    boolValue?: boolean;
    bytesValue?: string;
    arrayValue?: { values: any[] };
    kvlistValue?: { values: OTLPAttribute[] };
  };
}

// Note: OTLPTraceRequest is imported from ./otlpSchemas for Zod validation

// OTLP Logs JSON interfaces
interface OTLPLogRecord {
  timeUnixNano: string | number;
  observedTimeUnixNano?: string | number;
  severityNumber?: number;
  severityText?: string;
  body?: {
    stringValue?: string;
    intValue?: string | number;
    doubleValue?: number;
    boolValue?: boolean;
    bytesValue?: string;
    kvlistValue?: { values: OTLPAttribute[] };
    arrayValue?: { values: any[] };
  };
  attributes?: OTLPAttribute[];
  droppedAttributesCount?: number;
  flags?: number;
  traceId?: string; // Base64 encoded
  spanId?: string; // Base64 encoded
  eventName?: string;
}

// Note: OTLPLogsRequest is imported from ./otlpSchemas for Zod validation

const SPAN_KIND_MAP: Record<number, string> = {
  0: 'unspecified',
  1: 'internal',
  2: 'server',
  3: 'client',
  4: 'producer',
  5: 'consumer',
};

const MAX_ATTRIBUTE_DEPTH = 20;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

class InvalidOtlpPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOtlpPayloadError';
  }
}

export class OTLPReceiver {
  private app: express.Application;
  private traceStore: TraceStore;
  private port?: number;
  private server?: any; // http.Server type
  private activeRequests = 0;
  private lastActivityAt = Date.now();

  constructor() {
    this.app = express();
    this.traceStore = getTraceStore();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use((_req, res, next) => {
      this.activeRequests += 1;
      this.lastActivityAt = Date.now();

      let finalized = false;
      const finalize = () => {
        if (finalized) {
          return;
        }
        finalized = true;
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        this.lastActivityAt = Date.now();
      };

      res.on('finish', finalize);
      res.on('close', finalize);
      next();
    });

    // Support both JSON and protobuf (for now, we'll focus on JSON)
    this.app.use(express.json({ limit: '10mb', type: 'application/json' }));
    this.app.use(express.raw({ type: 'application/x-protobuf', limit: '10mb' }));
  }

  private setupRoutes(): void {
    // OTLP HTTP endpoint for traces
    this.app.post('/v1/traces', async (req, res) => {
      const contentType = req.headers['content-type'] || 'unknown';

      // Check content type first before processing (handle charset parameters)
      const isJson = contentType.startsWith('application/json');
      const isProtobuf = contentType.startsWith('application/x-protobuf');

      if (!isJson && !isProtobuf) {
        res.status(415).json({ error: 'Unsupported content type' });
        return;
      }

      try {
        let traces: ParsedTrace[] = [];

        if (isJson) {
          // Validate JSON request with Zod schema
          const validation = validateOTLPTraceRequest(req.body);
          if (!validation.success) {
            logger.debug(`[OtlpReceiver] Trace request validation failed: ${validation.error}`);
            res.status(400).json({ error: validation.error });
            return;
          }

          traces = this.parseOTLPJSONRequest(validation.data);
        } else if (isProtobuf) {
          traces = await this.parseOTLPProtobufRequest(req.body);
        }

        const result = await this.groupAndStoreSpans(traces, 'spans');

        // OTLP success response
        res.status(200).json({
          partialSuccess:
            result.rejectedCount > 0
              ? {
                  rejectedSpans: result.rejectedCount,
                  errorMessage: result.reasons.join('; '),
                }
              : {},
        });
      } catch (error) {
        logger.error(`[OtlpReceiver] Failed to process OTLP traces: ${error}`);
        logger.error(
          `[OtlpReceiver] Error stack: ${error instanceof Error ? error.stack : 'No stack'}`,
        );

        // Return 400 for invalid payload/parsing errors
        const errorMessage = error instanceof Error ? error.message : 'Invalid OTLP traces payload';
        if (
          error instanceof InvalidOtlpPayloadError ||
          errorMessage.toLowerCase().includes('invalid protobuf')
        ) {
          res.status(400).json({ error: errorMessage });
          return;
        }

        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // OTLP HTTP endpoint for logs (used by Claude Agent SDK)
    this.app.post('/v1/logs', async (req, res) => {
      const contentType = req.headers['content-type'] || 'unknown';

      // Check content type first before processing (handle charset parameters)
      const isJson = contentType.startsWith('application/json');
      const isProtobuf = contentType.startsWith('application/x-protobuf');

      if (!isJson && !isProtobuf) {
        res.status(415).json({ error: 'Unsupported content type' });
        return;
      }

      try {
        let traces: ParsedTrace[] = [];

        if (isJson) {
          // Validate JSON request with Zod schema
          const validation = validateOTLPLogsRequest(req.body);
          if (!validation.success) {
            logger.debug(`[OtlpReceiver] Logs request validation failed: ${validation.error}`);
            res.status(400).json({ error: validation.error });
            return;
          }

          traces = this.parseOTLPLogsJSONRequest(validation.data);
        } else if (isProtobuf) {
          traces = await this.parseOTLPLogsProtobufRequest(req.body);
        }

        const result = await this.groupAndStoreSpans(traces, 'log-derived spans');

        // OTLP logs success response
        res.status(200).json({
          partialSuccess:
            result.rejectedCount > 0
              ? {
                  rejectedLogRecords: result.rejectedCount,
                  errorMessage: result.reasons.join('; '),
                }
              : {},
        });
      } catch (error) {
        logger.error(`[OtlpReceiver] Failed to process OTLP logs: ${error}`);
        logger.error(
          `[OtlpReceiver] Error stack: ${error instanceof Error ? error.stack : 'No stack'}`,
        );

        // Return 400 for invalid payload/parsing errors
        const errorMessage = error instanceof Error ? error.message : 'Invalid OTLP logs payload';
        if (
          error instanceof InvalidOtlpPayloadError ||
          errorMessage.toLowerCase().includes('invalid protobuf')
        ) {
          res.status(400).json({ error: errorMessage });
          return;
        }

        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Health check endpoint
    this.app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    // OTLP service info endpoint for traces
    this.app.get('/v1/traces', (_req, res) => {
      res.status(200).json({
        service: 'promptfoo-otlp-receiver',
        version: '1.0.0',
        supported_formats: ['json', 'protobuf'],
      });
    });

    // OTLP service info endpoint for logs
    this.app.get('/v1/logs', (_req, res) => {
      res.status(200).json({
        service: 'promptfoo-otlp-receiver',
        version: '1.0.0',
        supported_formats: ['json', 'protobuf'],
        description: 'OTLP logs endpoint - logs are converted to spans for tracing',
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

  /**
   * Group parsed traces by trace ID, create trace records where needed, and store spans.
   * Shared between the /v1/traces and /v1/logs endpoints.
   */
  private async groupAndStoreSpans(
    traces: ParsedTrace[],
    label: string,
  ): Promise<{ rejectedCount: number; reasons: string[] }> {
    let rejectedCount = 0;
    const reasons = new Set<string>();
    const spansByTrace = new Map<string, SpanData[]>();
    const traceInfoById = new Map<string, { evaluationId?: string; testCaseId?: string }>();

    for (const trace of traces) {
      if (!spansByTrace.has(trace.traceId)) {
        spansByTrace.set(trace.traceId, []);
        if (!traceInfoById.has(trace.traceId)) {
          traceInfoById.set(trace.traceId, {});
        }
      }

      // Extract optional evaluation and test case IDs from any span's attributes
      const evaluationId = trace.span.attributes?.['evaluation.id'] as string | undefined;
      const testCaseId = trace.span.attributes?.['test.case.id'] as string | undefined;
      if (evaluationId || testCaseId) {
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
    // Create trace records for traces that have an evaluationId.
    // Traces without evaluationId should already exist in the DB (created by
    // the evaluator via generateTraceContextIfNeeded before the provider runs).
    // Attempting to create a trace with an empty evaluationId would violate the
    // foreign key constraint on the traces table.
    const tracesWithKnownRecords = new Set<string>();
    const tracesWithCreateFailures = new Set<string>();
    for (const [traceId, info] of traceInfoById) {
      if (!info.evaluationId) {
        continue;
      }
      try {
        await this.traceStore.createTrace({
          traceId,
          evaluationId: info.evaluationId,
          testCaseId: info.testCaseId || '',
        });
        tracesWithKnownRecords.add(traceId);
      } catch (error) {
        const spanCount = spansByTrace.get(traceId)?.length || 0;
        const reason = `Failed to create trace record for ${traceId}: ${
          error instanceof Error ? error.message : String(error)
        }`;
        logger.error(`[OtlpReceiver] ${reason}`);
        tracesWithCreateFailures.add(traceId);
        rejectedCount += spanCount;
        reasons.add(reason);
      }
    }

    // Store spans for each trace.
    // For traces we created/confirmed above, skip the existence check.
    // For traces without evaluationId, let the store verify the trace exists
    // (it may have been pre-created by the evaluator). If the trace doesn't
    // exist, addSpans returns { stored: false } without throwing.
    for (const [traceId, spans] of spansByTrace) {
      if (tracesWithCreateFailures.has(traceId)) {
        logger.warn(
          `[OtlpReceiver] Skipping ${spans.length} ${label} for trace ${traceId} after trace creation failure`,
        );
        continue;
      }

      const skipCheck = tracesWithKnownRecords.has(traceId);
      const result = await this.traceStore.addSpans(traceId, spans, {
        skipTraceCheck: skipCheck,
      });
      if (!result.stored) {
        logger.warn(`[OtlpReceiver] ${label} not stored for trace ${traceId}: ${result.reason}`);
        rejectedCount += spans.length;
        if (result.reason) {
          reasons.add(result.reason);
        }
      }
    }

    return {
      rejectedCount,
      reasons: Array.from(reasons),
    };
  }

  private parseOTLPJSONRequest(body: OTLPTraceRequest): ParsedTrace[] {
    // Note: body is already validated by Zod schema at this point
    const traces: ParsedTrace[] = [];

    for (const resourceSpan of body.resourceSpans) {
      const resourceAttributes = this.parseAttributes(resourceSpan.resource?.attributes);

      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          // Convert IDs - handle both hex strings and base64 encoded binary
          const traceId = this.convertId(span.traceId, 32, {
            fieldName: 'traceId',
            required: true,
          })!; // 32 hex chars = 16 bytes
          const spanId = this.convertId(span.spanId, 16, {
            fieldName: 'spanId',
            required: true,
          })!; // 16 hex chars = 8 bytes
          const parentSpanId = span.parentSpanId
            ? this.convertId(span.parentSpanId, 16, {
                fieldName: 'parentSpanId',
              })
            : undefined;

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
    const traces: ParsedTrace[] = [];

    // Decode protobuf message
    const decoded: DecodedExportTraceServiceRequest = await decodeExportTraceServiceRequest(body);

    for (const resourceSpan of decoded.resourceSpans || []) {
      const resourceAttributes = this.parseDecodedAttributes(resourceSpan.resource?.attributes);

      for (const scopeSpan of resourceSpan.scopeSpans || []) {
        for (const span of scopeSpan.spans || []) {
          // Convert binary IDs to hex strings
          const traceId = this.convertBinaryId(span.traceId, 32, {
            fieldName: 'traceId',
            required: true,
          })!;
          const spanId = this.convertBinaryId(span.spanId, 16, {
            fieldName: 'spanId',
            required: true,
          })!;
          const parentSpanId = span.parentSpanId?.length
            ? this.convertBinaryId(span.parentSpanId, 16, {
                fieldName: 'parentSpanId',
              })
            : undefined;

          // Parse attributes
          const spanKindName = SPAN_KIND_MAP[span.kind ?? 0] ?? 'unspecified';
          const attributes: Record<string, any> = {
            ...resourceAttributes,
            ...this.parseDecodedAttributes(span.attributes),
            'otel.scope.name': scopeSpan.scope?.name,
            'otel.scope.version': scopeSpan.scope?.version,
            'otel.span.kind': spanKindName,
            'otel.span.kind_code': span.kind ?? 0,
          };

          // Convert nanoseconds to milliseconds
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
              name: span.name,
              startTime: startTimeNano / 1_000_000, // Convert nanoseconds to milliseconds
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

  /**
   * Parse OTLP logs JSON request and convert log events to spans
   * Claude Agent SDK sends events as OTEL logs, not traces
   */
  private parseOTLPLogsJSONRequest(body: OTLPLogsRequest): ParsedTrace[] {
    const traces: ParsedTrace[] = [];

    for (const resourceLogs of body.resourceLogs || []) {
      const resourceAttributes = this.parseAttributes(resourceLogs.resource?.attributes);

      for (const scopeLogs of resourceLogs.scopeLogs || []) {
        for (const logRecord of scopeLogs.logRecords || []) {
          const converted = this.convertLogEventToSpan(
            logRecord,
            resourceAttributes,
            scopeLogs.scope?.name,
            scopeLogs.scope?.version,
          );
          if (converted) {
            traces.push(converted);
          }
        }
      }
    }

    return traces;
  }

  /**
   * Parse OTLP logs protobuf request and convert log events to spans
   */
  private async parseOTLPLogsProtobufRequest(body: Buffer): Promise<ParsedTrace[]> {
    const traces: ParsedTrace[] = [];

    // Decode protobuf message
    const decoded: DecodedExportLogsServiceRequest = await decodeExportLogsServiceRequest(body);

    for (const resourceLogs of decoded.resourceLogs || []) {
      const resourceAttributes = this.parseDecodedAttributes(resourceLogs.resource?.attributes);

      for (const scopeLogs of resourceLogs.scopeLogs || []) {
        for (const logRecord of scopeLogs.logRecords || []) {
          const converted = this.convertDecodedLogEventToSpan(
            logRecord,
            resourceAttributes,
            scopeLogs.scope?.name,
            scopeLogs.scope?.version,
          );
          if (converted) {
            traces.push(converted);
          }
        }
      }
    }

    return traces;
  }

  /**
   * Resolve trace and span IDs for a log event, applying re-parenting from resource attributes.
   * If the resource carries promptfoo.trace_id (injected via OTEL_RESOURCE_ATTRIBUTES),
   * use it to re-parent this orphan SDK log under the evaluator's trace.
   */
  private resolveLogTraceContext(
    resourceAttributes: Record<string, any>,
    rawTraceId: string | undefined,
    rawSpanId: string | undefined,
  ): { traceId: string; spanId: string; parentSpanId: string | undefined } {
    const resourceTraceId =
      typeof resourceAttributes['promptfoo.trace_id'] === 'string'
        ? this.convertId(resourceAttributes['promptfoo.trace_id'], 32, {
            fieldName: 'promptfoo.trace_id',
          })
        : undefined;
    const resourceParentSpanId =
      typeof resourceAttributes['promptfoo.parent_span_id'] === 'string'
        ? this.convertId(resourceAttributes['promptfoo.parent_span_id'], 16, {
            fieldName: 'promptfoo.parent_span_id',
          })
        : undefined;

    let traceId: string;
    if (resourceTraceId) {
      traceId = resourceTraceId;
    } else if (rawTraceId) {
      traceId = rawTraceId;
    } else {
      traceId = randomBytes(16).toString('hex');
      logger.debug(`[OtlpReceiver] Generated new trace ID for orphan log: ${traceId}`);
    }

    const spanId = rawSpanId || randomBytes(8).toString('hex');
    const parentSpanId = resourceParentSpanId || undefined;

    return { traceId, spanId, parentSpanId };
  }

  /**
   * Build the final ParsedTrace from pre-resolved log event fields.
   * Shared between JSON and protobuf log conversion paths.
   */
  private buildLogSpan(params: {
    traceId: string;
    spanId: string;
    parentSpanId: string | undefined;
    timeMs: number;
    spanName: string;
    resourceAttributes: Record<string, any>;
    logAttributes: Record<string, any>;
    scopeName: string | undefined;
    scopeVersion: string | undefined;
    severityNumber: number | undefined;
    severityText: string | undefined;
    eventName: string | undefined;
    bodyValue: any;
  }): ParsedTrace {
    const attributes: Record<string, any> = {
      ...params.resourceAttributes,
      ...params.logAttributes,
      'otel.scope.name': params.scopeName,
      'otel.scope.version': params.scopeVersion,
      'log.severity_number': params.severityNumber,
      'log.severity_text': params.severityText,
      'log.event_name': params.eventName,
      'log.body': params.bodyValue,
      'otel.span.kind': 'internal',
      'otel.span.kind_code': 1,
    };

    return {
      traceId: params.traceId,
      span: {
        spanId: params.spanId,
        parentSpanId: params.parentSpanId,
        name: params.spanName,
        startTime: params.timeMs,
        endTime: params.timeMs, // Zero duration - log events are point-in-time
        attributes,
        statusCode: 0,
        statusMessage: undefined,
      },
    };
  }

  private parseLogBodyValue(value?: OTLPLogRecord['body']): any {
    return value ? this.parseAttributeValue(value) : undefined;
  }

  private getLogSpanName(params: {
    eventName?: string;
    severityText?: string;
    bodyValue: unknown;
    logAttributes: Record<string, any>;
  }): string {
    if (params.eventName) {
      return params.eventName;
    }

    if (
      typeof params.bodyValue === 'string' &&
      params.bodyValue.startsWith('claude_code.') &&
      !params.bodyValue.includes(' ')
    ) {
      return params.bodyValue;
    }

    const attributeEventName = params.logAttributes['event.name'];
    if (typeof attributeEventName === 'string' && attributeEventName) {
      return attributeEventName;
    }

    return params.severityText || 'log_event';
  }

  /**
   * Convert a JSON OTLP log event to a span.
   * Each log event becomes a zero-duration span with the event data as attributes.
   */
  private convertLogEventToSpan(
    logRecord: OTLPLogRecord,
    resourceAttributes: Record<string, any>,
    scopeName?: string,
    scopeVersion?: string,
  ): ParsedTrace | null {
    const rawTraceId = logRecord.traceId ? this.convertId(logRecord.traceId, 32) : undefined;
    const rawSpanId = logRecord.spanId ? this.convertId(logRecord.spanId, 16) : undefined;
    const { traceId, spanId, parentSpanId } = this.resolveLogTraceContext(
      resourceAttributes,
      rawTraceId,
      rawSpanId,
    );

    const timeMs = Number(logRecord.timeUnixNano) / 1_000_000;
    const logAttributes = this.parseAttributes(logRecord.attributes);
    const bodyValue = this.parseLogBodyValue(logRecord.body);
    const spanName = this.getLogSpanName({
      eventName: logRecord.eventName,
      severityText: logRecord.severityText,
      bodyValue,
      logAttributes,
    });

    return this.buildLogSpan({
      traceId,
      spanId,
      parentSpanId,
      timeMs,
      spanName,
      resourceAttributes,
      logAttributes,
      scopeName,
      scopeVersion,
      severityNumber: logRecord.severityNumber,
      severityText: logRecord.severityText,
      eventName: logRecord.eventName,
      bodyValue,
    });
  }

  /**
   * Convert a decoded protobuf OTLP log event to a span.
   */
  private convertDecodedLogEventToSpan(
    logRecord: DecodedLogRecord,
    resourceAttributes: Record<string, any>,
    scopeName?: string,
    scopeVersion?: string,
  ): ParsedTrace | null {
    const rawTraceId = logRecord.traceId?.length
      ? this.convertBinaryId(logRecord.traceId, 32, {
          fieldName: 'traceId',
        })
      : undefined;
    const rawSpanId = logRecord.spanId?.length
      ? this.convertBinaryId(logRecord.spanId, 16, {
          fieldName: 'spanId',
        })
      : undefined;
    const { traceId, spanId, parentSpanId } = this.resolveLogTraceContext(
      resourceAttributes,
      rawTraceId,
      rawSpanId,
    );

    const timeNano =
      typeof logRecord.timeUnixNano === 'number'
        ? logRecord.timeUnixNano
        : Number(logRecord.timeUnixNano);
    const timeMs = timeNano / 1_000_000;
    const logAttributes = this.parseDecodedAttributes(logRecord.attributes);
    const bodyValue = logRecord.body ? this.parseDecodedAttributeValue(logRecord.body) : undefined;
    const spanName = this.getLogSpanName({
      eventName: logRecord.eventName,
      severityText: logRecord.severityText,
      bodyValue,
      logAttributes,
    });

    return this.buildLogSpan({
      traceId,
      spanId,
      parentSpanId,
      timeMs,
      spanName,
      resourceAttributes,
      logAttributes,
      scopeName,
      scopeVersion,
      severityNumber: logRecord.severityNumber,
      severityText: logRecord.severityText,
      eventName: logRecord.eventName,
      bodyValue,
    });
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
    return this.parseDecodedAttributeValueWithDepth(value, 0);
  }

  private parseDecodedAttributeValueWithDepth(
    value: DecodedAttribute['value'],
    depth: number,
  ): any {
    if (!value) {
      return undefined;
    }
    if (depth >= MAX_ATTRIBUTE_DEPTH) {
      logger.warn(
        `[OtlpReceiver] Reached max OTLP decoded attribute depth (${MAX_ATTRIBUTE_DEPTH}); truncating nested value`,
      );
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
      return value.arrayValue.values.map((v) =>
        this.parseDecodedAttributeValueWithDepth(v, depth + 1),
      );
    }
    if (value.kvlistValue?.values) {
      const kvMap: Record<string, any> = {};
      for (const kv of value.kvlistValue.values) {
        kvMap[kv.key] = this.parseDecodedAttributeValueWithDepth(kv.value, depth + 1);
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
    return this.parseAttributeValueWithDepth(value, 0);
  }

  private parseAttributeValueWithDepth(value: OTLPAttribute['value'], depth: number): any {
    if (!value) {
      return undefined;
    }
    if (depth >= MAX_ATTRIBUTE_DEPTH) {
      logger.warn(
        `[OtlpReceiver] Reached max OTLP attribute depth (${MAX_ATTRIBUTE_DEPTH}); truncating nested value`,
      );
      return undefined;
    }
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
    if (value.bytesValue !== undefined) {
      return value.bytesValue;
    }
    if (value.arrayValue?.values) {
      return value.arrayValue.values.map((v) => this.parseAttributeValueWithDepth(v, depth + 1));
    }
    if (value.kvlistValue?.values) {
      const kvMap: Record<string, any> = {};
      for (const kv of value.kvlistValue.values) {
        kvMap[kv.key] = this.parseAttributeValueWithDepth(kv.value, depth + 1);
      }
      return kvMap;
    }
    return undefined;
  }

  private convertId(
    id: string,
    expectedHexLength: number,
    options?: { fieldName?: string; required?: boolean },
  ): string | undefined {
    const fieldName = options?.fieldName || 'id';
    const normalizedId = id.trim();

    // Check if it's already a hex string of the expected length
    if (normalizedId.length === expectedHexLength && /^[0-9a-f]+$/i.test(normalizedId)) {
      return this.normalizeValidatedHexId(normalizedId.toLowerCase(), fieldName, options);
    }

    if (!BASE64_PATTERN.test(normalizedId) || normalizedId.length % 4 !== 0) {
      if (options?.required) {
        throw new InvalidOtlpPayloadError(
          `Invalid ${fieldName}: expected ${expectedHexLength / 2}-byte hex or base64-encoded binary`,
        );
      }
      logger.warn(`[OtlpReceiver] Ignoring invalid optional ${fieldName}: ${id}`);
      return undefined;
    }

    const buffer = Buffer.from(normalizedId, 'base64');
    const reEncoded = buffer.toString('base64');
    if (reEncoded !== normalizedId.replace(/=+$/, '') && reEncoded !== normalizedId) {
      if (options?.required) {
        throw new InvalidOtlpPayloadError(
          `Invalid ${fieldName}: expected ${expectedHexLength / 2}-byte hex or base64-encoded binary`,
        );
      }
      logger.warn(`[OtlpReceiver] Ignoring invalid optional ${fieldName}: ${id}`);
      return undefined;
    }

    const hex = buffer.toString('hex');

    // Check if the decoded value looks like it was originally a hex string encoded as UTF-8
    const utf8String = buffer.toString('utf8');
    if (utf8String.length === expectedHexLength && /^[0-9a-f]+$/i.test(utf8String)) {
      return this.normalizeValidatedHexId(utf8String.toLowerCase(), fieldName, options);
    }

    if (hex.length === expectedHexLength) {
      return this.normalizeValidatedHexId(hex, fieldName, options);
    }

    if (options?.required) {
      throw new InvalidOtlpPayloadError(
        `Invalid ${fieldName}: expected ${expectedHexLength / 2}-byte hex or base64-encoded binary`,
      );
    }

    logger.warn(
      `[OtlpReceiver] Ignoring invalid optional ${fieldName}: ${id} -> ${hex} (expected ${expectedHexLength} hex chars)`,
    );
    return undefined;
  }

  private convertBinaryId(
    id: Uint8Array | undefined,
    expectedHexLength: number,
    options?: { fieldName?: string; required?: boolean },
  ): string | undefined {
    const fieldName = options?.fieldName || 'id';
    const expectedByteLength = expectedHexLength / 2;

    if (!id?.length) {
      if (options?.required) {
        throw new InvalidOtlpPayloadError(
          `Invalid ${fieldName}: expected ${expectedByteLength}-byte binary value`,
        );
      }
      logger.warn(`[OtlpReceiver] Ignoring invalid optional ${fieldName}: missing binary value`);
      return undefined;
    }

    if (id.length !== expectedByteLength) {
      if (options?.required) {
        throw new InvalidOtlpPayloadError(
          `Invalid ${fieldName}: expected ${expectedByteLength}-byte binary value`,
        );
      }
      logger.warn(
        `[OtlpReceiver] Ignoring invalid optional ${fieldName}: expected ${expectedByteLength} bytes, received ${id.length}`,
      );
      return undefined;
    }

    return this.normalizeValidatedHexId(bytesToHex(id, expectedHexLength), fieldName, options);
  }

  private normalizeValidatedHexId(
    hexId: string,
    fieldName: string,
    options?: { required?: boolean },
  ): string | undefined {
    if (/^0+$/.test(hexId)) {
      if (options?.required) {
        throw new InvalidOtlpPayloadError(`Invalid ${fieldName}: all-zero ID is not valid`);
      }
      logger.warn(`[OtlpReceiver] Ignoring invalid optional ${fieldName}: all-zero ID`);
      return undefined;
    }
    return hexId;
  }

  listen(port: number = 4318, host: string = '127.0.0.1'): Promise<void> {
    if (this.server?.listening) {
      logger.debug('[OtlpReceiver] Receiver already running, skipping duplicate listen request');
      return Promise.resolve();
    }

    if (this.server && !this.server.listening) {
      logger.warn('[OtlpReceiver] Clearing stale server handle before retrying receiver startup');
      this.server = undefined;
    }

    this.port = port;
    logger.debug(`[OtlpReceiver] Starting receiver on ${host}:${port}`);

    return new Promise((resolve, reject) => {
      const server = this.app.listen(port, host);
      this.server = server;
      let settled = false;

      const cleanup = () => {
        server.off('error', onError);
        server.off('listening', onListening);
      };

      const onError = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (this.server === server) {
          this.server = undefined;
        }
        logger.error(`[OtlpReceiver] Failed to start: ${error}`);
        reject(error);
      };

      const onListening = () => {
        setImmediate(() => {
          if (settled) {
            return;
          }
          if (!server.listening) {
            onError(new Error(`OTLP receiver failed to bind on ${host}:${port}`));
            return;
          }
          settled = true;
          cleanup();
          logger.info(`[OtlpReceiver] Listening on http://${host}:${port}`);
          logger.debug('[OtlpReceiver] Receiver fully initialized and ready to accept traces');
          resolve();
        });
      };

      server.once('error', onError);
      server.once('listening', onListening);
    });
  }

  async waitForIdle(options?: {
    idleMs?: number;
    timeoutMs?: number;
    pollMs?: number;
  }): Promise<boolean> {
    const idleMs = options?.idleMs ?? 250;
    const timeoutMs = options?.timeoutMs ?? 3000;
    const pollMs = options?.pollMs ?? 50;

    let observedActivityAt = this.lastActivityAt;
    let idleStart = Date.now();
    const deadline = idleStart + timeoutMs;

    while (Date.now() < deadline) {
      if (this.activeRequests > 0 || this.lastActivityAt !== observedActivityAt) {
        observedActivityAt = this.lastActivityAt;
        idleStart = Date.now();
      } else if (Date.now() - idleStart >= idleMs) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    return false;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('[OtlpReceiver] Server stopped');
          this.server = undefined;
          resolve();
        });
        // Force-close lingering keep-alive connections
        this.server.closeAllConnections?.();
      } else {
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
  const receiver = getOTLPReceiver();
  await receiver.listen(port, host);
}

export async function stopOTLPReceiver(): Promise<void> {
  if (otlpReceiver) {
    await otlpReceiver.stop();
    otlpReceiver = null;
  }
}

export async function waitForOTLPReceiverIdle(options?: {
  idleMs?: number;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<boolean> {
  if (!otlpReceiver) {
    return true;
  }
  return otlpReceiver.waitForIdle(options);
}
