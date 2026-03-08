import { asc, eq, sql } from 'drizzle-orm';
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

export interface TraceSpanQueryOptions {
  earliestStartTime?: number;
  maxSpans?: number;
  maxDepth?: number;
  includeInternalSpans?: boolean;
  spanFilter?: string[];
  sanitizeAttributes?: boolean;
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
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_ATTRIBUTE_KEYS.some((sensitiveKey) => lowerKey.includes(sensitiveKey))) {
      sanitized[key] = '<redacted>';
      continue;
    }
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}

function computeDepth(
  span: SpanData,
  spanMap: Map<string, SpanData>,
  depthCache: Map<string, number>,
  visited: Set<string> = new Set(),
): number {
  if (depthCache.has(span.spanId)) {
    return depthCache.get(span.spanId)!;
  }

  if (visited.has(span.spanId)) {
    logger.warn(
      `[TraceStore] Detected circular parent reference while computing depth for span ${span.spanId}`,
    );
    depthCache.set(span.spanId, 0);
    return 0;
  }

  if (!span.parentSpanId || !spanMap.has(span.parentSpanId)) {
    depthCache.set(span.spanId, 0);
    return 0;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(span.spanId);
  const parentDepth = computeDepth(
    spanMap.get(span.parentSpanId)!,
    spanMap,
    depthCache,
    nextVisited,
  );
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
      this.db = getDb();
    }
    return this.db;
  }

  async createTrace(trace: StoreTraceData): Promise<void> {
    try {
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
    } catch (error) {
      logger.error(`[TraceStore] Failed to create trace: ${error}`);
      throw error;
    }
  }

  async addSpans(
    traceId: string,
    spans: SpanData[],
    options?: { skipTraceCheck?: boolean },
  ): Promise<{ stored: boolean; reason?: string }> {
    try {
      const db = this.getDatabase();

      // Only verify trace exists if not skipping the check (for OTLP scenarios)
      if (!options?.skipTraceCheck) {
        const trace = await db
          .select()
          .from(tracesTable)
          .where(eq(tracesTable.traceId, traceId))
          .limit(1);

        if (trace.length === 0) {
          logger.warn(
            `[TraceStore] Trace ${traceId} not found, skipping ${spans.length} spans. ` +
              `This may indicate spans arrived before trace was created.`,
          );
          return { stored: false, reason: `Trace ${traceId} not found` };
        }
      }

      // Insert spans
      const spanRecords = spans.map((span) => ({
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
      }));

      await db
        .insert(spansTable)
        .values(spanRecords)
        .onConflictDoNothing({ target: [spansTable.traceId, spansTable.spanId] });
      return { stored: true };
    } catch (error) {
      logger.error(`[TraceStore] Failed to add spans: ${error}`);
      throw error;
    }
  }

  async getTracesByEvaluation(evaluationId: string): Promise<any[]> {
    try {
      const db = this.getDatabase();

      const traces = await db
        .select()
        .from(tracesTable)
        .where(eq(tracesTable.evaluationId, evaluationId));

      const tracesWithSpans = await Promise.all(
        traces.map(async (trace) => {
          const spans = await db
            .select()
            .from(spansTable)
            .where(eq(spansTable.traceId, trace.traceId));

          return {
            ...trace,
            spans,
          };
        }),
      );

      return tracesWithSpans;
    } catch (error) {
      logger.error(`[TraceStore] Failed to get traces for evaluation: ${error}`);
      throw error;
    }
  }

  async getTrace(traceId: string): Promise<any | null> {
    try {
      const db = this.getDatabase();

      const traces = await db
        .select()
        .from(tracesTable)
        .where(eq(tracesTable.traceId, traceId))
        .limit(1);

      if (traces.length === 0) {
        return null;
      }

      const trace = traces[0];
      const spans = await db.select().from(spansTable).where(eq(spansTable.traceId, traceId));

      return {
        ...trace,
        spans,
      };
    } catch (error) {
      logger.error(`[TraceStore] Failed to get trace: ${error}`);
      throw error;
    }
  }

  async deleteOldTraces(retentionDays: number): Promise<void> {
    try {
      const db = this.getDatabase();
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const cutoffTimestamp = new Date(cutoffTime).toISOString().replace('T', ' ').slice(0, 19);

      // Delete old traces (spans will be cascade deleted due to foreign key)
      await db.delete(tracesTable).where(sql`
        (
          typeof(${tracesTable.createdAt}) = 'integer'
          AND ${tracesTable.createdAt} < ${cutoffTime}
        )
        OR
        (
          typeof(${tracesTable.createdAt}) = 'text'
          AND ${tracesTable.createdAt} < ${cutoffTimestamp}
        )
      `);
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
    traceStore = new TraceStore();
  }
  return traceStore;
}

export async function getTraceSpans(
  traceId: string,
  options: TraceSpanQueryOptions = {},
): Promise<SpanData[]> {
  return getTraceStore().getSpans(traceId, options);
}
