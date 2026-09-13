import { AsyncLocalStorage } from 'node:async_hooks';

import type { EnvOverrides } from './types/env';

export type EnvOverridesProvider = () => EnvOverrides | undefined;

const requestEnvOverrides = new AsyncLocalStorage<EnvOverrides>();

/** Keep one async operation's environment independent of concurrent config loads. */
export function withEnvOverrides<T>(env: EnvOverrides, callback: () => T): T {
  return requestEnvOverrides.run({ ...env }, callback);
}

/**
 * Module-level singleton; last-writer-wins. Scoped to the current process —
 * not propagated to `worker_threads` or child processes, which must register
 * their own provider (typically by importing `./cliState`).
 *
 * Kept independent of application modules: this module is reachable from the bottom
 * of the import graph (via `envars`), so adding imports here risks circular
 * cycles with logger / cliState.
 */
let envOverridesProvider: EnvOverridesProvider | undefined;

export function setEnvOverridesProvider(provider: EnvOverridesProvider | undefined): void {
  envOverridesProvider = provider;
}

/** Return only the current async request, excluding the process-wide CLI fallback. */
export function getRequestEnvOverrides(): EnvOverrides | undefined {
  return requestEnvOverrides.getStore();
}

/**
 * Returns the current env overrides snapshot, or `undefined` if no provider is
 * registered. Swallows provider exceptions to preserve the invariant that
 * `getEnvString` (and its delegates `getEnvBool` / `getEnvInt` / etc.) never
 * throw on environment access — relied on by ~148 call sites.
 */
export function getEnvOverrides(): EnvOverrides | undefined {
  const requestEnv = getRequestEnvOverrides();
  if (requestEnv !== undefined) {
    return requestEnv;
  }
  if (!envOverridesProvider) {
    return undefined;
  }
  try {
    return envOverridesProvider();
  } catch {
    return undefined;
  }
}
