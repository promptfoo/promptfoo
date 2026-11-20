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
 * Options the OpenAI chat provider resolves itself: it loads `file://` references, renders
 * Nunjucks vars, merges in MCP tools and normalizes tool shapes. `passthrough` is spread into
 * the body last, so a chat provider that forwards its model parameters through `passthrough`
 * must keep these out of it, or a raw copy would clobber the resolved value. The chat provider
 * sends each of these whenever it is set (an empty `tools` list aside), so dropping the raw
 * copy cannot lose a usable parameter. Keeping them at the top level also lets function-call
 * assertions see `functions` and lets a prompt's or test's own value win.
 * `reasoning_effort` is deliberately absent: the chat provider only renders and
 * emits it for recognized reasoning model patterns or names containing `gpt-oss`, so
 * passthrough has to keep carrying it for other models. The completion and embedding
 * providers do not resolve these options, so they keep receiving them through `passthrough`.
 */
export const CHAT_RESOLVED_OPTION_NAMES = [
  'functions',
  'response_format',
  'tool_choice',
  'tools',
] satisfies (keyof OpenAiCompletionOptions)[];

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
