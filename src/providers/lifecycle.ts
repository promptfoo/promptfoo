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

export function hasProviderCleanupScope(): boolean {
  return providerScope.getStore() !== undefined;
}

/** Call sites explicitly enroll providers constructed for this operation. */
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

export function trackProvider<T extends ApiProvider>(provider: T): T {
  const scope = providerScope.getStore();
  if (!scope) {
    return provider;
  }
  scope.owned.add(provider);
  if (scope.closed) {
    // A sibling load may finish after a failed Promise.all has returned.
    void cleanupProvider(provider).catch((error) => {
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
