import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
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
  it('waits for an in-progress release before the next evaluation starts', async () => {
    const shutdownStarted = deferred();
    const releaseShutdown = deferred();
    const registered = {
      shutdown: vi.fn(async () => {
        shutdownStarted.resolve();
        await releaseShutdown.promise;
      }),
    };
    providerRegistry.register(registered);
    const earlier = providerRegistry.withEvaluation(async () => {});
    const run = vi.fn(async () => {});
    let next: Promise<void> | undefined;
    try {
      await shutdownStarted.promise;
      next = providerRegistry.withEvaluation(run);
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

  it('stops waiting for an earlier release that never settles', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const shutdownStarted = deferred();
    const hung = {
      shutdown: vi.fn(() => {
        shutdownStarted.resolve();
        return new Promise<void>(() => {});
      }),
    };
    providerRegistry.register(hung);
    // The first evaluation's release never settles, so its own promise never does either.
    void providerRegistry.withEvaluation(async () => {});
    const run = vi.fn(async () => 'ran');
    try {
      await shutdownStarted.promise;
      const next = providerRegistry.withEvaluation(run);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(run).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await expect(next).resolves.toBe('ran');
      expect(hung.shutdown).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('starting anyway'));
    } finally {
      warn.mockRestore();
    }
  });

  it.each(['still running', 'already finished'] as const)(
    'does not let a timed-out cleanup close resources owned by a newer evaluation that is %s',
    async (newerState) => {
      vi.useFakeTimers();
      const cleanupStarted = deferred();
      const releaseCleanup = deferred();
      const newerStarted = deferred();
      const finishNewer = deferred();
      const cleanup = {
        id: () => 'slow-idle-cleanup',
        cleanup: vi.fn(async () => {
          cleanupStarted.resolve();
          await releaseCleanup.promise;
        }),
      };
      const reused = { shutdown: vi.fn(async () => {}) };
      const fresh = { shutdown: vi.fn(async () => {}) };
      providerRegistry.register(reused);
      const earlier = providerRegistry.withEvaluation(async () => {
        providerRegistry.cleanupWhenIdle([cleanup]);
      });
      let newer: Promise<void> | undefined;
      try {
        await cleanupStarted.promise;
        newer = providerRegistry.withEvaluation(async () => {
          providerRegistry.register(reused);
          providerRegistry.register(fresh);
          newerStarted.resolve();
          await finishNewer.promise;
        });
        await vi.advanceTimersByTimeAsync(30_000);
        await newerStarted.promise;
        if (newerState === 'already finished') {
          finishNewer.resolve();
          await newer;
          expect(reused.shutdown).toHaveBeenCalledOnce();
          expect(fresh.shutdown).toHaveBeenCalledOnce();
        }
        releaseCleanup.resolve();
        await earlier;
        if (newerState === 'still running') {
          expect(reused.shutdown).not.toHaveBeenCalled();
          expect(fresh.shutdown).not.toHaveBeenCalled();
        }

        finishNewer.resolve();
        await newer;
        expect(reused.shutdown).toHaveBeenCalledOnce();
        expect(fresh.shutdown).toHaveBeenCalledOnce();
      } finally {
        releaseCleanup.resolve();
        finishNewer.resolve();
        await Promise.allSettled([earlier, ...(newer ? [newer] : [])]);
        providerRegistry.unregister(reused);
        providerRegistry.unregister(fresh);
        vi.useRealTimers();
      }
    },
  );

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
      providerRegistry.cleanupWhenIdle([legacy, aware]);
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
