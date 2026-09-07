import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';

type CleanupProvider = { cleanup(): void | Promise<void> } | { shutdown(): void | Promise<void> };

interface ProviderScope {
  registrations: Set<ProviderRegistration>;
  closed: boolean;
}

interface ProviderRegistration {
  provider: CleanupProvider;
  scopes: Set<ProviderScope>;
  cleanupPromise?: Promise<void>;
}

/** Tracks evaluation ownership while retaining process-exit cleanup for unscoped resources. */
class ProviderRegistry {
  private providers = new Map<object, ProviderRegistration>();
  private scopeStorage = new AsyncLocalStorage<ProviderScope>();
  private shutdownRegistered = false;
  private shutdownPromise: Promise<void> | null = null;

  register(provider: CleanupProvider): void {
    let registration = this.providers.get(provider);
    if (!registration) {
      registration = { provider, scopes: new Set() };
      this.providers.set(provider, registration);
    }
    const scope = this.scopeStorage.getStore();
    if (scope && !scope.closed) {
      this.claim(registration, scope);
    }
    if (!this.shutdownRegistered) {
      this.registerShutdownHandlers();
      this.shutdownRegistered = true;
    }
  }

  unregister(provider: CleanupProvider): void {
    const registration = this.providers.get(provider);
    if (registration) {
      for (const scope of registration.scopes) {
        scope.registrations.delete(registration);
      }
      this.providers.delete(provider);
    }
  }

  private claim(registration: ProviderRegistration, scope: ProviderScope): void {
    scope.registrations.add(registration);
    registration.scopes.add(scope);
  }

  async withScope<T>(providers: Iterable<object>, run: () => Promise<T>): Promise<T> {
    const scope: ProviderScope = { registrations: new Set(), closed: false };
    // Providers may be constructed before evaluation begins. Claim known instances now;
    // register() also claims resources initialized lazily anywhere inside this async scope.
    for (const provider of providers) {
      const registration = this.providers.get(provider);
      if (registration) {
        this.claim(registration, scope);
      }
    }
    return this.scopeStorage.run(scope, async () => {
      try {
        return await run();
      } finally {
        scope.closed = true;
        const registrations = [...scope.registrations];
        scope.registrations.clear();
        await Promise.all(
          registrations.map((registration) => {
            registration.scopes.delete(scope);
            if (registration.scopes.size === 0) {
              return this.cleanupRegistration(registration);
            }
          }),
        );
      }
    });
  }

  private registerShutdownHandlers(): void {
    const shutdown = (signal: string) => {
      logger.debug(`Received ${signal}, shutting down providers...`);
      void this.shutdownAll();
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('beforeExit', () => shutdown('beforeExit'));
  }

  private cleanupRegistration(registration: ProviderRegistration): Promise<void> {
    if (registration.cleanupPromise) {
      return registration.cleanupPromise;
    }
    const { provider } = registration;
    // A reused provider can acquire a new registration while old cleanup finishes.
    if (this.providers.get(provider) === registration) {
      this.providers.delete(provider);
    }
    registration.cleanupPromise = (async () => {
      try {
        if ('shutdown' in provider) {
          await provider.shutdown();
        } else {
          await provider.cleanup();
        }
      } catch (error) {
        logger.warn(`Error shutting down provider: ${error}`);
      }
    })();
    return registration.cleanupPromise;
  }

  /** Process shutdown and explicit caller cleanup; evaluations use withScope instead. */
  shutdownAll(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }
    const registrations = [...this.providers.values()];
    this.shutdownPromise = Promise.all(
      registrations.map((registration) => this.cleanupRegistration(registration)),
    )
      .then(() => undefined)
      .finally(() => {
        this.shutdownPromise = null;
      });
    return this.shutdownPromise;
  }
}

export const providerRegistry = new ProviderRegistry();
