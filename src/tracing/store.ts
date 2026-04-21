import { asc, eq, lt } from 'drizzle-orm';
import { getDb } from '../database/index';
import { spansTable, tracesTable } from '../database/tables';
import logger from '../logger';

import type { TraceData } from '../types/tracing';

interface StoreTraceData extends Omit<TraceData, 'spans'> {
  evaluationId: string;
  testCaseId: string;
  metadata?: Record<string, any>;
}

export interface SpanData {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes?: Record<string, any>;
  statusCode?: number;
  statusMessage?: string;
}

export interface ParsedTrace {
  traceId: string;
  span: SpanData;
}

export interface TraceAttributeSanitizationOptions {
  sanitizeAttributes?: boolean;
}

export interface TraceSpanQueryOptions extends TraceAttributeSanitizationOptions {
  earliestStartTime?: number;
  maxSpans?: number;
  maxDepth?: number;
  includeInternalSpans?: boolean;
  spanFilter?: string[];
}

export interface AddSpansOptions {
  skipTraceCheck?: boolean;
  warnIfMissingTrace?: boolean;
}

const SENSITIVE_ATTRIBUTE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'api_key',
  'apikey',
  'secret',
  'password',
  'passphrase',
];

const NORMALIZED_SENSITIVE_ATTRIBUTE_KEYS = SENSITIVE_ATTRIBUTE_KEYS.map((key) =>
  key.replace(/[^a-z0-9]/g, ''),
);

const SAFE_TOKEN_ATTRIBUTE_KEYS = new Set([
  'gen_ai.request.max_tokens',
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.output_tokens',
  'gen_ai.usage.total_tokens',
  'gen_ai.usage.cached_tokens',
  'gen_ai.usage.reasoning_tokens',
  'gen_ai.usage.accepted_prediction_tokens',
  'gen_ai.usage.rejected_prediction_tokens',
  'gen_ai.usage.cache_read_input_tokens',
  'gen_ai.usage.cache_creation_input_tokens',
]);

function isSensitiveAttributeKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  if (SAFE_TOKEN_ATTRIBUTE_KEYS.has(lowerKey)) {
    return false;
  }

  const normalizedKey = lowerKey.replace(/[^a-z0-9]/g, '');

  return SENSITIVE_ATTRIBUTE_KEYS.some((sensitiveKey, index) => {
    return (
      lowerKey.includes(sensitiveKey) ||
      normalizedKey.includes(NORMALIZED_SENSITIVE_ATTRIBUTE_KEYS[index])
    );
  });
}

function sanitizeAttributes(
  attributes: Record<string, any> | null | undefined,
): Record<string, any> {
  if (!attributes) {
    return {};
  }

  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      return value.length > 400 ? `${value.slice(0, 400)}…` : value;
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object') {
      return sanitizeAttributes(value as Record<string, any>);
    }
    return value;
  };

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (isSensitiveAttributeKey(key)) {
      sanitized[key] = '<redacted>';
      continue;
    }
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}

function serializeSpan(
  span: typeof spansTable.$inferSelect,
  shouldSanitizeAttributes = true,
): SpanData {
  const rawAttributes = span.attributes ?? undefined;

  return {
    spanId: span.spanId,
    parentSpanId: span.parentSpanId ?? undefined,
    name: span.name,
    startTime: span.startTime,
    endTime: span.endTime ?? undefined,
    attributes: rawAttributes
      ? shouldSanitizeAttributes
        ? sanitizeAttributes(rawAttributes)
        : rawAttributes
      : undefined,
    statusCode: span.statusCode ?? undefined,
    statusMessage: span.statusMessage ?? undefined,
  };
}

function computeDepth(
  span: SpanData,
  spanMap: Map<string, SpanData>,
  depthCache: Map<string, number>,
): number {
  if (depthCache.has(span.spanId)) {
    return depthCache.get(span.spanId)!;
  }

  if (!span.parentSpanId || !spanMap.has(span.parentSpanId)) {
    depthCache.set(span.spanId, 0);
    return 0;
  }

  const parentDepth = computeDepth(spanMap.get(span.parentSpanId)!, spanMap, depthCache);
  const currentDepth = parentDepth + 1;
  depthCache.set(span.spanId, currentDepth);
  return currentDepth;
}

