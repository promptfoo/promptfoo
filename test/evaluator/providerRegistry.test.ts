import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { MCPProvider } from '../../src/providers/mcp';
import { ProviderRegistry, providerRegistry } from '../../src/providers/providerRegistry';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, CallApiOptionsParams, TestSuite } from '../../src/types/index';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('drains an active call that registers a resource after process shutdown starts', async () => {
  const registry = new ProviderRegistry(false);
  const callStarted = deferred();
  const finishInitialization = deferred();
  const resourceClosing = deferred();
  const finishResourceClose = deferred();
  const finishCall = deferred();
  const provider = { id: () => 'late-process-registration' };
  const resource = {
    shutdown: vi.fn(async () => {
      resourceClosing.resolve();
      await finishResourceClose.promise;
    }),
  };
  let physical: Promise<void> | undefined;
  const evaluation = registry.withEvaluation(async () => {
    physical = registry.withProvider(provider, async () => {
      callStarted.resolve();
      await finishInitialization.promise;
      registry.register(resource);
      await finishCall.promise;
    });
    await callStarted.promise;
  });
  const shutdownFinished = vi.fn();
  let shuttingDown: Promise<void> | undefined;
  try {
    await evaluation;
    shuttingDown = registry.shutdownForProcess().then(shutdownFinished);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(shutdownFinished).not.toHaveBeenCalled();

    finishInitialization.resolve();
    await resourceClosing.promise;
    expect(resource.shutdown).toHaveBeenCalledOnce();
    expect(shutdownFinished).not.toHaveBeenCalled();
    finishResourceClose.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(shutdownFinished).not.toHaveBeenCalled();

    finishCall.resolve();
    await Promise.all([physical, shuttingDown]);
    expect(shutdownFinished).toHaveBeenCalledOnce();
    expect(resource.shutdown).toHaveBeenCalledOnce();
  } finally {
    finishInitialization.resolve();
    finishResourceClose.resolve();
    finishCall.resolve();
    await Promise.allSettled([
      evaluation,
      ...(physical ? [physical] : []),
      ...(shuttingDown ? [shuttingDown] : []),
    ]);
  }
});

