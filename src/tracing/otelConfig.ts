import { createHash } from 'node:crypto';

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

// The SDK reads these settings directly from the process when it creates its sampler and exporter.
function getProcessTraceSetting(key: string): string | undefined {
  const value = process.env[key];
  if (getEnvString(key) !== value) {
    throw new Error(
      'Set OTLP credentials and trace sampling in the process environment. The OpenTelemetry SDK cannot apply evaluation-specific overrides for these settings.',
    );
  }
  return value?.trim() ? value : undefined;
}

export function getOtelRoutingKey(config: OtelConfig): string | undefined {
  const sampler = getProcessTraceSetting('OTEL_TRACES_SAMPLER') ?? 'parentbased_always_on';
  const settings = [config.serviceName, config.localExport, config.endpoint, sampler];
  if (sampler === 'traceidratio' || sampler === 'parentbased_traceidratio') {
    settings.push(getProcessTraceSetting('OTEL_TRACES_SAMPLER_ARG'));
  }
  let usesTlsFiles = false;
  if (config.endpoint) {
    for (const prefix of ['OTEL_EXPORTER_OTLP_', 'OTEL_EXPORTER_OTLP_TRACES_']) {
      for (const suffix of ['HEADERS', 'CERTIFICATE', 'CLIENT_CERTIFICATE', 'CLIENT_KEY']) {
        const value = getProcessTraceSetting(prefix + suffix);
        if (suffix === 'HEADERS') {
          settings.push(value);
        } else if (value) {
          // File contents can rotate at the same path between evaluations.
          usesTlsFiles = true;
        }
      }
    }
  }
  return usesTlsFiles
    ? undefined
    : createHash('sha256').update(JSON.stringify(settings)).digest('hex');
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
