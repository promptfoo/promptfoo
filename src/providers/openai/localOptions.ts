import type { OpenAiCompletionOptions, OpenAiSharedOptions } from './types';

/**
 * Config keys promptfoo or its transport consumes, rather than model parameters that belong
 * in the request body. Requiring every shared option keeps future connection settings — and
 * promptfoo bookkeeping such as `basePath` — out of `passthrough`, where they would be
 * serialized verbatim into the JSON body of every request.
 */
const LOCAL_OPTIONS = {
  apiKey: true,
  apiKeyEnvar: true,
  apiKeyRequired: true,
  useDefaultApiKey: true,
  apiHost: true,
  apiBaseUrl: true,
  organization: true,
  headers: true,
  maxRetries: true,
  cost: true,
  inputCost: true,
  outputCost: true,
  audioCost: true,
  audioInputCost: true,
  audioOutputCost: true,
  passthrough: true,
  mcp: true,
  functionToolCallbacks: true,
  showThinking: true,
  omitDefaults: true,
  basePath: true,
  linkedTargetId: true,
} satisfies Record<keyof OpenAiSharedOptions, boolean> &
  Partial<Record<keyof OpenAiCompletionOptions | 'basePath' | 'linkedTargetId', boolean>>;

const LOCAL_OPTION_NAMES = new Set<string>(Object.keys(LOCAL_OPTIONS));

/**
 * Splits an OpenAI-compatible provider config into the settings promptfoo handles itself
 * (auth, routing, headers, cost overrides) and genuine model parameters, so that only the
 * latter reach the request body via `passthrough`.
 *
 * `extraLocalKeys` lets a provider keep its own vendor-specific settings local too.
 */
export function splitLocalOptions(
  config: Record<string, any> = {},
  extraLocalKeys: string[] = [],
): { localOptions: Record<string, any>; modelParameters: Record<string, any> } {
  const localOptions: Record<string, any> = {};
  const modelParameters: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    const target =
      LOCAL_OPTION_NAMES.has(key) || extraLocalKeys.includes(key) ? localOptions : modelParameters;
    target[key] = value;
  }
  return { localOptions, modelParameters };
}
