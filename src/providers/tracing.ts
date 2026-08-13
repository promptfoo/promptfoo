import { trace } from '@opentelemetry/api';
import cliState from '../cliState';
import { getOtelConfigFromEnv } from '../tracing/otelConfig';

export type TracingExportFormat = 'json' | 'protobuf';

export interface ConfiguredTracingExport {
  endpoint: string;
  format: TracingExportFormat;
}

export {
  buildChatSpanContext,
  emitTurnMarkerSpan,
  extractProviderResponseAttributes,
  GenAIAttributes,
  type GenAISpanContext,
  getGenAITracer,
  withGenAISpan,
  withGenAIToolSpan,
} from '../tracing/genaiTracer';

/** Keep optional SDK telemetry disabled when there is no usable parent span. */
export function hasActiveTracingSpan(): boolean {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext !== undefined && trace.isSpanContextValid(spanContext);
}

/** Return the receiver owned by the current evaluation, when one was configured. */
export function getConfiguredTracingEndpoint(): string | undefined {
  return getConfiguredTracingExport()?.endpoint;
}

/** Resolve a running HTTP receiver and an OTLP format it actually accepts. */
export function getConfiguredTracingExport(): ConfiguredTracingExport | undefined {
  const receiver = cliState.requestTracingConfig?.otlp?.http;
  if (!receiver?.enabled) {
    return undefined;
  }

  const acceptFormats = receiver.acceptFormats;
  const format =
    !acceptFormats?.length || acceptFormats.includes('json')
      ? 'json'
      : acceptFormats.includes('protobuf')
        ? 'protobuf'
        : undefined;
  if (!format) {
    return undefined;
  }

  const host = receiver.host ?? '127.0.0.1';
  const urlHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return { endpoint: `http://${urlHost}:${receiver.port ?? 4318}`, format };
}

/** Give subprocess SDKs a usable collector even when the receiver uses its defaults. */
export function getTracingEndpoint(): string {
  return getConfiguredTracingEndpoint() ?? 'http://127.0.0.1:4318';
}

/** Keep SDK-exported spans grouped with Promptfoo's configured service resource. */
export function getTracingServiceName(): string {
  return getOtelConfigFromEnv().serviceName;
}
