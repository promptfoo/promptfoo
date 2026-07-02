import { AsyncLocalStorage } from 'node:async_hooks';

import type { RateLimitRegistryRef } from '../types/index';
import type { ProviderCallQueue } from './providerCallQueue';

/**
 * Runtime-only scheduler context for provider calls made below the evaluator.
 *
 * This keeps scheduler internals out of CallApiContextParams, which providers
 * can inspect, while still letting matcher helpers reuse the evaluator's
 * cancellation and rate-limit orchestration.
 */
export interface ProviderCallExecutionContext {
  abortSignal?: AbortSignal;
  providerCallQueue?: ProviderCallQueue;
  // Cancels this call before provider invocation without changing outer evaluator flush semantics.
  queuedCallAbortSignal?: AbortSignal;
  rateLimitRegistry?: RateLimitRegistryRef;
}

const providerCallExecutionContext = new AsyncLocalStorage<ProviderCallExecutionContext>();

export function getProviderCallExecutionContext(): ProviderCallExecutionContext | undefined {
  return providerCallExecutionContext.getStore();
}

// Let grouped grading settle on cancellation while continuing to observe the underlying
// scheduler promise, which the evaluator owns and disposes during cleanup.
export function raceWithAbortSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(signal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function withProviderCallExecutionContext<T>(
  context: ProviderCallExecutionContext,
  fn: () => Promise<T>,
): Promise<T> {
  return providerCallExecutionContext.run(context, fn);
}
