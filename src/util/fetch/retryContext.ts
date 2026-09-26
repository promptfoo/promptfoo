import { AsyncLocalStorage } from 'node:async_hooks';

interface FetchRetryContext {
  maxRetries?: number;
}

const fetchRetryContext = new AsyncLocalStorage<FetchRetryContext>();

/**
 * Run `fn` with a fetch retry context so nested `fetchWithRetries` /
 * `fetchWithProxy` calls inherit the provider's configured `maxRetries`.
 *
 * When `maxRetries` is `undefined`, the new scope deliberately shadows any
 * outer provider context so providers without an override fall back to defaults.
 */
export function withFetchRetryContext<T>(
  maxRetries: number | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return fetchRetryContext.run({ maxRetries }, fn);
}

/**
 * Read the active context's `maxRetries`, or `undefined` when none is set.
 */
export function getFetchRetryContextMaxRetries(): number | undefined {
  return fetchRetryContext.getStore()?.maxRetries;
}
