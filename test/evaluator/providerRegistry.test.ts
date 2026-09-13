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
