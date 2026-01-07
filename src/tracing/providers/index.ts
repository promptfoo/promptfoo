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
  switch (config.type) {
    case 'tempo':
      return new TempoProvider(config);
    // Future providers:
    // case 'jaeger':
    //   return new JaegerProvider(config);
    case 'local':
      throw new Error(
        'Local provider type should use TraceStore directly, not createTraceProvider()',
      );
    default:
      throw new Error(`Unknown trace provider type: ${(config as TraceProviderConfig).type}`);
  }
}

/**
 * Check if a provider configuration specifies an external backend.
 * Returns true if the config has a type other than 'local' and has an endpoint.
 *
 * @param config - Optional provider configuration
 * @returns true if this is an external provider (Tempo, Jaeger, etc.)
 */
export function isExternalTraceProvider(config?: TraceProviderConfig): boolean {
  return !!config && config.type !== 'local' && !!config.endpoint;
}
