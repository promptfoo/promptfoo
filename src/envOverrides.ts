import type { EnvOverrides } from './types/env';

export type EnvOverridesProvider = (layer: 'suite' | 'file') => EnvOverrides | undefined;

type ProviderLayerOverridesProvider = (
  layer: 'suite' | 'file' | 'provider',
) => EnvOverrides | undefined;

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
let providerLayerOverridesProvider: ProviderLayerOverridesProvider | undefined;

/**
 * Opt in to provider-layer reads by Promptfoo's environment helpers, not native SDK discovery.
 * Pass the option again whenever re-registering a provider-layer callback.
 */
export function setEnvOverridesProvider(provider: EnvOverridesProvider | undefined): void;
export function setEnvOverridesProvider(
  provider: ProviderLayerOverridesProvider | undefined,
  options: { providerLayer: true },
): void;
export function setEnvOverridesProvider(
  provider: EnvOverridesProvider | undefined,
  options?: { providerLayer: true },
): void {
  envOverridesProvider = provider;
  providerLayerOverridesProvider = options?.providerLayer
    ? (provider as ProviderLayerOverridesProvider | undefined)
    : undefined;
}

export function getEnvOverridesProvider(): EnvOverridesProvider | undefined {
  return envOverridesProvider;
}

export function getProviderEnvOverrides(): EnvOverrides | undefined {
  return providerLayerOverridesProvider?.('provider');
}
