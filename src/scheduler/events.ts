import type { ConcurrencyChangeResult } from './adaptiveConcurrency';

/**
 * Event emitted when a rate limit is hit (429 response).
 */
export interface RateLimitHitEvent {
  rateLimitKey: string;
  retryAfterMs?: number;
  resetAt?: number | null;
  concurrencyChange: ConcurrencyChangeResult;
}

/**
 * Event emitted when approaching rate limit threshold (proactive warning).
 */
export interface RateLimitWarningEvent {
  rateLimitKey: string;
  requestRatio: number | null;
  tokenRatio: number | null;
}

/**
 * Event emitted when rate limit information is learned from headers.
 */
export interface RateLimitLearnedEvent {
  rateLimitKey: string;
  requestLimit?: number;
  tokenLimit?: number;
}

/**
 * Event emitted when concurrency is increased (recovery).
 */
export interface ConcurrencyIncreasedEvent {
  rateLimitKey: string;
  changed: boolean;
  previous: number;
  current: number;
  reason: string;
}

/**
 * Event emitted when concurrency is decreased (backoff or proactive).
 */
export interface ConcurrencyDecreasedEvent {
  rateLimitKey: string;
  changed: boolean;
  previous: number;
  current: number;
  reason: string;
}

/**
 * Event emitted when a request is being retried.
 */
export interface RequestRetryingEvent {
  rateLimitKey: string;
  attempt: number;
  delayMs: number;
  reason: 'ratelimit' | 'error';
}

/**
 * Event emitted when a request is started.
 */
export interface RequestStartedEvent {
  rateLimitKey: string;
  requestId: string;
  queueDepth: number;
}

/**
 * Event emitted when a request completes successfully.
 */
export interface RequestCompletedEvent {
  rateLimitKey: string;
  requestId: string;
}

/**
 * Event emitted when a request fails after all retries.
 */
export interface RequestFailedEvent {
  rateLimitKey: string;
  requestId: string;
  error: string;
}

/**
 * Event emitted when a concurrency slot is acquired.
 */
export interface SlotAcquiredEvent {
  rateLimitKey: string;
  queueDepth: number;
}

/**
 * Event emitted when a concurrency slot is released.
 */
export interface SlotReleasedEvent {
  rateLimitKey: string;
  queueDepth: number;
}
