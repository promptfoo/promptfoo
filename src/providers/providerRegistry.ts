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
  private shutdownHandlers: Record<'SIGINT' | 'SIGTERM' | 'beforeExit', () => void> | null = null;
  private pendingShutdowns = 0;
  private shutdownPromise: Promise<void> | null = null;

  register(provider: CleanupProvider): void {
    this.providers.add(provider);

    if (!this.shutdownHandlers) {
      this.registerShutdownHandlers();
    }
  }

  unregister(provider: CleanupProvider): void {
    this.providers.delete(provider);
    this.removeIdleShutdownHandlers();
  }

  private removeIdleShutdownHandlers(): void {
    if (this.providers.size || this.pendingShutdowns || !this.shutdownHandlers) {
      return;
    }
    for (const [event, handler] of Object.entries(this.shutdownHandlers)) {
      process.removeListener(event, handler);
    }
    this.shutdownHandlers = null;
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

    this.shutdownHandlers = {
      SIGINT: () => void shutdown('SIGINT'),
      SIGTERM: () => void shutdown('SIGTERM'),
      // Use beforeExit for async cleanup (exit event cannot await).
      beforeExit: () => void shutdown('beforeExit'),
    };
    for (const [event, handler] of Object.entries(this.shutdownHandlers)) {
      process.once(event, handler);
    }
  }

  async shutdownAll(): Promise<void> {
    const providers = Array.from(this.providers);
    // Release only this snapshot. Providers registered during cleanup belong to
    // a later lifetime and must remain available to the next shutdownAll call.
    this.providers.clear();
    const previousShutdown = this.shutdownPromise;
    // A provider may unregister synchronously inside shutdown(). Keep ownership
    // before invoking it, until this cleanup and any earlier cleanup have settled.
    this.pendingShutdowns++;
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
      this.pendingShutdowns--;
      this.removeIdleShutdownHandlers();
    }
  }
}

export const providerRegistry = new ProviderRegistry();
