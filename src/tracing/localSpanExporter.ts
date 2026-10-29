import { ExportResultCode, getNumberFromEnv } from '@opentelemetry/core';
import logger from '../logger';
import { runWithAbort, sleepWithAbort } from '../util/time';
import { getTraceStore, type SpanData, type TraceStore } from './store';
import type { ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';

const MISSING_TRACE_RETRY_DELAY_MS = 50;

interface TrackedTrace {
  owners: number;
  pending: Set<Promise<void>>;
  error?: Error;
}

/**
 * A span exporter that writes spans to the local TraceStore (SQLite).
 * This allows OTEL spans to be stored locally for analysis in the promptfoo UI.
 */
export class LocalSpanExporter implements SpanExporter {
  // Use the same environment fallback and default as the SDK's BatchSpanProcessor.
  private readonly exportTimeoutMs = getNumberFromEnv('OTEL_BSP_EXPORT_TIMEOUT') ?? 30_000;
  private readonly pendingExports = new Set<Promise<Error | undefined>>();
  private readonly trackedTraces = new Map<string, TrackedTrace>();

  /** Remember failed writes from the start of an eval row through its trace assertions. */
  trackTrace(traceId: string): () => void {
    const state = this.trackedTraces.get(traceId) ?? {
      owners: 0,
      pending: new Set<Promise<void>>(),
    };
    this.trackedTraces.set(traceId, state);
    state.owners++;
    let released = false;
    return () => {
      if (!released && --state.owners === 0) {
        this.trackedTraces.delete(traceId);
      }
      released = true;
    };
  }

  private trackBatchWrites(
    spans: ReadableSpan[],
    finishGroup: Map<string, (error?: Error) => void>,
  ): void {
    if (!this.trackedTraces.size) {
      return;
    }
    // Register every group before the first write, including groups a timed-out batch never reaches.
    for (const span of spans) {
      const traceId = span.spanContext().traceId;
      const state = this.trackedTraces.get(traceId);
      if (!state || finishGroup.has(traceId)) {
        continue;
      }
      const pending = new Promise<void>((resolve) => {
        finishGroup.set(traceId, (error) => {
          state.error ??= error;
          state.pending.delete(pending);
          finishGroup.delete(traceId);
          resolve();
        });
      });
      state.pending.add(pending);
    }
  }

  /**
   * Export spans to the local TraceStore.
   * Spans are grouped by trace ID and inserted into the database.
   */
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const deadline = Date.now() + this.exportTimeoutMs;
    const controller = new AbortController();
    const timeout = new DOMException('Local span export timed out', 'TimeoutError');
    const timer = setTimeout(() => controller.abort(timeout), this.exportTimeoutMs);
    const options = {
      skipTraceCheck: false,
      warnIfMissingTrace: false,
      abortSignal: controller.signal,
      deadline,
    };
    const finishGroup = new Map<string, (error?: Error) => void>();

    /**
     * Async implementation of span export.
     * Returns the first non-FK error encountered, or undefined if successful.
     */
    const exportAsync = async (): Promise<Error | undefined> => {
      if (spans.length === 0) {
        return undefined;
      }

      this.trackBatchWrites(spans, finishGroup);

      const traceStore = getTraceStore();
      logger.debug(`[LocalSpanExporter] Exporting ${spans.length} spans`);

      // Group spans by trace ID
      const spansByTrace = new Map<string, SpanData[]>();

      for (const span of spans) {
        /**
         * Convert an OTEL ReadableSpan to our SpanData format.
         */
        const spanContext = span.spanContext();
        const { traceId } = spanContext;

        // Convert OTEL hrtime (seconds, nanoseconds) to milliseconds for consistency
        // with OTLPReceiver which also stores times in milliseconds
        const startTimeMs = span.startTime[0] * 1e3 + span.startTime[1] / 1e6;
        const endTimeMs = span.endTime[0] * 1e3 + span.endTime[1] / 1e6;

        const spanData: SpanData = {
          spanId: spanContext.spanId,
          parentSpanId: span.parentSpanContext?.spanId || undefined,
          name: span.name,
          startTime: startTimeMs,
          endTime: endTimeMs,
          /**
           * Convert OTEL attributes to a plain object.
           * OTEL attributes can have various value types that need normalization.
           */
          // OTEL attribute values can be string, number, boolean, or arrays of those
          attributes: Object.assign(
            {},
            Object.fromEntries(Object.entries({ ...span.resource.attributes, ...span.attributes })),
          ),
          statusCode: span.status.code,
          statusMessage: span.status.message,
        };

        if (!spansByTrace.has(traceId)) {
          spansByTrace.set(traceId, []);
        }
        spansByTrace.get(traceId)!.push(spanData);
      }

      // Store each trace's spans, tracking first error
      let firstError: Error | undefined;

      for (const [traceId, spanDataList] of spansByTrace) {
        if (controller.signal.aborted || Date.now() >= deadline) {
          return timeout;
        }
        let groupError: Error | undefined;
        try {
          const addSpansWithTraceRetry = async (): ReturnType<TraceStore['addSpans']> => {
            const result = await traceStore.addSpans(traceId, spanDataList, options);
            if (result.stored) {
              return result;
            }

            await sleepWithAbort(MISSING_TRACE_RETRY_DELAY_MS, controller.signal);
            return traceStore.addSpans(traceId, spanDataList, options);
          };

          const result = await addSpansWithTraceRetry();
          if (result.stored) {
            logger.debug(
              `[LocalSpanExporter] Added ${spanDataList.length} spans to trace ${traceId}`,
            );
          } else {
            groupError = new Error(result.reason ?? 'Cannot store spans for a missing trace');
            // Trace doesn't exist - these spans are from grading calls or other internal
            // operations that weren't initiated through the evaluation tracing flow.
            logger.debug(
              `[LocalSpanExporter] Skipping ${spanDataList.length} spans for orphan trace ${traceId}: ${result.reason}`,
            );
          }
        } catch (error) {
          groupError = error instanceof Error ? error : new Error(String(error));
          // Handle unexpected errors (e.g., database connection issues)
          if (groupError.message.includes('FOREIGN KEY')) {
            // Foreign key constraint - trace was deleted between check and insert
            logger.debug(
              `[LocalSpanExporter] Skipping ${spanDataList.length} spans for orphan trace ${traceId}`,
            );
          } else {
            // Track error but continue processing other traces
            logger.error(`[LocalSpanExporter] Failed to add spans to trace ${traceId}`, { error });
            firstError ??= groupError;
          }
        }
        if (controller.signal.aborted || Date.now() >= deadline) {
          return timeout;
        }
        finishGroup.get(traceId)?.(groupError);
      }

      return firstError;
    };

    const pending = runWithAbort(exportAsync, controller.signal).catch((error: unknown) => {
      logger.error('[LocalSpanExporter] Failed to export spans', { error });
      return error instanceof Error ? error : new Error(String(error));
    });
    this.pendingExports.add(pending);
    void pending.then((error) => {
      clearTimeout(timer);
      for (const finish of finishGroup.values()) {
        finish(error);
      }
      this.pendingExports.delete(pending);
      resultCallback(
        error ? { code: ExportResultCode.FAILED, error } : { code: ExportResultCode.SUCCESS },
      );
    });
  }

  /**
   * Wait for local writes that the span processor already dispatched.
   */
  shutdown(): Promise<void> {
    logger.debug('[LocalSpanExporter] Shutting down');
    return this.forceFlush();
  }

  /**
   * Wait for the batches submitted before this flush.
   */
  async forceFlush(traceId?: string): Promise<void> {
    if (traceId !== undefined) {
      const state = this.trackedTraces.get(traceId);
      if (state) {
        await Promise.all(state.pending);
        if (state.error) {
          throw state.error;
        }
      }
      return;
    }
    const error = (await Promise.all(this.pendingExports)).find(Boolean);
    if (error) {
      throw error;
    }
  }
}
