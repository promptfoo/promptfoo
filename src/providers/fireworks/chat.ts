import { getEnvString } from '../../envars';
import { OpenAiChatCompletionProvider } from '../openai/chat';

import type { EnvVarKey } from '../../envars';
import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/providers';
import type { OpenAiCompletionOptions } from '../openai/types';

const FIREWORKS_API_BASE_URL = 'https://api.fireworks.ai/inference/v1';

// Subtypes that may show up in `fireworks:<subtype>:<model>` paths but should
// be routed by future dedicated providers rather than silently going through
// the chat-completions surface here.
const FIREWORKS_RESERVED_PROVIDER_SUBTYPES = new Set([
  'chat',
  'completion',
  'embedding',
  'embeddings',
  'image',
  'moderation',
  'realtime',
  'responses',
]);

export function calculateFireworksCost(
  config: Pick<OpenAiCompletionOptions, 'cost' | 'inputCost' | 'outputCost'>,
  promptTokens?: number,
  completionTokens?: number,
  cached = false,
): number | undefined {
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

  return cached ? 0 : inputCost * promptTokens + outputCost * completionTokens;
}

export class FireworksProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions) {
    const explicitBaseUrl = providerOptions.config?.apiBaseUrl;
    const envBaseUrl =
      (providerOptions.env as Record<string, string | undefined> | undefined)
        ?.FIREWORKS_API_BASE_URL || getEnvString('FIREWORKS_API_BASE_URL');

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiBaseUrl: explicitBaseUrl || envBaseUrl || FIREWORKS_API_BASE_URL,
        apiKeyEnvar: providerOptions.config?.apiKeyEnvar || 'FIREWORKS_API_KEY',
      },
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
    const envar = this.config?.apiKeyEnvar || 'FIREWORKS_API_KEY';
    return (
      this.config?.apiKey ||
      (this.env as EnvOverrides | undefined)?.[envar as keyof EnvOverrides] ||
      getEnvString(envar as EnvVarKey)
    );
  }

  // OpenAI-Organization is OpenAI-specific; it must not leak onto requests
  // sent to api.fireworks.ai.
  override getOrganization(): string | undefined {
    return undefined;
  }

  // The base provider's getApiUrl() consults OPENAI_API_HOST / OPENAI_API_BASE_URL /
  // OPENAI_BASE_URL before config.apiBaseUrl, so an environment configured for
  // another OpenAI-compatible host would silently route fireworks:* requests
  // there. The constructor already merged FIREWORKS_API_BASE_URL into
  // config.apiBaseUrl, so we only need to consult that.
  override getApiUrl(): string {
    return this.config.apiBaseUrl || FIREWORKS_API_BASE_URL;
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
    response.cost = calculateFireworksCost(
      config,
      response.tokenUsage?.prompt,
      response.tokenUsage?.completion,
      response.cached,
    );

    return response;
  }
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
  const modelName = splits.slice(1).join(':');

  if (!modelName) {
    throw new Error(
      `Fireworks provider needs a model identifier (e.g. "fireworks:accounts/fireworks/models/llama-v3p3-70b-instruct"), got "${providerPath}".`,
    );
  }

  if (FIREWORKS_RESERVED_PROVIDER_SUBTYPES.has(subtype)) {
    throw new Error(
      `The fireworks:${subtype}:* subtype is reserved for a future dedicated provider. Pass the model directly, e.g. "fireworks:accounts/fireworks/models/llama-v3p3-70b-instruct".`,
    );
  }

  return new FireworksProvider(modelName, {
    ...providerOptions.config,
    env: providerOptions.env,
  });
}
