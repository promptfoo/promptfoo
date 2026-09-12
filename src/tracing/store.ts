import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../database/index';
import { spansTable, tracesTable } from '../database/tables';
import logger from '../logger';
import { sanitizeTraceAttributes } from './sanitizeAttributes';
import { isRelevantSpan, matchesSpanFilter } from './spanFilter';
import { SPAN_ROLE_ATTRIBUTE } from './spanRoles';

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
  updateExisting?: boolean;
  redactSpans?: (spans: SpanData[]) => SpanData[];
}

export class TraceLimitError extends Error {
  constructor() {
    super('Trace redaction limit exceeded (10,000 spans or 10 MiB per trace)');
    this.name = 'TraceLimitError';
  }
}

function validateTracePayloadSize(
  spans: SpanData[],
  updateExisting: boolean,
  storedSizes: { spanId: string; bytes: number }[] = [],
): void {
  const sizes = new Map(storedSizes.map((span) => [span.spanId, span.bytes]));
  for (const span of spans) {
    if (updateExisting || !sizes.has(span.spanId)) {
      sizes.set(
        span.spanId,
        Buffer.byteLength(span.spanId) +
          Buffer.byteLength(span.parentSpanId ?? '') +
          Buffer.byteLength(span.name) +
          Buffer.byteLength(JSON.stringify(span.attributes) ?? '') +
          Buffer.byteLength(span.statusMessage ?? ''),
      );
    }
  }
  if (
    sizes.size > 10_000 ||
    [...sizes.values()].reduce((total, bytes) => total + bytes, 0) > 10 * 1024 * 1024
  ) {
    throw new TraceLimitError();
  }
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
        ? sanitizeTraceAttributes(rawAttributes)
        : rawAttributes
      : undefined,
    statusCode: span.statusCode ?? undefined,
    statusMessage: span.statusMessage ?? undefined,
  };
}

function isGraderOwnedSpan(
  span: typeof spansTable.$inferSelect,
  spansById: ReadonlyMap<string, typeof spansTable.$inferSelect>,
  ownershipCache: Map<string, boolean>,
): boolean {
  let ancestor: typeof spansTable.$inferSelect | undefined = span;
  const visitedSpanIds = new Set<string>();
  let belongsToGrader = false;

  while (ancestor && !visitedSpanIds.has(ancestor.spanId)) {
    const cached = ownershipCache.get(ancestor.spanId);
    if (cached !== undefined) {
      belongsToGrader = cached;
      break;
    }

    visitedSpanIds.add(ancestor.spanId);
    if (ancestor.attributes?.[SPAN_ROLE_ATTRIBUTE] === 'grader') {
      belongsToGrader = true;
      break;
    }

    ancestor = ancestor.parentSpanId ? spansById.get(ancestor.parentSpanId) : undefined;
  }

  for (const spanId of visitedSpanIds) {
    ownershipCache.set(spanId, belongsToGrader);
  }

  return belongsToGrader;
}

function sqliteTimestampFromMs(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 19).replace('T', ' ');
}

