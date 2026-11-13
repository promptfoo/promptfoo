import { getBedrockBillingEndpoint } from '../openai/billing';
import { OpenAiChatCompletionProvider } from '../openai/chat';
import {
  getBedrockMantleOrigin,
  resolveBedrockMantleApiKey,
  resolveBedrockMantleRegion,
} from './mantle';
import {
  BEDROCK_OPENAI_MANTLE_REGIONS,
  getBedrockCapabilityModelName,
  getBedrockMantleBillingModelName,
} from './openaiModels';
import {
  isBedrockGrokModel,
  isBedrockOpenAiChatModel,
  isBedrockOpenAiResponsesModel,
} from './routing';
import { BedrockTokenProvider, type BedrockTokenProviderConfig } from './tokenProvider';

import type { OpenAiCompletionOptions } from '../openai/types';

type OpenAiChatProviderOptions = NonNullable<
  ConstructorParameters<typeof OpenAiChatCompletionProvider>[1]
>;
type BedrockMantleChatProviderOptions = Omit<OpenAiChatProviderOptions, 'config'> & {
  config?: NonNullable<OpenAiChatProviderOptions['config']> &
    BedrockTokenProviderConfig & { region?: string };
};
type BedrockMantleChatBodyContext = Parameters<OpenAiChatCompletionProvider['getOpenAiBody']>[1];
type BedrockMantleChatCallApiOptions = Parameters<OpenAiChatCompletionProvider['getOpenAiBody']>[2];

/**
 * The Bedrock **Mantle** endpoint exposes an OpenAI-compatible **Chat Completions** API at
 *
 *   https://bedrock-mantle.<region>.api.aws/<route>/chat/completions
 *
 * `bedrock:mantle:<id>` selects this API explicitly. Mantle and Runtime have distinct
 * catalogs and model namespaces, including Mantle's Qwen `*-instruct` ids. Most models
 * use `/v1`; xAI, Gemma 4, and OpenAI frontier models use `/openai/v1`.
 *
 * This is the Chat Completions counterpart to {@link createBedrockOpenAiResponsesProvider} (the
 * `/openai/v1/responses` path used by the OpenAI frontier and xAI Grok models). Use the bare
 * `bedrock:openai.gpt-5.6-sol` / `bedrock:xai.grok-4.3` forms for those (Responses API, with
 * reasoning tokens); use `bedrock:mantle:<id>` to talk to the Chat Completions endpoint directly.
 *
 * Default region used when none is configured. The mantle model catalog is regional (see
 * `GET /v1/models`), so the caller should set `region` to one where the target model is offered.
 */
export const DEFAULT_BEDROCK_MANTLE_CHAT_REGION = 'us-east-1';
export const DEFAULT_BEDROCK_MANTLE_GROK_CHAT_REGION = 'us-west-2';

/**
 * Base URL for the mantle Chat Completions API. Most mantle chat models use the bare `/v1`
 * path, but xAI, Gemma 4, and OpenAI frontier models use `/openai/v1`.
 */
export function getBedrockMantleChatBaseUrl(region: string, modelName?: string): string {
  const path =
    (modelName !== undefined && isBedrockGrokModel(modelName)) ||
    (modelName !== undefined && isBedrockOpenAiChatModel(modelName)) ||
    modelName?.startsWith('google.gemma-4')
      ? 'openai/v1'
      : 'v1';
  return `${getBedrockMantleOrigin(region)}/${path}`;
}

function isBedrockMantleEndpoint(apiBaseUrl: string): boolean {
  return getBedrockBillingEndpoint(URL.parse(apiBaseUrl)?.hostname)?.service === 'mantle';
}

/**
 * OpenAI Chat Completions provider pinned to the Bedrock mantle endpoint. Behaves like the
 * OpenAI Platform chat provider (shared request/response/usage handling) but always targets the
 * configured mantle `apiBaseUrl`.
 */
export class BedrockMantleChatProvider extends OpenAiChatCompletionProvider {
  private readonly bedrockTokenProvider: BedrockTokenProvider;
  private readonly bedrockRegion: string;

  constructor(modelName: string, options: BedrockMantleChatProviderOptions = {}) {
    super(modelName, options);
    const defaultRegion = isBedrockGrokModel(modelName)
      ? DEFAULT_BEDROCK_MANTLE_GROK_CHAT_REGION
      : (BEDROCK_OPENAI_MANTLE_REGIONS.get(modelName)?.[0] ?? DEFAULT_BEDROCK_MANTLE_CHAT_REGION);
    const region = resolveBedrockMantleRegion(options.config ?? {}, options.env, defaultRegion);
    this.bedrockRegion = region;
    // Pin direct construction too, before any AWS credential can be resolved.
    this.config = {
      ...this.config,
      apiBaseUrl: this.config.apiBaseUrl || getBedrockMantleChatBaseUrl(region, modelName),
    };
    this.bedrockTokenProvider = new BedrockTokenProvider(this.config, options.env, region);
  }

  requiresApiKey(): boolean {
    return false;
  }

  getApiKey(): string | undefined {
    return resolveBedrockMantleApiKey(this.config, this.env);
  }

  protected override getRequestAuthentication() {
    return async (signal?: AbortSignal): Promise<Record<string, string>> => {
      const token = await this.bedrockTokenProvider.getToken(signal);
      return token ? { Authorization: `Bearer ${token}` } : {};
    };
  }

