/**
 * Adaptive Rate Limit Scheduler
 *
 * An intelligent evaluation orchestrator that learns rate limits from response
 * headers and adapts concurrency dynamically. Zero configuration required.
 *
 * @module scheduler
 */

// Adaptive concurrency
export { AdaptiveConcurrency, WARNING_THRESHOLD } from './adaptiveConcurrency';
// Header parsing
export {
  type ParsedRateLimitHeaders,
  parseRateLimitHeaders,
  parseRetryAfter,
} from './headerParser';
// Provider state
export { ProviderRateLimitState } from './providerRateLimitState';
// Provider wrapper
export {
  createProviderRateLimitOptions,
  isRateLimitWrapped,
  wrapProvidersWithRateLimiting,
  wrapProviderWithRateLimiting,
} from './providerWrapper';
// Rate limit key generation
export { getRateLimitKey } from './rateLimitKey';
// Core exports
export { createRateLimitRegistry, RateLimitRegistry } from './rateLimitRegistry';
// Retry policy
export {
  DEFAULT_RETRY_POLICY,
  getRetryDelay,
  type RetryPolicy,
  shouldRetry,
} from './retryPolicy';
// Slot queue
export { SlotQueue } from './slotQueue';

export type { ConcurrencyChangeResult } from './adaptiveConcurrency';
// Event types
export type {
  ConcurrencyDecreasedEvent,
  ConcurrencyIncreasedEvent,
  RateLimitHitEvent,
  RateLimitLearnedEvent,
  RateLimitWarningEvent,
  RequestCompletedEvent,
  RequestFailedEvent,
  RequestRetryingEvent,
  RequestStartedEvent,
  SlotAcquiredEvent,
  SlotReleasedEvent,
} from './events';
export type { ProviderMetrics } from './providerRateLimitState';
export type { RateLimitRegistryOptions } from './rateLimitRegistry';
export type { SlotQueueOptions } from './slotQueue';
// Shared types
export type { RateLimitExecuteOptions } from './types';
