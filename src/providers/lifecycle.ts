import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';
import { isApiProvider } from '../types/providers';
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
  if (providerRegistry.has(provider)) {
    await providerRegistry.shutdown(provider);
  } else {
    await provider.cleanup?.();
  }
}

/**
 * Own providers across calls, until terminal cleanup. Pending loads retain this
 * scope so they are disposed even if they finish after cleanup.
 */
export function createProviderCleanupScope() {
  const scope: ProviderScope = {
    owned: new Set(),
    cleaned: new Set(),
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
export async function withProviderCleanup<T>(
  operation: () => Promise<T>,
  hasFailure: () => boolean = () => false,
): Promise<T> {
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
      if (!failed && !hasFailure()) {
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

/** Exclude provider instances supplied by the caller when enrolling a loaded config. */
export function trackConfiguredProviders(providers: ApiProvider[], configured: unknown): void {
  const borrowed = new Set(
    (Array.isArray(configured) ? configured : [configured]).filter(isApiProvider),
  );
  for (const provider of providers) {
    if (!borrowed.has(provider)) {
      trackProvider(provider);
    }
  }
}
