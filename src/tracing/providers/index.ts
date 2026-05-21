import { TempoProvider } from './tempo';

import type { TraceProvider, TraceProviderConfig } from './types';

export type {
  FetchTraceOptions,
  FetchTraceResult,
  TraceProvider,
  TraceProviderConfig,
} from './types';

/**
 * Create a trace provider instance based on configuration.
 *
 * @param config - Provider configuration specifying type and connection details
 * @returns A TraceProvider instance for the specified backend
 * @throws Error if the provider type is not supported or misconfigured
 */
export function createTraceProvider(config: TraceProviderConfig): TraceProvider {
  switch (config.id) {
    case 'tempo':
      return new TempoProvider(config);
    // Future providers:
    // case 'jaeger':
    //   return new JaegerProvider(config);
    case 'local':
      throw new Error(
        'Local provider id should use TraceStore directly, not createTraceProvider()',
      );
    default:
      throw new Error(`Unknown trace provider id: ${(config as TraceProviderConfig).id}`);
  }
}

/**
 * Check if a provider configuration specifies an external backend.
 * Returns true if the config has an id other than 'local' and has an endpoint.
 *
 * @param config - Optional provider configuration
 * @returns true if this is an external provider (Tempo, Jaeger, etc.)
 */
export function isExternalTraceProvider(config?: TraceProviderConfig): boolean {
  return !!config && config.id !== 'local' && !!config.endpoint;
}
