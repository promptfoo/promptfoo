import type { EnvOverrides } from './types/env';

export type EnvOverridesProvider = (layer: 'suite' | 'file') => EnvOverrides | undefined;

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
 * Returns suite overrides or env-file defaults, or `undefined` if no provider is
 * registered. Swallows provider exceptions to preserve the invariant that
 * `getEnvString` (and its delegates `getEnvBool` / `getEnvInt` / etc.) never
 * throw on environment access — relied on by ~148 call sites.
 */
export function getEnvOverrides(layer: 'suite' | 'file' = 'suite'): EnvOverrides | undefined {
  if (!envOverridesProvider) {
    return undefined;
  }
  try {
    return envOverridesProvider(layer);
  } catch {
    return undefined;
  }
}

/** Environment inherited by child processes, including invocation-local file values. */
export function getProcessEnv(): NodeJS.ProcessEnv {
  const fileEnv = getEnvOverrides('file');
  return fileEnv
    ? {
        ...process.env,
        ...Object.fromEntries(Object.entries(fileEnv).filter(([, value]) => value !== undefined)),
      }
    : process.env;
}
