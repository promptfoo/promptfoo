import { getConfiguredTracingExport, getTracingEndpoint } from '../tracing';

const DEFAULT_OTLP_EXPORT_TIMEOUT_MS = 10_000;
const MINIMUM_CODEX_TRACE_SHUTDOWN_GRACE_MS = 5_000;

/** Point Codex subprocess telemetry at the receiver associated with the current eval. */
export function getCodexTraceEndpoint(): string {
  return getTracingEndpoint();
}

/** Select an OTLP protocol accepted by the receiver currently serving this evaluation. */
export function getCodexTraceProtocol(): string {
  return getConfiguredTracingExport()?.format === 'protobuf' ? 'http/protobuf' : 'http/json';
}

/** Allow Codex's batch processor at least one complete OTLP export attempt during shutdown. */
export function getCodexTraceShutdownGraceMs(env: Record<string, string>): number {
  for (const key of ['OTEL_EXPORTER_OTLP_TRACES_TIMEOUT', 'OTEL_EXPORTER_OTLP_TIMEOUT']) {
    const value = env[key];
    if (value === undefined || !/^\d+$/.test(value)) {
      continue;
    }

    const timeoutMs = Number(value);
    if (Number.isSafeInteger(timeoutMs) && timeoutMs > 0) {
      return Math.max(MINIMUM_CODEX_TRACE_SHUTDOWN_GRACE_MS, timeoutMs);
    }
  }

  return DEFAULT_OTLP_EXPORT_TIMEOUT_MS;
}

function appendTracePath(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const pathname = url.pathname.replace(/\/+$/, '');
    if (pathname.endsWith('/v1/traces')) {
      return endpoint;
    }

    url.pathname = `${pathname}/v1/traces`;
    return url.toString();
  } catch {
    const trimmedEndpoint = endpoint.replace(/\/+$/, '');
    return trimmedEndpoint.endsWith('/v1/traces')
      ? trimmedEndpoint
      : `${trimmedEndpoint}/v1/traces`;
  }
}

/** Configure Codex's own trace exporter; standard OTEL environment variables do not select it. */
export function withCodexTraceExporter(
  cliConfig: Record<string, unknown>,
  env: Record<string, string>,
  enabled: boolean,
): Record<string, unknown> {
  if (
    !enabled ||
    Object.keys(cliConfig).some(
      (key) => key === 'otel.trace_exporter' || key.startsWith('otel.trace_exporter.'),
    )
  ) {
    return cliConfig;
  }

  const existingOtel = cliConfig.otel;
  if (existingOtel !== undefined && !isRecord(existingOtel)) {
    return cliConfig;
  }
  if (
    existingOtel &&
    Object.keys(existingOtel).some(
      (key) => key === 'trace_exporter' || key.startsWith('trace_exporter.'),
    )
  ) {
    return cliConfig;
  }

  const protocol =
    env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL ??
    env.OTEL_EXPORTER_OTLP_PROTOCOL ??
    getCodexTraceProtocol();
  const signalEndpoint = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const endpoint = signalEndpoint ?? env.OTEL_EXPORTER_OTLP_ENDPOINT ?? getCodexTraceEndpoint();
  const httpEndpoint = signalEndpoint ?? appendTracePath(endpoint);
  const traceExporter =
    protocol === 'grpc'
      ? { 'otlp-grpc': { endpoint } }
      : {
          'otlp-http': {
            endpoint: httpEndpoint,
            protocol: protocol === 'http/protobuf' ? 'binary' : 'json',
          },
        };

  return {
    ...cliConfig,
    otel: {
      ...existingOtel,
      trace_exporter: traceExporter,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
