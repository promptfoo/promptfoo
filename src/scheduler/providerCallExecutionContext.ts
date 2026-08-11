import { AsyncLocalStorage } from 'node:async_hooks';

import type { RateLimitRegistryRef, TestSuite } from '../types/index';
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
  rateLimitRegistry?: RateLimitRegistryRef;
  /** Request-scoped tracing settings, kept out of the provider-visible call context. */
  tracingConfig?: TestSuite['tracing'];
}

const providerCallExecutionContext = new AsyncLocalStorage<ProviderCallExecutionContext>();

export function getProviderCallExecutionContext(): ProviderCallExecutionContext | undefined {
  return providerCallExecutionContext.getStore();
}

export function withProviderCallExecutionContext<T>(
  context: ProviderCallExecutionContext,
  fn: () => Promise<T>,
): Promise<T> {
  return providerCallExecutionContext.run(context, fn);
}
