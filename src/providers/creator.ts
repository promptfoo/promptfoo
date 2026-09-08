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

// OpenAI-compatible providers serialize passthrough into the request body.
// Keep transport, billing, and loader settings on the provider instead.
const OPENAI_PROVIDER_OPTIONS = new Set([
  'apiKey',
  'apiKeyEnvar',
  'apiKeyRequired',
  'apiHost',
  'apiBaseUrl',
  'organization',
  'headers',
  'maxRetries',
  'cost',
  'inputCost',
  'outputCost',
  'audioCost',
  'audioInputCost',
  'audioOutputCost',
  'mcp',
  'functionToolCallbacks',
  'showThinking',
  'omitDefaults',
  'basePath',
  'linkedTargetId',
]);

export function splitOpenAiCompatibleConfig(config: Record<string, any>) {
  const { passthrough, ...options } = config;
  const providerOptions: Record<string, any> = {};
  const modelParameters: Record<string, any> = {};
  for (const [key, value] of Object.entries(options)) {
    (OPENAI_PROVIDER_OPTIONS.has(key) ? providerOptions : modelParameters)[key] = value;
  }
  return { providerOptions, passthrough: { ...modelParameters, ...passthrough } };
}
