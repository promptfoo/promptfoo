import { AsyncLocalStorage } from 'node:async_hooks';

interface PrivateRangeGuardContext {
  enabled: true;
}

// The packaged server and the public ESM/CJS entry points can load separate
// copies of this module. The guard decision must survive that split: a server
// route enters the guard context in its copy, but the provider code that
// performs the fetch may run in the library copy. Share the
// AsyncLocalStorage on globalThis under a well-known symbol, mirroring the
// cache module's handling of the same duplicate-copy condition.
const GUARD_CONTEXT_KEY = Symbol.for('promptfoo.guard.privateRangeContext.v1');
const guardContextGlobal = globalThis as typeof globalThis & {
  [GUARD_CONTEXT_KEY]?: AsyncLocalStorage<PrivateRangeGuardContext>;
};
const privateRangeGuardContext = (guardContextGlobal[GUARD_CONTEXT_KEY] ??=
  new AsyncLocalStorage<PrivateRangeGuardContext>());

/**
 * Run `fn` inside the private-range guard context.
 *
 * The guarded server routes (the ones that preflight caller-chosen provider
 * targets when `PROMPTFOO_BLOCK_PRIVATE_RANGES` is set) wrap their downstream
 * provider calls in this context. `fetchWithProxy` applies manual redirect
 * validation only to requests made inside the context, so the process-wide
 * flag alone never changes fetch behavior for unrelated callers in the same
 * process, such as eval runs against local targets.
 */
export function withPrivateRangeGuard<T>(fn: () => Promise<T>): Promise<T> {
  return privateRangeGuardContext.run({ enabled: true }, fn);
}

/**
 * Whether the current async context belongs to a guarded server request.
 */
export function isPrivateRangeGuardContextActive(): boolean {
  return privateRangeGuardContext.getStore()?.enabled === true;
}
