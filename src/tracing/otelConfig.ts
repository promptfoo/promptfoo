import { getEnvBool, getEnvString } from '../envars';

/**
 * Configuration for OpenTelemetry tracing.
 */
export interface OtelConfig {
  /**
   * Whether OTEL tracing is enabled.
   */
  enabled: boolean;
  /**
   * Service name to use in traces. Defaults to 'promptfoo'.
   */
  serviceName: string;
  /**
   * External OTLP/HTTP traces URL for trace export, ready to pass to the exporter.
   * If not set, traces are only exported locally.
   */
  endpoint?: string;
  /**
   * Whether to export traces to local TraceStore (SQLite).
   * Defaults to true.
   */
  localExport: boolean;
  /**
   * Enable OTEL debug logging.
   */
  debug: boolean;
}

/**
 * Resolve the traces URL the OpenTelemetry spec assigns to an OTLP/HTTP exporter.
 *
 * `PROMPTFOO_OTEL_ENDPOINT` and the signal-specific `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` are used
 * verbatim. The generic `OTEL_EXPORTER_OTLP_ENDPOINT` is a base URL, so `/v1/traces` is appended
 * when it has no path; a generic value that already names a path is kept as-is.
 */
function resolveTracesEndpoint(): string | undefined {
  const verbatim =
    getEnvString('PROMPTFOO_OTEL_ENDPOINT')?.trim() ||
    getEnvString('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT')?.trim();
  if (verbatim) {
    return verbatim;
  }
  const base = getEnvString('OTEL_EXPORTER_OTLP_ENDPOINT')?.trim();
  if (!base) {
    return undefined;
  }
  try {
    const url = new URL(base);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/v1/traces';
      return url.toString();
    }
  } catch {
    // Leave an unparseable value for the exporter to report.
  }
  return base;
}

/**
 * Get OTEL configuration from environment variables.
 */
export function getOtelConfigFromEnv(): OtelConfig {
  return {
    enabled: getEnvBool('PROMPTFOO_OTEL_ENABLED', false),
    serviceName: getEnvString('PROMPTFOO_OTEL_SERVICE_NAME', 'promptfoo'),
    endpoint: resolveTracesEndpoint(),
    localExport: getEnvBool('PROMPTFOO_OTEL_LOCAL_EXPORT', true),
    debug: getEnvBool('PROMPTFOO_OTEL_DEBUG', false),
  };
}

/**
 * Get default OTEL configuration with tracing enabled.
 * Used when tracing is enabled via test metadata but no explicit config provided.
 */
export function getDefaultOtelConfig(): OtelConfig {
  const envConfig = getOtelConfigFromEnv();
  // Enable tracing by default when this is called (since we've determined tracing should be on)
  return {
    ...envConfig,
    enabled: true,
  };
}
