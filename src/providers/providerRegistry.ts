import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';

interface CleanupProvider {
  shutdown?(): Promise<void> | void;
  cleanup?(): Promise<void> | void;
}

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
    const cleanupProvider = provider as CleanupProvider;
    if (
      typeof cleanupProvider.shutdown === 'function' ||
      typeof cleanupProvider.cleanup === 'function'
    ) {
      await this.closing.get(cleanupProvider);
      this.register(cleanupProvider);
    }
  }

  unregister(provider: CleanupProvider): void {
    this.providers.delete(provider);
  }

  private async close(provider: CleanupProvider): Promise<void> {
    for (const cleanup of [provider.shutdown, provider.cleanup]) {
      try {
        await cleanup?.call(provider);
      } catch (error) {
        logger.warn('Error cleaning up provider', { error });
      }
    }
  }

  private registerShutdownHandlers(): void {
    let shuttingDown = false;

    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        return; // Prevent duplicate shutdown
      }
      shuttingDown = true;

      logger.debug(`Received ${signal}, shutting down ${this.providers.size} providers...`);

      await Promise.all(Array.from(this.providers.keys(), (provider) => this.close(provider)));

      logger.debug('Provider shutdown complete');
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
        .then(() => this.close(provider))
        .finally(() => this.closing.delete(provider));
      this.closing.set(provider, closing);
      pending.push(closing);
    }
    await Promise.all(pending);
  }
}

export const providerRegistry = new ProviderRegistry();
