import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';

interface CleanupProvider {
  shutdown(): Promise<void>;
}

interface IdleCleanupProvider {
  id(): string;
  shutdown?: () => Promise<void>;
  cleanup?: () => void | Promise<void>;
  cleanupAfterEvaluation?: (context: { reason: 'evaluation-complete' }) => void | Promise<void>;
}

interface EvaluationScope {
  active: boolean;
  closed: Promise<void>;
  close: () => void;
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
  processCleanup?: Promise<void>;
}

interface ResourceState {
  resource: CleanupProvider;
  users: Set<EvaluationScope>;
  providers: Set<ProviderState>;
  registered: boolean;
  registration: number;
  release?: { promise: Promise<void>; start: (force?: boolean) => Promise<void> };
}

export class ProviderRegistry {
  private readonly evaluation = new AsyncLocalStorage<EvaluationScope>();
  private readonly currentProvider = new AsyncLocalStorage<{
    state: ProviderState;
    signal?: AbortSignal;
  }>();
  private readonly releasingResource = new AsyncLocalStorage<{
    state: ResourceState;
    registration: number;
  }>();
  private readonly providers = new WeakMap<IdleCleanupProvider, ProviderState>();
  private readonly ownedProviders = new Set<ProviderState>();
  private readonly resources = new Map<CleanupProvider, ResourceState>();
  private readonly selfRegisteredProviders = new WeakSet<IdleCleanupProvider>();
  private readonly activeCalls = new Set<Promise<void>>();
  private readonly processReleases = new Set<Promise<void>>();
  private readonly processAbortController = new AbortController();
  private shutdownRegistered = false;
  private processShuttingDown = false;

  constructor(private readonly installProcessHandlers = true) {}

  /** Nested entry points share a scope; independent evaluations own their own providers. */
  async withEvaluation<T>(run: () => Promise<T>): Promise<T> {
    if (this.processShuttingDown) {
      throw this.processShutdownError();
    }
    if (this.evaluation.getStore()?.active) {
      return run();
    }
    let close!: () => void;
    const closed = new Promise<void>((resolve) => {
      close = resolve;
    });
    const scope: EvaluationScope = {
      active: true,
      closed,
      close,
      providers: new Set(),
      resources: new Set(),
    };
    return this.evaluation.run(scope, async () => {
      try {
        return await run();
      } finally {
        scope.active = false;
        scope.close();
        await this.releaseEvaluation(scope);
      }
    });
  }

  /** Reserve a known provider during setup without taking ownership of a caller-supplied instance. */
  useProvider(provider: IdleCleanupProvider, signal?: AbortSignal): Promise<void> | undefined {
    const scope = this.evaluation.getStore();
    if (signal?.aborted) {
      return Promise.reject(signal.reason);
    }
    if (this.processShuttingDown) {
      return Promise.reject(this.processShutdownError());
    }
    if (scope && !scope.active) {
      return Promise.reject(this.closedScopeError());
    }
    const ready = this.claimProvider(scope, this.getProvider(provider));
    return ready ? this.waitForScope(scope, ready, signal) : undefined;
  }

