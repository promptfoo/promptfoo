import { getEnvString } from '../envars';
import { getAnthropicEnvHeaderSuppressions } from './anthropic/generic';
import { AnthropicMessagesProvider } from './anthropic/messages';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiResponsesProvider } from './openai/responses';
import type { ClientOptions } from '@anthropic-ai/sdk';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';
import type { AnthropicMessageOptions } from './anthropic/types';
import type { OpenAiCompletionOptions } from './openai/types';

const META_API_BASE_URL = 'https://api.meta.ai/v1';
// The Anthropic-compatible Messages surface is served from the bare host; the
// Anthropic SDK appends /v1/messages itself.
const META_MESSAGES_API_BASE_URL = 'https://api.meta.ai';
// MODEL_API_KEY is Meta's official env var: it's what the SDKs, docs, and
// quickstart use. Use `apiKeyEnvar` (or `apiKey`) in the provider config to
// source the key from somewhere else.
const META_API_KEY_ENVAR = 'MODEL_API_KEY';
const DEFAULT_META_MODEL = 'muse-spark-1.1';

// Muse Spark rejects other values (including OpenAI's 'none') with an HTTP 400.
const META_REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'];

// Minimal config shapes shared by the OpenAI- and Anthropic-based Meta providers.
type MetaKeyConfig = { apiKey?: string; apiKeyEnvar?: string };
type MetaCostConfig = {
  cost?: number;
  inputCost?: number;
  outputCost?: number;
  // Per-cached-token input rate. The Meta Model API bills cached prompt tokens
  // below the normal input rate; override the built-in rate if pricing changes.
  cacheReadCost?: number;
};

type MetaConfig = OpenAiCompletionOptions & MetaCostConfig;

type MetaProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: MetaConfig;
};

type MetaMessagesConfig = AnthropicMessageOptions & MetaKeyConfig & MetaCostConfig;

type MetaMessagesProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: MetaMessagesConfig;
};

// Published Meta Model API pricing in USD per token (the pricing page lists
// $1.25 / $0.15 (cached) / $4.25 per 1M tokens for muse-spark-1.1; reasoning
// tokens bill at the output rate). Models missing from this table fall back to
// user-supplied `cost` / `inputCost` / `outputCost` overrides.
// https://dev.meta.ai/docs/getting-started/pricing-rate-limits
export const META_MODEL_PRICES: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  'muse-spark-1.1': {
    input: 1.25 / 1e6,
    cachedInput: 0.15 / 1e6,
    output: 4.25 / 1e6,
  },
};

function getProviderEnvString(env: EnvOverrides | undefined, key: EnvVarKey): string | undefined {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    const value = env[key as keyof EnvOverrides];
    return value === undefined ? undefined : String(value);
  }
  return undefined;
}

// Resolve the key from Meta-specific sources only — unlike the OpenAI base
// provider we do NOT fall back to OPENAI_API_KEY, which would send an OpenAI
// key to the Meta endpoint and 401. Provider-scoped `env:` overrides beat the
// ambient process env.
function resolveMetaApiKey(
  config: MetaKeyConfig,
  env: EnvOverrides | undefined,
): string | undefined {
  if (config.apiKey !== undefined) {
    return config.apiKey;
  }
  const apiKeyEnvar = (config.apiKeyEnvar ?? META_API_KEY_ENVAR) as EnvVarKey;
  return getProviderEnvString(env, apiKeyEnvar) ?? getEnvString(apiKeyEnvar);
}

function missingMetaApiKeyMessage(config: MetaKeyConfig): string {
  return (
    `Meta Model API key is not set. Set the ${config.apiKeyEnvar ?? META_API_KEY_ENVAR} ` +
    'environment variable or add `apiKey` to the provider config.'
  );
}

