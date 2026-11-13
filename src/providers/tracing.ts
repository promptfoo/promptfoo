import { trace } from '@opentelemetry/api';
import cliState from '../cliState';
import { getOtelConfigFromEnv } from '../tracing/otelConfig';
import { getTraceStore } from '../tracing/store';

export type TracingExportFormat = 'json' | 'protobuf';

export interface ConfiguredTracingExport {
  endpoint: string;
  format: TracingExportFormat;
}

const DEFAULT_NATIVE_TRACE_EXPORT_INTERVAL_MS = 1_000;
const DEFAULT_NATIVE_TRACE_EXPORT_TIMEOUT_MS = 10_000;
const MAX_NATIVE_TRACE_EXPORT_WAIT_MS = 30_000;
const NATIVE_TRACE_EXPORT_POLL_MS = 50;

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
  const requestedReceiver = cliState.requestTracingConfig?.otlp?.http;
  if (!requestedReceiver?.enabled) {
    return undefined;
  }

  const receiver = cliState.activeOtlpReceiver ?? requestedReceiver;
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

/** Only suppress Promptfoo spans when subprocess exports can reach the live receiver. */
export function isActiveTracingExport(endpoint?: string, protocol?: string): boolean {
  const receiver = cliState.activeOtlpReceiver;
  const format =
    protocol === 'http/json' ? 'json' : protocol === 'http/protobuf' ? 'protobuf' : undefined;
  if (
    !cliState.requestTracingConfig?.otlp?.http?.enabled ||
    !receiver ||
    !endpoint ||
    !format ||
    !receiver.acceptFormats.includes(format)
  ) {
    return false;
  }

  const urlHost =
    receiver.host.includes(':') && !receiver.host.startsWith('[')
      ? `[${receiver.host}]`
      : receiver.host;
  try {
    const exportUrl = new URL(endpoint);
    const receiverUrl = new URL(`http://${urlHost}:${receiver.port}`);
    const normalizeHost = (hostname: string) =>
      hostname === 'localhost' || hostname === '127.0.0.1' ? '127.0.0.1' : hostname;
    const pathname = exportUrl.pathname.replace(/\/+$/, '') || '/';
    return (
      exportUrl.protocol === receiverUrl.protocol &&
      exportUrl.port === receiverUrl.port &&
      normalizeHost(exportUrl.hostname) === normalizeHost(receiverUrl.hostname) &&
      (pathname === '/' || pathname === '/v1/traces')
    );
  } catch {
    return false;
  }
}

function getPositiveExportTimeout(value: string | undefined, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }

  const timeout = Number(value);
  return Number.isSafeInteger(timeout) && timeout > 0 ? timeout : fallback;
}

/** Wait until a subprocess span is stored under its Promptfoo provider span. */
export async function waitForNativeTraceExport(
  traceId: string,
  parentSpanId: string,
  env: Record<string, string>,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  const intervalMs = getPositiveExportTimeout(
    env.OTEL_TRACES_EXPORT_INTERVAL,
    DEFAULT_NATIVE_TRACE_EXPORT_INTERVAL_MS,
  );
  const exporterTimeoutMs = getPositiveExportTimeout(
    env.OTEL_EXPORTER_OTLP_TRACES_TIMEOUT ?? env.OTEL_EXPORTER_OTLP_TIMEOUT,
    DEFAULT_NATIVE_TRACE_EXPORT_TIMEOUT_MS,
  );
  const timeoutMs = Math.min(intervalMs + exporterTimeoutMs, MAX_NATIVE_TRACE_EXPORT_WAIT_MS);
  const deadline = Date.now() + timeoutMs;

  while (!abortSignal?.aborted) {
    const traceData = await getTraceStore().getTrace(traceId);
    if (traceData?.spans.some((span) => span.parentSpanId === parentSpanId)) {
      return true;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return false;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.min(remainingMs, NATIVE_TRACE_EXPORT_POLL_MS));
    });
  }

  return false;
}

/** Give subprocess SDKs a usable collector even when the receiver uses its defaults. */
export function getTracingEndpoint(): string {
  return getConfiguredTracingEndpoint() ?? 'http://127.0.0.1:4318';
}

/** Keep SDK-exported spans grouped with Promptfoo's configured service resource. */
export function getTracingServiceName(): string {
  return getOtelConfigFromEnv().serviceName;
}
