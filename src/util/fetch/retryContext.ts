import { AsyncLocalStorage } from 'node:async_hooks';

interface FetchRetryContext {
  maxRetries?: number;
  singleAttempt?: boolean;
}

const fetchRetryContext = new AsyncLocalStorage<FetchRetryContext>();

/** A stateful trial may have committed before an HTTP error. Never replay its ID. */
export function withSingleAttempt<T>(fn: () => Promise<T>): Promise<T> {
  return fetchRetryContext.run({ singleAttempt: true, maxRetries: 0 }, fn);
}

export function requiresSingleAttempt(): boolean {
  return fetchRetryContext.getStore()?.singleAttempt === true;
}

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
  if (requiresSingleAttempt()) {
    return fn();
  }
  return fetchRetryContext.run({ maxRetries }, fn);
}

/**
 * Explicit retry counts override provider defaults except for a single-attempt dispatch.
 */
export function getFetchRetryContextMaxRetries(requested?: number): number | undefined {
  const context = fetchRetryContext.getStore();
  return context?.singleAttempt ? 0 : (requested ?? context?.maxRetries);
}
