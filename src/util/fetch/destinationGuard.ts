import { AsyncLocalStorage } from 'node:async_hooks';

// Restricted local preview requests apply their destination check to cached fetches,
// network dispatch, and redirects. Concurrent CLI and server requests stay independent.
const destinationGuard = new AsyncLocalStorage<(url: string) => void>();

export function withFetchDestinationGuard<T>(check: (url: string) => void, run: () => T): T {
  return destinationGuard.run(check, run);
}

export function getFetchDestinationGuard() {
  return destinationGuard.getStore();
}
