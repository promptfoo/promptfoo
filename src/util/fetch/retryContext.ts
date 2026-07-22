import { AsyncLocalStorage } from 'node:async_hooks';

interface FetchRetryContext {
  maxRetries?: number;
  schedulerOwnsRetries?: boolean;
}

const fetchRetryContext = new AsyncLocalStorage<FetchRetryContext>();

/**
 * Run `fn` with a fetch retry context so nested transport calls inherit the
 * provider's retry budget or leave retries to the scheduler.
 *
 * When `maxRetries` is `undefined`, the new scope deliberately shadows any
 * outer provider context so providers without an override fall back to defaults.
 */
export function withFetchRetryContext<T>(
  maxRetries: number | undefined,
  fn: () => Promise<T>,
  options?: { schedulerOwnsRetries?: boolean },
): Promise<T> {
  return fetchRetryContext.run({ maxRetries, ...options }, fn);
}

/**
 * Read the active context's `maxRetries`, or `undefined` when none is set.
 */
export function getFetchRetryContextMaxRetries(): number | undefined {
  return fetchRetryContext.getStore()?.maxRetries;
}

export function doesSchedulerOwnFetchRetries(): boolean {
  return fetchRetryContext.getStore()?.schedulerOwnsRetries === true;
}
