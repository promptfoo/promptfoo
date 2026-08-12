import { trace } from '@opentelemetry/api';
import cliState from '../cliState';
import { getOtelConfigFromEnv } from '../tracing/otelConfig';

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
  const receiver = cliState.requestTracingConfig?.otlp?.http;
  if (!receiver) {
    return undefined;
  }

  return `http://${receiver.host ?? '127.0.0.1'}:${receiver.port ?? 4318}`;
}

/** Give subprocess SDKs a usable collector even when the receiver uses its defaults. */
export function getTracingEndpoint(): string {
  return getConfiguredTracingEndpoint() ?? 'http://127.0.0.1:4318';
}

/** Keep SDK-exported spans grouped with Promptfoo's configured service resource. */
export function getTracingServiceName(): string {
  return getOtelConfigFromEnv().serviceName;
}
