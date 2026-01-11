import { DEFAULT_MAX_CONCURRENCY } from '../../constants';
import type { EndpointId } from './types';

/**
 * Get default concurrency for an endpoint.
 * Returns the standard default concurrency for all providers.
 * Users can override via the endpointConcurrency config option.
 */
export function getDefaultConcurrency(_endpointId: EndpointId): number {
  return DEFAULT_MAX_CONCURRENCY;
}
