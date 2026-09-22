import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';

interface CleanupProvider {
  shutdown(): Promise<void>;
  shutdownForProcess?(): Promise<void>;
}

interface IdleCleanupProvider {
  id(): string;
  shutdown?: () => Promise<void>;
  cleanup?: () => void | Promise<void>;
  cleanupAfterEvaluation?: (context: { reason: 'evaluation-complete' }) => void | Promise<void>;
}

interface EvaluationScope {
  active: boolean;
  providers: Set<ProviderState>;
  resources: Set<ResourceState>;
}

interface ProviderState {
  provider: IdleCleanupProvider;
  users: Set<EvaluationScope>;
  resources: Set<ResourceState>;
  activeCalls: number;
  cleanupRequested: boolean;
  cleanup?: Promise<void>;
}

interface ResourceState {
  resource: CleanupProvider;
  users: Set<EvaluationScope>;
  providers: Set<ProviderState>;
  registered: boolean;
  release?: { promise: Promise<void>; start: (forProcess?: boolean) => Promise<void> };
}

class ProviderRegistry {
  private readonly evaluation = new AsyncLocalStorage<EvaluationScope>();
  private readonly currentProvider = new AsyncLocalStorage<ProviderState>();
  private readonly providers = new WeakMap<IdleCleanupProvider, ProviderState>();
  private readonly resources = new Map<CleanupProvider, ResourceState>();
  private shutdownRegistered = false;
  private processShutdown?: { start: (state: ResourceState) => void; promise: Promise<void> };

  /** Nested entry points share a scope; independent evaluations own their own providers. */
  async withEvaluation<T>(run: () => Promise<T>): Promise<T> {
    if (this.evaluation.getStore()?.active) {
      return run();
    }
    const scope: EvaluationScope = { active: true, providers: new Set(), resources: new Set() };
    return this.evaluation.run(scope, async () => {
      try {
        return await run();
      } finally {
        scope.active = false;
        await this.releaseEvaluation(scope);
      }
    });
  }

  /** Reserve a known provider during setup without taking ownership of a caller-supplied instance. */
  useProvider(provider: IdleCleanupProvider): Promise<void> | undefined {
    const scope = this.evaluation.getStore();
    if (!scope?.active) {
      return undefined;
    }
    return this.claimProvider(scope, this.getProvider(provider));
  }

  /** Keep a provider and any resources it opens alive until its actual call settles. */
  withProvider<T>(provider: IdleCleanupProvider, run: () => Promise<T>): Promise<T> {
    const scope = this.evaluation.getStore();
    if (!scope?.active) {
      return run();
    }
    const state = this.getProvider(provider);
    const ready = this.claimProvider(scope, state);
    state.activeCalls++;
    return this.currentProvider.run(state, async () => {
      try {
        if (ready) {
          await ready;
        }
        return await run();
      } finally {
        state.activeCalls--;
        const cleanup = this.maybeCleanupProvider(state);
        for (const resource of state.resources) {
          void this.maybeReleaseResource(
            resource,
            resource.resource === provider ? cleanup : undefined,
          );
        }
      }
    });
  }

  /** The CLI owns its loaded targets; a caller-supplied grader is only borrowed. */
  async cleanupWhenIdle(providers: Iterable<IdleCleanupProvider>): Promise<void> {
    const scope = this.evaluation.getStore();
    if (!scope?.active) {
      return;
    }
    const pending: Promise<void>[] = [];
    for (const provider of providers) {
      const state = this.getProvider(provider);
      state.cleanupRequested = true;
      const ready = this.claimProvider(scope, state);
      if (ready) {
        pending.push(ready);
      }
    }
    await Promise.all(pending);
  }

  /** Reserve a shared resource before using it, waiting if its preceding shutdown has started. */
  useResource(resource: CleanupProvider): Promise<void> | undefined {
    const state = this.resources.get(resource);
    if (!state) {
      return undefined;
    }
    const provider = this.currentProvider.getStore();
    if (provider?.activeCalls) {
      this.linkResource(provider, state);
    }
    const scope = this.evaluation.getStore();
    if (!scope?.active) {
      return provider?.activeCalls ? state.release?.promise : undefined;
    }
    this.claimResource(scope, state);
    return state.release?.promise;
  }