function deriveSpanKind(span: SpanData): string {
  const attributes = span.attributes || {};
  const attributeKind = (attributes['span.kind'] ||
    attributes['otel.span.kind'] ||
    attributes['spanKind']) as string | undefined;

  if (typeof attributeKind === 'string') {
    return attributeKind.toLowerCase();
  }

  return 'internal';
}

export class TraceStore {
  private db: ReturnType<typeof getDb> | null = null;

  private getDatabase() {
    if (!this.db) {
      logger.debug('[TraceStore] Initializing database connection');
      this.db = getDb();
    }
    return this.db;
  }

  async createTrace(trace: StoreTraceData): Promise<void> {
    try {
      logger.debug(
        `[TraceStore] Creating trace ${trace.traceId} for evaluation ${trace.evaluationId}`,
      );
      const db = this.getDatabase();
      await db
        .insert(tracesTable)
        .values({
          id: crypto.randomUUID(),
          traceId: trace.traceId,
          evaluationId: trace.evaluationId,
          testCaseId: trace.testCaseId,
          metadata: trace.metadata,
        })
        .onConflictDoNothing({ target: tracesTable.traceId });
      logger.debug(`[TraceStore] Successfully created or found existing trace ${trace.traceId}`);
    } catch (error) {
      logger.error(`[TraceStore] Failed to create trace: ${error}`);
      throw error;
    }
  }

  async addSpans(
    traceId: string,
    spans: SpanData[],
    options?: AddSpansOptions,
  ): Promise<{ stored: boolean; reason?: string }> {
    try {
      logger.debug(`[TraceStore] Adding ${spans.length} spans to trace ${traceId}`);
      const db = this.getDatabase();

      // Only verify trace exists if not skipping the check (for OTLP scenarios)
      if (options?.skipTraceCheck) {
        logger.debug(`[TraceStore] Skipping trace existence check for OTLP scenario`);
      } else {
        logger.debug(`[TraceStore] Verifying trace ${traceId} exists`);
        const trace = await db
          .select()
          .from(tracesTable)
          .where(eq(tracesTable.traceId, traceId))
          .limit(1);

        if (trace.length === 0) {
          const message =
            `[TraceStore] Trace ${traceId} not found, skipping ${spans.length} spans. ` +
            `This may indicate spans arrived before trace was created.`;
          if (options?.warnIfMissingTrace === false) {
            logger.debug(message);
          } else {
            logger.warn(message);
          }
          return { stored: false, reason: `Trace ${traceId} not found` };
        }
        logger.debug(`[TraceStore] Trace ${traceId} found, proceeding with span insertion`);
      }

      // Insert spans
      const spanRecords = spans.map((span) => {
        logger.debug(`[TraceStore] Preparing span ${span.spanId} (${span.name}) for insertion`);
        return {
          id: crypto.randomUUID(),
          traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          name: span.name,
          startTime: span.startTime,
          endTime: span.endTime,
          attributes: span.attributes,
          statusCode: span.statusCode,
          statusMessage: span.statusMessage,
        };
      });

      await db.insert(spansTable).values(spanRecords);
      logger.debug(`[TraceStore] Successfully added ${spans.length} spans to trace ${traceId}`);
      return { stored: true };
    } catch (error) {
      logger.error(`[TraceStore] Failed to add spans: ${error}`);
      throw error;
    }
  }

