import { AsyncLocalStorage } from 'node:async_hooks';

import logger from '../logger';

export type ProviderShutdownReason = 'evaluation' | 'manual' | 'process';
const PROCESS_SHUTDOWN_TIMEOUT_MS = 1_000;
type TerminationSignal = 'SIGINT' | 'SIGTERM';
type SignalListener = (signal: NodeJS.Signals) => void;

interface HostSignalObservation {
  listeners: Record<TerminationSignal, Set<SignalListener>>;
  added: (event: string | symbol, listener: SignalListener) => void;
  removed: (event: string | symbol, listener: SignalListener) => void;
}

/**
 * Interface for providers that need cleanup on process exit.
 */
interface CleanupProvider {
  shutdown(reason?: ProviderShutdownReason): Promise<void>;
}

interface ProviderEvaluationScope {
  providers: Set<CleanupProvider>;
  closed: boolean;
}

/**
 * Global registry for cleaning up provider resources and processes. Providers can opt in
 * to evaluation ownership when their resources must outlive individual calls.
 */
class ProviderRegistry {
  private providers: Set<CleanupProvider> = new Set();
  private processTerminating = false;
  private nativeSignal?: TerminationSignal;
  private beforeExitAttempted = false;
  private signalHandlers?: Record<TerminationSignal | 'beforeExit', () => void>;
  private hostSignalObservation?: HostSignalObservation;
  private readonly normalShutdowns = new Map<CleanupProvider, Promise<void>>();
  private readonly processShutdowns = new Map<CleanupProvider, Promise<void>>();
  private readonly escalatedProviders = new WeakSet<CleanupProvider>();
  private readonly evaluationScope = new AsyncLocalStorage<ProviderEvaluationScope>();
  private readonly evaluationOwners = new WeakMap<CleanupProvider, Set<ProviderEvaluationScope>>();
  private readonly directlyOwnedProviders = new WeakSet<CleanupProvider>();

  register(provider: CleanupProvider): void {
    if (
      !this.providers.has(provider) &&
      !this.normalShutdowns.has(provider) &&
      !this.processShutdowns.has(provider)
    ) {
      this.escalatedProviders.delete(provider);
    }
    this.providers.add(provider);

    if (!this.signalHandlers && !this.nativeSignal) {
      this.registerShutdownHandlers();
    }
  }

  unregister(provider: CleanupProvider): void {
    this.providers.delete(provider);
    this.directlyOwnedProviders.delete(provider);
    this.removeShutdownHandlersWhenIdle();
  }

  isProcessTerminating(): boolean {
    return this.processTerminating;
  }

  registerScoped(provider: CleanupProvider): void {
    this.register(provider);
    const scope = this.evaluationScope.getStore();
    if (!scope || scope.closed) {
      this.directlyOwnedProviders.add(provider);
      return;
    }
    if (scope.providers.has(provider)) {
      return;
    }
    scope.providers.add(provider);
    let owners = this.evaluationOwners.get(provider);
    if (!owners) {
      owners = new Set();
      this.evaluationOwners.set(provider, owners);
    }
    owners.add(scope);
  }

  withEvaluationScope<T>(run: () => Promise<T>): Promise<T> {
    const scope: ProviderEvaluationScope = { providers: new Set(), closed: false };
    return this.evaluationScope.run(scope, async () => {
      try {
        return await run();
      } finally {
        // Also release ownership when evaluation exits before its usual cleanup block.
        await this.shutdownEvaluation();
      }
    });
  }

  async shutdownEvaluation(): Promise<void> {
    const scope = this.evaluationScope.getStore();
    if (!scope) {
      return this.shutdownAll();
    }
    if (scope.closed) {
      return;
    }
    scope.closed = true;
    for (const provider of scope.providers) {
      const owners = this.evaluationOwners.get(provider);
      owners?.delete(scope);
      if (owners?.size === 0) {
        this.evaluationOwners.delete(provider);
      }
    }
    scope.providers.clear();

    // Legacy providers keep their existing global evaluation cleanup. Opted-in providers
    // remain registered until all evaluation owners finish, or until manual/process cleanup
    // when they were also used directly outside an evaluation.
    const available = [...this.providers].filter(
      (provider) =>
        !this.directlyOwnedProviders.has(provider) && !this.evaluationOwners.get(provider)?.size,
    );
    return this.shutdownProviders(available, 'evaluation');
  }

  private registerShutdownHandlers(): void {
    this.beforeExitAttempted = false;
    const handlers = {
      SIGINT: () => this.handleSignal('SIGINT'),
      SIGTERM: () => this.handleSignal('SIGTERM'),
      beforeExit: () => this.handleBeforeExit(),
    };
    this.signalHandlers = handlers;
    const observation: HostSignalObservation = {
      listeners: {
        SIGINT: new Set(process.listeners('SIGINT')),
        SIGTERM: new Set(process.listeners('SIGTERM')),
      },
      added: (event, listener) => {
        if ((event === 'SIGINT' || event === 'SIGTERM') && listener !== handlers[event]) {
          observation.listeners[event].add(listener);
        }
      },
      removed: (event, listener) => {
        if ((event !== 'SIGINT' && event !== 'SIGTERM') || listener === handlers[event]) {
          return;
        }
        // Node removes a once-listener before invoking it. Keep it through this dispatch in
        // case the host prepended it ahead of us after we registered our signal handlers.
        queueMicrotask(() => {
          if (
            this.hostSignalObservation === observation &&
            !process.listeners(event).includes(listener)
          ) {
            observation.listeners[event].delete(listener);
          }
        });
      },
    };
    this.hostSignalObservation = observation;
    process.on('newListener', observation.added);
    process.on('removeListener', observation.removed);
    process.prependListener('SIGINT', handlers.SIGINT);
    process.prependListener('SIGTERM', handlers.SIGTERM);
    process.once('beforeExit', handlers.beforeExit);
  }

