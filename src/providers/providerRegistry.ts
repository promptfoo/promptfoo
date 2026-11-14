import logger from '../logger';

/**
 * Interface for providers that need cleanup on process exit.
 */
interface CleanupProvider {
  shutdown(): Promise<void>;
}

/**
 * Tracks resource-owning providers for cleanup after evals and on process exit.
 */
class ProviderRegistry {
  private providers: Set<CleanupProvider> = new Set();
  private shutdownRegistered: boolean = false;

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

  has(provider: unknown): boolean {
    return this.providers.has(provider as CleanupProvider);
  }

  async shutdown(provider: unknown): Promise<void> {
    const registered = provider as CleanupProvider;
    if (this.providers.delete(registered)) {
      try {
        await registered.shutdown();
      } catch (error) {
        this.providers.add(registered);
        throw error;
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
      await this.shutdownAll();
      logger.debug('Provider shutdown complete');
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    // Use beforeExit for async cleanup (exit event cannot await)
    process.once('beforeExit', () => void shutdown('beforeExit'));
  }

  async shutdownAll(): Promise<void> {
    const providers = Array.from(this.providers);
    // New resources registered during teardown belong to the next cleanup.
    this.providers.clear();
    const results = await Promise.allSettled(providers.map(async (p) => p.shutdown()));

    // Log any failures but don't throw - cleanup should be defensive
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(`Error shutting down provider: ${result.reason}`);
      }
    }
  }
}

export const providerRegistry = new ProviderRegistry();
