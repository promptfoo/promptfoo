import { ExportResultCode } from '@opentelemetry/core';
import logger from '../logger';
import { getTraceStore, type SpanData, type TraceStore } from './store';
import type { ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';

const MISSING_TRACE_RETRY_DELAY_MS = 50;

// Represent byte values the same way as OTLP JSON, including inside arrays and maps.
function toStoredAttribute(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }
  if (Array.isArray(value)) {
    return value.map(toStoredAttribute);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toStoredAttribute(entry)]),
    );
  }
  return value;
}

/**
 * A span exporter that writes spans to the local TraceStore (SQLite).
 * This allows OTEL spans to be stored locally for analysis in the promptfoo UI.
 */
export class LocalSpanExporter implements SpanExporter {
  /**
   * Export spans to the local TraceStore.
   * Spans are grouped by trace ID and inserted into the database.
   */
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    // Handle async export
    /**
     * Async implementation of span export.
     * Returns the first non-FK error encountered, or undefined if successful.
     */
    const exportAsync = async (): Promise<Error | undefined> => {
      if (spans.length === 0) {
        return undefined;
      }

      const traceStore = getTraceStore();
      logger.debug(`[LocalSpanExporter] Exporting ${spans.length} spans`);

      // Group spans by trace ID
      const spansByTrace = new Map<string, SpanData[]>();

      for (const span of spans) {
        const traceId = span.spanContext().traceId;
        /**
         * Convert an OTEL ReadableSpan to our SpanData format.
         */
        const spanContext = span.spanContext();

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
          attributes: Object.fromEntries(
            Object.entries({ ...span.resource.attributes, ...span.attributes }).map(
              ([key, value]) => [key, toStoredAttribute(value)],
            ),
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
        try {
          const addSpansWithTraceRetry = async (): ReturnType<TraceStore['addSpans']> => {
            const options = { skipTraceCheck: false, warnIfMissingTrace: false };
            const result = await traceStore.addSpans(traceId, spanDataList, options);
            if (result.stored) {
              return result;
            }

            await new Promise((resolve) => setTimeout(resolve, MISSING_TRACE_RETRY_DELAY_MS));
            return traceStore.addSpans(traceId, spanDataList, options);
          };

          const result = await addSpansWithTraceRetry();
          if (result.stored) {
            logger.debug(
              `[LocalSpanExporter] Added ${spanDataList.length} spans to trace ${traceId}`,
            );
          } else {
            // Trace doesn't exist - these spans are from grading calls or other internal
            // operations that weren't initiated through the evaluation tracing flow.
            logger.debug(
              `[LocalSpanExporter] Skipping ${spanDataList.length} spans for orphan trace ${traceId}: ${result.reason}`,
            );
          }
        } catch (error) {
          // Handle unexpected errors (e.g., database connection issues)
          if ((error instanceof Error ? error.message : String(error)).includes('FOREIGN KEY')) {
            // Foreign key constraint - trace was deleted between check and insert
            logger.debug(
              `[LocalSpanExporter] Skipping ${spanDataList.length} spans for orphan trace ${traceId}`,
            );
          } else {
            // Track error but continue processing other traces
            logger.error(`[LocalSpanExporter] Failed to add spans to trace ${traceId}`, { error });
            if (!firstError) {
              firstError = error instanceof Error ? error : new Error(String(error));
            }
          }
        }
      }

      return firstError;
    };

    exportAsync()
      .then((error) => {
        if (error) {
          // An error occurred during export
          resultCallback({
            code: ExportResultCode.FAILED,
            error,
          });
        } else {
          resultCallback({ code: ExportResultCode.SUCCESS });
        }
      })
      .catch((error) => {
        logger.error('[LocalSpanExporter] Failed to export spans', { error });
        resultCallback({
          code: ExportResultCode.FAILED,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
  }

  /**
   * Shutdown the exporter. No-op for local storage.
   */
  shutdown(): Promise<void> {
    logger.debug('[LocalSpanExporter] Shutting down');
    return Promise.resolve();
  }

  /**
   * Force flush any pending spans. No-op as we export immediately.
   */
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
