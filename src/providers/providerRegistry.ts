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
  private providers: Set<CleanupProvider> = new Set();
  private shutdownRegistered: boolean = false;
  private shutdownPromise: Promise<void> | null = null;

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

  private registerShutdownHandlers(): void {
    let shuttingDown = false;

    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        return; // Prevent duplicate shutdown
      }
      shuttingDown = true;

      logger.debug(`Received ${signal}, shutting down ${this.providers.size} Python providers...`);

      await this.shutdownAll();

      logger.debug('Python provider shutdown complete');
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    // Use beforeExit for async cleanup (exit event cannot await)
    process.once('beforeExit', () => void shutdown('beforeExit'));
  }

  async shutdownAll(): Promise<void> {
    const providers = Array.from(this.providers);
    // Release only this snapshot. Providers registered during cleanup belong to
    // a later lifetime and must remain available to the next shutdownAll call.
    this.providers.clear();
    const previousShutdown = this.shutdownPromise;
    const shutdown = (async () => {
      const results = await Promise.allSettled([
        ...(previousShutdown ? [previousShutdown] : []),
        ...providers.map((provider) => provider.shutdown()),
      ]);

      // Log any failures but don't throw - cleanup should be defensive.
      for (const result of results) {
        if (result.status === 'rejected') {
          logger.warn(`Error shutting down provider: ${result.reason}`);
        }
      }
    })();
    this.shutdownPromise = shutdown;

    try {
      await shutdown;
    } finally {
      if (this.shutdownPromise === shutdown) {
        this.shutdownPromise = null;
      }
    }
  }
}

export const providerRegistry = new ProviderRegistry();