// Shared defaults for the two OpenAI-based Meta providers. `||` (not `??`) for
// apiBaseUrl so an empty string — e.g. a template that rendered empty — still
// resolves to the Meta endpoint.
function resolveMetaOpenAiConfig(config: MetaConfig = {}): MetaConfig {
  return {
    ...config,
    apiKeyEnvar: config.apiKeyEnvar ?? META_API_KEY_ENVAR,
    apiBaseUrl: config.apiBaseUrl || META_API_BASE_URL,
  };
}

function metaToJSON(provider: string, modelName: string, config: MetaKeyConfig) {
  return {
    provider,
    model: modelName,
    config: {
      ...config,
      ...(config.apiKey && { apiKey: undefined }),
    },
  };
}

function assertSupportedReasoningEffort(effort: unknown): void {
  if (effort === undefined || effort === null) {
    return;
  }
  if (!META_REASONING_EFFORTS.includes(String(effort))) {
    throw new Error(
      `Muse Spark models do not support reasoning_effort '${effort}'. Omit it to let ` +
        `the model pick its own reasoning depth, or use one of: ${META_REASONING_EFFORTS.join(', ')}.`,
    );
  }
}

// Set the single output-cap field a Meta endpoint accepts, or — when no cap is
// configured — strip a leaked OPENAI_MAX_COMPLETION_TOKENS / OPENAI_MAX_TOKENS
// env default so reasoning keeps the full output budget. Explicit passthrough
// values are left untouched.
function applyMetaOutputCap(
  body: Record<string, unknown>,
  passthrough: Record<string, unknown>,
  field: 'max_completion_tokens' | 'max_output_tokens',
  value: number | undefined,
): void {
  if (field in passthrough) {
    return;
  }
  if (value === undefined) {
    delete body[field];
  } else {
    body[field] = value;
  }
}

// The base providers seed temperature / top_p / penalties from OPENAI_* env
// vars whenever those are set. They are OpenAI-scoped tuning knobs; don't let
// them leak into Meta requests. Promptfoo's deterministic temperature default
// is kept, sourced from config alone.
function applyMetaSamplingHygiene(
  body: Record<string, unknown>,
  config: OpenAiCompletionOptions,
  passthrough: Record<string, unknown>,
  samplingKeys: Array<'top_p' | 'presence_penalty' | 'frequency_penalty'>,
): void {
  if (config.temperature === undefined && !('temperature' in passthrough)) {
    if (config.omitDefaults) {
      delete body.temperature;
    } else {
      body.temperature = 0;
    }
  }
  for (const key of samplingKeys) {
    if (config[key] === undefined && !(key in passthrough)) {
      delete body[key];
    }
  }
}

/**
 * Cost for a Meta Model API call. Uses the built-in price table for known
 * models; `cost` / `inputCost` / `outputCost` / `cacheReadCost` overrides take
 * precedence (all in USD per token). Cached prompt tokens bill at
 * `cacheReadCost`, falling back to a user input rate, then the built-in cached
 * rate — the same precedence the OpenAI billing path uses.
 */
export function calculateMetaCost(
  modelName: string,
  config: MetaCostConfig,
  promptTokens?: number,
  completionTokens?: number,
  cachedTokens?: number,
): number | undefined {
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) {
    return undefined;
  }

  const prices = META_MODEL_PRICES[modelName];
  const inputCost = config.inputCost ?? config.cost ?? prices?.input;
  const outputCost = config.outputCost ?? config.cost ?? prices?.output;
  if (inputCost === undefined || outputCost === undefined) {
    return undefined;
  }

  const billableCachedTokens = Number.isFinite(cachedTokens)
    ? Math.min(Math.max(cachedTokens!, 0), promptTokens!)
    : 0;
  const uncachedPromptTokens = promptTokens! - billableCachedTokens;
  const cacheReadCost =
    config.cacheReadCost ?? config.inputCost ?? config.cost ?? prices?.cachedInput ?? inputCost;

  return (
    inputCost * uncachedPromptTokens +
    cacheReadCost * billableCachedTokens +
    outputCost * completionTokens!
  );
}

