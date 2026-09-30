import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';
import { providerRegistry } from './providerRegistry';

import type { ApiProvider } from '../types/providers';

interface ProviderScope {
  owned: Set<ApiProvider>;
  cleaned: Set<ApiProvider>;
  closed: boolean;
}

const providerScope = new AsyncLocalStorage<ProviderScope>();

export async function cleanupProvider(provider: ApiProvider): Promise<void> {
  const scope = providerScope.getStore();
  if (scope?.cleaned.has(provider)) {
    return;
  }
  scope?.cleaned.add(provider);
  await provider.cleanup?.();
}

/** Only providers constructed within the operation belong to this scope. */
export async function withProviderCleanup<T>(
  operation: () => Promise<T>,
  hasFailure: () => boolean = () => false,
): Promise<T> {
  const scope: ProviderScope = { owned: new Set(), cleaned: new Set(), closed: false };
  return providerScope.run(scope, async () => {
    let failed = false;
    try {
      return await operation();
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      scope.closed = true;
      const results = await Promise.allSettled([...scope.owned].map(cleanupProvider));
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') {
        if (!failed && !hasFailure()) {
          throw failure.reason;
        }
        logger.warn('Provider cleanup failed after evaluation error', { error: failure.reason });
      }
    }
  });
}

export function trackProvider(provider: ApiProvider): void {
  const scope = providerScope.getStore();
  if (!scope || providerRegistry.has(provider)) {
    return;
  }
  scope.owned.add(provider);
  if (scope.closed) {
    // A sibling load may finish after a failed Promise.all has returned.
    void cleanupProvider(provider).catch((error) => {
      logger.warn('Provider cleanup failed after evaluation error', { error });
    });
  }
}
