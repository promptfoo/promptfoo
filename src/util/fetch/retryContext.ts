import { AsyncLocalStorage } from 'node:async_hooks';

interface FetchRetryContext {
  maxRetries?: number;
}

const fetchRetryContext = new AsyncLocalStorage<FetchRetryContext>();
const DEFAULT_FETCH_RETRIES = 4;

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

/** Resolve an explicit or contextual retry budget to the shared fetch default. */
export function resolveFetchRetryMaxRetries(maxRetries?: number): number {
  const resolved = maxRetries ?? getFetchRetryContextMaxRetries() ?? DEFAULT_FETCH_RETRIES;
  if (!Number.isFinite(resolved)) {
    return DEFAULT_FETCH_RETRIES;
  }
  return Math.max(0, Math.floor(resolved));
}
