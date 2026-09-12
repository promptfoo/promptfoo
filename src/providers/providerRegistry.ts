import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';

/**
 * Interface for providers that need cleanup on process exit.
 */
interface CleanupProvider {
  shutdown(): Promise<void> | void;
}

/**
 * Global registry of Python providers for cleanup on process exit.
 * Ensures no zombie Python processes are left running.
 */
class ProviderRegistry {
  private providers = new Map<CleanupProvider, Set<object | undefined>>();
  private closing = new Map<CleanupProvider, Promise<void>>();
  private scope = new AsyncLocalStorage<object>();
  private shutdownRegistered: boolean = false;

  register(provider: CleanupProvider): void {
    const scope = this.scope.getStore();
    const owners = this.providers.get(provider) ?? new Set<object | undefined>();
    if (scope) {
      owners.delete(undefined);
    }
    owners.add(scope);
    this.providers.set(provider, owners);

    if (!this.shutdownRegistered) {
      this.registerShutdownHandlers();
      this.shutdownRegistered = true;
    }
  }

  async adopt(provider: object): Promise<void> {
    if ('shutdown' in provider && typeof provider.shutdown === 'function') {
      const cleanupProvider = provider as CleanupProvider;
      await this.closing.get(cleanupProvider);
      this.register(cleanupProvider);
    }
  }

  unregister(provider: CleanupProvider): void {
    this.providers.delete(provider);
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
        Array.from(this.providers.keys()).map((p) =>
          Promise.resolve()
            .then(() => p.shutdown())
            .catch((err) => {
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

  async withScope<T>(callback: () => Promise<T>): Promise<T> {
    return this.scope.run({}, async () => {
      try {
        return await callback();
      } finally {
        await this.shutdownAll();
      }
    });
  }

  async shutdownAll(): Promise<void> {
    const scope = this.scope.getStore();
    const pending: Promise<void>[] = [];
    for (const [provider, owners] of this.providers) {
      if (!owners.delete(scope) || owners.size > 0) {
        continue;
      }
      this.providers.delete(provider);
      const closing = Promise.resolve()
        .then(() => provider.shutdown())
        .catch((error) => logger.warn(`Error shutting down provider: ${error}`))
        .finally(() => this.closing.delete(provider));
      this.closing.set(provider, closing);
      pending.push(closing);
    }
    await Promise.all(pending);
  }
}

export const providerRegistry = new ProviderRegistry();
