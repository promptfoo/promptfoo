import logger from '../logger';

/**
 * Interface for providers that need cleanup on process exit.
 */
interface CleanupProvider {
  shutdown(): Promise<void>;
}

/**
 * Registry of provider resources, optionally owned by one evaluation environment.
 */
class ProviderRegistry {
  private providers = new Map<CleanupProvider, object | undefined>();
  private shutdownRegistered: boolean = false;

  register(provider: CleanupProvider, scope?: object): void {
    this.providers.set(provider, scope);

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

      logger.debug(
        `Received ${signal}, shutting down ${this.providers.size} provider resources...`,
      );
      await this.shutdownAll();
      logger.debug('Provider shutdown complete');
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    // Use beforeExit for async cleanup (exit event cannot await)
    process.once('beforeExit', () => void shutdown('beforeExit'));
  }

  async shutdownAll(scope?: object): Promise<void> {
    const providers = [...this.providers]
      .filter(([, owner]) => !scope || !owner || owner === scope)
      .map(([provider]) => provider);
    // Remove this batch before awaiting it; cleanup may register new resources.
    providers.forEach((provider) => this.providers.delete(provider));
    const results = await Promise.allSettled(providers.map((provider) => provider.shutdown()));

    // Log any failures but don't throw - cleanup should be defensive
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(`Error shutting down provider: ${result.reason}`);
      }
    }
  }
}

export const providerRegistry = new ProviderRegistry();