  async getTracesByEvaluation(
    evaluationId: string,
    options: TraceAttributeSanitizationOptions = {},
  ): Promise<TraceData[]> {
    const { sanitizeAttributes: shouldSanitize = true } = options;

    try {
      logger.debug(`[TraceStore] Fetching traces for evaluation ${evaluationId}`);
      const db = this.getDatabase();

      // Get all traces for the evaluation
      const traces = await db
        .select()
        .from(tracesTable)
        .where(eq(tracesTable.evaluationId, evaluationId));
      logger.debug(`[TraceStore] Found ${traces.length} traces for evaluation ${evaluationId}`);

      // Get spans for each trace
      const tracesWithSpans = await Promise.all(
        traces.map(async (trace) => {
          logger.debug(`[TraceStore] Fetching spans for trace ${trace.traceId}`);
          const spans = await db
            .select()
            .from(spansTable)
            .where(eq(spansTable.traceId, trace.traceId));
          logger.debug(`[TraceStore] Found ${spans.length} spans for trace ${trace.traceId}`);

          return {
            traceId: trace.traceId,
            evaluationId: trace.evaluationId,
            testCaseId: trace.testCaseId,
            metadata: trace.metadata ?? undefined,
            spans: spans.map((span) => serializeSpan(span, shouldSanitize)),
          };
        }),
      );

      logger.debug(`[TraceStore] Returning ${tracesWithSpans.length} traces with spans`);
      return tracesWithSpans;
    } catch (error) {
      logger.error(`[TraceStore] Failed to get traces for evaluation: ${error}`);
      throw error;
    }
  }

  async getTrace(
    traceId: string,
    options: TraceAttributeSanitizationOptions = {},
  ): Promise<TraceData | null> {
    const { sanitizeAttributes: shouldSanitize = true } = options;

    try {
      logger.debug(`[TraceStore] Fetching trace ${traceId}`);
      const db = this.getDatabase();

      const traces = await db
        .select()
        .from(tracesTable)
        .where(eq(tracesTable.traceId, traceId))
        .limit(1);

      if (traces.length === 0) {
        logger.debug(`[TraceStore] Trace ${traceId} not found`);
        return null;
      }

      const trace = traces[0];
      logger.debug(`[TraceStore] Found trace ${traceId}, fetching spans`);
      const spans = await db.select().from(spansTable).where(eq(spansTable.traceId, traceId));
      logger.debug(`[TraceStore] Found ${spans.length} spans for trace ${traceId}`);

      return {
        traceId: trace.traceId,
        evaluationId: trace.evaluationId,
        testCaseId: trace.testCaseId,
        metadata: trace.metadata ?? undefined,
        spans: spans.map((span) => serializeSpan(span, shouldSanitize)),
      };
    } catch (error) {
      logger.error(`[TraceStore] Failed to get trace: ${error}`);
      throw error;
    }
  }

  async deleteOldTraces(retentionDays: number): Promise<void> {
    try {
      logger.debug(`[TraceStore] Deleting traces older than ${retentionDays} days`);
      const db = this.getDatabase();
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      // Delete old traces (spans will be cascade deleted due to foreign key)
      await db.delete(tracesTable).where(lt(tracesTable.createdAt, cutoffTime));

      logger.debug(`[TraceStore] Successfully deleted traces older than ${retentionDays} days`);
    } catch (error) {
      logger.error(`[TraceStore] Failed to delete old traces: ${error}`);
      throw error;
    }
  }

