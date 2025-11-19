import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { OpenAiGenericProvider } from '.';
import { getTokenUsage } from './util';

import type { ProviderEmbeddingResponse } from '../../types/index';

export class OpenAiEmbeddingProvider extends OpenAiGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    // Validate API key first (like chat provider)
    if (this.requiresApiKey() && !this.getApiKey()) {
      return {
        error: `API key is not set. Set the ${this.config.apiKeyEnvar || 'OPENAI_API_KEY'} environment variable or add \`apiKey\` to the provider config.`,
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
    };

    let data: any;
    let status: number | undefined;
    let statusText: string | undefined;
    let deleteFromCache: (() => Promise<void>) | undefined;
    let cached = false;
    let latencyMs: number | undefined;
    try {
      const response = await fetchWithCache(
        `${this.getApiUrl()}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        false,
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
      return {
        embedding,
        latencyMs,
        tokenUsage: getTokenUsage(data, cached),
      };
    } catch (err) {
      logger.error(`Response parsing error: ${String(err)}`);
      await deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
