import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { extractProviderResponseAttributes, withGenAISpan } from '../../tracing/genaiTracer';
import { getRequestTimeoutMs } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAIUsageCost } from './billing';
import {
  appendOpenAiApiPath,
  assertOpenAiApiModel,
  formatOpenAiError,
  getTokenUsage,
  OPENAI_COMPLETION_MODELS,
} from './util';

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

    let stop: unknown;
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
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(stop ? { stop } : {}),
      ...(this.config.passthrough || {}),
    };
    assertOpenAiApiModel(body.model, this.getApiUrl());
    const asNumber = (value: unknown): number | undefined =>
      typeof value === 'number' ? value : undefined;
    const stopSequences =
      typeof body.stop === 'string'
        ? [body.stop]
        : Array.isArray(body.stop) &&
            body.stop.every((item): item is string => typeof item === 'string')
          ? body.stop
          : undefined;

    return withGenAISpan(
      {
        system: this.getGenAISystem(),
        operationName: 'text_completion',
        model: body.model,
        providerId: this.id(),
        maxTokens: asNumber(body.max_tokens),
        temperature: asNumber(body.temperature),
        topP: asNumber(body.top_p),
        stopSequences,
        presencePenalty: asNumber(body.presence_penalty),
        frequencyPenalty: asNumber(body.frequency_penalty),
        evalId: context?.evaluationId,
        testIndex: context?.testIdx ?? (context?.test?.vars?.__testIdx as number | undefined),
        promptLabel: context?.prompt?.label,
        traceparent: context?.traceparent,
        requestBody: prompt,
      },
      () => this.callApiInternal(body, context),
      extractProviderResponseAttributes,
    );
  }

  private async callApiInternal(
    body: Record<string, unknown>,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    let data,
      cached = false,
      latencyMs: number | undefined;
    try {
      ({ data, cached, latencyMs } = (await fetchWithCache(
        appendOpenAiApiPath(this.getApiUrl(), 'completions'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
            ...this.getOpenAiRequestHeaders(),
          },
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
        'json',
        context?.bustCache ?? context?.debug,
        this.config.maxRetries,
      )) as unknown as any);
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    if (data.error) {
      return {
        error: formatOpenAiError(data),
      };
    }
    try {
      return {
        output: data.choices[0].text,
        tokenUsage: getTokenUsage(data, cached),
        cached,
        latencyMs,
        cost: calculateOpenAIUsageCost(this.modelName, this.config, data.usage, {
          cachedResponse: cached,
          serviceTier: data.service_tier ?? this.config.service_tier,
        }),
      };
    } catch (err) {
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