function traceCreatedBefore(cutoffTime: number) {
  const sqliteTimestampCutoff = sqliteTimestampFromMs(cutoffTime);
  return sql`(
    (
      typeof(${tracesTable.createdAt}) in ('integer', 'real')
      and ${tracesTable.createdAt} < ${cutoffTime}
    )
    or (
      typeof(${tracesTable.createdAt}) = 'text'
      and (
        (
          cast(${tracesTable.createdAt} as integer) > 1000000000000
          and cast(${tracesTable.createdAt} as integer) < ${cutoffTime}
        )
        or datetime(${tracesTable.createdAt}) < datetime(${sqliteTimestampCutoff})
      )
    )
  )`;
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

export class TraceStore {
  private db: Awaited<ReturnType<typeof getDb>> | null = null;

  private async getDatabase() {
    if (!this.db) {
      logger.debug('[TraceStore] Initializing database connection');
      this.db = await getDb();
    }
    return this.db;
  }

  async createTrace(trace: StoreTraceData): Promise<void> {
    try {
      logger.debug(
        `[TraceStore] Creating trace ${trace.traceId} for evaluation ${trace.evaluationId}`,
      );
      const db = await this.getDatabase();
      await db
        .insert(tracesTable)
        .values({
          id: crypto.randomUUID(),
          traceId: trace.traceId,
          evaluationId: trace.evaluationId,
          testCaseId: trace.testCaseId,
          createdAt: Date.now(),
          metadata: trace.metadata,
        })
        .onConflictDoNothing({ target: tracesTable.traceId })
        .run();
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
      const db = await this.getDatabase();

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

      // Only the store may create persisted redaction-history markers.
      spans = spans.map((span) => {
        if (
          !span.attributes ||
          !Object.prototype.hasOwnProperty.call(span.attributes, 'promptfoo.redaction.history')
        ) {
          return span;
        }
        const attributes = { ...span.attributes };
        delete attributes['promptfoo.redaction.history'];
        return { ...span, attributes };
      });

      const insertSpans = async (connection: Pick<typeof db, 'insert'>, incoming: SpanData[]) => {
        const spanRecords = incoming.map((span) => {
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

        if (spanRecords.length === 0) {
          return;
        }

        for (let index = 0; index < spanRecords.length; index += 500) {
          const insert = connection
            .insert(spansTable)
            .values(spanRecords.slice(index, index + 500));
          const target = [spansTable.traceId, spansTable.spanId];
          await (options?.updateExisting
            ? insert.onConflictDoUpdate({
                target,
                set: {
                  parentSpanId: sql`excluded.parent_span_id`,
                  name: sql`excluded.name`,
                  startTime: sql`excluded.start_time`,
                  endTime: sql`excluded.end_time`,
                  attributes: sql`excluded.attributes`,
                  statusCode: sql`excluded.status_code`,
                  statusMessage: sql`excluded.status_message`,
                },
              })
            : insert.onConflictDoNothing({ target })
          ).run();
        }
      };

      const redact = options?.redactSpans;
      await db.transaction(async (tx) => {
        const payloadBytes = sql<number>`
            length(cast(${spansTable.spanId} as blob))
            + coalesce(length(cast(${spansTable.parentSpanId} as blob)), 0)
            + length(cast(${spansTable.name} as blob))
            + coalesce(length(cast(${spansTable.attributes} as blob)), 0)
            + coalesce(length(cast(${spansTable.statusMessage} as blob)), 0)
          `;
        const [size] = await tx
          .select({
            count: sql<number>`count(*)`,
            bytes: sql<number>`coalesce(sum(${payloadBytes}), 0)`,
          })
          .from(spansTable)
          .where(eq(spansTable.traceId, traceId));
        // Bound each input before hydrating existing payloads, including duplicate uploads.
        if (
          size.count > 10_000 ||
          spans.length > 10_000 ||
          size.bytes > 10 * 1024 * 1024 ||
          Buffer.byteLength(JSON.stringify(spans)) > 10 * 1024 * 1024
        ) {
          throw new TraceLimitError();
        }
        const storedSizes = await tx
          .select({ spanId: spansTable.spanId, bytes: payloadBytes })
          .from(spansTable)
          .where(eq(spansTable.traceId, traceId));
        validateTracePayloadSize(spans, options?.updateExisting ?? false, storedSizes);
        if (!redact) {
          await insertSpans(tx, spans);
          return;
        }
        const stored = await tx.select().from(spansTable).where(eq(spansTable.traceId, traceId));
        const existing = stored.map((span) => serializeSpan(span, false));
        const original = [...existing, ...spans];
        const sanitized = redact(original);
        const redactedSpanIds = new Set(
          sanitized
            .filter(
              (span, index) =>
                JSON.stringify(span) !== JSON.stringify(original[index]) &&
                /\[(?:REDACTED|TRUNCATED)\]/.test(JSON.stringify(span)),
            )
            .map((span) => span.spanId),
        );
        for (const span of sanitized) {
          if (redactedSpanIds.has(span.spanId)) {
            span.attributes = { ...span.attributes, 'promptfoo.redaction.history': '[REDACTED]' };
          }
        }
        // Redaction history markers can also increase the stored payload.
        validateTracePayloadSize(sanitized, options?.updateExisting ?? false);
        for (const [index, previous] of existing.entries()) {
          const span = sanitized[index];
          if (JSON.stringify(previous) === JSON.stringify(span)) {
            continue;
          }
          await tx
            .update(spansTable)
            .set({
              name: span.name,
              attributes: span.attributes,
              statusMessage: span.statusMessage,
            })
            .where(eq(spansTable.id, stored[index].id))
            .run();
        }
        await insertSpans(tx, sanitized.slice(existing.length));
      });
      logger.debug(`[TraceStore] Successfully added ${spans.length} spans to trace ${traceId}`);
      return { stored: true };
    } catch (error) {
      if (error instanceof TraceLimitError) {
        await this.markTraceIncomplete(traceId);
      }
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
      const db = await this.getDatabase();

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
      const db = await this.getDatabase();

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

  async markTraceIncomplete(traceId: string): Promise<void> {
    const db = await this.getDatabase();
    await db
      .update(tracesTable)
      .set({
        metadata: sql`json_set(coalesce(${tracesTable.metadata}, '{}'), '$.promptfooTraceIncomplete', 'limit exceeded')`,
      })
      .where(eq(tracesTable.traceId, traceId))
      .run();
  }

  async getTraceMetadata(traceId: string): Promise<Record<string, any> | undefined> {
    try {
      logger.debug(`[TraceStore] Fetching metadata for trace ${traceId}`);
      const db = await this.getDatabase();
      const traces = await db
        .select({ metadata: tracesTable.metadata })
        .from(tracesTable)
        .where(eq(tracesTable.traceId, traceId))
        .limit(1);

      return traces.length > 0 ? (traces[0].metadata ?? {}) : undefined;
    } catch (error) {
      logger.error(`[TraceStore] Failed to get trace metadata: ${error}`);
      throw error;
    }
  }

  async deleteOldTraces(retentionDays: number): Promise<void> {
    try {
      logger.debug(`[TraceStore] Deleting traces older than ${retentionDays} days`);
      const db = await this.getDatabase();
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const cutoffCondition = traceCreatedBefore(cutoffTime);

      // `spans.trace_id` is FK-enforced without ON DELETE CASCADE.
      await db.transaction(async (tx) => {
        await tx
          .delete(spansTable)
          .where(
            sql`${spansTable.traceId} in (
              select ${tracesTable.traceId}
              from ${tracesTable}
              where ${cutoffCondition}
            )`,
          )
          .run();

        await tx.delete(tracesTable).where(cutoffCondition).run();
      });

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
      const db = await this.getDatabase();

      const rows = await db
        .select()
        .from(spansTable)
        .where(eq(spansTable.traceId, traceId))
        .orderBy(asc(spansTable.startTime), asc(spansTable.spanId));

      const rowsBySpanId = new Map(rows.map((row) => [row.spanId, row]));
      const graderOwnedSpanIds = new Map<string, boolean>();
      const spanMap = new Map<string, SpanData>();
      const depthCache = new Map<string, number>();

      for (const row of rows) {
        if (earliestStartTime && row.startTime < earliestStartTime) {
          continue;
        }

        const rawAttributes = row.attributes ?? {};

        if (!includeInternalSpans && isGraderOwnedSpan(row, rowsBySpanId, graderOwnedSpanIds)) {
          continue;
        }

        const spanData: SpanData = {
          spanId: row.spanId,
          parentSpanId: row.parentSpanId ?? undefined,
          name: row.name,
          startTime: row.startTime,
          endTime: row.endTime ?? undefined,
          attributes: shouldSanitize ? sanitizeTraceAttributes(rawAttributes) : rawAttributes,
          statusCode: row.statusCode ?? undefined,
          statusMessage: row.statusMessage ?? undefined,
        };

        const hasExplicitFilter = Boolean(spanFilter?.length);

        if (hasExplicitFilter && !matchesSpanFilter(spanData.name, spanFilter!)) {
          continue;
        }

        if (
          !includeInternalSpans &&
          !hasExplicitFilter &&
          !isRelevantSpan({ attributes: rawAttributes, statusCode: spanData.statusCode })
        ) {
          continue;
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
  return getTraceStore().getSpans(traceId, options);
}
