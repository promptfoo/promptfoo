import { AsyncLocalStorage } from 'node:async_hooks';

interface FetchRetryContext {
  maxRetries?: number;
  owner: 'fetch' | 'scheduler';
}

const fetchRetryContext = new AsyncLocalStorage<FetchRetryContext>();

/**
 * Run `fn` with a provider retry context. While the scheduler owns retries,
 * nested transport calls make one attempt instead of retrying independently.
 *
 * When `maxRetries` is `undefined`, the new scope deliberately shadows any
 * outer provider context so providers without an override fall back to defaults.
 */
export function withFetchRetryContext<T>(
  maxRetries: number | undefined,
  fn: () => Promise<T>,
  owner: 'fetch' | 'scheduler' = 'fetch',
): Promise<T> {
  return fetchRetryContext.run({ maxRetries, owner }, fn);
}

/**
 * Read the active context's `maxRetries`, or `undefined` when none is set.
 */
export function getFetchRetryContextMaxRetries(): number | undefined {
  return fetchRetryContext.getStore()?.maxRetries;
}

export function isFetchRetryManagedByScheduler(): boolean {
  return fetchRetryContext.getStore()?.owner === 'scheduler';
}
