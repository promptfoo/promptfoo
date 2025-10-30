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

    const shutdown = async (signal: NodeJS.Signals | 'beforeExit') => {
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

    const handleSignal = (signal: NodeJS.Signals) => {
      const exitCode = signal === 'SIGTERM' ? 143 : undefined;

      void shutdown(signal).finally(() => {
        if (exitCode !== undefined) {
          process.exit(exitCode);
        }
      });
    };

    // SIGINT is handled by eval.ts to avoid conflicts with AbortController
    process.once('SIGTERM', () => handleSignal('SIGTERM'));
    // Use beforeExit for async cleanup (exit event cannot await)
    process.once('beforeExit', () => void shutdown('beforeExit'));
  }

  async shutdownAll(): Promise<void> {
    const results = await Promise.allSettled(Array.from(this.providers).map((p) => p.shutdown()));

    // Log any failures but don't throw - cleanup should be defensive
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(`Error shutting down provider: ${result.reason}`);
      }
    }

    this.providers.clear();
  }
}

export const providerRegistry = new ProviderRegistry();
