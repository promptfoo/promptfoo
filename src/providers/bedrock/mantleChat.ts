import { OpenAiChatCompletionProvider } from '../openai/chat';
import {
  getBedrockMantleOrigin,
  isBedrockGrokModel,
  isBedrockOpenAiResponsesModel,
  resolveBedrockMantleApiKey,
  resolveBedrockMantleRegion,
} from './mantle';

import type { OpenAiCompletionOptions } from '../openai/types';

type OpenAiChatProviderOptions = NonNullable<
  ConstructorParameters<typeof OpenAiChatCompletionProvider>[1]
>;
type BedrockMantleChatProviderOptions = Omit<OpenAiChatProviderOptions, 'config'> & {
  config?: NonNullable<OpenAiChatProviderOptions['config']> & { region?: string };
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
 * use `/v1`; xAI, Gemma 4, and supported GPT-5.6 models use `/openai/v1`.
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

// These exact AWS model cards document Mantle Chat Completions support. Older frontier
// models retain their Responses-only restriction until their Chat contract is established.
const BEDROCK_OPENAI_CHAT_MODELS = new Set([
  'openai.gpt-5.6-sol',
  'openai.gpt-5.6-terra',
  'openai.gpt-5.6-luna',
]);

/**
 * Base URL for the mantle Chat Completions API. Most mantle chat models use the bare `/v1`
 * path, but xAI, Gemma 4, and supported GPT-5.6 chat models use `/openai/v1`.
 */
export function getBedrockMantleChatBaseUrl(region: string, modelName?: string): string {
  const path =
    (modelName !== undefined && isBedrockGrokModel(modelName)) ||
    (modelName !== undefined && BEDROCK_OPENAI_CHAT_MODELS.has(modelName)) ||
    modelName?.startsWith('google.gemma-4')
      ? 'openai/v1'
      : 'v1';
  return `${getBedrockMantleOrigin(region)}/${path}`;
}

/**
 * OpenAI Chat Completions provider pinned to the Bedrock mantle endpoint. Behaves like the
 * OpenAI Platform chat provider (shared request/response/usage handling) but always targets the
 * configured mantle `apiBaseUrl`.
 */
export class BedrockMantleChatProvider extends OpenAiChatCompletionProvider {
  protected override getGenAISystem(): string {
    return 'bedrock';
  }

  protected getCapabilityModelName(): string {
    return this.modelName.replace(/^(openai|xai)\./, '');
  }

  protected isReasoningModel(): boolean {
    return isBedrockGrokModel(this.modelName) || super.isReasoningModel();
  }

  protected override getBillingModelName(config: OpenAiCompletionOptions): string {
    const modelName = super.getBillingModelName(config).replace(/^(?:openai|xai)\./, '');
    return /^gpt-5\.6(?:-|$)/.test(modelName) || modelName === 'grok-4.3'
      ? `bedrock:${modelName}`
      : modelName;
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
    // Gemma 4 accepts this field even though the base provider's OpenAI-specific reasoning
    // model detection does not recognize its Bedrock model id.
    if (
      this.modelName.startsWith('google.gemma-4-') &&
      result.config.reasoning_effort !== undefined
    ) {
      result.body.reasoning_effort = result.config.reasoning_effort;
    }
    if (isBedrockGrokModel(this.modelName)) {
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
 * region (config → AWS_BEDROCK_REGION → AWS_REGION → default) and the Amazon Bedrock API key
 * (config.apiKey → AWS_BEARER_TOKEN_BEDROCK), and targets the mantle endpoint unless the caller
 * supplies an explicit `apiBaseUrl`.
 */
export function createBedrockMantleChatProvider(
  modelName: string,
  providerOptions: BedrockMantleChatProviderOptions = {},
): BedrockMantleChatProvider {
  const profile = modelName.match(/^[a-z]+\.(openai\.gpt-5\.6-(?:sol|terra|luna))$/);
  if (profile) {
    throw new Error(
      `Amazon Bedrock inference profile "${modelName}" cannot be used on Mantle. Use ` +
        `"bedrock:mantle:${profile[1]}" for Mantle Chat Completions or ` +
        `"bedrock:converse:${modelName}" for Runtime Converse.`,
    );
  }
  if (isBedrockOpenAiResponsesModel(modelName) && !BEDROCK_OPENAI_CHAT_MODELS.has(modelName)) {
    throw new Error(
      `Amazon Bedrock model "bedrock:mantle:${modelName}" is not supported by promptfoo's ` +
        `Mantle Chat Completions adapter. ` +
        `Use the bare "bedrock:${modelName}" id so promptfoo routes it through Bedrock's ` +
        `OpenAI-compatible Responses API.`,
    );
  }
  const config: Record<string, any> = providerOptions.config ?? {};
  const region = resolveBedrockMantleRegion(
    config,
    providerOptions.env,
    isBedrockGrokModel(modelName)
      ? DEFAULT_BEDROCK_MANTLE_GROK_CHAT_REGION
      : DEFAULT_BEDROCK_MANTLE_CHAT_REGION,
  );
  const apiKey = resolveBedrockMantleApiKey(config, providerOptions.env);

  if (!apiKey) {
    throw new Error(
      `Amazon Bedrock model "bedrock:mantle:${modelName}" uses the OpenAI-compatible Chat ` +
        `Completions API on the mantle endpoint, which authenticates with an Amazon Bedrock API ` +
        `key. Set the AWS_BEARER_TOKEN_BEDROCK environment variable (or config.apiKey). See ` +
        `https://www.promptfoo.dev/docs/providers/aws-bedrock/#mantle-chat-completions`,
    );
  }

  const apiBaseUrl = config.apiBaseUrl || getBedrockMantleChatBaseUrl(region, modelName);
  const isGrok = isBedrockGrokModel(modelName);

  return new BedrockMantleChatProvider(modelName, {
    ...providerOptions,
    config: { ...config, apiBaseUrl, apiKey, ...(isGrok ? { omitDefaults: true } : {}) },
  });
}