it('closes registrations after an empty process shutdown and preserves a later re-registration', async () => {
  const registry = new ProviderRegistry(false);
  const firstClose = deferred();
  const finishFirstClose = deferred();
  let shutdowns = 0;
  const resource = {
    shutdown: vi.fn(async () => {
      if (++shutdowns === 1) {
        firstClose.resolve();
        await finishFirstClose.promise;
      }
      registry.unregister(resource);
    }),
  };
  const run = vi.fn(async () => {});
  await registry.shutdownForProcess();
  try {
    registry.register(resource);
    await firstClose.promise;
    registry.register(resource);
    const draining = registry.shutdownForProcess();
    finishFirstClose.resolve();
    await draining;
    expect(resource.shutdown).toHaveBeenCalledTimes(2);

    await expect(registry.withEvaluation(run)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(registry.withProvider({ id: () => 'new-call' }, run)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(run).not.toHaveBeenCalled();
  } finally {
    finishFirstClose.resolve();
    await registry.shutdownForProcess();
  }
});

it('forces CLI-owned cleanup-only providers while their calls are active without cleaning borrowed providers', async () => {
  const registry = new ProviderRegistry(false);
  const idle = { id: () => 'already-cleaned-cli-provider', cleanup: vi.fn() };
  await registry.withEvaluation(() => registry.cleanupWhenIdle([idle]));
  expect(idle.cleanup).toHaveBeenCalledOnce();

  const callsStarted = deferred();
  const finishCalls = deferred();
  const cleanupStarted = deferred();
  const finishCleanup = deferred();
  const owned = {
    id: () => 'cleanup-only-cli-provider',
    cleanup: vi.fn(async () => {
      cleanupStarted.resolve();
      await finishCleanup.promise;
    }),
  };
  const borrowed = { id: () => 'borrowed-provider', cleanup: vi.fn() };
  let started = 0;
  const run = async () => {
    if (++started === 2) {
      callsStarted.resolve();
    }
    await finishCalls.promise;
  };
  const physical: Promise<void>[] = [];
  const evaluation = registry.withEvaluation(async () => {
    await registry.cleanupWhenIdle([owned]);
    physical.push(registry.withProvider(owned, run), registry.withProvider(borrowed, run));
    await callsStarted.promise;
  });
  let shuttingDown: Promise<void> | undefined;
  const shutdownFinished = vi.fn();
  try {
    await evaluation;
    expect(owned.cleanup).not.toHaveBeenCalled();
    shuttingDown = registry.shutdownForProcess().then(shutdownFinished);
    await cleanupStarted.promise;
    expect(owned.cleanup).toHaveBeenCalledExactlyOnceWith();
    expect(borrowed.cleanup).not.toHaveBeenCalled();
    expect(idle.cleanup).toHaveBeenCalledOnce();
    expect(shutdownFinished).not.toHaveBeenCalled();

    finishCleanup.resolve();
    finishCalls.resolve();
    await Promise.all([...physical, shuttingDown]);
    expect(owned.cleanup).toHaveBeenCalledOnce();
    expect(borrowed.cleanup).not.toHaveBeenCalled();
    expect(idle.cleanup).toHaveBeenCalledOnce();
  } finally {
    finishCleanup.resolve();
    finishCalls.resolve();
    await Promise.allSettled([evaluation, ...physical, ...(shuttingDown ? [shuttingDown] : [])]);
  }
});

it('starts an owned provider’s explicit process cleanup even when its separate idle hook is blocked', async () => {
  const registry = new ProviderRegistry(false);
  const idleStarted = deferred();
  const finishIdle = deferred();
  const provider = {
    id: () => 'distinct-owned-cleanups',
    cleanupAfterEvaluation: vi.fn(async () => {
      idleStarted.resolve();
      await finishIdle.promise;
    }),
    cleanup: vi.fn(async () => {}),
  };
  const evaluation = registry.withEvaluation(() => registry.cleanupWhenIdle([provider]));
  try {
    await idleStarted.promise;
    await registry.shutdownForProcess();
    expect(provider.cleanup).toHaveBeenCalledExactlyOnceWith();
    expect(provider.cleanupAfterEvaluation).toHaveBeenCalledOnce();
    finishIdle.resolve();
    await evaluation;
    expect(provider.cleanup).toHaveBeenCalledOnce();
  } finally {
    finishIdle.resolve();
    await Promise.allSettled([evaluation]);
  }
});

it('keeps a standalone provider and resources it opens alive when a concurrent evaluation finishes', async () => {
  const registry = new ProviderRegistry(false);
  const started = deferred();
  const finish = deferred();
  const resource = { shutdown: vi.fn(async () => {}) };
  const provider = {
    id: () => 'standalone-self-registered-provider',
    shutdown: vi.fn(async () => {}),
  };
  registry.register(provider);
  const standalone = registry.withProvider(provider, async () => {
    registry.register(resource);
    started.resolve();
    await finish.promise;
  });
  try {
    await started.promise;
    await registry.withEvaluation(() => registry.withProvider(provider, async () => {}));
    expect(provider.shutdown).not.toHaveBeenCalled();
    expect(resource.shutdown).not.toHaveBeenCalled();

    finish.resolve();
    await standalone;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(provider.shutdown).toHaveBeenCalledOnce();
    expect(resource.shutdown).toHaveBeenCalledOnce();
  } finally {
    finish.resolve();
    await Promise.allSettled([standalone]);
    await registry.shutdownAll();
  }
});

it('waits for earlier provider cleanup in standalone calls and cancels one waiter independently', async () => {
  const registry = new ProviderRegistry(false);
  const started = deferred();
  const finish = deferred();
  const provider = {
    id: () => 'standalone-waits-for-evaluation',
    shutdown: vi.fn(async () => {
      if (provider.shutdown.mock.calls.length === 1) {
        started.resolve();
        await finish.promise;
      }
    }),
  };
  registry.register(provider);
  const earlier = registry.withEvaluation(() => registry.withProvider(provider, async () => {}));
  const controller = new AbortController();
  const reason = new Error('cancel one standalone call');
  const cancelledRun = vi.fn(async () => {});
  const liveRun = vi.fn(async () => {});
  let cancelled: Promise<void> | undefined;
  let live: Promise<void> | undefined;
  try {
    await started.promise;
    cancelled = registry.withProvider(provider, cancelledRun, controller.signal);
    const rejected = expect(cancelled).rejects.toBe(reason);
    const setup = registry.useProvider(provider, controller.signal);
    const rejectedSetup = expect(setup).rejects.toBe(reason);
    live = registry.withProvider(provider, liveRun);
    controller.abort(reason);
    await Promise.all([rejected, rejectedSetup]);
    expect(cancelledRun).not.toHaveBeenCalled();
    expect(liveRun).not.toHaveBeenCalled();

    finish.resolve();
    await Promise.all([earlier, live]);
    expect(liveRun).toHaveBeenCalledOnce();
    expect(cancelledRun).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(provider.shutdown).toHaveBeenCalledTimes(2);
  } finally {
    finish.resolve();
    await Promise.allSettled([earlier, ...(cancelled ? [cancelled] : []), ...(live ? [live] : [])]);
    await registry.shutdownAll();
  }
});

describeEvaluator('registered resources across overlapping evaluations', () => {
  it('waits for a shared resource release without delaying an unrelated evaluation', async () => {
    const shutdownStarted = deferred();
    const releaseShutdown = deferred();
    const registered = {
      shutdown: vi.fn(async () => {
        shutdownStarted.resolve();
        await releaseShutdown.promise;
      }),
    };
    const earlier = providerRegistry.withEvaluation(async () =>
      providerRegistry.register(registered),
    );
    const run = vi.fn(async () => {});
    let next: Promise<void> | undefined;
    try {
      await shutdownStarted.promise;
      await expect(providerRegistry.withEvaluation(async () => 'unrelated')).resolves.toBe(
        'unrelated',
      );
      next = providerRegistry.withEvaluation(async () => {
        await providerRegistry.useResource(registered);
        await run();
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(run).not.toHaveBeenCalled();
      releaseShutdown.resolve();
      await Promise.all([earlier, next]);
      expect(run).toHaveBeenCalledOnce();
      expect(registered.shutdown).toHaveBeenCalledOnce();
    } finally {
      releaseShutdown.resolve();
      await Promise.allSettled([earlier, ...(next ? [next] : [])]);
      providerRegistry.unregister(registered);
    }
  });

  it.each(['provider call', 'resource reservation'] as const)(
    'abandons a pending shared resource on %s cancellation without interrupting a sibling',
    async (signalSource) => {
      const registry = new ProviderRegistry(false);
      const shutdownStarted = deferred();
      const finishShutdown = deferred();
      const waiting = deferred();
      const siblingWaiting = deferred();
      const finishEvaluation = deferred();
      const resource = {
        shutdown: vi.fn(async () => {
          shutdownStarted.resolve();
          await finishShutdown.promise;
        }),
      };
      const controller = new AbortController();
      const reason = new Error('evaluation step expired');
      const abandoned = vi.fn();
      const sibling = vi.fn();
      const first = registry.withEvaluation(async () => registry.register(resource));
      let physical: Promise<void> | undefined;
      let unaffected: Promise<void> | undefined;
      let later: Promise<void> | undefined;
      try {
        await shutdownStarted.promise;
        later = registry.withEvaluation(async () => {
          physical = registry.withProvider(
            { id: () => 'cancelled-shared-resource-user' },
            async () => {
              const ready = registry.useResource(
                resource,
                signalSource === 'resource reservation' ? controller.signal : undefined,
              );
              waiting.resolve();
              await ready;
              registry.throwIfResourceUseAborted();
              abandoned();
            },
            signalSource === 'provider call' ? controller.signal : undefined,
          );
          void physical.catch(() => {});
          unaffected = registry.withProvider(
            { id: () => 'other-shared-resource-user' },
            async () => {
              const ready = registry.useResource(resource);
              siblingWaiting.resolve();
              await ready;
              sibling();
            },
          );
          void unaffected.catch(() => {});
          await finishEvaluation.promise;
        });
        await Promise.all([waiting.promise, siblingWaiting.promise]);
        controller.abort(reason);
        await expect(physical).rejects.toBe(reason);
        expect(abandoned).not.toHaveBeenCalled();
        expect(sibling).not.toHaveBeenCalled();

        finishShutdown.resolve();
        await Promise.all([first, unaffected]);
        expect(abandoned).not.toHaveBeenCalled();
        expect(sibling).toHaveBeenCalledOnce();
        finishEvaluation.resolve();
        await later;
        expect(resource.shutdown).toHaveBeenCalledOnce();
      } finally {
        finishShutdown.resolve();
        finishEvaluation.resolve();
        await Promise.allSettled([
          first,
          ...(later ? [later] : []),
          ...(physical ? [physical] : []),
          ...(unaffected ? [unaffected] : []),
        ]);
      }
    },
  );

  it('blocks only the reused provider while its cleanup is still running, even after a minute', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const cleanupStarted = deferred();
    const releaseCleanup = deferred();
    const provider = {
      id: () => 'held-provider',
      cleanupAfterEvaluation: vi.fn(async () => {
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      }),
    };
    const unrelated = { shutdown: vi.fn(async () => {}) };
    const run = vi.fn(async () => {});
    const earlier = providerRegistry.withEvaluation(async () => {
      await providerRegistry.cleanupWhenIdle([provider]);
    });
    let next: Promise<void> | undefined;
    try {
      await cleanupStarted.promise;
      next = providerRegistry.withEvaluation(async () => {
        await providerRegistry.useProvider(provider);
        await providerRegistry.withProvider(provider, run);
      });
      await expect(
        providerRegistry.withEvaluation(() =>
          providerRegistry.withEvaluation(async () => {
            providerRegistry.register(unrelated);
            return 'ran';
          }),
        ),
      ).resolves.toBe('ran');
      expect(unrelated.shutdown).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(run).not.toHaveBeenCalled();
      releaseCleanup.resolve();
      await Promise.all([earlier, next]);
      expect(run).toHaveBeenCalledOnce();
      expect(provider.cleanupAfterEvaluation).toHaveBeenCalledOnce();
    } finally {
      releaseCleanup.resolve();
      await Promise.allSettled([earlier, ...(next ? [next] : [])]);
      providerRegistry.unregister(unrelated);
      vi.useRealTimers();
    }
  });

  it.each(['signal', 'scope'] as const)(
    'does not start a queued provider call after its %s ends',
    async (mode) => {
      const cleanupStarted = deferred();
      const releaseCleanup = deferred();
      const stopEvaluation = deferred();
      const queuedStarted = deferred();
      const provider = {
        id: () => 'cancelled-queued-provider',
        cleanup: vi.fn(async () => {
          cleanupStarted.resolve();
          await releaseCleanup.promise;
        }),
      };
      const run = vi.fn(async () => {});
      const abort = new AbortController();
      const reason = new Error('grading was cancelled');
      const preceding = providerRegistry.withEvaluation(async () => {
        await providerRegistry.cleanupWhenIdle([provider]);
      });
      let evaluation: Promise<void> | undefined;
      let queued: Promise<void> | undefined;
      try {
        await cleanupStarted.promise;
        evaluation = providerRegistry.withEvaluation(async () => {
          queued = providerRegistry.withProvider(
            provider,
            run,
            mode === 'signal' ? abort.signal : undefined,
          );
          void queued.catch(() => {});
          queuedStarted.resolve();
          await stopEvaluation.promise;
        });
        await queuedStarted.promise;
        if (mode === 'signal') {
          abort.abort(reason);
          await expect(queued).rejects.toBe(reason);
        } else {
          stopEvaluation.resolve();
          await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
        }
        stopEvaluation.resolve();
        await evaluation;
        expect(run).not.toHaveBeenCalled();
        releaseCleanup.resolve();
        await preceding;
        expect(run).not.toHaveBeenCalled();
      } finally {
        abort.abort(reason);
        stopEvaluation.resolve();
        releaseCleanup.resolve();
        await Promise.allSettled([
          preceding,
          ...(evaluation ? [evaluation] : []),
          ...(queued ? [queued] : []),
        ]);
      }
    },
  );

  it('stops provider setup on caller cancellation without waiting for an earlier cleanup', async () => {
    const cleanupStarted = deferred();
    const releaseCleanup = deferred();
    const setupStarted = deferred();
    const provider = {
      id: () => 'cancelled-provider-setup',
      cleanup: vi.fn(async () => {
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      }),
    };
    const run = vi.fn();
    const abort = new AbortController();
    const reason = new Error('setup was cancelled');
    const preceding = providerRegistry.withEvaluation(async () => {
      await providerRegistry.cleanupWhenIdle([provider]);
    });
    let current: Promise<void> | undefined;
    try {
      await cleanupStarted.promise;
      current = providerRegistry.withEvaluation(async () => {
        setupStarted.resolve();
        await providerRegistry.useProvider(provider, abort.signal);
        run();
      });
      void current.catch(() => {});
      await setupStarted.promise;
      abort.abort(reason);
      await expect(current).rejects.toBe(reason);
      expect(run).not.toHaveBeenCalled();
      releaseCleanup.resolve();
      await preceding;
      expect(run).not.toHaveBeenCalled();
    } finally {
      releaseCleanup.resolve();
      await Promise.allSettled([preceding, ...(current ? [current] : [])]);
    }
  });

  it('starts the global evaluation timeout before waiting for an earlier provider cleanup', async () => {
    const cleanupStarted = deferred();
    const releaseCleanup = deferred();
    const provider = {
      id: () => 'globally-timed-out-provider-setup',
      callApi: vi.fn(async () => ({ output: 'should not start' })),
      cleanupAfterEvaluation: vi.fn(async () => {
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      }),
    } satisfies ApiProvider;
    const suite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('ping')],
      tests: [{}],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    const preceding = providerRegistry.withEvaluation(() =>
      providerRegistry.cleanupWhenIdle([provider]),
    );
    let evaluation: Promise<Eval> | undefined;
    try {
      await cleanupStarted.promise;
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      evaluation = evaluate(suite, record, { maxEvalTimeMs: 100 });
      const rejection = expect(evaluation).rejects.toMatchObject({ name: 'AbortError' });

      await vi.advanceTimersByTimeAsync(100);
      await rejection;
      expect(provider.callApi).not.toHaveBeenCalled();

      releaseCleanup.resolve();
      await preceding;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(provider.callApi).not.toHaveBeenCalled();
    } finally {
      releaseCleanup.resolve();
      await Promise.allSettled([preceding, ...(evaluation ? [evaluation] : [])]);
      vi.useRealTimers();
    }
  });

  it('records CLI cleanup ownership without blocking setup on an earlier teardown', async () => {
    const cleanupStarted = deferred();
    const releaseCleanup = deferred();
    const claimed = deferred();
    const provider = {
      id: () => 'cli-setup-with-pending-cleanup',
      cleanupAfterEvaluation: vi.fn(async () => {
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      }),
    };
    const run = vi.fn(async () => {});
    const preceding = providerRegistry.withEvaluation(() =>
      providerRegistry.cleanupWhenIdle([provider]),
    );
    let next: Promise<void> | undefined;
    try {
      await cleanupStarted.promise;
      next = providerRegistry.withEvaluation(async () => {
        await providerRegistry.cleanupWhenIdle([provider]);
        claimed.resolve();
        await providerRegistry.withProvider(provider, run);
      });
      await claimed.promise;
      expect(run).not.toHaveBeenCalled();

      releaseCleanup.resolve();
      await Promise.all([preceding, next]);
      expect(run).toHaveBeenCalledOnce();
      expect(provider.cleanupAfterEvaluation).toHaveBeenCalledTimes(2);
    } finally {
      releaseCleanup.resolve();
      await Promise.allSettled([preceding, ...(next ? [next] : [])]);
    }
  });

  it('keeps cleanup with the target behind an evaluation wrapper until its cancelled call drains', async () => {
    const entered = deferred();
    const finish = deferred();
    const settled = deferred();
    let signal: AbortSignal | undefined;
    const cleanup = vi.fn(async () => {});
    const target: MCPProvider = Object.assign(Object.create(MCPProvider.prototype), {
      config: { enabled: false },
      getAvailableTools: vi.fn(async () => []),
      callApi: vi.fn(async (_prompt: string, _context: unknown, options?: CallApiOptionsParams) => {
        signal = options?.abortSignal;
        entered.resolve();
        try {
          await finish.promise;
          signal?.throwIfAborted();
          return { output: 'finished' };
        } finally {
          settled.resolve();
        }
      }),
      cleanup,
    });
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('ping')],
      tests: [{ metadata: { pluginId: 'custom' } }],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    const evaluation = providerRegistry.withEvaluation(async () => {
      await providerRegistry.cleanupWhenIdle([target]);
      return evaluate(suite, record, { timeoutMs: 50 });
    });
    try {
      await entered.promise;
      await evaluation;
      expect(signal?.aborted).toBe(true);
      expect(cleanup).not.toHaveBeenCalled();
      finish.resolve();
      await settled.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(cleanup).toHaveBeenCalledOnce();
    } finally {
      finish.resolve();
      await Promise.allSettled([evaluation]);
    }
  });

  it('releases each short evaluation while a different evaluation is still active', async () => {
    const started = deferred();
    const finish = deferred();
    const longResource = { shutdown: vi.fn(async () => {}) };
    const long = providerRegistry.withEvaluation(async () => {
      providerRegistry.register(longResource);
      started.resolve();
      await finish.promise;
    });
    try {
      await started.promise;
      for (let i = 0; i < 4; i++) {
        const shortResource = { shutdown: vi.fn(async () => {}) };
        const shortProvider = { id: () => 'short-' + i, cleanup: vi.fn(async () => {}) };
        await providerRegistry.withEvaluation(async () => {
          await providerRegistry.cleanupWhenIdle([shortProvider]);
          await providerRegistry.withProvider(shortProvider, async () => {
            providerRegistry.register(shortResource);
          });
        });
        expect(shortResource.shutdown).toHaveBeenCalledOnce();
        expect(shortProvider.cleanup).toHaveBeenCalledOnce();
        expect(longResource.shutdown).not.toHaveBeenCalled();
      }
      finish.resolve();
      await long;
      expect(longResource.shutdown).toHaveBeenCalledOnce();
    } finally {
      finish.resolve();
      await Promise.allSettled([long]);
      providerRegistry.unregister(longResource);
    }
  });

  it('reuses a nested evaluation scope and only closes its resources after the outer scope ends', async () => {
    const resource = { shutdown: vi.fn(async () => {}) };
    await providerRegistry.withEvaluation(async () => {
      providerRegistry.register(resource);
      await providerRegistry.withEvaluation(async () => {
        await providerRegistry.useResource(resource);
      });
      expect(resource.shutdown).not.toHaveBeenCalled();
    });
    expect(resource.shutdown).toHaveBeenCalledOnce();
  });

  it('only calls registered CLI cleanup through shutdown when shutdown delegates to it', async () => {
    const provider = {
      id: () => 'self-registered-cli-provider',
      cleanup: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {
        await provider.cleanup();
        providerRegistry.unregister(provider);
      }),
    };
    providerRegistry.register(provider);
    try {
      await providerRegistry.withEvaluation(async () => {
        await providerRegistry.cleanupWhenIdle([provider]);
        await providerRegistry.withProvider(provider, async () => {});
      });
      expect(provider.shutdown).toHaveBeenCalledOnce();
      expect(provider.cleanup).toHaveBeenCalledExactlyOnceWith();
    } finally {
      providerRegistry.unregister(provider);
    }
  });

  it('runs only an explicit idle cleanup hook for a registered CLI provider', async () => {
    const provider = {
      id: () => 'self-registered-cli-provider-with-idle-cleanup',
      cleanup: vi.fn(),
      cleanupAfterEvaluation: vi.fn(),
      shutdown: vi.fn(async () => {}),
    };
    providerRegistry.register(provider);
    try {
      await providerRegistry.withEvaluation(async () => {
        await providerRegistry.cleanupWhenIdle([provider]);
        await providerRegistry.withProvider(provider, async () => {});
      });
      expect(provider.cleanupAfterEvaluation).toHaveBeenCalledExactlyOnceWith({
        reason: 'evaluation-complete',
      });
      expect(provider.shutdown).not.toHaveBeenCalled();
      expect(provider.cleanup).not.toHaveBeenCalled();
      await providerRegistry.shutdownAll();
      expect(provider.shutdown).toHaveBeenCalledOnce();
      expect(provider.cleanupAfterEvaluation).toHaveBeenCalledOnce();
    } finally {
      providerRegistry.unregister(provider);
    }
  });

  it('tracks each sequential programmatic evaluation of a provider that registered only once', async () => {
    let open = false;
    const provider = {
      id: () => 'constructor-registered-reused-provider',
      callApi: vi.fn(async (prompt: string) => {
        open = true;
        return { output: prompt };
      }),
      shutdown: vi.fn(async () => {
        open = false;
        providerRegistry.unregister(provider);
      }),
    } satisfies ApiProvider & { shutdown(): Promise<void> };
    providerRegistry.register(provider);
    try {
      for (const [index, prompt] of ['first', 'second'].entries()) {
        const suite = { providers: [provider], prompts: [toPrompt(prompt)], tests: [{}] };
        const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
        const completed = await evaluate(suite, record, {});
        expect(await completed.getResults()).toEqual([
          expect.objectContaining({
            success: true,
            response: expect.objectContaining({ output: prompt }),
          }),
        ]);
        expect(provider.callApi).toHaveBeenCalledTimes(index + 1);
        expect(provider.shutdown).toHaveBeenCalledTimes(index + 1);
        expect(open).toBe(false);
      }
    } finally {
      providerRegistry.unregister(provider);
    }
  });

  it('waits for an old shutdown before restoring a reused provider for process shutdown', async () => {
    const shutdownStarted = deferred();
    const releaseShutdown = deferred();
    const secondStarted = deferred();
    const releaseSecond = deferred();
    const cleanup = vi.fn(async () => {});
    const provider = {
      id: () => 'constructor-registered-provider-with-pending-shutdown',
      cleanup,
      shutdown: vi.fn(async () => {
        if (provider.shutdown.mock.calls.length === 1) {
          shutdownStarted.resolve();
          await releaseShutdown.promise;
        }
        await cleanup();
        providerRegistry.unregister(provider);
      }),
    };
    providerRegistry.register(provider);
    const first = providerRegistry.withEvaluation(() =>
      providerRegistry.withProvider(provider, async () => {}),
    );
    const secondRun = vi.fn(async () => {
      secondStarted.resolve();
      await releaseSecond.promise;
    });
    let second: Promise<void> | undefined;
    try {
      await shutdownStarted.promise;
      second = providerRegistry.withEvaluation(async () => {
        await providerRegistry.cleanupWhenIdle([provider]);
        await providerRegistry.withProvider(provider, secondRun);
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(secondRun).not.toHaveBeenCalled();

      releaseShutdown.resolve();
      await Promise.all([first, secondStarted.promise]);
      expect(provider.shutdown).toHaveBeenCalledOnce();
      expect(cleanup).toHaveBeenCalledOnce();

      await providerRegistry.shutdownAll();
      expect(provider.shutdown).toHaveBeenCalledTimes(2);
      expect(cleanup).toHaveBeenCalledTimes(2);
      releaseSecond.resolve();
      await second;
      expect(cleanup).toHaveBeenCalledTimes(2);
    } finally {
      releaseShutdown.resolve();
      releaseSecond.resolve();
      await Promise.allSettled([first, ...(second ? [second] : [])]);
      providerRegistry.unregister(provider);
    }
  });

  it('does not restore a reused provider after its queued call has been cancelled', async () => {
    const shutdownStarted = deferred();
    const releaseShutdown = deferred();
    const provider = {
      id: () => 'constructor-registered-cancelled-provider',
      shutdown: vi.fn(async () => {
        shutdownStarted.resolve();
        await releaseShutdown.promise;
        providerRegistry.unregister(provider);
      }),
    };
    const controller = new AbortController();
    const reason = new Error('cancel queued reuse');
    const run = vi.fn(async () => {});
    providerRegistry.register(provider);
    const first = providerRegistry.withEvaluation(() =>
      providerRegistry.withProvider(provider, async () => {}),
    );
    let queued: Promise<void> | undefined;
    try {
      await shutdownStarted.promise;
      queued = providerRegistry.withEvaluation(() =>
        providerRegistry.withProvider(provider, run, controller.signal),
      );
      const rejection = expect(queued).rejects.toBe(reason);
      controller.abort(reason);
      await rejection;
      expect(run).not.toHaveBeenCalled();

      releaseShutdown.resolve();
      await first;
      await providerRegistry.shutdownAll();
      expect(provider.shutdown).toHaveBeenCalledOnce();
    } finally {
      releaseShutdown.resolve();
      await Promise.allSettled([first, ...(queued ? [queued] : [])]);
      providerRegistry.unregister(provider);
    }
  });

  it('directly closes a pending registered resource on process shutdown while its provider cleanup is held', async () => {
    const cleanupStarted = deferred();
    const releaseCleanup = deferred();
    const provider = {
      id: () => 'shutdown-during-cleanup',
      cleanupAfterEvaluation: vi.fn(async () => {
        cleanupStarted.resolve();
        await releaseCleanup.promise;
      }),
      shutdown: vi.fn(async () => {}),
    };
    const evaluation = providerRegistry.withEvaluation(async () => {
      await providerRegistry.cleanupWhenIdle([provider]);
      await providerRegistry.withProvider(provider, async () =>
        providerRegistry.register(provider),
      );
    });
    try {
      await cleanupStarted.promise;
      expect(provider.shutdown).not.toHaveBeenCalled();
      await providerRegistry.shutdownAll();
      expect(provider.shutdown).toHaveBeenCalledOnce();
      releaseCleanup.resolve();
      await evaluation;
      expect(provider.shutdown).toHaveBeenCalledOnce();
    } finally {
      releaseCleanup.resolve();
      await Promise.allSettled([evaluation]);
      providerRegistry.unregister(provider);
    }
  });

  it('keeps cleanup and transport release pending until an unawaited underlying provider call settles', async () => {
    const started = deferred();
    const finish = deferred();
    const resource = { shutdown: vi.fn(async () => {}) };
    const provider = { id: () => 'unawaited-provider', cleanup: vi.fn(async () => {}) };
    let physical: Promise<void> | undefined;
    const evaluation = providerRegistry.withEvaluation(async () => {
      await providerRegistry.cleanupWhenIdle([provider]);
      physical = providerRegistry.withProvider(provider, async () => {
        providerRegistry.register(resource);
        started.resolve();
        await finish.promise;
      });
      await started.promise;
    });
    try {
      await evaluation;
      expect(provider.cleanup).not.toHaveBeenCalled();
      expect(resource.shutdown).not.toHaveBeenCalled();
      finish.resolve();
      await physical;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(provider.cleanup).toHaveBeenCalledOnce();
      expect(resource.shutdown).toHaveBeenCalledOnce();
    } finally {
      finish.resolve();
      await Promise.allSettled([evaluation, ...(physical ? [physical] : [])]);
      providerRegistry.unregister(resource);
    }
  });

  it.each([false, true])(
    'closes a resource initialized after its evaluation ends when the physical call settles (failure: %s)',
    async (fails) => {
      const startInitialization = deferred();
      const registered = deferred();
      const finish = deferred();
      const resource = { shutdown: vi.fn(async () => {}) };
      const provider = { id: () => 'late-unawaited-provider', cleanup: vi.fn(async () => {}) };
      const failure = new Error('underlying provider failed');
      let physical: Promise<void> | undefined;
      const evaluation = providerRegistry.withEvaluation(async () => {
        await providerRegistry.cleanupWhenIdle([provider]);
        physical = providerRegistry.withProvider(provider, async () => {
          await startInitialization.promise;
          providerRegistry.register(resource);
          registered.resolve();
          await finish.promise;
          if (fails) {
            throw failure;
          }
        });
        void physical.catch(() => {});
      });
      try {
        await evaluation;
        startInitialization.resolve();
        await registered.promise;
        expect(resource.shutdown).not.toHaveBeenCalled();
        expect(provider.cleanup).not.toHaveBeenCalled();

        finish.resolve();
        if (fails) {
          await expect(physical).rejects.toBe(failure);
        } else {
          await physical;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(resource.shutdown).toHaveBeenCalledOnce();
        expect(provider.cleanup).toHaveBeenCalledOnce();
      } finally {
        startInitialization.resolve();
        finish.resolve();
        await Promise.allSettled([evaluation, ...(physical ? [physical] : [])]);
        providerRegistry.unregister(resource);
      }
    },
  );

  it('does not start using an earlier shared resource after the physical caller’s evaluation ends', async () => {
    const shutdownStarted = deferred();
    const releaseShutdown = deferred();
    const startUse = deferred();
    const using = deferred();
    const resource = {
      shutdown: vi.fn(async () => {
        shutdownStarted.resolve();
        await releaseShutdown.promise;
      }),
    };
    const provider = { id: () => 'outliving-resource-caller' };
    const touched = vi.fn();
    const earlier = providerRegistry.withEvaluation(async () =>
      providerRegistry.register(resource),
    );
    let physical: Promise<void> | undefined;
    const evaluation = providerRegistry.withEvaluation(async () => {
      physical = providerRegistry.withProvider(provider, async () => {
        await startUse.promise;
        using.resolve();
        await providerRegistry.useResource(resource);
        touched();
        providerRegistry.register(resource);
      });
      void physical.catch(() => {});
    });
    try {
      await Promise.all([shutdownStarted.promise, evaluation]);
      startUse.resolve();
      await using.promise;
      await expect(physical).rejects.toMatchObject({ name: 'AbortError' });
      expect(touched).not.toHaveBeenCalled();

      releaseShutdown.resolve();
      await earlier;
      expect(touched).not.toHaveBeenCalled();
      expect(resource.shutdown).toHaveBeenCalledOnce();
    } finally {
      startUse.resolve();
      releaseShutdown.resolve();
      await Promise.allSettled([earlier, evaluation, ...(physical ? [physical] : [])]);
      providerRegistry.unregister(resource);
    }
  });

  it('shares a lazily registered transport with evaluations already using the same provider', async () => {
    const bothStarted = deferred();
    const finishFirst = deferred();
    const finishSecond = deferred();
    const resource = { shutdown: vi.fn(async () => {}) };
    const provider = { id: () => 'late-registration' };
    let calls = 0;
    const use = (first: boolean) =>
      providerRegistry.withEvaluation(async () => {
        await providerRegistry.useProvider(provider);
        await providerRegistry.withProvider(provider, async () => {
          if (++calls === 2) {
            bothStarted.resolve();
          }
          await bothStarted.promise;
          if (first) {
            providerRegistry.register(resource);
          }
          await (first ? finishFirst : finishSecond).promise;
        });
      });
    const first = use(true);
    const second = use(false);
    try {
      await bothStarted.promise;
      finishFirst.resolve();
      await first;
      expect(resource.shutdown).not.toHaveBeenCalled();
      finishSecond.resolve();
      await second;
      expect(resource.shutdown).toHaveBeenCalledOnce();
    } finally {
      finishFirst.resolve();
      finishSecond.resolve();
      await Promise.allSettled([first, second]);
      providerRegistry.unregister(resource);
    }
  });

  it('calls legacy cleanup without arguments and uses the separate evaluation hook when present', async () => {
    const legacy = {
      id: () => 'legacy-optional-force',
      callApi: async () => ({ output: 'ok' }),
      cleanup: vi.fn((force?: boolean) => {
        if (force) {
          throw new Error('Unexpected forced cleanup');
        }
      }),
    } satisfies ApiProvider;
    const aware = {
      id: () => 'evaluation-aware-cleanup',
      callApi: async () => ({ output: 'ok' }),
      cleanup: vi.fn(),
      cleanupAfterEvaluation: vi.fn(),
    } satisfies ApiProvider;

    await providerRegistry.withEvaluation(async () => {
      await providerRegistry.cleanupWhenIdle([legacy, aware]);
    });

    expect(legacy.cleanup).toHaveBeenCalledExactlyOnceWith();
    expect(aware.cleanupAfterEvaluation).toHaveBeenCalledExactlyOnceWith({
      reason: 'evaluation-complete',
    });
    expect(aware.cleanup).not.toHaveBeenCalled();
  });

  it.each(['distinct', 'shared', 'abort', 'error'] as const)(
    'keeps the active registered request alive when the other %s run finishes',
    async (mode) => {
      const enteredA = deferred();
      const enteredB = deferred();
      const releaseA = deferred();
      const releaseB = deferred();
      const abortA = new AbortController();
      const createProvider = (name: string) => {
        let closed = false;
        const id = `${name}-${randomUUID()}`;
        const provider = {
          id: () => id,
          shutdown: vi.fn(async () => {
            closed = true;
          }),
          async callApi(prompt: string, _context: unknown, options?: CallApiOptionsParams) {
            // Registration is deliberately lazy, as with Python pools and MCP clients.
            providerRegistry.register(provider);
            const isA = prompt === 'A';
            (isA ? enteredA : enteredB).resolve();
            await (isA ? releaseA : releaseB).promise;
            options?.abortSignal?.throwIfAborted();
            if (isA && mode === 'error') {
              throw new Error('fail only evaluation A');
            }
            if (closed) {
              throw new Error('Registered transport closed during its request');
            }
            return { output: `completed ${prompt}` };
          },
        } satisfies ApiProvider & { shutdown(): Promise<void> };
        return provider;
      };
      const providerA = createProvider('A');
      const providerB = mode === 'shared' ? providerA : createProvider('B');
      const suite = (provider: ApiProvider, prompt: string): TestSuite => ({
        providers: [provider],
        prompts: [toPrompt(prompt)],
        tests: [{}],
      });
      const suiteA = suite(providerA, 'A');
      const suiteB = suite(providerB, 'B');
      const recordA = await Eval.create({}, suiteA.prompts, { id: randomUUID() });
      const recordB = await Eval.create({}, suiteB.prompts, { id: randomUUID() });
      const pendingB = evaluate(suiteB, recordB, {});
      let pendingA: ReturnType<typeof evaluate> | undefined;
      try {
        await enteredB.promise;
        pendingA = evaluate(suiteA, recordA, { abortSignal: abortA.signal });
        await enteredA.promise;
        if (mode === 'abort') {
          abortA.abort(new Error('cancel only evaluation A'));
        }
        releaseA.resolve();
        await pendingA;
        expect(providerB.shutdown).not.toHaveBeenCalled();
        releaseB.resolve();
        const completed = await pendingB;
        expect(await completed.getResults()).toEqual([
          expect.objectContaining({
            success: true,
            response: expect.objectContaining({ output: 'completed B' }),
          }),
        ]);
        expect(providerB.shutdown).toHaveBeenCalledOnce();
        expect(providerA.shutdown).toHaveBeenCalledOnce();
      } finally {
        releaseA.resolve();
        releaseB.resolve();
        await Promise.allSettled([pendingB, ...(pendingA ? [pendingA] : [])]);
        await providerRegistry.shutdownAll();
      }
    },
  );
});
