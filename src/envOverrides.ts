import type { EnvOverrides } from './types/env';

export type EnvOverridesProvider = () => EnvOverrides | undefined;

/**
 * Module-level singleton; last-writer-wins. Scoped to the current process —
 * not propagated to `worker_threads` or child processes, which must register
 * their own provider (typically by importing `./cliState`).
 *
 * Kept dependency-free on purpose: this module is reachable from the bottom
 * of the import graph (via `envars`), so adding imports here risks circular
 * cycles with logger / cliState.
 */
let envOverridesProvider: EnvOverridesProvider | undefined;

export function setEnvOverridesProvider(provider: EnvOverridesProvider | undefined): void {
  envOverridesProvider = provider;
}

/**
 * Returns the current env overrides snapshot, or `undefined` if no provider is
 * registered. Swallows provider exceptions to preserve the invariant that
 * `getEnvString` (and its delegates `getEnvBool` / `getEnvInt` / etc.) never
 * throw on environment access — relied on by ~148 call sites.
 */
export function getEnvOverrides(): EnvOverrides | undefined {
  if (!envOverridesProvider) {
    return undefined;
  }
  try {
    return envOverridesProvider();
  } catch {
    return undefined;
  }
}
