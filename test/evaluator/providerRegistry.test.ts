import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { providerRegistry } from '../../src/providers/providerRegistry';
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

  it('directly closes a pending registered resource on process shutdown while its provider cleanup is held', async () => {
    const cleanupStarted = deferred();
    const releaseCleanup = deferred();
    const provider = {
      id: () => 'shutdown-during-cleanup',
      cleanup: vi.fn(async () => {
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

  it('waits for an earlier resource shutdown when the physical caller outlives its evaluation', async () => {
    const shutdownStarted = deferred();
    const releaseShutdown = deferred();
    const startUse = deferred();
    const using = deferred();
    const finish = deferred();
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
        await finish.promise;
      });
      void physical.catch(() => {});
    });
    try {
      await Promise.all([shutdownStarted.promise, evaluation]);
      startUse.resolve();
      await using.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(touched).not.toHaveBeenCalled();

      releaseShutdown.resolve();
      await earlier;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(touched).toHaveBeenCalledOnce();
      expect(resource.shutdown).toHaveBeenCalledOnce();

      finish.resolve();
      await physical;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(resource.shutdown).toHaveBeenCalledTimes(2);
    } finally {
      startUse.resolve();
      releaseShutdown.resolve();
      finish.resolve();
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

  it('uses the process-specific shutdown hook only for providers that opt in', async () => {
    const legacy = { shutdown: vi.fn(async () => {}) };
    const aware = {
      shutdown: vi.fn(async () => {}),
      shutdownForProcess: vi.fn(async () => {}),
    };
    providerRegistry.register(legacy);
    providerRegistry.register(aware);

    await providerRegistry.shutdownForProcess();

    expect(legacy.shutdown).toHaveBeenCalledExactlyOnceWith();
    expect(aware.shutdownForProcess).toHaveBeenCalledExactlyOnceWith();
    expect(aware.shutdown).not.toHaveBeenCalled();
    providerRegistry.register(aware);
    await providerRegistry.shutdownAll();
    expect(aware.shutdown).toHaveBeenCalledExactlyOnceWith();
    expect(aware.shutdownForProcess).toHaveBeenCalledOnce();
  });

  it('starts resources registered by a process shutdown hook without waiting for that hook to finish', async () => {
    const nestedStarted = deferred();
    const releaseRoot = deferred();
    const leaf = {
      shutdown: vi.fn(async () => {
        nestedStarted.resolve();
      }),
    };
    const child = {
      shutdown: vi.fn(async () => {}),
      shutdownForProcess: vi.fn(async () => {
        providerRegistry.register(leaf);
      }),
    };
    const root = {
      shutdown: vi.fn(async () => {}),
      shutdownForProcess: vi.fn(async () => {
        providerRegistry.register(root);
        providerRegistry.register(child);
        await releaseRoot.promise;
      }),
    };
    providerRegistry.register(root);
    const completed = vi.fn();
    const pending = providerRegistry.shutdownForProcess().then(completed);
    try {
      await nestedStarted.promise;
      expect(root.shutdownForProcess).toHaveBeenCalledOnce();
      expect(child.shutdownForProcess).toHaveBeenCalledOnce();
      expect(leaf.shutdown).toHaveBeenCalledOnce();
      expect(completed).not.toHaveBeenCalled();
      expect(root.shutdown).not.toHaveBeenCalled();
      expect(child.shutdown).not.toHaveBeenCalled();
    } finally {
      releaseRoot.resolve();
      await pending;
      for (const resource of [root, child, leaf]) {
        providerRegistry.unregister(resource);
      }
    }
    expect(completed).toHaveBeenCalledOnce();
  });

  it('escalates an already-running ordinary release without waiting for it', async () => {
    const started = deferred();
    const complete = deferred();
    const resource = {
      shutdown: vi.fn(async () => {
        started.resolve();
        await complete.promise;
      }),
      shutdownForProcess: vi.fn(async () => {}),
    };
    providerRegistry.register(resource);
    const ordinary = providerRegistry.shutdownAll();
    await started.promise;
    try {
      await providerRegistry.shutdownForProcess();
      expect(resource.shutdownForProcess).toHaveBeenCalledExactlyOnceWith();
      expect(resource.shutdown).toHaveBeenCalledOnce();
    } finally {
      complete.resolve();
      await ordinary;
    }
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
