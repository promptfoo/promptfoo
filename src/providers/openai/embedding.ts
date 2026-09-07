import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { getRequestTimeoutMs, shouldBustProviderCache, withResponseCacheMetadata } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAIUsageCost } from './billing';
import { appendOpenAiApiPath, assertOpenAiApiModel, getTokenUsage } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

type OpenAiEmbeddingOptions = OpenAiSharedOptions & {
  passthrough?: object;
};

export class OpenAiEmbeddingProvider extends OpenAiGenericProvider {
  static readonly declaredProviderCapabilities = ['callEmbeddingApi'] as const;
  readonly promptfooCapabilities = OpenAiEmbeddingProvider.declaredProviderCapabilities;

  declare config: OpenAiEmbeddingOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiEmbeddingOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
  }

  protected getBillingModelName(): string {
    return this.modelName;
  }

  async callEmbeddingApi(
    text: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderEmbeddingResponse> {
    options?.abortSignal?.throwIfAborted();
    // Validate API key first (like chat provider)
    if (this.requiresApiKey() && !this.getApiKey()) {
      return {
        error: this.getMissingApiKeyErrorMessage(),
      };
    }

    // Validate input type to catch objects early
    if (typeof text !== 'string') {
      return {
        error: `Invalid input type for embedding API. Expected string, got ${typeof text}. Input: ${JSON.stringify(text)}`,
      };
    }

    const body = {
      input: text,
      model: this.modelName,
      ...(this.config.passthrough || {}),
    };
    assertOpenAiApiModel(body.model, this.getApiUrl());

    let data: any;
    let status: number | undefined;
    let statusText: string | undefined;
    let deleteFromCache: (() => Promise<void>) | undefined;
    let cached = false;
    let latencyMs: number | undefined;
    try {
      const apiKey = this.getApiKey();
      const response = await fetchWithCache(
        appendOpenAiApiPath(this.getApiUrl(), 'embeddings'),
        {
          method: 'POST',
          signal: options?.abortSignal,
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            ...this.getOpenAiRequestHeaders(),
          },
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
        'json',
        shouldBustProviderCache(context),
        this.config.maxRetries,
      );
      ({ data, cached, status, statusText, latencyMs, deleteFromCache } = response as any);

      // Check HTTP status like chat provider
      if (status && (status < 200 || status >= 300)) {
        return {
          error: `API error: ${status} ${statusText || 'Unknown error'}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      await deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        return {
          error: 'No embedding found in OpenAI embeddings API response',
        };
      }
      return withResponseCacheMetadata(
        {
          embedding,
          latencyMs,
          tokenUsage: getTokenUsage(data, false),
          cost: calculateOpenAIUsageCost(this.getBillingModelName(), this.config, data.usage),
        },
        cached,
      );
    } catch (err) {
      logger.error(`Response parsing error: ${String(err)}`);
      await deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
