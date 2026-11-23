import { AsyncLocalStorage } from 'node:async_hooks';

// Providers and extension hooks can load another copy of the public entry point.
const key = Symbol.for('promptfoo.privateEvaluation.v1');
const shared = globalThis as typeof globalThis & { [key]?: AsyncLocalStorage<boolean> };
const privacy = (shared[key] ??= new AsyncLocalStorage<boolean>());

export function withPrivateEvaluation<T>(operation: () => T): T {
  return privacy.run(true, operation);
}

export function isPrivateEvaluation(): boolean {
  return privacy.getStore() === true;
}
