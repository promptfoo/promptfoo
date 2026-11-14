import { context, diag, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  getNumberFromEnv,
  getStringFromEnv,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace';
import type { TextMapPropagator, TracerProvider } from '@opentelemetry/api';
import type { SpanExporter, TracerProviderOptions } from '@opentelemetry/sdk-trace';

export function registerTracerProvider(provider: TracerProvider, propagator?: TextMapPropagator) {
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(
    propagator ??
      new CompositePropagator({
        propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
      }),
  );
}

function samplerFromEnv() {
  const name = getStringFromEnv('OTEL_TRACES_SAMPLER');
  switch (name) {
    case undefined:
    case 'parentbased_always_on':
      return undefined; // The SDK default.
    case 'always_on':
      return new AlwaysOnSampler();
    case 'always_off':
      return new AlwaysOffSampler();
    case 'parentbased_always_off':
      return new ParentBasedSampler({ root: new AlwaysOffSampler() });
    case 'traceidratio':
    case 'parentbased_traceidratio': {
      const ratio = getNumberFromEnv('OTEL_TRACES_SAMPLER_ARG');
      const valid = ratio !== undefined && ratio >= 0 && ratio <= 1;
      if (!valid) {
        diag.error('OTEL_TRACES_SAMPLER_ARG must be between 0 and 1. Using 1.');
      }
      const sampler = new TraceIdRatioBasedSampler(valid ? ratio : 1);
      return name === 'traceidratio' ? sampler : new ParentBasedSampler({ root: sampler });
    }
    default:
      diag.error(`Unknown OTEL_TRACES_SAMPLER "${name}". Using the default sampler.`);
      return undefined;
  }
}

// SDK 3 takes explicit options for settings that sdk-trace-node read from the environment.
export function traceOptionsFromEnv(): TracerProviderOptions {
  return {
    sampler: samplerFromEnv(),
    spanLimits: {
      attributeCountLimit:
        getNumberFromEnv('OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT') ??
        getNumberFromEnv('OTEL_ATTRIBUTE_COUNT_LIMIT'),
      attributeValueLengthLimit:
        getNumberFromEnv('OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT') ??
        getNumberFromEnv('OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT'),
      eventCountLimit: getNumberFromEnv('OTEL_SPAN_EVENT_COUNT_LIMIT'),
      linkCountLimit: getNumberFromEnv('OTEL_SPAN_LINK_COUNT_LIMIT'),
      attributePerEventCountLimit: getNumberFromEnv('OTEL_SPAN_ATTRIBUTE_PER_EVENT_COUNT_LIMIT'),
      attributePerLinkCountLimit: getNumberFromEnv('OTEL_SPAN_ATTRIBUTE_PER_LINK_COUNT_LIMIT'),
    },
  };
}

export function batchProcessorFromEnv(exporter: SpanExporter) {
  return new BatchSpanProcessor({
    exporter,
    maxQueueSize: getNumberFromEnv('OTEL_BSP_MAX_QUEUE_SIZE'),
    maxExportBatchSize: getNumberFromEnv('OTEL_BSP_MAX_EXPORT_BATCH_SIZE'),
    scheduledDelayMillis: getNumberFromEnv('OTEL_BSP_SCHEDULE_DELAY'),
    exportTimeoutMillis: getNumberFromEnv('OTEL_BSP_EXPORT_TIMEOUT'),
  });
}
