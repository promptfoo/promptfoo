import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiEmbeddingProvider, ProviderResponse, ProviderEmbeddingResponse } from '../types';
import { REQUEST_TIMEOUT_MS } from './shared';

export class VoyageEmbeddingProvider implements ApiEmbeddingProvider {
  modelName: string;
  config: any;
  env?: any;

  constructor(modelName: string, config: any = {}, env?: any) {
    this.modelName = modelName;
    this.config = config;
    this.env = env;
  }

  id() {
    return `voyage:${this.modelName}`;
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] || this.env?.[this.config.apiKeyEnvar as keyof any]
        : undefined) ||
      this.env?.VOYAGE_API_KEY ||
      getEnvString('VOYAGE_API_KEY')
    );
  }

  getApiUrl(): string {
    return (
      this.config.apiBaseUrl ||
      this.env?.VOYAGE_API_BASE_URL ||
      getEnvString('VOYAGE_API_BASE_URL') ||
      'https://api.voyageai.com/v1'
    );
  }

  async callApi(): Promise<ProviderResponse> {
    throw new Error('Voyage API does not provide text inference.');
  }

  async callEmbeddingApi(input: string): Promise<ProviderEmbeddingResponse> {
    if (!this.getApiKey()) {
      throw new Error('Voyage API key must be set for similarity comparison');
    }

    const body = {
      input: [input],
      model: this.modelName,
    };

    let data;
    try {
      ({ data } = (await fetchWithCache(
        `${this.getApiUrl()}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      logger.error(`API call error: ${err}`);
      throw err;
    }
    logger.debug(`\tVoyage embeddings API response: ${JSON.stringify(data)}`);

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in Voyage embeddings API response');
      }
      return {
        embedding,
        tokenUsage: {
          total: data.usage.total_tokens,
        },
      };
    } catch (err) {
      logger.error(data.error.message);
      throw err;
    }
  }
}
