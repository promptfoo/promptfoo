import { PROMPTFOO_TRACER_NAME, SPAN_ROLE_ATTRIBUTE } from './spanRoles';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';

import type { ParsedTrace } from './store';

// An HTTP receiver may also be this process's own SDK export destination.
// Retain only in-flight batches so a receiver can identify those local wrappers.
const pendingBatches = new Set<Map<string, ReadableSpan>>();

export function trackLocalOtlpExports(exporter: SpanExporter): SpanExporter {
  return {
    export(spans, callback) {
      const batch = new Map<string, ReadableSpan>();
      for (const span of spans) {
        if (
          span.instrumentationScope.name === PROMPTFOO_TRACER_NAME &&
          span.attributes[SPAN_ROLE_ATTRIBUTE]
        ) {
          const { traceId, spanId } = span.spanContext();
          batch.set(traceId + spanId, span);
        }
      }
      pendingBatches.add(batch);
      try {
        exporter.export(spans, (result) => {
          pendingBatches.delete(batch);
          callback(result);
        });
      } catch (error) {
        pendingBatches.delete(batch);
        throw error;
      }
    },
    forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve(),
    shutdown: () => exporter.shutdown(),
  };
}

export function stripExternalSpanOwnership(attributes: Record<string, unknown>): void {
  delete attributes[SPAN_ROLE_ATTRIBUTE];
}

export function setReceivedSpanOwnership({ traceId, span }: ParsedTrace): void {
  const attributes = span.attributes;
  if (!attributes) {
    return;
  }
  stripExternalSpanOwnership(attributes);

  for (const batch of pendingBatches) {
    const local = batch.get(traceId + span.spanId);
    if (
      local &&
      local.name === span.name &&
      local.parentSpanContext?.spanId === span.parentSpanId
    ) {
      attributes[SPAN_ROLE_ATTRIBUTE] = local.attributes[SPAN_ROLE_ATTRIBUTE];
      return;
    }
  }
}
