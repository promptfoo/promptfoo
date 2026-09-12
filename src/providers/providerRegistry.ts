import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';

/**
 * Interface for providers that need cleanup on process exit.
 */
interface CleanupProvider {
  shutdown(): Promise<void>;
}

/**
 * Global registry of Python providers for cleanup on process exit.
 * Ensures no zombie Python processes are left running.
 */
class ProviderRegistry {
  private providers = new Map<CleanupProvider, object | undefined>();
  private scope = new AsyncLocalStorage<object>();
  private shutdownRegistered: boolean = false;

  register(provider: CleanupProvider): void {
    this.providers.set(provider, this.scope.getStore());

    if (!this.shutdownRegistered) {
      this.registerShutdownHandlers();
      this.shutdownRegistered = true;
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
    const providers = [...this.providers]
      .filter(([, owner]) => owner === scope)
      .map(([provider]) => provider);
    const results = await Promise.allSettled(providers.map((provider) => provider.shutdown()));

    // Log any failures but don't throw - cleanup should be defensive
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(`Error shutting down provider: ${result.reason}`);
      }
    }

    for (const provider of providers) {
      this.providers.delete(provider);
    }
  }
}

export const providerRegistry = new ProviderRegistry();
