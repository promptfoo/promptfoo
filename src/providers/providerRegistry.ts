import logger from '../logger';

/**
 * Interface for providers that need cleanup on process exit.
 */
interface CleanupProvider {
  shutdown(): Promise<void>;
}

interface RegisteredCleanup {
  provider: CleanupProvider;
  generation: number;
}

/**
 * How long a new evaluation waits for an earlier evaluation's cleanup. A cleanup that never
 * settles must not stall every later evaluation in a long-lived process (web or MCP server).
 */
const IDLE_RELEASE_WAIT_MS = 30_000;

/** The part of an ApiProvider that idle cleanup uses. */
interface IdleCleanupProvider {
  id(): string;
  cleanup?: () => void | Promise<void>;
  cleanupAfterEvaluation?: (context: { reason: 'evaluation-complete' }) => void | Promise<void>;
}

/**
 * Global registry of provider resources, released once no evaluation is active and on
 * process exit. Ensures no zombie Python processes are left running.
 */
class ProviderRegistry {
  private providers: Set<CleanupProvider> = new Set();
  private registrationGenerations = new WeakMap<CleanupProvider, number>();
  private nextRegistrationGeneration = 0;
  private shutdownRegistered: boolean = false;
  private activeEvaluations = 0;
  private idleCleanups = new Set<IdleCleanupProvider>();
  private idleShutdown?: Promise<void>;
  private idleReleaseGeneration = 0;

  /**
   * Run `run` as an active evaluation. Registered resources, and providers passed to
   * `cleanupWhenIdle`, are released only after the last active evaluation finishes, so one
   * evaluation finishing never closes a provider another is still using. A new evaluation
   * waits (for at most IDLE_RELEASE_WAIT_MS) for an in-progress release before it starts.
   */
  async withEvaluation<T>(run: () => Promise<T>): Promise<T> {
    // Count synchronously: setup that loads or registers providers is covered too.
    this.activeEvaluations++;
    try {
      await this.waitForIdleRelease();
      return await run();
    } finally {
      if (--this.activeEvaluations === 0) {
        const generation = ++this.idleReleaseGeneration;
        const shutdown = this.releaseIdleResources();
        this.idleShutdown = shutdown;
        await shutdown;
        if (this.idleReleaseGeneration === generation) {
          this.idleShutdown = undefined;
        }
      }
    }
  }

  private async waitForIdleRelease(): Promise<void> {
    if (!this.idleShutdown) {
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<true>((resolve) => {
      timer = setTimeout(() => resolve(true), IDLE_RELEASE_WAIT_MS);
    });
    // Each release works on a snapshot, so starting late cannot close this run's providers.
    if (await Promise.race([this.idleShutdown, timedOut])) {
      logger.warn(
        `Provider cleanup from an earlier evaluation is still running after ${IDLE_RELEASE_WAIT_MS / 1000}s; starting anyway.`,
      );
    }
    clearTimeout(timer);
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
    const registered = this.takeRegisteredResources();
    const results = await Promise.allSettled(
      providers.map((provider) =>
        Promise.resolve().then(() =>
          provider.cleanupAfterEvaluation
            ? provider.cleanupAfterEvaluation({ reason: 'evaluation-complete' })
            : provider.cleanup?.(),
        ),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn('Provider cleanup failed after evaluation.', { error: result.reason });
      }
    }
    // An evaluation admitted after the timeout can re-register a resource for its own use.
    await this.shutdownResources(registered, true);
  }

  register(provider: CleanupProvider): void {
    this.registrationGenerations.set(provider, ++this.nextRegistrationGeneration);
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

  private takeRegisteredResources(): RegisteredCleanup[] {
    const providers = Array.from(this.providers, (provider) => ({
      provider,
      generation: this.registrationGenerations.get(provider)!,
    }));
    // Remove only this snapshot before invoking user code, preserving registrations
    // made during asynchronous shutdown and preventing duplicate cleanup on reentry.
    for (const { provider } of providers) {
      this.providers.delete(provider);
    }
    return providers;
  }

  private async shutdownResources(
    providers: RegisteredCleanup[],
    skipReregistered = false,
  ): Promise<void> {
    const results = await Promise.allSettled(
      providers.map(({ provider, generation }) =>
        Promise.resolve().then(() => {
          if (!skipReregistered || this.registrationGenerations.get(provider) === generation) {
            return provider.shutdown();
          }
        }),
      ),
    );

    // Log any failures but don't throw - cleanup should be defensive
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(`Error shutting down provider: ${result.reason}`);
      }
    }
  }

  async shutdownAll(): Promise<void> {
    await this.shutdownResources(this.takeRegisteredResources());
  }
}

export const providerRegistry = new ProviderRegistry();
