import logger from '../../logger';
import { OpenAiGenericProvider } from '.';
import { calculateOpenAIUsageCost } from './billing';
import { callJsonCachedOpenAi, unwrapOpenAiTransportError } from './client';
import { getTokenUsage } from './util';

import type { EnvOverrides } from '../../types/env';
import type { ProviderEmbeddingResponse } from '../../types/index';
import type { OpenAiSharedOptions } from './types';

type OpenAiEmbeddingOptions = OpenAiSharedOptions & {
  passthrough?: object;
};

export class OpenAiEmbeddingProvider extends OpenAiGenericProvider {
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

  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
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
      encoding_format: 'float' as const,
      ...(this.config.passthrough || {}),
    };

    const request = await callJsonCachedOpenAi(
      {
        apiKey: this.getApiKey(),
        allowMissingApiKey: !this.requiresApiKey(),
        organization: this.getOrganization(),
        baseURL: this.getApiUrl(),
        headers: this.config.headers,
        maxRetries: this.config.maxRetries,
      },
      (client) => client.embeddings.create(body),
    );
    const { requestMetadata } = request;
    if (!request.ok) {
      const { data: errorData, status, statusText } = requestMetadata;

      if (status && (status < 200 || status >= 300)) {
        return {
          error: `API error: ${status} ${statusText || 'Unknown error'}\n${typeof errorData === 'string' ? errorData : JSON.stringify(errorData)}`,
        };
      }

      const apiCallError = unwrapOpenAiTransportError(request.error);
      logger.error(`API call error: ${String(apiCallError)}`);
      await requestMetadata.deleteFromCache?.();
      return {
        error: `API call error: ${String(apiCallError)}`,
      };
    }
    const { data } = request;

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        return {
          error: 'No embedding found in OpenAI embeddings API response',
        };
      }
      return {
        embedding,
        latencyMs: requestMetadata.latencyMs,
        tokenUsage: getTokenUsage(data, requestMetadata.cached),
        cost: calculateOpenAIUsageCost(this.getBillingModelName(), this.config, data.usage, {
          cachedResponse: requestMetadata.cached,
        }),
      };
    } catch (err) {
      logger.error(`Response parsing error: ${String(err)}`);
      await requestMetadata.deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
