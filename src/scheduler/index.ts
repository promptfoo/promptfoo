/**
 * Adaptive Rate Limit Scheduler
 *
 * An intelligent evaluation orchestrator that learns rate limits from response
 * headers and adapts concurrency dynamically. Zero configuration required.
 *
 * @module scheduler
 */

// Core exports
export { RateLimitRegistry, createRateLimitRegistry } from './rateLimitRegistry';
export type { RateLimitRegistryOptions } from './rateLimitRegistry';

// Rate limit key generation
export { getRateLimitKey } from './rateLimitKey';

// Header parsing
export {
  parseRateLimitHeaders,
  parseRetryAfter,
  type ParsedRateLimitHeaders,
} from './headerParser';

// Retry policy
export {
  getRetryDelay,
  shouldRetry,
  DEFAULT_RETRY_POLICY,
  type RetryPolicy,
} from './retryPolicy';

// Adaptive concurrency
export { AdaptiveConcurrency, WARNING_THRESHOLD } from './adaptiveConcurrency';
export type { ConcurrencyChangeResult } from './adaptiveConcurrency';

// Slot queue
export { SlotQueue } from './slotQueue';
export type { SlotQueueOptions } from './slotQueue';

// Provider state
export { ProviderRateLimitState } from './providerRateLimitState';
export type { ProviderMetrics } from './providerRateLimitState';

// Event types
export type {
  RateLimitHitEvent,
  RateLimitWarningEvent,
  RateLimitLearnedEvent,
  ConcurrencyIncreasedEvent,
  ConcurrencyDecreasedEvent,
  RequestRetryingEvent,
  RequestStartedEvent,
  RequestCompletedEvent,
  RequestFailedEvent,
  SlotAcquiredEvent,
  SlotReleasedEvent,
} from './events';
