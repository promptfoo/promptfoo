import { AsyncLocalStorage } from 'node:async_hooks';

interface PrivateRangeGuardContext {
  enabled: true;
}

const privateRangeGuardContext = new AsyncLocalStorage<PrivateRangeGuardContext>();

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