// Fill in cost for responses the OpenAI/Anthropic billing tables can't price
// (Muse models are in neither). Both base getTokenUsage helpers surface cache
// reads as completionDetails.cacheReadInputTokens, so that is the only source
// needed. Honors prompt-level cost overrides like the base billing paths do.
function applyMetaCost(
  response: ProviderResponse,
  modelName: string,
  providerConfig: MetaCostConfig,
  context?: CallApiContextParams,
): ProviderResponse {
  if (!response || response.cached || response.cost !== undefined || !response.tokenUsage) {
    return response;
  }
  const config: MetaCostConfig = {
    ...providerConfig,
    ...(context?.prompt?.config as Partial<MetaCostConfig> | undefined),
  };
  const cost = calculateMetaCost(
    modelName,
    config,
    response.tokenUsage.prompt,
    response.tokenUsage.completion,
    response.tokenUsage.completionDetails?.cacheReadInputTokens ?? 0,
  );
  if (cost !== undefined) {
    response.cost = cost;
  }
  return response;
}

// The Meta Model API (dev.meta.ai) serves the Muse Spark models through an
// OpenAI-compatible chat completions endpoint, so the standard chat provider
// handles requests once the base URL and key resolution point at it.
// https://dev.meta.ai/docs/features/chat-completion
class MetaProvider extends OpenAiChatCompletionProvider {
  config: MetaConfig;

  constructor(modelName: string, providerOptions: MetaProviderOptions) {
    const resolvedConfig = resolveMetaOpenAiConfig(providerOptions.config);

    super(modelName, {
      ...providerOptions,
      config: resolvedConfig,
    });

    this.config = resolvedConfig;
  }

  override getApiKey(): string | undefined {
    return resolveMetaApiKey(this.config, this.env);
  }

  override getApiUrl(): string {
    return this.config.apiBaseUrl || META_API_BASE_URL;
  }

  // Meta has no concept of an OpenAI organization; suppress the header so a
  // stray OPENAI_ORGANIZATION env var doesn't leak onto Meta requests.
  override getOrganization(): undefined {
    return undefined;
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return missingMetaApiKeyMessage(this.config);
  }

  // The Muse Spark models are reasoning models: they take reasoning_effort and
  // max_completion_tokens (max_tokens is only a deprecated alias upstream).
  // Marking them as reasoning models makes the base class forward those fields
  // and skip the injected max_tokens default (1024), which would starve
  // reasoning.
  protected override isReasoningModel(): boolean {
    return true;
  }

  // Unlike OpenAI's o-series, Muse Spark accepts temperature (0-2), so keep
  // promptfoo's deterministic default instead of suppressing the parameter.
  protected override supportsTemperature(): boolean {
    return true;
  }

  id(): string {
    return `meta:${this.modelName}`;
  }

  toString(): string {
    return `[Meta Model API Provider ${this.modelName}]`;
  }

  toJSON() {
    return metaToJSON('meta', this.modelName, this.config);
  }

  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    const { body, config } = result;
    const passthrough = (config.passthrough ?? {}) as Record<string, unknown>;

    assertSupportedReasoningEffort(body.reasoning_effort);

    // Meta documents `stop` and logprobs as unsupported; surface one
    // actionable error instead of an opaque HTTP 400 per request.
    if ('stop' in body) {
      throw new Error(
        'Muse Spark models do not support `stop` sequences; remove `stop` from the provider config.',
      );
    }
    if ('logprobs' in body) {
      throw new Error('Muse Spark models do not support logprobs.');
    }

    // The Meta API caps generation with max_completion_tokens (max_tokens is
    // only a deprecated alias); honor an explicit max_tokens as the canonical
    // field rather than silently dropping it.
    applyMetaOutputCap(
      body,
      passthrough,
      'max_completion_tokens',
      config.max_completion_tokens ?? config.max_tokens,
    );
    applyMetaSamplingHygiene(body, config, passthrough, [
      'top_p',
      'presence_penalty',
      'frequency_penalty',
    ]);