  private removeShutdownHandlersWhenIdle(): void {
    if (
      this.providers.size === 0 &&
      this.normalShutdowns.size === 0 &&
      this.processShutdowns.size === 0
    ) {
      this.removeShutdownHandlers();
    }
  }

  private removeShutdownHandlers(): void {
    const handlers = this.signalHandlers;
    if (!handlers) {
      return;
    }
    const observation = this.hostSignalObservation;
    this.hostSignalObservation = undefined;
    if (observation) {
      process.removeListener('newListener', observation.added);
      process.removeListener('removeListener', observation.removed);
    }
    process.removeListener('SIGINT', handlers.SIGINT);
    process.removeListener('SIGTERM', handlers.SIGTERM);
    process.removeListener('beforeExit', handlers.beforeExit);
    this.signalHandlers = undefined;
  }

  private handleSignal(signal: TerminationSignal): void {
    if (this.nativeSignal) {
      return;
    }
    this.nativeSignal = signal;
    this.processTerminating = true;
    const ownHandler = this.signalHandlers?.[signal];
    const hostHandlesSignal =
      Boolean(this.hostSignalObservation?.listeners[signal].size) ||
      process.rawListeners(signal).some((listener) => listener !== ownHandler);
    // A second real signal should follow host/default behavior, not run our cleanup twice.
    this.removeShutdownHandlers();

    logger.debug(`Received ${signal}, shutting down providers...`);
    const finish = () => {
      logger.debug('Provider shutdown complete');
      if (!hostHandlesSignal && process.listenerCount(signal) === 0) {
        try {
          // Installing a Node signal listener suppresses its default. Restore that behavior
          // only when the embedding application had no handler of its own.
          process.kill(process.pid, signal);
        } catch (error) {
          logger.warn(`Failed to restore default ${signal} handling: ${error}`);
          process.exit(signal === 'SIGINT' ? 130 : 143);
        }
      }
    };
    void this.waitForProcessCleanup(this.shutdownForProcess(), hostHandlesSignal).then(
      finish,
      finish,
    );
  }

  private handleBeforeExit(): void {
    if (this.beforeExitAttempted || this.nativeSignal) {
      return;
    }
    this.beforeExitAttempted = true;
    void this.waitForProcessCleanup(this.shutdownForProcess(), true);
  }

  private async waitForProcessCleanup(cleanup: Promise<void>, unref: boolean): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, PROCESS_SHUTDOWN_TIMEOUT_MS);
      if (unref) {
        timer.unref();
      }
    });
    try {
      await Promise.race([cleanup, deadline]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  shutdownAll(): Promise<void> {
    return this.shutdownProviders([...this.providers], 'manual');
  }

  shutdownForProcess(): Promise<void> {
    return this.shutdownProviders(
      [
        ...new Set([
          ...this.providers,
          ...this.normalShutdowns.keys(),
          ...this.processShutdowns.keys(),
        ]),
      ],
      'process',
    );
  }

  private async shutdownProviders(
    providers: CleanupProvider[],
    reason: ProviderShutdownReason,
  ): Promise<void> {
    // Remove the whole old batch before invoking any provider: one provider can register
    // itself or another provider during shutdown, and those registrations must survive.
    for (const provider of providers) {
      const alreadyStarted =
        reason === 'process'
          ? this.processShutdowns.has(provider) || this.escalatedProviders.has(provider)
          : this.normalShutdowns.has(provider);
      if (!alreadyStarted) {
        this.providers.delete(provider);
      }
    }
    const pending = providers.flatMap((provider) => {
      const shutdown = this.startProviderShutdown(provider, reason);
      return shutdown ? [shutdown] : [];
    });
    await Promise.all(pending);
  }

  private startProviderShutdown(
    provider: CleanupProvider,
    reason: ProviderShutdownReason,
  ): Promise<void> | undefined {
    const shutdowns = reason === 'process' ? this.processShutdowns : this.normalShutdowns;
    const existing = shutdowns.get(provider);
    if (reason === 'process') {
      if (existing || this.escalatedProviders.has(provider)) {
        return existing;
      }
      this.escalatedProviders.add(provider);
    } else if (existing) {
      // A re-registration during an older shutdown belongs to a later cleanup batch.
      return;
    }

    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const completed = new Promise<void>((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    const finish = () => {
      if (shutdowns.get(provider) === shutdown) {
        shutdowns.delete(provider);
        this.removeShutdownHandlersWhenIdle();
      }
    };
    const shutdown = completed.then(
      () => finish(),
      (error: unknown) => {
        logger.warn(`Error shutting down provider: ${error}`);
        finish();
      },
    );
    // Register before invoking user code so synchronous unregister/re-registration and process
    // escalation can still see this resource while its normal asynchronous shutdown drains.
    shutdowns.set(provider, shutdown);
    try {
      Promise.resolve(provider.shutdown(reason)).then(resolve, reject);
    } catch (error) {
      reject(error);
    }
    return shutdown;
  }
}

export const providerRegistry = new ProviderRegistry();
