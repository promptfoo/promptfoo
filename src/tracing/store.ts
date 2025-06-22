import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from '../database';
import { tracesTable, spansTable } from '../database/tables';
import logger from '../logger';

export interface TraceData {
  traceId: string;
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
      this.db = getDb();
    }
    return this.db;
  }

  async createTrace(trace: TraceData): Promise<void> {
    try {
      const db = this.getDatabase();
      await db.insert(tracesTable).values({
        id: randomUUID(),
        traceId: trace.traceId,
        evaluationId: trace.evaluationId,
        testCaseId: trace.testCaseId,
        metadata: trace.metadata,
      });
      logger.debug(`Created trace ${trace.traceId} for evaluation ${trace.evaluationId}`);
    } catch (error) {
      logger.error(`Failed to create trace: ${error}`);
      throw error;
    }
  }

  async addSpans(traceId: string, spans: SpanData[]): Promise<void> {
    try {
      const db = this.getDatabase();
      
      // Verify trace exists
      const trace = await db.select().from(tracesTable).where(eq(tracesTable.traceId, traceId)).limit(1);
      
      if (trace.length === 0) {
        logger.warn(`Trace ${traceId} not found, skipping spans`);
        return;
      }

      // Insert spans
      const spanRecords = spans.map((span) => ({
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
      }));

      await db.insert(spansTable).values(spanRecords);
      logger.debug(`Added ${spans.length} spans to trace ${traceId}`);
    } catch (error) {
      logger.error(`Failed to add spans: ${error}`);
      throw error;
    }
  }

  async getTracesByEvaluation(evaluationId: string): Promise<any[]> {
    try {
      const db = this.getDatabase();
      
      // Get all traces for the evaluation
      const traces = await db
        .select()
        .from(tracesTable)
        .where(eq(tracesTable.evaluationId, evaluationId));

      // Get spans for each trace
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
        })
      );

      return tracesWithSpans;
    } catch (error) {
      logger.error(`Failed to get traces for evaluation: ${error}`);
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
      const spans = await db
        .select()
        .from(spansTable)
        .where(eq(spansTable.traceId, traceId));

      return {
        ...trace,
        spans,
      };
    } catch (error) {
      logger.error(`Failed to get trace: ${error}`);
      throw error;
    }
  }

  async deleteOldTraces(retentionDays: number): Promise<void> {
    try {
      const db = this.getDatabase();
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      
      // Delete old traces (spans will be cascade deleted due to foreign key)
      await db
        .delete(tracesTable)
        .where(eq(tracesTable.createdAt, cutoffTime));
      
      logger.debug(`Deleted traces older than ${retentionDays} days`);
    } catch (error) {
      logger.error(`Failed to delete old traces: ${error}`);
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