    return result;
  }

  override async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const response = await super.callApi(prompt, context, callApiOptions);
    if (!response || response.error) {
      return response;
    }
    return applyMetaCost(response, this.modelName, this.config, context);
  }
}

// Meta's /v1/responses endpoint follows the OpenAI Responses API shape,
// supports search grounding (tools: [{type: 'web_search'}]), and is the only
// Meta endpoint whose reasoning persists across turns.
// https://dev.meta.ai/docs/features/responses
export class MetaResponsesProvider extends OpenAiResponsesProvider {
  config: MetaConfig;

  constructor(modelName: string, providerOptions: MetaProviderOptions) {
    const resolvedConfig = resolveMetaOpenAiConfig(providerOptions.config);

    super(modelName, {
      ...providerOptions,
      config: resolvedConfig,
    });

    this.config = resolvedConfig;
  }

  override getApiKey(): string | undefined {
    return resolveMetaApiKey(this.config, this.env);
  }

  override getApiUrl(): string {
    return this.config.apiBaseUrl || META_API_BASE_URL;
  }

  override getOrganization(): undefined {
    return undefined;
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return missingMetaApiKeyMessage(this.config);
  }

  protected override isReasoningModel(): boolean {
    return true;
  }

  protected override supportsTemperature(): boolean {
    return true;
  }

  id(): string {
    return `meta:responses:${this.modelName}`;
  }

  toString(): string {
    return `[Meta Model API Responses Provider ${this.modelName}]`;
  }

  toJSON() {
    return metaToJSON('meta:responses', this.modelName, this.config);
  }

  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    const { body, config } = result;
    const passthrough = (config.passthrough ?? {}) as Record<string, unknown>;

    assertSupportedReasoningEffort(body.reasoning?.effort);

    // The Responses API caps generation with max_output_tokens; map the
    // chat-style caps across so a config shared with meta:<model> keeps its cap.
    applyMetaOutputCap(
      body,
      passthrough,
      'max_output_tokens',
      config.max_output_tokens ?? config.max_completion_tokens ?? config.max_tokens,
    );
    applyMetaSamplingHygiene(body, config, passthrough, ['top_p']);

    return result;
  }

  protected override applyBilling(
    result: ProviderResponse,
    data: any,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): ProviderResponse {
    const billed = super.applyBilling(result, data, config, cached);
    if (cached || billed.cost !== undefined) {
      return billed;
    }
    const usage = data?.usage;
    const cost = calculateMetaCost(
      this.modelName,
      config as MetaConfig,
      usage?.input_tokens,
      usage?.output_tokens,
      usage?.input_tokens_details?.cached_tokens,
    );
    return cost === undefined ? billed : { ...billed, cost };
  }
}

// Meta also serves an Anthropic-compatible Messages endpoint — the surface
// Anthropic-format coding agents like Claude Code use. It authenticates with
// `Authorization: Bearer`, not Anthropic's x-api-key header.
// https://dev.meta.ai/docs/features/messages
export class MetaMessagesProvider extends AnthropicMessagesProvider {
  // Never authenticate with a local Claude Code OAuth credential — that token
  // belongs to Anthropic and must not be sent to api.meta.ai.
  static override readonly SUPPORTS_CLAUDE_CODE_OAUTH: boolean = false;

  // Muse model ids are not Anthropic models; skip the unknown-model warning.
  static override readonly WARNS_ON_UNKNOWN_MODEL: boolean = false;

  constructor(modelName: string, providerOptions: MetaMessagesProviderOptions) {
    const metaConfig = providerOptions.config ?? {};
    const resolvedConfig: MetaMessagesConfig = {
      ...metaConfig,
      apiBaseUrl: metaConfig.apiBaseUrl || META_MESSAGES_API_BASE_URL,
      // Muse reasoning arrives as encrypted redacted_thinking blocks on this
      // surface; surfacing that ciphertext would pollute graded output, so
      // hide thinking by default (overridable with showThinking: true).
      showThinking: metaConfig.showThinking ?? false,
    };

    super(modelName, {
      ...providerOptions,
      config: resolvedConfig,
    });
  }

