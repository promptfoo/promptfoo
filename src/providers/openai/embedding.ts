import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { getRequestTimeoutMs, shouldBustProviderCache, withResponseCacheMetadata } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAIUsageCost } from './billing';
import {
  appendOpenAiApiPath,
  assertOpenAiApiModel,
  getTokenUsage,
  normalizeOpenAiBillingModelName,
} from './util';

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

function decodeBase64Embedding(value: string): number[] {
  const bytes = Buffer.from(value, 'base64');
  const canonical = bytes.toString('base64');
  if (
    bytes.length === 0 ||
    bytes.length % Float32Array.BYTES_PER_ELEMENT !== 0 ||
    (value !== canonical && value !== canonical.replace(/=+$/, ''))
  ) {
    throw new Error('Invalid base64 embedding in OpenAI embeddings API response');
  }

  const embedding = Array.from(
    { length: bytes.length / Float32Array.BYTES_PER_ELEMENT },
    (_, index) => bytes.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT),
  );
  if (embedding.some((number) => !Number.isFinite(number))) {
    throw new Error('Invalid base64 embedding in OpenAI embeddings API response');
  }
  return embedding;
}

export class OpenAiEmbeddingProvider extends OpenAiGenericProvider {
  readonly supportsEmbeddingCancellation = true;

  declare config: OpenAiEmbeddingOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiEmbeddingOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
  }

  protected getBillingModelName(config: OpenAiSharedOptions): string {
    const passthroughModel = (config as OpenAiSharedOptions & { passthrough?: { model?: unknown } })
      .passthrough?.model;
    return typeof passthroughModel === 'string'
      ? passthroughModel
      : super.getBillingModelName(config);
  }

  async callEmbeddingApi(
    text: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderEmbeddingResponse> {
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
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            ...this.getOpenAiRequestHeaders(),
          },
          body: JSON.stringify(body),
          ...(options?.abortSignal && { signal: options.abortSignal }),
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
      options?.abortSignal?.throwIfAborted();
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
      const billingModelName = this.getBillingModelName(this.config);
      const billingLookupModel = normalizeOpenAiBillingModelName(billingModelName);
      return withResponseCacheMetadata(
        {
          embedding: typeof embedding === 'string' ? decodeBase64Embedding(embedding) : embedding,
          latencyMs,
          tokenUsage: getTokenUsage(data, false),
          cost: calculateOpenAIUsageCost(billingLookupModel, this.config, data.usage),
        },
        cached,
      );
    } catch (err) {
      logger.error(`Response parsing error: ${String(err)}`);
      await deleteFromCache?.();
      return {
        error: `API error: ${String(err)}`,
      };
    }
  }
}
