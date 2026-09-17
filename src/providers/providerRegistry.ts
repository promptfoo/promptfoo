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
  private activeEvaluations = 0;
  private pendingShutdown?: Promise<void>;

  async withEvaluation<T>(run: () => Promise<T>): Promise<T> {
    // Reserve before waiting: another evaluator's finalizer must not close
    // resources while this evaluation constructs or lazily registers providers.
    this.activeEvaluations++;
    try {
      await this.pendingShutdown;
      return await run();
    } finally {
      this.activeEvaluations--;
      if (this.activeEvaluations === 0) {
        const shutdown = this.pendingShutdown ?? Promise.resolve().then(() => this.shutdownAll());
        this.pendingShutdown = shutdown;
        try {
          await shutdown;
        } finally {
          if (this.pendingShutdown === shutdown) {
            this.pendingShutdown = undefined;
          }
        }
      }
    }
  }

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

      // Process termination still closes all resources, regardless of active evaluations.
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
    // Remove only this snapshot before invoking user code, preserving registrations
    // made during asynchronous shutdown and preventing duplicate cleanup on reentry.
    for (const provider of providers) {
      this.providers.delete(provider);
    }
    const results = await Promise.allSettled(
      providers.map((provider) => Promise.resolve().then(() => provider.shutdown())),
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
