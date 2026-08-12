import { getTracingEndpoint } from '../tracing';

/** Point Codex subprocess telemetry at the receiver associated with the current eval. */
export function getCodexTraceEndpoint(): string {
  return getTracingEndpoint();
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
    env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL ?? env.OTEL_EXPORTER_OTLP_PROTOCOL ?? 'http/json';
  const endpoint =
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    getCodexTraceEndpoint();
  const traceExporter =
    protocol === 'grpc'
      ? { 'otlp-grpc': { endpoint } }
      : {
          'otlp-http': {
            endpoint: endpoint.replace(/\/+$/, '').endsWith('/v1/traces')
              ? endpoint.replace(/\/+$/, '')
              : `${endpoint.replace(/\/+$/, '')}/v1/traces`,
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