  protected override getGenAISystem(): string {
    return 'bedrock';
  }

  protected override getBillingRegion(): string {
    return this.bedrockRegion;
  }

  protected normalizeCapabilityModelName(modelName: string): string {
    return getBedrockCapabilityModelName(modelName);
  }

  protected getCapabilityModelName(): string {
    return this.normalizeCapabilityModelName(this.modelName);
  }

  protected isReasoningModel(): boolean {
    return isBedrockGrokModel(this.modelName) || super.isReasoningModel();
  }

  protected override getBillingModelName(config: OpenAiCompletionOptions): string {
    const passthroughModel = (config.passthrough as { model?: unknown } | undefined)?.model;
    return getBedrockMantleBillingModelName(
      typeof passthroughModel === 'string' ? passthroughModel : this.modelName,
    );
  }

  protected supportsTemperature(): boolean {
    return isBedrockGrokModel(this.modelName) || super.supportsTemperature();
  }

  async getOpenAiBody(
    prompt: string,
    context?: BedrockMantleChatBodyContext,
    callApiOptions?: BedrockMantleChatCallApiOptions,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    const model = result.body.model;
    const apiUrl = new URL(this.getApiUrl());
    if (isBedrockMantleEndpoint(apiUrl.href)) {
      const expectedPath = new URL(
        getBedrockMantleChatBaseUrl(DEFAULT_BEDROCK_MANTLE_CHAT_REGION, model),
      ).pathname;
      if (apiUrl.pathname.replace(/\/+$/, '') !== expectedPath) {
        throw new Error(
          `Bedrock model ${model} requires the ${expectedPath} Mantle endpoint. ` +
            `Configure a separate provider using bedrock:mantle:${model}.`,
        );
      }
    }
    // Gemma 4 accepts this field even though the base provider's OpenAI-specific reasoning
    // model detection does not recognize its Bedrock model id.
    if (
      model.startsWith('google.gemma-4-') &&
      result.config.isReasoningModel !== false &&
      result.config.reasoning_effort !== undefined &&
      result.body.reasoning_effort === undefined
    ) {
      result.body.reasoning_effort = result.config.reasoning_effort;
    }
    if (isBedrockGrokModel(model)) {
      delete result.body.presence_penalty;
      delete result.body.frequency_penalty;
      delete result.body.stop;
    }
    return result;
  }

  /**
   * Pin requests to the configured mantle endpoint. The base `getApiUrl()` prefers
   * `apiHost`/`OPENAI_API_HOST` over `apiBaseUrl`, so without this an ambient `OPENAI_API_HOST`
   * (set for an unrelated OpenAI-compatible provider) would hijack Bedrock calls and send the
   * Bedrock bearer token to the wrong host.
   */
  getApiUrl(): string {
    return this.config.apiBaseUrl || super.getApiUrl();
  }

  getOpenAiRequestHeaders(
    customHeaders: Record<string, string> | undefined = this.config.headers,
  ): Record<string, string> {
    // Match the Bedrock Responses adapter: ambient OpenAI account headers do not apply
    // to Bedrock. Preserve only headers explicitly configured for this provider.
    return customHeaders ?? {};
  }

  protected shouldBustCache(): boolean {
    // The inherited fetch cache includes an HMAC fingerprint of Authorization in its
    // persistent identity. Bedrock exposes no non-secret account identifier for partitioning,
    // so bypass caching rather than persist a derivative of the Bedrock bearer token.
    return true;
  }
}

/**
 * Construct a Chat Completions provider configured for the Bedrock mantle endpoint. Resolves the
 * region (config → AWS_BEDROCK_REGION → AWS_REGION → default), targets the mantle endpoint
 * unless the caller supplies an explicit `apiBaseUrl`, and authenticates with either a
 * configured Bedrock bearer token or a request-scoped token generated from AWS credentials.
 */
export function createBedrockMantleChatProvider(
  modelName: string,
  providerOptions: BedrockMantleChatProviderOptions = {},
): BedrockMantleChatProvider {
  if (isBedrockOpenAiResponsesModel(modelName) && !isBedrockOpenAiChatModel(modelName)) {
    throw new Error(
      `Amazon Bedrock model "bedrock:mantle:${modelName}" is not supported by promptfoo's ` +
        `Mantle Chat Completions adapter. ` +
        `Use the bare "bedrock:${modelName}" id so promptfoo routes it through Bedrock's ` +
        `OpenAI-compatible Responses API.`,
    );
  }
  const config: Record<string, any> = providerOptions.config ?? {};
  const profile = modelName.match(/^[a-z-]+\.(openai\.gpt-.+)$/);
  if (
    profile &&
    isBedrockOpenAiChatModel(profile[1]) &&
    (!config.apiBaseUrl || isBedrockMantleEndpoint(config.apiBaseUrl))
  ) {
    throw new Error(
      `Amazon Bedrock inference profile "${modelName}" cannot be used on Mantle. Use ` +
        `"bedrock:mantle:${profile[1]}" for Mantle Chat Completions. Use bedrock:converse: with a Runtime profile listed on the AWS model card.`,
    );
  }
  const isGrok = isBedrockGrokModel(modelName);

  return new BedrockMantleChatProvider(modelName, {
    ...providerOptions,
    config: { ...config, ...(isGrok ? { omitDefaults: true } : {}) },
  });
}