  register(resource: CleanupProvider): void {
    let state = this.resources.get(resource);
    if (!state) {
      state = { resource, users: new Set(), providers: new Set(), registered: false };
      this.resources.set(resource, state);
    }
    state.registered = true;
    if ('id' in resource && typeof resource.id === 'function') {
      const provider = this.providers.get(resource as CleanupProvider & IdleCleanupProvider);
      if (provider) {
        this.linkResource(provider, state);
      }
    }
    void this.useResource(resource);
    if (!this.shutdownRegistered) {
      this.registerShutdownHandlers();
      this.shutdownRegistered = true;
    }
    this.processShutdown?.start(state);
  }

  unregister(resource: CleanupProvider): void {
    const state = this.resources.get(resource);
    if (state) {
      state.registered = false;
      this.forgetResource(state);
    }
  }

  /** Force ordinary shutdown for all known resources, including pending idle releases. */
  async shutdownAll(): Promise<void> {
    const releases = [...this.resources.values()].map((state) => {
      void this.maybeReleaseResource(state, undefined, true);
      return state.release?.start();
    });
    await Promise.all(releases);
  }

  /** Process shutdown also starts any resources registered by an in-flight shutdown hook. */
  shutdownForProcess(): Promise<void> {
    if (this.processShutdown) {
      return this.processShutdown.promise;
    }
    const seen = new Set<CleanupProvider>();
    const pending = new Set<Promise<void>>();
    const start = (state: ResourceState) => {
      if (seen.has(state.resource)) {
        return;
      }
      seen.add(state.resource);
      void this.maybeReleaseResource(state, undefined, true, true);
      const release = state.release?.start(true);
      if (release) {
        pending.add(release);
      }
    };
    const shutdown = {
      start,
      promise: Promise.resolve()
        .then(async () => {
          for (const state of this.resources.values()) {
            start(state);
          }
          while (pending.size) {
            const batch = [...pending];
            await Promise.all(batch);
            for (const release of batch) {
              pending.delete(release);
            }
          }
        })
        .finally(() => {
          this.processShutdown = undefined;
        }),
    };
    this.processShutdown = shutdown;
    return shutdown.promise;
  }

  private getProvider(provider: IdleCleanupProvider): ProviderState {
    let state = this.providers.get(provider);
    if (!state) {
      state = {
        provider,
        users: new Set(),
        resources: new Set(),
        activeCalls: 0,
        cleanupRequested: false,
      };
      this.providers.set(provider, state);
    }
    if ('shutdown' in provider && typeof provider.shutdown === 'function') {
      const resource = this.resources.get(provider as IdleCleanupProvider & CleanupProvider);
      if (resource) {
        this.linkResource(state, resource);
      }
    }
    return state;
  }

  private linkResource(provider: ProviderState, resource: ResourceState): void {
    provider.resources.add(resource);
    resource.providers.add(provider);
    for (const scope of provider.users) {
      if (scope.active) {
        this.claimResource(scope, resource);
      }
    }
  }

  private claimProvider(
    scope: EvaluationScope,
    provider: ProviderState,
  ): Promise<void> | undefined {
    if (!scope.providers.has(provider)) {
      scope.providers.add(provider);
      provider.users.add(scope);
    }
    const pending: Promise<void>[] = [];
    if (provider.cleanup) {
      pending.push(provider.cleanup);
    }
    for (const resource of provider.resources) {
      if (resource.registered || resource.release) {
        this.claimResource(scope, resource);
        if (resource.release) {
          pending.push(resource.release.promise);
        }
      }
    }
    return pending.length ? Promise.all(pending).then(() => undefined) : undefined;
  }

