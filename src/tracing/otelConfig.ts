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
   * External OTLP endpoint URL for trace export.
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
 * Get OTEL configuration from environment variables.
 */
export function getOtelConfigFromEnv(): OtelConfig {
  const endpoint =
    getEnvString('PROMPTFOO_OTEL_ENDPOINT') || getEnvString('OTEL_EXPORTER_OTLP_ENDPOINT');

  return {
    enabled: getEnvBool('PROMPTFOO_OTEL_ENABLED', false),
    serviceName: getEnvString('PROMPTFOO_OTEL_SERVICE_NAME', 'promptfoo'),
    endpoint: endpoint || undefined,
    localExport: getEnvBool('PROMPTFOO_OTEL_LOCAL_EXPORT', true),
    debug: getEnvBool('PROMPTFOO_OTEL_DEBUG', false),
  };
}

/**
 * Get OTEL configuration from YAML config object.
 * Returns partial config that can be merged with env-based config.
 */
export function getOtelConfigFromYaml(config: Record<string, unknown>): Partial<OtelConfig> {
  const tracing = config?.tracing as Record<string, unknown> | undefined;
  if (!tracing) {
    return {};
  }

  return {
    ...(typeof tracing.enabled === 'boolean' && { enabled: tracing.enabled }),
    ...(typeof tracing.serviceName === 'string' && { serviceName: tracing.serviceName }),
    ...(typeof tracing.endpoint === 'string' && { endpoint: tracing.endpoint }),
    ...(typeof tracing.localExport === 'boolean' && { localExport: tracing.localExport }),
    ...(typeof tracing.debug === 'boolean' && { debug: tracing.debug }),
  };
}

/**
 * Merge OTEL configurations with priority: yaml > env > defaults.
 */
export function mergeOtelConfigs(
  envConfig: OtelConfig,
  yamlConfig: Partial<OtelConfig>,
): OtelConfig {
  return {
    enabled: yamlConfig.enabled ?? envConfig.enabled,
    serviceName: yamlConfig.serviceName ?? envConfig.serviceName,
    endpoint: yamlConfig.endpoint ?? envConfig.endpoint,
    localExport: yamlConfig.localExport ?? envConfig.localExport,
    debug: yamlConfig.debug ?? envConfig.debug,
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
