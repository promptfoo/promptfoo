import { AsyncLocalStorage } from 'node:async_hooks';

interface FetchRetryContext {
  maxRetries?: number;
}

const fetchRetryContext = new AsyncLocalStorage<FetchRetryContext>();

export function runWithFetchRetryContext<T>(
  maxRetries: number | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (maxRetries === undefined) {
    return fn();
  }
  return fetchRetryContext.run({ maxRetries }, fn);
}

export function getFetchRetryContextMaxRetries(): number | undefined {
  return fetchRetryContext.getStore()?.maxRetries;
}
