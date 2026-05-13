import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAIUsageCost } from './billing';
import { callJsonCachedOpenAi, unwrapOpenAiTransportError } from './client';
import { formatOpenAiError, getTokenUsage, OPENAI_COMPLETION_MODELS } from './util';
import type OpenAI from 'openai';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiCompletionOptions } from './types';

export class OpenAiCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_COMPLETION_MODELS = OPENAI_COMPLETION_MODELS;

  static OPENAI_COMPLETION_MODEL_NAMES = OPENAI_COMPLETION_MODELS.map((model) => model.id);

  config: OpenAiCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
    if (
      !OpenAiCompletionProvider.OPENAI_COMPLETION_MODEL_NAMES.includes(modelName) &&
      this.getApiUrl() === this.getApiUrlDefault()
    ) {
      logger.warn(`FYI: Using unknown OpenAI completion model: ${modelName}`);
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    let stop: string;
    try {
      stop = getEnvString('OPENAI_STOP')
        ? JSON.parse(getEnvString('OPENAI_STOP') || '')
        : this.config?.stop || ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
    }
    const body = {
      model: this.modelName,
      prompt,
      seed: this.config.seed,
      max_tokens: this.config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024),
      temperature: this.config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0),
      top_p: this.config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1),
      presence_penalty: this.config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
      frequency_penalty:
        this.config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
      best_of: this.config.best_of ?? getEnvInt('OPENAI_BEST_OF', 1),
      ...(callApiOptions?.includeLogProbs ? { logprobs: 1 } : {}),
      ...(stop ? { stop } : {}),
      ...(this.config.passthrough || {}),
    };

    const request = await callJsonCachedOpenAi(
      {
        apiKey: this.getApiKey(),
        allowMissingApiKey: !this.requiresApiKey(),
        organization: this.getOrganization(),
        baseURL: this.getApiUrl(),
        headers: this.config.headers,
        bustCache: context?.bustCache ?? context?.debug,
        maxRetries: this.config.maxRetries,
      },
      (client) => client.completions.create(body as OpenAI.CompletionCreateParamsNonStreaming),
    );
    const { requestMetadata } = request;
    if (!request.ok) {
      if (isOpenAiErrorResponse(requestMetadata.data)) {
        return {
          error: formatOpenAiError(requestMetadata.data),
        };
      }

      const apiCallError = unwrapOpenAiTransportError(request.error);
      logger.error(`API call error: ${String(apiCallError)}`);
      return {
        error: `API call error: ${String(apiCallError)}`,
      };
    }
    const { data } = request;

    if (isOpenAiErrorResponse(data)) {
      return {
        error: formatOpenAiError(data),
      };
    }
    try {
      return {
        output: data.choices[0].text,
        tokenUsage: getTokenUsage(data, requestMetadata.cached),
        cached: requestMetadata.cached,
        latencyMs: requestMetadata.latencyMs,
        cost: calculateOpenAIUsageCost(this.modelName, this.config, data.usage, {
          cachedResponse: requestMetadata.cached,
          serviceTier:
            (data as { service_tier?: OpenAiCompletionOptions['service_tier'] }).service_tier ??
            this.config.service_tier,
        }),
      };
    } catch (err) {
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

function isOpenAiErrorResponse(data: unknown): data is {
  error: { message: string; type?: string; code?: string };
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'object' &&
    data.error !== null &&
    'message' in data.error &&
    typeof data.error.message === 'string'
  );
}
