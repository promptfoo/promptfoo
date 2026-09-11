import type { EnvOverrides } from '../types/env';
import type { ProviderOptions } from '../types/providers';

/** Canonical registry input, with the old nested shape accepted at public creator boundaries. */
export interface ProviderCreatorOptions {
  providerOptions?: ProviderOptions;
  /** @deprecated Pass providerOptions instead. This is the entire ProviderOptions, not model config. */
  config?: ProviderOptions;
  id?: string;
  env?: EnvOverrides;
}

export function resolveProviderCreatorInput(input: ProviderCreatorOptions): ProviderOptions {
  const legacy = input.config;
  return (
    input.providerOptions ?? {
      ...legacy,
      id: input.id ?? legacy?.id,
      env: input.env || legacy?.env ? { ...input.env, ...legacy?.env } : undefined,
    }
  );
}
