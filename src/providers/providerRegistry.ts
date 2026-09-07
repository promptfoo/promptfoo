import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';

type CleanupProvider = { cleanup(): void | Promise<void> } | { shutdown(): void | Promise<void> };

function hasCleanupHook(provider: object): provider is CleanupProvider {
  return (
    ('cleanup' in provider && typeof provider.cleanup === 'function') ||
    ('shutdown' in provider && typeof provider.shutdown === 'function')
  );
}

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
  private scopesByProvider = new WeakMap<object, Set<ProviderScope>>();
  private cleanupsByProvider = new WeakMap<object, Promise<void>>();
  private shutdownRegistered = false;
  private shutdownPromise: Promise<void> | null = null;

  register(provider: CleanupProvider): void {
    let registration = this.providers.get(provider);
    if (!registration) {
      registration = { provider, scopes: new Set() };
      this.providers.set(provider, registration);
    }
    for (const owner of this.scopesByProvider.get(provider) ?? []) {
      this.claim(registration, owner);
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
    const scopeProviders = new Set(providers);
    // Retain ownership even before lazy initialization registers a resource. Another
    // evaluation may already be waiting for the same provider's startup promise.
    for (const provider of scopeProviders) {
      // Teardown can outlive the previous scope's registration. Do not let a new
      // evaluation use the same instance until that teardown has finished.
      while (this.cleanupsByProvider.has(provider)) {
        await this.cleanupsByProvider.get(provider);
      }
      let owners = this.scopesByProvider.get(provider);
      if (!owners) {
        owners = new Set();
        this.scopesByProvider.set(provider, owners);
      }
      owners.add(scope);
      if (hasCleanupHook(provider)) {
        this.scopeStorage.run(scope, () => this.register(provider));
      }
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
        for (const provider of scopeProviders) {
          const owners = this.scopesByProvider.get(provider);
          owners?.delete(scope);
          if (owners?.size === 0) {
            this.scopesByProvider.delete(provider);
          }
        }
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
    registration.cleanupPromise = Promise.resolve()
      .then(async () => {
        try {
          if ('shutdown' in provider) {
            await provider.shutdown();
          } else {
            await provider.cleanup();
          }
        } catch (error) {
          logger.warn(`Error shutting down provider: ${error}`);
        }
      })
      .finally(() => {
        if (this.cleanupsByProvider.get(provider) === registration.cleanupPromise) {
          this.cleanupsByProvider.delete(provider);
        }
      });
    this.cleanupsByProvider.set(provider, registration.cleanupPromise);
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