  async getSpans(traceId: string, options: TraceSpanQueryOptions = {}): Promise<SpanData[]> {
    const {
      earliestStartTime,
      maxSpans,
      maxDepth,
      includeInternalSpans = true,
      spanFilter,
      sanitizeAttributes: shouldSanitize = true,
    } = options;

    try {
      logger.debug(`[TraceStore] Fetching spans for trace ${traceId}`);
      const db = this.getDatabase();

      const rows = await db
        .select()
        .from(spansTable)
        .where(eq(spansTable.traceId, traceId))
        .orderBy(asc(spansTable.startTime));

      const spanMap = new Map<string, SpanData>();
      const depthCache = new Map<string, number>();

      for (const row of rows) {
        if (earliestStartTime && row.startTime < earliestStartTime) {
          continue;
        }

        const rawAttributes = row.attributes ?? {};

        const spanData: SpanData = {
          spanId: row.spanId,
          parentSpanId: row.parentSpanId ?? undefined,
          name: row.name,
          startTime: row.startTime,
          endTime: row.endTime ?? undefined,
          attributes: shouldSanitize ? sanitizeAttributes(rawAttributes) : rawAttributes,
          statusCode: row.statusCode ?? undefined,
          statusMessage: row.statusMessage ?? undefined,
        };

        const spanKind = deriveSpanKind({
          ...spanData,
          attributes: rawAttributes,
        });

        if (!includeInternalSpans && spanKind === 'internal') {
          continue;
        }

        if (spanFilter && spanFilter.length > 0) {
          const matchesFilter = spanFilter.some((filterName) =>
            spanData.name.toLowerCase().includes(filterName.toLowerCase()),
          );
          if (!matchesFilter) {
            continue;
          }
        }

        spanMap.set(spanData.spanId, spanData);
      }

      let spans = Array.from(spanMap.values());

      if (maxDepth !== undefined) {
        spans = spans.filter((span) => computeDepth(span, spanMap, depthCache) < maxDepth);
      }

      if (maxSpans !== undefined) {
        spans = spans.slice(0, maxSpans);
      }

      logger.debug(`[TraceStore] Returning ${spans.length} spans for trace ${traceId}`);
      return spans;
    } catch (error) {
      logger.error(`[TraceStore] Failed to fetch spans for trace ${traceId}: ${error}`);
      throw error;
    }
  }
}

// Singleton instance
let traceStore: TraceStore | null = null;

export function getTraceStore(): TraceStore {
  if (!traceStore) {
    logger.debug('[TraceStore] Creating new TraceStore instance');
    traceStore = new TraceStore();
  }
  return traceStore;
}

export async function getTraceSpans(
  traceId: string,
  options: TraceSpanQueryOptions = {},
): Promise<SpanData[]> {
  const {
    earliestStartTime,
    maxSpans,
    maxDepth,
    includeInternalSpans = true, // Match TraceStore.getSpans default
    spanFilter,
    sanitizeAttributes: shouldSanitize = true,
  } = options;

  const traceStoreInstance = getTraceStore();
  const db = (traceStoreInstance as any).getDatabase?.() ?? traceStoreInstance['getDatabase']?.();
  if (!db) {
    throw new Error('TraceStore database has not been initialized');
  }

  const rows = await db
    .select()
    .from(spansTable)
    .where(eq(spansTable.traceId, traceId))
    .orderBy(asc(spansTable.startTime));

  const spanMap = new Map<string, SpanData>();
  const depthCache = new Map<string, number>();

  for (const row of rows) {
    if (earliestStartTime && row.startTime < earliestStartTime) {
      continue;
    }

    const spanData: SpanData = {
      spanId: row.spanId,
      parentSpanId: row.parentSpanId ?? undefined,
      name: row.name,
      startTime: row.startTime,
      endTime: row.endTime ?? undefined,
      attributes: shouldSanitize ? sanitizeAttributes(row.attributes) : (row.attributes ?? {}),
      statusCode: row.statusCode ?? undefined,
      statusMessage: row.statusMessage ?? undefined,
    };

    const spanKind = deriveSpanKind(spanData);
    if (!includeInternalSpans && spanKind === 'internal') {
      continue;
    }

    if (spanFilter && spanFilter.length > 0) {
      const matchesFilter = spanFilter.some((filterName) =>
        spanData.name.toLowerCase().includes(filterName.toLowerCase()),
      );
      if (!matchesFilter) {
        continue;
      }
    }

    spanMap.set(spanData.spanId, spanData);
  }

  let spans = Array.from(spanMap.values());

  if (maxDepth !== undefined) {
    spans = spans.filter((span) => computeDepth(span, spanMap, depthCache) < maxDepth);
  }

  if (maxSpans !== undefined) {
    spans = spans.slice(0, maxSpans);
  }

  return spans;
}