  /** Keep a provider and any resources it opens alive until its actual call settles. */
  async withProvider<T>(
    provider: IdleCleanupProvider,
    run: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const scope = this.evaluation.getStore();
    signal?.throwIfAborted();
    if (this.processShuttingDown) {
      throw this.processShutdownError();
    }
    if (scope && !scope.active) {
      throw this.closedScopeError();
    }
    const state = this.getProvider(provider);
    const ready = this.claimProvider(scope, state);
    state.activeCalls++;
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.activeCalls.add(finished);
    return this.currentProvider.run({ state, signal }, async () => {
      try {
        if (ready) {
          await this.waitForScope(scope, ready, signal);
        }
        signal?.throwIfAborted();
        if (scope && !scope.active) {
          throw this.closedScopeError();
        }
        if (this.processShuttingDown) {
          throw this.processShutdownError();
        }
        let release = this.restoreProviderRegistration(provider);
        while (release) {
          await this.waitForScope(scope, release, signal);
          signal?.throwIfAborted();
          if (scope && !scope.active) {
            throw this.closedScopeError();
          }
          if (this.processShuttingDown) {
            throw this.processShutdownError();
          }
          release = this.restoreProviderRegistration(provider);
        }
        return await run();
      } finally {
        state.activeCalls--;
        this.activeCalls.delete(finished);
        finish();
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

  /** The CLI owns its loaded targets; the eventual provider call waits for any earlier cleanup. */
  async cleanupWhenIdle(
    providers: Iterable<IdleCleanupProvider>,
    signal?: AbortSignal,
  ): Promise<void> {
    const scope = this.evaluation.getStore();
    if (!scope?.active) {
      return;
    }
    for (const provider of providers) {
      const state = this.getProvider(provider);
      state.cleanupRequested = true;
      this.ownedProviders.add(state);
      if (this.processShuttingDown) {
        void this.forceProviderCleanup(state);
      } else {
        this.ensureShutdownHandlers();
        void this.claimProvider(scope, state);
      }
    }
    signal?.throwIfAborted();
  }

  /** Recheck after an awaited reservation, before starting more work with a shared resource. */
  throwIfResourceUseAborted(signal?: AbortSignal): void {
    signal?.throwIfAborted();
    this.currentProvider.getStore()?.signal?.throwIfAborted();
    if (this.processShuttingDown) {
      throw this.processShutdownError();
    }
    const scope = this.evaluation.getStore();
    if (scope && !scope.active) {
      throw this.closedScopeError();
    }
  }

  /** Reserve a shared resource without resuming work after cancellation or evaluation closure. */
  useResource(resource: CleanupProvider, signal?: AbortSignal): Promise<void> | undefined {
    try {
      this.throwIfResourceUseAborted(signal);
    } catch (error) {
      return Promise.reject(error);
    }
    const state = this.resources.get(resource);
    if (!state) {
      return undefined;
    }
    const current = this.currentProvider.getStore();
    if (current?.state.activeCalls) {
      this.linkResource(current.state, state);
    }
    const scope = this.evaluation.getStore();
    if (scope) {
      this.claimResource(scope, state);
    }
    const callerSignal =
      signal && current?.signal && signal !== current.signal
        ? AbortSignal.any([signal, current.signal])
        : (signal ?? current?.signal);
    return state.release && this.waitForScope(scope, state.release.promise, callerSignal);
  }

  register(resource: CleanupProvider): void {
    let state = this.resources.get(resource);
    if (!state) {
      state = {
        resource,
        users: new Set(),
        providers: new Set(),
        registered: false,
        registration: 0,
      };
      this.resources.set(resource, state);
    }
    if (!state.registered) {
      state.registration++;
    }
    state.registered = true;
    if ('id' in resource && typeof resource.id === 'function') {
      const instance = resource as CleanupProvider & IdleCleanupProvider;
      this.selfRegisteredProviders.add(instance);
      const provider = this.providers.get(instance);
      if (provider) {
        this.linkResource(provider, state);
      }
    }
    if (this.processShuttingDown) {
      void this.forceResource(state);
      return;
    }
    // Registration may finish after an evaluation closes; retain already-opened resources until
    // their physical provider call settles, even though that call may no longer start new work.
    const current = this.currentProvider.getStore();
    if (current?.state.activeCalls) {
      this.linkResource(current.state, state);
    }
    const scope = this.evaluation.getStore();
    if (scope?.active) {
      this.claimResource(scope, state);
    }
    this.ensureShutdownHandlers();
  }

  unregister(resource: CleanupProvider): void {
    const state = this.resources.get(resource);
    if (state) {
      const releasing = this.releasingResource.getStore();
      if (releasing?.state === state && releasing.registration !== state.registration) {
        return;
      }
      state.registered = false;
      this.forgetResource(state);
    }
  }

  /** Close the currently known resources; embedded callers can continue using the registry. */
  async shutdownAll(): Promise<void> {
    const releases = [...this.resources.values()].map((state) => this.forceResource(state));
    await Promise.all(releases);
  }

  /** Process exit also closes later registrations and waits for active calls and releases to drain. */
  async shutdownForProcess(): Promise<void> {
    this.processShuttingDown = true;
    this.processAbortController.abort(this.processShutdownError());
    for (const state of this.ownedProviders) {
      void this.forceProviderCleanup(state);
    }
    for (const state of this.resources.values()) {
      void this.forceResource(state);
    }
    while (this.activeCalls.size || this.processReleases.size) {
      await Promise.all([...this.activeCalls, ...this.processReleases]);
    }
  }

  private closedScopeError(): DOMException {
    return new DOMException('Evaluation ended before the provider call started', 'AbortError');
  }

  private processShutdownError(): DOMException {
    return new DOMException('Provider registry is shutting down', 'AbortError');
  }

  private forceResource(state: ResourceState): Promise<void> | undefined {
    const release = this.maybeReleaseResource(state, undefined, true);
    if (release) {
      void state.release?.start(true);
      if (this.processShuttingDown) {
        this.trackProcessRelease(release);
      }
    }
    return release;
  }

  private forceProviderCleanup(state: ProviderState): Promise<void> | undefined {
    state.cleanupRequested = false;
    if (this.selfRegisteredProviders.has(state.provider)) {
      this.ownedProviders.delete(state);
      return undefined;
    }
    if (state.processCleanup) {
      return state.processCleanup;
    }
    const { provider } = state;
    if (!provider.cleanup && !provider.cleanupAfterEvaluation) {
      this.ownedProviders.delete(state);
      return undefined;
    }
    const hasSeparateProcessCleanup = provider.cleanup && provider.cleanupAfterEvaluation;
    const cleanup =
      (!hasSeparateProcessCleanup && state.cleanup) ||
      Promise.resolve()
        .then(() =>
          provider.cleanup
            ? provider.cleanup()
            : provider.cleanupAfterEvaluation?.({ reason: 'evaluation-complete' }),
        )
        .catch((error) => {
          logger.warn('Provider cleanup failed during process shutdown.', { error });
        });
    state.processCleanup = cleanup;
    this.trackProcessRelease(cleanup);
    void cleanup.then(() => this.ownedProviders.delete(state));
    return cleanup;
  }

  private trackProcessRelease(release: Promise<void>): void {
    if (!this.processReleases.has(release)) {
      this.processReleases.add(release);
      void release.then(() => this.processReleases.delete(release));
    }
  }

  private waitForScope(
    scope: EvaluationScope | undefined,
    ready: Promise<void>,
    callerSignal?: AbortSignal,
  ): Promise<void> {
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, this.processAbortController.signal])
      : this.processAbortController.signal;
    if (signal.aborted || (scope && !scope.active)) {
      void ready.catch(() => {});
      return Promise.reject(signal.aborted ? signal.reason : this.closedScopeError());
    }
    const pending = scope
      ? Promise.race([
          ready,
          scope.closed.then(() => {
            signal.throwIfAborted();
            throw this.closedScopeError();
          }),
        ])
      : ready;
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      pending.then(
        () => {
          signal.removeEventListener('abort', onAbort);
          if (signal.aborted) {
            reject(signal.reason);
          } else if (scope && !scope.active) {
            reject(this.closedScopeError());
          } else {
            resolve();
          }
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
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

  private restoreProviderRegistration(provider: IdleCleanupProvider): Promise<void> | undefined {
    if (!this.selfRegisteredProviders.has(provider)) {
      return undefined;
    }
    const resource = provider as IdleCleanupProvider & CleanupProvider;
    const state = this.resources.get(resource);
    if (state?.release) {
      return state.release.promise;
    }
    if (!state?.registered) {
      this.register(resource);
    }
    return undefined;
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
    scope: EvaluationScope | undefined,
    provider: ProviderState,
  ): Promise<void> | undefined {
    if (scope && !scope.providers.has(provider)) {
      scope.providers.add(provider);
      provider.users.add(scope);
    }
    const pending: Promise<void>[] = [];
    if (provider.cleanup) {
      pending.push(provider.cleanup);
    }
    for (const resource of provider.resources) {
      if (resource.registered || resource.release) {
        if (scope) {
          this.claimResource(scope, resource);
        }
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
      const preceding = provider.cleanup;
      const cleanup = this.maybeCleanupProvider(provider);
      if (cleanup && cleanup !== preceding && provider.users.size === 0) {
        pending.push(cleanup);
      }
    }
    for (const resource of scope.resources) {
      const preceding = resource.release?.promise;
      const owner = [...resource.providers].find((state) => state.provider === resource.resource);
      const release = this.maybeReleaseResource(resource, owner?.cleanup);
      if (release && release !== preceding && resource.users.size === 0) {
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
    // Registered providers normally release themselves through shutdown(), which may call cleanup().
    if (
      !state.provider.cleanupAfterEvaluation &&
      this.selfRegisteredProviders.has(state.provider)
    ) {
      this.ownedProviders.delete(state);
      return undefined;
    }
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
        if (!state.cleanupRequested) {
          this.ownedProviders.delete(state);
        }
      });
    state.cleanup = cleanup;
    return cleanup;
  }

  private maybeReleaseResource(
    state: ResourceState,
    prerequisite?: Promise<void>,
    force = false,
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
    const usesEvaluationCleanup =
      prerequisite !== undefined &&
      [...state.providers].some(
        ({ provider }) => provider === state.resource && provider.cleanupAfterEvaluation,
      );
    const complete = () => {
      if (state.release?.promise === promise) {
        state.release = undefined;
      }
      this.forgetResource(state);
      if (this.processShuttingDown && state.registered) {
        void this.forceResource(state);
      }
      finish();
    };
    let actual: Promise<void> | undefined;
    const start = (forceShutdown = false) => {
      if (!actual) {
        if (usesEvaluationCleanup && !forceShutdown) {
          actual = Promise.resolve();
          complete();
        } else {
          const registration = state.registration;
          state.registered = false;
          actual = Promise.resolve()
            .then(() =>
              this.releasingResource.run({ state, registration }, () => state.resource.shutdown()),
            )
            .catch((error) => {
              logger.warn('Error shutting down provider: ' + String(error));
            })
            .then(complete);
        }
      }
      return actual;
    };
    state.release = { promise, start };
    if (prerequisite) {
      void prerequisite.then(
        () => start(),
        () => start(),
      );
    } else {
      void start();
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

  private ensureShutdownHandlers(): void {
    if (this.installProcessHandlers && !this.shutdownRegistered) {
      this.registerShutdownHandlers();
      this.shutdownRegistered = true;
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
