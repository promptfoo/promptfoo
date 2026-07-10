import Anthropic from '@anthropic-ai/sdk';
import { getEnvString } from '../envars';
import logger from '../logger';
import { AnthropicMessagesProvider } from './anthropic/messages';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiResponsesProvider } from './openai/responses';

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
const META_API_KEY_ENVAR = 'META_API_KEY';
// MODEL_API_KEY is Meta's default: it's what the official SDKs, docs, and
// quickstart use, so it's the variable we document and recommend. META_API_KEY
// is a promptfoo-specific override that wins when both are set, for users who
// need to isolate the key per provider.
const META_OFFICIAL_KEY_ENVAR = 'MODEL_API_KEY';
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
// ambient process env; within each source META_API_KEY beats Meta's generic
// MODEL_API_KEY so promptfoo users can isolate the key per provider.
function resolveMetaApiKey(
  config: MetaKeyConfig,
  env: EnvOverrides | undefined,
): string | undefined {
  if (config.apiKey !== undefined) {
    return config.apiKey;
  }
  const apiKeyEnvar = config.apiKeyEnvar as EnvVarKey | undefined;
  if (apiKeyEnvar && apiKeyEnvar !== META_API_KEY_ENVAR) {
    return getProviderEnvString(env, apiKeyEnvar) ?? getEnvString(apiKeyEnvar);
  }
  const fromOverrides =
    getProviderEnvString(env, META_API_KEY_ENVAR) ??
    getProviderEnvString(env, META_OFFICIAL_KEY_ENVAR);
  if (fromOverrides !== undefined) {
    return fromOverrides;
  }
  const fromMetaEnv = getEnvString(META_API_KEY_ENVAR);
  if (fromMetaEnv !== undefined) {
    return fromMetaEnv;
  }
  const fromOfficialEnv = getEnvString(META_OFFICIAL_KEY_ENVAR);
  if (fromOfficialEnv !== undefined) {
    // MODEL_API_KEY is a generic name other tooling could also set; leave a
    // trace so an unexpected credential source is observable.
    logger.debug('[Meta] Using API key from the MODEL_API_KEY environment variable');
  }
  return fromOfficialEnv;
}

function missingMetaApiKeyMessage(config: MetaKeyConfig): string {
  const envar =
    config.apiKeyEnvar && config.apiKeyEnvar !== META_API_KEY_ENVAR
      ? config.apiKeyEnvar
      : `${META_OFFICIAL_KEY_ENVAR} (or ${META_API_KEY_ENVAR})`;
  return (
    `Meta Model API key is not set. Set the ${envar} environment variable ` +
    'or add `apiKey` to the provider config.'
  );
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

// Parse ANTHROPIC_CUSTOM_HEADERS the same way the Anthropic SDK does
// (newline-separated `Name: value` lines) and map each header name to null so
// the SDK omits it. Exported for tests.
export function getAnthropicEnvHeaderSuppressions(): Record<string, null> {
  const suppressed: Record<string, null> = {};
  const customHeadersEnv = getEnvString('ANTHROPIC_CUSTOM_HEADERS');
  if (!customHeadersEnv) {
    return suppressed;
  }
  for (const line of customHeadersEnv.split('\n')) {
    const colon = line.indexOf(':');
    if (colon >= 0) {
      const name = line.substring(0, colon).trim();
      if (name) {
        suppressed[name] = null;
      }
    }
  }
  return suppressed;
}

function extractCachedTokens(raw: unknown): number {
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.debug(`[Meta] Failed to parse raw response for cache info: ${err}`);
      return 0;
    }
  }
  // Chat Completions reports prompt_tokens_details.cached_tokens; the
  // Responses API reports input_tokens_details.cached_tokens; the Messages
  // surface uses Anthropic's cache_read_input_tokens.
  const cached =
    parsed?.usage?.prompt_tokens_details?.cached_tokens ??
    parsed?.usage?.input_tokens_details?.cached_tokens ??
    parsed?.usage?.cache_read_input_tokens;
  return typeof cached === 'number' ? cached : 0;
}

// The Meta Model API (dev.meta.ai) serves the Muse Spark models through an
// OpenAI-compatible chat completions endpoint, so the standard chat provider
// handles requests once the base URL and key resolution point at it.
// https://dev.meta.ai/docs/features/chat-completion
class MetaProvider extends OpenAiChatCompletionProvider {
  config: MetaConfig;

