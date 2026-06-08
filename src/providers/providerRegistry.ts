import logger from '../logger';

/**
 * Lifecycle method for providers and other resources that need cleanup.
 */
export type ProviderLifecycleMethod = () => void | Promise<void>;

/**
 * Lifecycle contract for registered providers and resources.
 *
 * When both methods are present, `shutdown()` takes precedence.
 */
export type ProviderLifecycle =
  | {
      shutdown: ProviderLifecycleMethod;
      cleanup?: ProviderLifecycleMethod;
    }
  | {
      shutdown?: never;
      cleanup: ProviderLifecycleMethod;
    };

export interface ProviderRegistryOptions {
  registerProcessHandlers?: boolean;
}

/**
 * Registry of providers and resources that need cleanup.
 */
export class ProviderRegistry {
  private providers: Set<ProviderLifecycle> = new Set();
  private shutdownRegistered: boolean = false;
  private shutdownPromise?: Promise<void>;
  private readonly shouldRegisterProcessHandlers: boolean;

  constructor({ registerProcessHandlers = true }: ProviderRegistryOptions = {}) {
    this.shouldRegisterProcessHandlers = registerProcessHandlers;
  }

  register(provider: ProviderLifecycle): () => void {
    this.providers.add(provider);

    if (this.shouldRegisterProcessHandlers && !this.shutdownRegistered) {
      this.registerShutdownHandlers();
      this.shutdownRegistered = true;
    }

    return () => {
      this.unregister(provider);
    };
  }

  unregister(provider: ProviderLifecycle): void {
    this.providers.delete(provider);
  }

  private async cleanupResource(provider: ProviderLifecycle): Promise<void> {
    try {
      const cleanup = provider.shutdown ?? provider.cleanup;
      await cleanup.call(provider);
    } catch (error) {
      logger.warn(`Error cleaning up registered resource: ${error}`);
    }
  }

  private registerShutdownHandlers(): void {
    let shuttingDown = false;

    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      logger.debug(
        `Received ${signal}, cleaning up ${this.providers.size} registered resources...`,
      );

      await this.shutdownAll();

      logger.debug('Registered resource cleanup complete');
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    // `beforeExit` allows asynchronous cleanup; the `exit` event does not.
    process.once('beforeExit', () => void shutdown('beforeExit'));
  }

  shutdownAll(): Promise<void> {
    if (this.shutdownPromise !== undefined && this.providers.size === 0) {
      return this.shutdownPromise;
    }

    const providers = Array.from(this.providers);
    for (const provider of providers) {
      this.providers.delete(provider);
    }

    const previousShutdown = this.shutdownPromise;
    const cleanupBatch = async () => {
      await Promise.all(providers.map((provider) => this.cleanupResource(provider)));
    };
    let resolveBatch: (() => void) | undefined;
    let rejectBatch: ((error: unknown) => void) | undefined;
    const shutdownBatch = new Promise<void>((resolve, reject) => {
      resolveBatch = resolve;
      rejectBatch = reject;
    });
    const trackedShutdown = shutdownBatch.finally(() => {
      if (this.shutdownPromise === trackedShutdown) {
        this.shutdownPromise = undefined;
      }
    });
    this.shutdownPromise = trackedShutdown;

    const runBatch =
      previousShutdown === undefined ? cleanupBatch() : previousShutdown.then(cleanupBatch);
    void runBatch.then(resolveBatch, rejectBatch);
    return trackedShutdown;
  }
}

export const providerRegistry = new ProviderRegistry();
