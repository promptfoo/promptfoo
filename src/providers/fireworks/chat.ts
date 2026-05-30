import { OpenAiChatCompletionProvider } from '../openai/chat';
import { FireworksEmbeddingProvider } from './embedding';
import {
  buildFireworksProviderConfig,
  resolveFireworksApiKey,
  resolveFireworksApiUrl,
} from './shared';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import type { OpenAiCompletionOptions } from '../openai/types';

// `embedding`/`embeddings` route to the dedicated Fireworks embedding provider.
const FIREWORKS_EMBEDDING_SUBTYPES = new Set(['embedding', 'embeddings']);

// Other subtypes that may show up in `fireworks:<subtype>:<model>` paths but
// aren't implemented yet. Fail fast rather than silently dispatching them to the
// chat-completions surface here.
const FIREWORKS_RESERVED_PROVIDER_SUBTYPES = new Set([
  'chat',
  'completion',
  'image',
  'moderation',
  'realtime',
  'responses',
]);

type FireworksCostConfig = Pick<OpenAiCompletionOptions, 'cost' | 'inputCost' | 'outputCost'> & {
  // Fireworks bills prompt-cache hits at a discounted per-token rate, but the
  // discount varies widely by model (often 80-95% off the uncached input rate),
  // so we don't guess one. When this is set, cache-hit prompt tokens are priced
  // at this rate; otherwise they're billed at the full `inputCost` so the
  // estimate never silently under- or over-states spend.
  cacheReadInputCost?: number;
};

export function calculateFireworksCost(
  config: FireworksCostConfig,
  promptTokens?: number,
  completionTokens?: number,
  cached = false,
  cachedInputTokens = 0,
): number | undefined {
  // Promptfoo's own response cache: nothing was sent to the provider, so
  // there's no incremental spend even when token counts are missing.
  if (cached) {
    return 0;
  }

  const inputCost = config.inputCost ?? config.cost;
  const outputCost = config.outputCost ?? config.cost;

  if (
    inputCost === undefined ||
    outputCost === undefined ||
    promptTokens === undefined ||
    completionTokens === undefined
  ) {
    return undefined;
  }

  // Fireworks's provider-side prompt cache: split the prompt tokens into
  // freshly-billed and cache-hit halves so the cache-hit half can be priced
  // at the user-configured discounted rate. Without an explicit
  // `cacheReadInputCost` we fall back to the full input rate rather than
  // assuming a discount that doesn't match the model's actual pricing.
  const cacheHitTokens = Math.min(Math.max(cachedInputTokens, 0), promptTokens);
  const uncachedPromptTokens = promptTokens - cacheHitTokens;
  const cacheReadCost = config.cacheReadInputCost ?? inputCost;

  return (
    inputCost * uncachedPromptTokens +
    cacheReadCost * cacheHitTokens +
    outputCost * completionTokens
  );
}

export class FireworksProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: buildFireworksProviderConfig(providerOptions.config, providerOptions.env),
    });
  }

  id(): string {
    return `fireworks:${this.modelName}`;
  }

  toString(): string {
    return `[Fireworks AI Provider ${this.modelName}]`;
  }

  // Don't fall through to OPENAI_API_KEY: a misconfigured environment must
  // fail loudly rather than silently send an OpenAI key to Fireworks.
  override getApiKey(): string | undefined {
    return resolveFireworksApiKey(this.config, this.env as EnvOverrides | undefined);
  }

  // OpenAI-Organization is OpenAI-specific; it must not leak onto requests
  // sent to api.fireworks.ai.
  override getOrganization(): string | undefined {
    return undefined;
  }

  override getApiUrl(): string {
    return resolveFireworksApiUrl(this.config);
  }

  override async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const response = await super.callApi(prompt, context, callApiOptions);
    if (response.error) {
      return response;
    }

    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };
    const cost = calculateFireworksCost(
      config,
      response.tokenUsage?.prompt,
      response.tokenUsage?.completion,
      response.cached,
      readFireworksCachedPromptTokens(response),
    );
    // Only overwrite when we actually computed a cost; otherwise leave whatever
    // the superclass derived in place rather than clobbering it with undefined.
    if (cost !== undefined) {
      response.cost = cost;
    }

    return response;
  }
}

// Fireworks's chat-completions endpoint exposes prompt-cache hits two different
// ways depending on how the request was made: as the `fireworks-cached-prompt-tokens`
// response header on every call, and as `prompt_tokens_details.cached_tokens` in the
// usage body when the upstream OpenAI-style parser surfaces it via
// `completionDetails.cacheReadInputTokens`. Prefer the larger of the two so the
// discount lands whichever source the deployment populates. See:
// https://docs.fireworks.ai/guides/prompt-caching
export function readFireworksCachedPromptTokens(response: ProviderResponse): number {
  const fromUsageDetails = response.tokenUsage?.completionDetails?.cacheReadInputTokens ?? 0;
  const headerRecord = (
    response.metadata as { http?: { headers?: Record<string, unknown> } } | undefined
  )?.http?.headers;
  const headerValue =
    headerRecord?.['fireworks-cached-prompt-tokens'] ??
    headerRecord?.['Fireworks-Cached-Prompt-Tokens'];
  const fromHeader = typeof headerValue === 'string' ? Number.parseInt(headerValue, 10) : 0;
  const safeHeader = Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : 0;
  return Math.max(fromUsageDetails, safeHeader);
}

export function createFireworksProvider(
  providerPath: string,
  providerOptions: {
    config?: ProviderOptions;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const subtype = splits[1];

  const constructorOptions: ProviderOptions = {
    ...providerOptions.config,
    env: providerOptions.env,
  };

  // `fireworks:embedding:<model>` (or `embeddings`) targets the embeddings
  // endpoint via the dedicated provider; the model is everything after the
  // subtype so account-scoped ids keep their colons.
  if (FIREWORKS_EMBEDDING_SUBTYPES.has(subtype)) {
    const embeddingModel = splits.slice(2).join(':');
    if (!embeddingModel) {
      throw new Error(
        `Fireworks embedding provider needs a model identifier (e.g. "fireworks:embedding:accounts/fireworks/models/qwen3-embedding-8b"), got "${providerPath}".`,
      );
    }
    return new FireworksEmbeddingProvider(embeddingModel, constructorOptions);
  }

  if (FIREWORKS_RESERVED_PROVIDER_SUBTYPES.has(subtype)) {
    throw new Error(
      `The fireworks:${subtype}:* subtype is reserved for a future dedicated provider. Pass the model directly, e.g. "fireworks:accounts/fireworks/models/llama-v3p3-70b-instruct".`,
    );
  }

  const modelName = splits.slice(1).join(':');
  if (!modelName) {
    throw new Error(
      `Fireworks provider needs a model identifier (e.g. "fireworks:accounts/fireworks/models/llama-v3p3-70b-instruct"), got "${providerPath}".`,
    );
  }

  return new FireworksProvider(modelName, constructorOptions);
}
