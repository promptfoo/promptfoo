import { randomUUID } from 'crypto';
import { eq, lt } from 'drizzle-orm';
import { getDb } from '../database';
import { tracesTable, spansTable } from '../database/tables';
import logger from '../logger';
import type { TraceData } from '../types/tracing';

export interface StoreTraceData extends Omit<TraceData, 'spans'> {
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
      await db.insert(tracesTable).values({
        id: randomUUID(),
        traceId: trace.traceId,
        evaluationId: trace.evaluationId,
        testCaseId: trace.testCaseId,
        metadata: trace.metadata,
      });
      logger.debug(`[TraceStore] Successfully created trace ${trace.traceId}`);
    } catch (error) {
      logger.error(`[TraceStore] Failed to create trace: ${error}`);
      throw error;
    }
  }

  async addSpans(
    traceId: string,
    spans: SpanData[],
    options?: { skipTraceCheck?: boolean },
  ): Promise<void> {
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
          logger.warn(`[TraceStore] Trace ${traceId} not found, skipping spans`);
          return;
        }
        logger.debug(`[TraceStore] Trace ${traceId} found, proceeding with span insertion`);
      }

      // Insert spans
      const spanRecords = spans.map((span) => {
        logger.debug(`[TraceStore] Preparing span ${span.spanId} (${span.name}) for insertion`);
        return {
          id: randomUUID(),
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
    } catch (error) {
      logger.error(`[TraceStore] Failed to add spans: ${error}`);
      throw error;
    }
  }

  async getTracesByEvaluation(evaluationId: string): Promise<any[]> {
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
            ...trace,
            spans,
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

  async getTrace(traceId: string): Promise<any | null> {
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
