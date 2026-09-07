import type { EnvOverrides } from '../types/env';
import type { ProviderOptions } from '../types/providers';

export interface ParsedProviderPath {
  readonly value: string;
  readonly segments: readonly string[];
}

export function parseProviderPath(value: string): ParsedProviderPath {
  return { value, segments: value.split(':') };
}

/** Canonical registry input, with the old nested shape accepted at public creator boundaries. */
export interface ProviderCreatorOptions {
  providerOptions?: ProviderOptions;
  parsedPath?: ParsedProviderPath;
  /** @deprecated Pass providerOptions instead. This is the entire ProviderOptions, not model config. */
  config?: ProviderOptions;
  id?: string;
  env?: EnvOverrides;
}

export function resolveProviderCreatorInput(value: string, input: ProviderCreatorOptions) {
  const legacy = input.config;
  return {
    parsedPath: input.parsedPath?.value === value ? input.parsedPath : parseProviderPath(value),
    providerOptions: input.providerOptions ?? {
      ...legacy,
      id: input.id ?? legacy?.id,
      env: input.env || legacy?.env ? { ...input.env, ...legacy?.env } : undefined,
    },
  };
}
