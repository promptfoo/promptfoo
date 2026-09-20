import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';

/**
 * Interface for providers that need cleanup on process exit.
 */
interface CleanupProvider {
  shutdown(): Promise<void>;
}

interface ProviderEvaluationScope {
  providers: Set<CleanupProvider>;
  closed: boolean;
}

/**
 * Global registry for cleaning up provider resources and processes. Providers can opt in
 * to evaluation ownership when their resources must outlive individual calls.
 */
class ProviderRegistry {
  private providers: Set<CleanupProvider> = new Set();
  private shutdownRegistered: boolean = false;
  private readonly evaluationScope = new AsyncLocalStorage<ProviderEvaluationScope>();
  private readonly evaluationOwners = new WeakMap<CleanupProvider, Set<ProviderEvaluationScope>>();

  register(provider: CleanupProvider): void {
    this.providers.add(provider);

    if (!this.shutdownRegistered) {
      this.registerShutdownHandlers();
      this.shutdownRegistered = true;
    }
  }

  unregister(provider: CleanupProvider): void {
    this.providers.delete(provider);
  }

  registerScoped(provider: CleanupProvider): void {
    this.register(provider);
    const scope = this.evaluationScope.getStore();
    if (!scope || scope.closed || scope.providers.has(provider)) {
      return;
    }
    scope.providers.add(provider);
    let owners = this.evaluationOwners.get(provider);
    if (!owners) {
      owners = new Set();
      this.evaluationOwners.set(provider, owners);
    }
    owners.add(scope);
  }

  withEvaluationScope<T>(run: () => Promise<T>): Promise<T> {
    const scope: ProviderEvaluationScope = { providers: new Set(), closed: false };
    return this.evaluationScope.run(scope, async () => {
      try {
        return await run();
      } finally {
        // Also release ownership when evaluation exits before its usual cleanup block.
        await this.shutdownEvaluation();
      }
    });
  }

  async shutdownEvaluation(): Promise<void> {
    const scope = this.evaluationScope.getStore();
    if (!scope) {
      return this.shutdownAll();
    }
    if (scope.closed) {
      return;
    }
    scope.closed = true;
    for (const provider of scope.providers) {
      const owners = this.evaluationOwners.get(provider);
      owners?.delete(scope);
      if (owners?.size === 0) {
        this.evaluationOwners.delete(provider);
      }
    }
    scope.providers.clear();

    // Legacy providers keep their existing global evaluation cleanup. Opted-in providers
    // remain registered until the last evaluation that used them has finished.
    const available = [...this.providers].filter(
      (provider) => !this.evaluationOwners.get(provider)?.size,
    );
    return this.shutdownProviders(available);
  }

  private registerShutdownHandlers(): void {
    let shuttingDown = false;

    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        return; // Prevent duplicate shutdown
      }
      shuttingDown = true;

      logger.debug(`Received ${signal}, shutting down ${this.providers.size} Python providers...`);

      await Promise.all(
        Array.from(this.providers).map((p) =>
          p.shutdown().catch((err) => {
            logger.error(`Error shutting down provider: ${err}`);
          }),
        ),
      );

      logger.debug('Python provider shutdown complete');
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    // Use beforeExit for async cleanup (exit event cannot await)
    process.once('beforeExit', () => void shutdown('beforeExit'));
  }

  shutdownAll(): Promise<void> {
    return this.shutdownProviders([...this.providers]);
  }

  private async shutdownProviders(providers: CleanupProvider[]): Promise<void> {
    // Take the current registrations before invoking shutdown. Providers can register again
    // while this batch drains, and a later evaluation must still be able to find them.
    for (const provider of providers) {
      this.providers.delete(provider);
    }
    const results = await Promise.allSettled(
      providers.map((provider) => {
        try {
          return provider.shutdown();
        } catch (error) {
          return Promise.reject(error);
        }
      }),
    );

    // Log any failures but don't throw - cleanup should be defensive
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(`Error shutting down provider: ${result.reason}`);
      }
    }
  }
}

export const providerRegistry = new ProviderRegistry();
