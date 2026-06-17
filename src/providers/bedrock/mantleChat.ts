import { OpenAiChatCompletionProvider } from '../openai/chat';
import {
  getBedrockMantleOrigin,
  resolveBedrockMantleApiKey,
  resolveBedrockMantleRegion,
} from './mantle';

import type { ProviderOptions } from '../../types/providers';

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

/**
 * Base URL for the mantle Chat Completions API. Note the bare `/v1` path — the provider appends
 * `/chat/completions`. This differs from the Responses API's `/openai/v1` path.
 */
export function getBedrockMantleChatBaseUrl(region: string): string {
  return `${getBedrockMantleOrigin(region)}/v1`;
}

/**
 * OpenAI Chat Completions provider pinned to the Bedrock mantle endpoint. Behaves like the
 * OpenAI Platform chat provider (shared request/response/usage handling) but always targets the
 * configured mantle `apiBaseUrl`.
 */
export class BedrockMantleChatProvider extends OpenAiChatCompletionProvider {
  /**
   * Pin requests to the configured mantle endpoint. The base `getApiUrl()` prefers
   * `apiHost`/`OPENAI_API_HOST` over `apiBaseUrl`, so without this an ambient `OPENAI_API_HOST`
   * (set for an unrelated OpenAI-compatible provider) would hijack Bedrock calls and send the
   * Bedrock bearer token to the wrong host.
   */
  getApiUrl(): string {
    return this.config.apiBaseUrl || super.getApiUrl();
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
  providerOptions: ProviderOptions & { id?: string } = {},
): OpenAiChatCompletionProvider {
  const config: Record<string, any> = providerOptions.config ?? {};
  const region = resolveBedrockMantleRegion(
    config,
    providerOptions.env,
    DEFAULT_BEDROCK_MANTLE_CHAT_REGION,
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

  const apiBaseUrl = config.apiBaseUrl || getBedrockMantleChatBaseUrl(region);

  return new BedrockMantleChatProvider(modelName, {
    ...providerOptions,
    config: { ...config, apiBaseUrl, apiKey },
  });
}
