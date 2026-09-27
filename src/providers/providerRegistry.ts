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
  private shutdownHandlers: Partial<
    Record<'SIGINT' | 'SIGTERM' | 'beforeExit', () => void>
  > | null = null;
  private beforeExitAttempts = new WeakSet<CleanupProvider>();
  private pendingShutdowns = 0;
  private shutdownPromise: Promise<void> | null = null;

  register(provider: CleanupProvider): void {
    this.providers.add(provider);

    if (
      !this.shutdownHandlers ||
      (!this.pendingShutdowns &&
        !this.shutdownHandlers.beforeExit &&
        !this.beforeExitAttempts.has(provider))
    ) {
      this.removeShutdownHandlers();
      this.registerShutdownHandlers();
    }
  }

  unregister(provider: CleanupProvider): void {
    this.providers.delete(provider);
    this.beforeExitAttempts.delete(provider);
    this.removeIdleShutdownHandlers();
  }

  private removeIdleShutdownHandlers(): void {
    if (this.providers.size || this.pendingShutdowns || !this.shutdownHandlers) {
      return;
    }
    this.removeShutdownHandlers();
  }

  private removeShutdownHandlers(): void {
    for (const [event, handler] of Object.entries(this.shutdownHandlers ?? {})) {
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

      try {
        await this.shutdownAll(signal === 'beforeExit');
        logger.debug('Python provider shutdown complete');
      } finally {
        // A once handler has been consumed. New registrations during cleanup
        // must receive a fresh set without removing any host-owned listeners.
        if (this.shutdownHandlers === handlers) {
          this.removeShutdownHandlers();
          if (this.providers.size || this.pendingShutdowns) {
            this.registerShutdownHandlers();
          }
        }
      }
    };

    const handlers = {
      SIGINT: () => void shutdown('SIGINT'),
      SIGTERM: () => void shutdown('SIGTERM'),
      // A failed owner remains available to explicit cleanup and signals, but
      // cannot repeatedly keep Node alive by scheduling work from beforeExit.
      ...(Array.from(this.providers).some((provider) => !this.beforeExitAttempts.has(provider))
        ? { beforeExit: () => void shutdown('beforeExit') }
        : {}),
    };
    this.shutdownHandlers = handlers;
    for (const [event, handler] of Object.entries(handlers)) {
      process.once(event, handler);
    }
  }

  async shutdownAll(beforeExit = false): Promise<void> {
    const providers = Array.from(this.providers).filter(
      (provider) => !beforeExit || !this.beforeExitAttempts.has(provider),
    );
    // Release only this snapshot. Providers registered during cleanup belong to
    // a later lifetime and must remain available to the next shutdownAll call.
    for (const provider of providers) {
      this.providers.delete(provider);
      if (beforeExit) {
        this.beforeExitAttempts.add(provider);
      }
    }
    const previousShutdown = this.shutdownPromise;
    // A provider may unregister synchronously inside shutdown(). Keep ownership
    // before invoking it, until this cleanup and any earlier cleanup have settled.
    this.pendingShutdowns++;
    const shutdown = (async () => {
      const results = await Promise.allSettled([
        ...(previousShutdown ? [previousShutdown] : []),
        ...providers.map(async (provider) => {
          try {
            await provider.shutdown();
            this.beforeExitAttempts.delete(provider);
          } catch (error) {
            this.providers.add(provider);
            throw error;
          }
        }),
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
