import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

import logger from '../logger';
import { getTraceStore, type SpanData } from './store';

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
    this.exportAsync(spans)
      .then(() => {
        resultCallback({ code: ExportResultCode.SUCCESS });
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
   * Async implementation of span export.
   */
  private async exportAsync(spans: ReadableSpan[]): Promise<void> {
    if (spans.length === 0) {
      return;
    }

    const traceStore = getTraceStore();
    logger.debug(`[LocalSpanExporter] Exporting ${spans.length} spans`);

    // Group spans by trace ID
    const spansByTrace = new Map<string, SpanData[]>();

    for (const span of spans) {
      const traceId = span.spanContext().traceId;
      const spanData = this.convertSpan(span);

      if (!spansByTrace.has(traceId)) {
        spansByTrace.set(traceId, []);
      }
      spansByTrace.get(traceId)!.push(spanData);
    }

    // Store each trace's spans
    // Use skipTraceCheck since OTEL spans may not have a pre-existing trace record
    let lastError: Error | undefined;

    for (const [traceId, spanDataList] of spansByTrace) {
      try {
        await traceStore.addSpans(traceId, spanDataList, { skipTraceCheck: true });
        logger.debug(`[LocalSpanExporter] Added ${spanDataList.length} spans to trace ${traceId}`);
      } catch (error) {
        logger.error(`[LocalSpanExporter] Failed to add spans to trace ${traceId}`, { error });
        // Continue with other traces even if one fails, but track the error
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    // If any export failed, throw the last error to signal failure
    if (lastError) {
      throw lastError;
    }
  }

  /**
   * Convert an OTEL ReadableSpan to our SpanData format.
   */
  private convertSpan(span: ReadableSpan): SpanData {
    const spanContext = span.spanContext();

    // Convert OTEL hrtime (seconds, nanoseconds) to nanosecond timestamp
    const startTimeNs = span.startTime[0] * 1e9 + span.startTime[1];
    const endTimeNs = span.endTime[0] * 1e9 + span.endTime[1];

    return {
      spanId: spanContext.spanId,
      parentSpanId: span.parentSpanId || undefined,
      name: span.name,
      startTime: startTimeNs,
      endTime: endTimeNs,
      attributes: this.convertAttributes(span.attributes),
      statusCode: span.status.code,
      statusMessage: span.status.message,
    };
  }

  /**
   * Convert OTEL attributes to a plain object.
   * OTEL attributes can have various value types that need normalization.
   */
  private convertAttributes(attributes: ReadableSpan['attributes']): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attributes)) {
      // OTEL attribute values can be string, number, boolean, or arrays of those
      result[key] = value;
    }

    return result;
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