  constructor(modelName: string, providerOptions: MetaProviderOptions) {
    const metaConfig = providerOptions.config ?? {};
    const resolvedConfig: MetaConfig = {
      ...metaConfig,
      apiKeyEnvar: metaConfig.apiKeyEnvar ?? META_API_KEY_ENVAR,
      // `||` (not `??`) so an empty string — e.g. a template that rendered
      // empty — still resolves to the Meta endpoint.
      apiBaseUrl: metaConfig.apiBaseUrl || META_API_BASE_URL,
    };

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
  // max_completion_tokens, and the API has no max_tokens parameter. Marking
  // them as reasoning models makes the base class forward those fields and
  // skip the injected max_tokens default (1024), which would starve reasoning.
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
    return {
      provider: 'meta',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
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

    // The Meta API caps generation with max_completion_tokens (there is no
    // max_tokens parameter); honor an explicit max_tokens as
    // max_completion_tokens rather than silently dropping it. When no cap is
    // configured, strip a leaked OPENAI_MAX_COMPLETION_TOKENS default so
    // reasoning keeps the full output budget.
    if (!('max_completion_tokens' in passthrough)) {
      const maxCompletionTokens = config.max_completion_tokens ?? config.max_tokens;
      if (maxCompletionTokens === undefined) {
        delete body.max_completion_tokens;
      } else {
        body.max_completion_tokens = maxCompletionTokens;
      }
    }
    delete body.max_tokens;

    // The base provider seeds temperature / top_p / penalties from OPENAI_*
    // env vars whenever those are set. They are OpenAI-scoped tuning knobs;
    // don't let them leak into Meta requests. Promptfoo's deterministic
    // temperature default is kept, sourced from config alone.
    if (config.temperature === undefined && !('temperature' in passthrough)) {
      if (config.omitDefaults) {
        delete body.temperature;
      } else {
        body.temperature = 0;
      }
    }
    if (config.top_p === undefined && !('top_p' in passthrough)) {
      delete body.top_p;
    }
    if (config.presence_penalty === undefined && !('presence_penalty' in passthrough)) {
      delete body.presence_penalty;
    }
    if (config.frequency_penalty === undefined && !('frequency_penalty' in passthrough)) {
      delete body.frequency_penalty;
    }

    return result;
  }

  override async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const response = await super.callApi(prompt, context, callApiOptions);

    if (!response || response.error || response.cached || response.cost !== undefined) {
      return response;
    }

    // Muse models are not in the OpenAI billing tables, so the base cost path
    // returns undefined. Fill it in from Meta's price table / user overrides,
    // honoring prompt-level config overrides like the base billing path does.
    if (response.tokenUsage) {
      const config: MetaConfig = {
        ...this.config,
        ...(context?.prompt?.config as Partial<MetaConfig> | undefined),
      };
      const cachedTokens =
        response.tokenUsage.completionDetails?.cacheReadInputTokens ??
        extractCachedTokens(response.raw);
      const cost = calculateMetaCost(
        this.modelName,
        config,
        response.tokenUsage.prompt,
        response.tokenUsage.completion,
        cachedTokens,
      );
      if (cost !== undefined) {
        response.cost = cost;
      }
    }

    return response;
  }
}

// Meta's /v1/responses endpoint follows the OpenAI Responses API shape and is
// the only Meta endpoint with search grounding (tools: [{type: 'web_search'}])
// and reasoning that persists across turns.
// https://dev.meta.ai/docs/features/responses
export class MetaResponsesProvider extends OpenAiResponsesProvider {
  config: MetaConfig;

