import { AsyncLocalStorage } from 'node:async_hooks';

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
  private readonly scopeContext = new AsyncLocalStorage<object>();
  private readonly closedScopes = new WeakSet<object>();

  get currentScope(): object | undefined {
    return this.scopeContext.getStore();
  }

  async withScope<T>(fn: () => Promise<T>): Promise<T> {
    const scope = {};
    return this.scopeContext.run(scope, async () => {
      try {
        return await fn();
      } finally {
        this.closedScopes.add(scope);
        await this.shutdownAll(scope);
      }
    });
  }

  register(
    provider: CleanupProvider,
    scope: object | undefined = this.currentScope,
    manageProcessSignals = true,
  ): void {
    if (scope && this.closedScopes.has(scope)) {
      // Timed-out work can resume in its original async scope after evaluation
      // cleanup. Let the caller finish assigning its initialization promise,
      // then release that resource without retaining it in the registry.
      void Promise.resolve()
        .then(() => provider.shutdown())
        .catch((error) => logger.warn('Error shutting down late provider', { error }));
      return;
    }
    this.providers.set(provider, scope);

    if (manageProcessSignals && !this.shutdownRegistered) {
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
