import { OpenAiChatCompletionProvider } from '../openai/chat';
import {
  getBedrockMantleOrigin,
  resolveBedrockMantleApiKey,
  resolveBedrockMantleRegion,
} from './mantle';
import { isBedrockOpenAiResponsesModel } from './openaiResponses';

type BedrockMantleChatProviderOptions = Record<string, any> & {
  config?: Record<string, any>;
  id?: string;
  env?: OpenAiChatCompletionProvider['env'];
};
type BedrockMantleChatBodyContext = Parameters<OpenAiChatCompletionProvider['getOpenAiBody']>[1];
type BedrockMantleChatCallApiOptions = Parameters<OpenAiChatCompletionProvider['getOpenAiBody']>[2];

/**
 * The Bedrock **Mantle** engine exposes an OpenAI-compatible **Chat Completions** API at
 *
 *   https://bedrock-mantle.<region>.api.aws/v1/chat/completions
 *
 * AWS recommends the mantle endpoint "whenever possible", and it is the *only* way to reach
 * some models that are not served by the native `InvokeModel`/`Converse` APIs and therefore do
 * not appear in `list-foundation-models` — e.g. `zai.glm-4.6`, `deepseek.v3.1`,
 * `google.gemma-4-*`, and the mantle-namespaced Qwen `*-instruct` ids. `bedrock:mantle:<id>`
 * routes here so any mantle Chat Completions model is reachable.
 *
 * This is the Chat Completions counterpart to {@link createBedrockOpenAiResponsesProvider} (the
 * `/openai/v1/responses` path used by the OpenAI frontier and xAI Grok models). Use the bare
 * `bedrock:openai.gpt-5.5` / `bedrock:xai.grok-4.3` forms for those (Responses API, with
 * reasoning tokens); use `bedrock:mantle:<id>` to talk to the Chat Completions endpoint directly.
 *
 * Default region used when none is configured. The mantle model catalog is regional (see
 * `GET /v1/models`), so the caller should set `region` to one where the target model is offered.
 */
export const DEFAULT_BEDROCK_MANTLE_CHAT_REGION = 'us-east-1';
export const DEFAULT_BEDROCK_MANTLE_GROK_CHAT_REGION = 'us-west-2';

/**
 * Base URL for the mantle Chat Completions API. Most mantle chat models use the bare `/v1`
 * path, but Bedrock's xAI Chat Completions models and Gemma 4 chat models use `/openai/v1`.
 */
export function getBedrockMantleChatBaseUrl(region: string, modelName?: string): string {
  const path =
    modelName?.startsWith('xai.') || modelName?.startsWith('google.gemma-4') ? 'openai/v1' : 'v1';
  return `${getBedrockMantleOrigin(region)}/${path}`;
}

/**
 * OpenAI Chat Completions provider pinned to the Bedrock mantle endpoint. Behaves like the
 * OpenAI Platform chat provider (shared request/response/usage handling) but always targets the
 * configured mantle `apiBaseUrl`.
 */
export class BedrockMantleChatProvider extends OpenAiChatCompletionProvider {
  protected getCapabilityModelName(): string {
    return this.modelName.replace(/^(openai|xai)\./, '');
  }

  protected isGPT5Model(): boolean {
    const model = this.getCapabilityModelName();
    return model.startsWith('gpt-5') || model.includes('/gpt-5');
  }

  protected isReasoningModel(): boolean {
    const model = this.getCapabilityModelName();
    return (
      this.modelName.startsWith('xai.') ||
      model.startsWith('o1') ||
      model.startsWith('o3') ||
      model.startsWith('o4') ||
      model.includes('/o1') ||
      model.includes('/o3') ||
      model.includes('/o4') ||
      this.isGPT5Model()
    );
  }

  protected supportsTemperature(): boolean {
    return this.modelName.startsWith('xai.') || super.supportsTemperature();
  }

  protected getBillingModelName(): string {
    return this.getCapabilityModelName();
  }

  async getOpenAiBody(
    prompt: string,
    context?: BedrockMantleChatBodyContext,
    callApiOptions?: BedrockMantleChatCallApiOptions,
  ) {
    const result = await super.getOpenAiBody(prompt, context, callApiOptions);
    if (this.modelName.startsWith('xai.')) {
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
): OpenAiChatCompletionProvider {
  if (isBedrockOpenAiResponsesModel(modelName)) {
    throw new Error(
      `Amazon Bedrock model "bedrock:mantle:${modelName}" does not support Chat Completions. ` +
        `Use the bare "bedrock:${modelName}" id so promptfoo routes it through Bedrock's ` +
        `OpenAI-compatible Responses API.`,
    );
  }
  const config: Record<string, any> = providerOptions.config ?? {};
  const region = resolveBedrockMantleRegion(
    config,
    providerOptions.env,
    modelName.startsWith('xai.')
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
  const isGrok = modelName.startsWith('xai.grok-');

  return new BedrockMantleChatProvider(modelName, {
    ...providerOptions,
    config: { ...config, apiBaseUrl, apiKey, ...(isGrok ? { omitDefaults: true } : {}) },
  });
}