  // The Anthropic SDK sends `apiKey` as an x-api-key header; Meta
  // authenticates the Messages surface with a bearer token, so swap the key
  // over to authToken. Also explicitly omit any headers the SDK would merge in
  // from ANTHROPIC_CUSTOM_HEADERS — those are Anthropic-scoped (often
  // gateway/proxy secrets) and must not be sent to Meta; a null value tells
  // the SDK to drop the header.
  protected override buildAnthropicClientOptions(options: ClientOptions): ClientOptions {
    const suppressedEnvHeaders = getAnthropicEnvHeaderSuppressions();
    return {
      ...options,
      apiKey: null,
      authToken: this.apiKey ?? null,
      ...(Object.keys(suppressedEnvHeaders).length > 0
        ? { defaultHeaders: { ...options.defaultHeaders, ...suppressedEnvHeaders } }
        : {}),
    };
  }

  // Meta-specific key resolution — never ANTHROPIC_API_KEY, which would send
  // an Anthropic key to the Meta endpoint.
  override getApiKey(): string | undefined {
    return resolveMetaApiKey(this.config as MetaMessagesConfig, this.env);
  }

  // Ignore ANTHROPIC_BASE_URL overrides — those are Anthropic-scoped.
  override getApiBaseUrl(): string {
    return (this.config as MetaMessagesConfig).apiBaseUrl || META_MESSAGES_API_BASE_URL;
  }

  id(): string {
    return `meta:messages:${this.modelName}`;
  }

  toString(): string {
    return `[Meta Model API Messages Provider ${this.modelName}]`;
  }

  toJSON() {
    return metaToJSON('meta:messages', this.modelName, this.config as MetaMessagesConfig);
  }

  override async callApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(missingMetaApiKeyMessage(this.config as MetaMessagesConfig));
    }

    const response = await super.callApi(prompt, context);

    // Unlike the chat provider, do NOT skip error responses: the base class
    // deliberately bills errors that carry tokenUsage (e.g. an MCP loop that
    // exceeded max_tool_calls) so spent tokens don't vanish from cost totals.
    return applyMetaCost(response, this.modelName, this.config as MetaMessagesConfig, context);
  }
}

export function createMetaProvider(
  providerPath: string,
  options: MetaProviderOptions = {},
): ApiProvider {
  // Accept `meta:<model>` plus the chat/responses/messages sub-types;
  // everything after the optional sub-type segment is the model id. Bare
  // `meta:<model>` defaults to the Responses API — Meta's full-feature
  // surface (search grounding, cross-turn reasoning) and the one its docs
  // recommend for agentic use.
  const rest = providerPath.split(':').slice(1);

  // Fail fast instead of silently treating an unsupported sub-type as a model
  // name — the Meta Model API exposes no embeddings or legacy completions
  // endpoint.
  if (rest[0] === 'embedding' || rest[0] === 'embeddings' || rest[0] === 'completion') {
    throw new Error(
      `The Meta Model API does not expose an ${rest[0]} endpoint; "${providerPath}" cannot be resolved. ` +
        'Use meta:<model>, meta:chat:<model>, meta:responses:<model>, or meta:messages:<model> instead.',
    );
  }

  const subType =
    rest[0] === 'chat' || rest[0] === 'responses' || rest[0] === 'messages'
      ? rest.shift()
      : 'responses';
  const modelName = rest.join(':') || DEFAULT_META_MODEL;

  switch (subType) {
    case 'chat':
      return new MetaProvider(modelName, options);
    case 'messages':
      return new MetaMessagesProvider(modelName, options as MetaMessagesProviderOptions);
    default:
      return new MetaResponsesProvider(modelName, options);
  }
}
