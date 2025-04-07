import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import type {
  ApiProvider,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../../types';
import { REQUEST_TIMEOUT_MS } from '../shared';

/**
 * Configuration options for Ollama embedding provider
 */
export interface OllamaEmbeddingConfig {
  model: string;

  // Optional parameters that might affect embeddings
  num_ctx?: number;
  seed?: number;
}

/**
 * Implementation of Ollama Embedding Provider
 */
export class OllamaEmbeddingProvider implements ApiProvider {
  public config: OllamaEmbeddingConfig;
  private baseUrl: string;
  private apiKey?: string;

  constructor(model: string, options: { id?: string; config?: ProviderOptions } = {}) {
    const { id, config = {} } = options;

    this.config = {
      model,
      ...(config.config || {}),
    };

    this.baseUrl = getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434';
    this.apiKey = getEnvString('OLLAMA_API_KEY');

    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `ollama:embedding:${this.config.model}`;
  }

  toString(): string {
    return `[Ollama Embedding Provider ${this.config.model}]`;
  }

  /**
   * Placeholder implementation to satisfy ApiProvider interface
   */
  async callApi(prompt: string): Promise<ProviderResponse> {
    return {
      error: 'This is an embedding provider. Use callEmbeddingApi instead.',
    };
  }

  /**
   * Call the Ollama embedding API
   */
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // Prepare request parameters
      const requestBody: Record<string, any> = {
        model: this.config.model,
        prompt: text,
      };

      // Add options if specified
      if (this.config.num_ctx !== undefined || this.config.seed !== undefined) {
        requestBody.options = {};

        if (this.config.num_ctx !== undefined) {
          requestBody.options.num_ctx = this.config.num_ctx;
        }

        if (this.config.seed !== undefined) {
          requestBody.options.seed = this.config.seed;
        }
      }

      logger.debug(
        `Calling Ollama Embeddings API with body: ${JSON.stringify(requestBody, null, 2)}`,
      );

      const response = await fetchWithCache(
        `${this.baseUrl}/api/embeddings`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );

      if (!response.data) {
        return {
          error: `Empty response from Ollama embeddings API: ${JSON.stringify(response)}`,
        };
      }

      const data = response.data as { embedding: number[] };

      if (!data.embedding) {
        return {
          error: `No embedding found in Ollama embeddings API response: ${JSON.stringify(data)}`,
        };
      }

      return {
        embedding: data.embedding,
      };
    } catch (err) {
      return {
        error: `Embedding API call error: ${String(err)}`,
      };
    }
  }
}
