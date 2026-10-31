import { getEnvBool, getEnvOverrides, getEnvString } from '../envars';

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
   * External OTLP endpoint URL for trace export.
   * If not set, traces are only exported locally.
   */
  endpoint?: string;
  /** A host provider can own the collector inherited from its process environment. */
  inheritedEndpoint?: boolean;
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
 * Get OTEL configuration from environment variables.
 */
export function getOtelConfigFromEnv(): OtelConfig {
  const promptfooEndpoint = getEnvString('PROMPTFOO_OTEL_ENDPOINT');
  const endpoint = promptfooEndpoint || getEnvString('OTEL_EXPORTER_OTLP_ENDPOINT');
  const inheritedEndpoint =
    endpoint &&
    !promptfooEndpoint &&
    endpoint === process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
    (['provider', 'suite', 'file'] as const).every(
      (layer) => getEnvOverrides(layer)?.OTEL_EXPORTER_OTLP_ENDPOINT === undefined,
    );

  return {
    enabled: getEnvBool('PROMPTFOO_OTEL_ENABLED', false),
    serviceName: getEnvString('PROMPTFOO_OTEL_SERVICE_NAME', 'promptfoo'),
    endpoint: endpoint || undefined,
    ...(inheritedEndpoint && { inheritedEndpoint: true }),
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
