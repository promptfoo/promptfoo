import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';
import { providerRegistry } from './providerRegistry';

import type { ApiProvider } from '../types/providers';

interface ProviderScope {
  owned: Set<ApiProvider>;
  cleaned: WeakMap<ApiProvider, Promise<void>>;
  closed: boolean;
}

const providerScope = new AsyncLocalStorage<ProviderScope>();

export function cleanupProvider(provider: ApiProvider): Promise<void> {
  const cleaned = providerScope.getStore()?.cleaned;
  const pending = cleaned?.get(provider);
  if (pending) {
    return pending;
  }
  const release = providerRegistry.shutdown(provider);
  cleaned?.set(provider, release);
  return release;
}

/**
 * Own providers across calls, until terminal cleanup. Pending loads retain this
 * scope so they are disposed even if they finish after cleanup.
 */
export function createProviderCleanupScope() {
  const scope: ProviderScope = {
    owned: new Set(),
    cleaned: new WeakMap(),
    closed: false,
  };
  let cleanup: Promise<void> | undefined;
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      if (scope.closed) {
        throw new Error('Provider cleanup scope is closed');
      }
      const result = await providerScope.run(scope, operation);
      if (scope.closed) {
        throw new Error('Provider cleanup scope is closed');
      }
      return result;
    },
    cleanup(): Promise<void> {
      scope.closed = true;
      return (cleanup ??= providerScope.run(scope, async () => {
        const results = await Promise.allSettled([...scope.owned].map(cleanupProvider));
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') {
          throw failure.reason;
        }
      }));
    },
  };
}

/** Call sites explicitly enroll providers constructed for this operation. */
export async function withProviderCleanup<T>(operation: () => Promise<T>): Promise<T> {
  const scope = createProviderCleanupScope();
  let failed = false;
  try {
    return await scope.run(operation);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await scope.cleanup();
    } catch (error) {
      if (!failed) {
        throw error;
      }
      logger.warn('Provider cleanup failed after evaluation error', { error });
    }
  }
}

export function trackProvider<T extends ApiProvider>(provider: T): T {
  const scope = providerScope.getStore();
  if (!scope) {
    return provider;
  }
  scope.owned.add(provider);
  if (scope.closed) {
    // A sibling load may finish after a failed Promise.all has returned.
    void providerScope
      .run(scope, () => cleanupProvider(provider))
      .catch((error) => {
        logger.warn('Provider cleanup failed after evaluation error', { error });
      });
  }
  return provider;
}