  private claimResource(scope: EvaluationScope, resource: ResourceState): void {
    if (!scope.resources.has(resource)) {
      scope.resources.add(resource);
      resource.users.add(scope);
    }
  }

  private async releaseEvaluation(scope: EvaluationScope): Promise<void> {
    for (const provider of scope.providers) {
      provider.users.delete(scope);
    }
    for (const resource of scope.resources) {
      resource.users.delete(scope);
    }
    const pending: Promise<void>[] = [];
    for (const provider of scope.providers) {
      const cleanup = this.maybeCleanupProvider(provider);
      if (cleanup && provider.users.size === 0) {
        pending.push(cleanup);
      }
    }
    for (const resource of scope.resources) {
      const owner = [...resource.providers].find((state) => state.provider === resource.resource);
      const release = this.maybeReleaseResource(resource, owner?.cleanup);
      if (release && resource.users.size === 0) {
        pending.push(release);
      }
      this.forgetResource(resource);
    }
    await Promise.all(pending);
  }

  private maybeCleanupProvider(state: ProviderState): Promise<void> | undefined {
    if (state.cleanup || state.users.size || state.activeCalls || !state.cleanupRequested) {
      return state.cleanup;
    }
    state.cleanupRequested = false;
    const cleanup = Promise.resolve()
      .then(() =>
        state.provider.cleanupAfterEvaluation
          ? state.provider.cleanupAfterEvaluation({ reason: 'evaluation-complete' })
          : state.provider.cleanup?.(),
      )
      .catch((error) => {
        logger.warn('Provider cleanup failed after evaluation.', { error });
      })
      .finally(() => {
        if (state.cleanup === cleanup) {
          state.cleanup = undefined;
        }
      });
    state.cleanup = cleanup;
    return cleanup;
  }

  private maybeReleaseResource(
    state: ResourceState,
    prerequisite?: Promise<void>,
    force = false,
    forProcess = false,
  ): Promise<void> | undefined {
    if (state.release) {
      return state.release.promise;
    }
    if (
      !state.registered ||
      (!force &&
        (state.users.size || [...state.providers].some((provider) => provider.activeCalls > 0)))
    ) {
      return undefined;
    }
    let finish!: () => void;
    const promise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let actual: Promise<void> | undefined;
    let processActual: Promise<void> | undefined;
    const finishRelease = () => {
      if (state.release?.promise === promise) {
        state.release = undefined;
      }
      this.forgetResource(state);
      finish();
    };
    const run = (shutdown: () => Promise<void>) =>
      Promise.resolve()
        .then(shutdown)
        .catch((error) => {
          logger.warn('Error shutting down provider: ' + String(error));
        });
    const start = (forProcess = false) => {
      if (forProcess && state.resource.shutdownForProcess) {
        if (!processActual) {
          state.registered = false;
          processActual = run(() => state.resource.shutdownForProcess!());
          if (!actual) {
            actual = processActual.then(finishRelease);
            processActual = actual;
          }
        }
        return processActual;
      }
      if (!actual) {
        state.registered = false;
        actual = run(() => state.resource.shutdown()).then(finishRelease);
      }
      return actual;
    };
    state.release = { promise, start };
    if (prerequisite) {
      void prerequisite.then(
        () => start(forProcess),
        () => start(forProcess),
      );
    } else {
      void start(forProcess);
    }
    return promise;
  }

  private forgetResource(state: ResourceState): void {
    if (state.registered || state.release || state.users.size) {
      return;
    }
    if (this.resources.get(state.resource) === state) {
      this.resources.delete(state.resource);
    }
    for (const provider of state.providers) {
      provider.resources.delete(state);
    }
    state.providers.clear();
  }

  private registerShutdownHandlers(): void {
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      logger.debug(
        'Received ' + signal + ', shutting down ' + this.resources.size + ' provider resources...',
      );
      await this.shutdownForProcess();
      logger.debug('Provider resource shutdown complete');
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    process.once('beforeExit', () => void shutdown('beforeExit'));
  }
}

export const providerRegistry = new ProviderRegistry();
