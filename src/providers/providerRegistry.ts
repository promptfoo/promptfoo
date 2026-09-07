import logger from '../logger';

type CleanupProvider = { cleanup(): void | Promise<void> } | { shutdown(): void | Promise<void> };

/** Tracks resource-owning providers until evaluation or process shutdown. */
class ProviderRegistry {
  private providers = new Set<CleanupProvider>();
  private shutdownRegistered = false;
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
    const shutdown = (signal: string) => {
      logger.debug(`Received ${signal}, shutting down providers...`);
      void this.shutdownAll();
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    // The exit event cannot await asynchronous cleanup.
    process.once('beforeExit', () => shutdown('beforeExit'));
  }

  shutdownAll(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    const providers = [...this.providers];
    // Detach this batch before awaiting; newly registered resources belong to the next batch.
    this.providers.clear();
    this.shutdownPromise = Promise.allSettled(
      providers.map(async (provider) => {
        // Keep the legacy hook for providers whose shutdown does more than cleanup.
        if ('shutdown' in provider) {
          await provider.shutdown();
        } else {
          await provider.cleanup();
        }
      }),
    )
      .then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            logger.warn(`Error shutting down provider: ${result.reason}`);
          }
        }
      })
      .finally(() => {
        this.shutdownPromise = null;
      });
    return this.shutdownPromise;
  }
}

export const providerRegistry = new ProviderRegistry();