  constructor(modelName: string, providerOptions: MetaProviderOptions) {
    const metaConfig = providerOptions.config ?? {};
    const resolvedConfig: MetaConfig = {
      ...metaConfig,
      apiKeyEnvar: metaConfig.apiKeyEnvar ?? META_API_KEY_ENVAR,
      apiBaseUrl: metaConfig.apiBaseUrl || META_API_BASE_URL,
    };

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
    return {
      provider: 'meta:responses',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
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
    // chat-style caps across so a config shared with meta:<model> keeps its
    // cap, and strip leaked OPENAI_MAX_COMPLETION_TOKENS / OPENAI_MAX_TOKENS
    // env defaults when no cap is configured.
    if (!('max_output_tokens' in passthrough)) {
      const maxOutputTokens =
        config.max_output_tokens ?? config.max_completion_tokens ?? config.max_tokens;
      if (maxOutputTokens === undefined) {
        delete body.max_output_tokens;
      } else {
        body.max_output_tokens = maxOutputTokens;
      }
    }

    // Same OPENAI_* env hygiene as the chat provider.
    if (config.temperature === undefined && !('temperature' in passthrough)) {
      if (config.omitDefaults) {
        delete body.temperature;
      } else {
        body.temperature = 0;
      }
    }
    if (config.top_p === undefined && !('top_p' in passthrough)) {
      delete body.top_p;
    }

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

    // The Anthropic SDK sends `apiKey` as an x-api-key header; Meta
    // authenticates the Messages surface with a bearer token, so rebuild the
    // client with authToken instead. Also explicitly omit any headers the SDK
    // would merge in from ANTHROPIC_CUSTOM_HEADERS — those are Anthropic-scoped
    // (often gateway/proxy secrets) and must not be sent to Meta; a null value
    // tells the SDK to drop the header, and constructor defaultHeaders win
    // over the env-derived ones.
    const suppressedEnvHeaders = getAnthropicEnvHeaderSuppressions();
    this.anthropic = new Anthropic({
      apiKey: null,
      authToken: this.apiKey ?? null,
      baseURL: this.getApiBaseUrl(),
      ...(Object.keys(suppressedEnvHeaders).length > 0
        ? { defaultHeaders: suppressedEnvHeaders }
        : {}),
    });
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
    return {
      provider: 'meta:messages',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.config.apiKey && { apiKey: undefined }),
      },
    };
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
    if (!response || response.cached || response.cost !== undefined) {
      return response;
    }

    // Muse models are not in the Anthropic billing tables, so the base cost
    // path returns undefined. Anthropic-format usage reports total input in
    // tokenUsage.prompt with cache reads broken out separately, which is
    // exactly what calculateMetaCost expects.
    if (response.tokenUsage) {
      const config: MetaMessagesConfig = {
        ...(this.config as MetaMessagesConfig),
        ...(context?.prompt?.config as Partial<MetaMessagesConfig> | undefined),
      };
      const cachedTokens =
        response.tokenUsage.completionDetails?.cacheReadInputTokens ??
        extractCachedTokens(response.raw);
      const cost = calculateMetaCost(
        this.modelName,
        config,
        response.tokenUsage.prompt,
        response.tokenUsage.completion,
        cachedTokens,
      );
      if (cost !== undefined) {
        response.cost = cost;
      }
    }

    return response;
  }
}

export function createMetaProvider(
  providerPath: string,
  options: MetaProviderOptions = {},
): ApiProvider {
  // Accept `meta:<model>`, `meta:chat:<model>`, `meta:responses:<model>` and
  // `meta:messages:<model>`; everything after the optional sub-type segment is
  // the model id.
  const splits = providerPath.split(':');
  const rest = splits.slice(1);

  if (rest[0] === 'responses') {
    rest.shift();
    return new MetaResponsesProvider(rest.join(':') || DEFAULT_META_MODEL, options);
  }

  if (rest[0] === 'messages') {
    rest.shift();
    return new MetaMessagesProvider(
      rest.join(':') || DEFAULT_META_MODEL,
      options as MetaMessagesProviderOptions,
    );
  }

  // Fail fast instead of silently treating an unsupported sub-type as a model
  // name — the Meta Model API exposes no embeddings or legacy completions
  // endpoint.
  if (rest[0] === 'embedding' || rest[0] === 'embeddings' || rest[0] === 'completion') {
    throw new Error(
      `The Meta Model API does not expose an ${rest[0]} endpoint; "${providerPath}" cannot be resolved. ` +
        'Use meta:<model>, meta:chat:<model>, meta:responses:<model>, or meta:messages:<model> instead.',
    );
  }

  if (rest[0] === 'chat') {
    rest.shift();
  }
  return new MetaProvider(rest.join(':') || DEFAULT_META_MODEL, options);
}
