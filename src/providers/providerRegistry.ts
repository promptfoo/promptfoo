import logger from '../logger';

/**
 * Interface for providers that need cleanup on process exit.
 */
interface CleanupProvider {
  shutdown(): Promise<void>;
}

/** The part of an ApiProvider that idle cleanup uses. */
interface IdleCleanupProvider {
  id(): string;
  cleanup?: (context: { reason: 'evaluation-complete' }) => void | Promise<void>;
}

/**
 * Global registry of provider resources, released once no evaluation is active and on
 * process exit. Ensures no zombie Python processes are left running.
 */
class ProviderRegistry {
  private providers: Set<CleanupProvider> = new Set();
  private shutdownRegistered: boolean = false;
  private activeEvaluations = 0;
  private idleCleanups = new Set<IdleCleanupProvider>();
  private idleShutdown?: Promise<void>;

  /**
   * Run `run` as an active evaluation. Registered resources, and providers passed to
   * `cleanupWhenIdle`, are released only after the last active evaluation finishes, so one
   * evaluation finishing never closes a provider another is still using. A new evaluation
   * waits for an in-progress release before it starts.
   */
  async withEvaluation<T>(run: () => Promise<T>): Promise<T> {
    // Count synchronously: setup that loads or registers providers is covered too.
    this.activeEvaluations++;
    try {
      await this.idleShutdown;
      return await run();
    } finally {
      if (--this.activeEvaluations === 0) {
        const shutdown = this.releaseIdleResources();
        this.idleShutdown = shutdown;
        await shutdown;
        if (this.idleShutdown === shutdown) {
          this.idleShutdown = undefined;
        }
      }
    }
  }

  /** Call `cleanup()` once, after the last active evaluation finishes. */
  cleanupWhenIdle(providers: Iterable<IdleCleanupProvider>): void {
    for (const provider of providers) {
      this.idleCleanups.add(provider);
    }
  }

  private async releaseIdleResources(): Promise<void> {
    const providers = [...this.idleCleanups];
    this.idleCleanups.clear();
    const results = await Promise.allSettled(
      providers.map((provider) =>
        Promise.resolve().then(() => provider.cleanup?.({ reason: 'evaluation-complete' })),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn('Provider cleanup failed after evaluation.', { error: result.reason });
      }
    }
    await this.shutdownAll();
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
