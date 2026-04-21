import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { REQUEST_TIMEOUT_MS } from './shared';

import type {
  ApiEmbeddingProvider,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../types/index';

function formatVoyageApiError(status: number, statusText: string, data: any): string {
  const responseText =
    typeof data === 'string'
      ? data
      : typeof data?.error === 'string'
        ? data.error
        : typeof data?.error?.message === 'string'
          ? data.error.message
          : JSON.stringify(data);
  const errorPrefix = status === 429 ? 'Voyage API rate limit exceeded' : 'Voyage API error';
  return `${errorPrefix}: ${status} ${statusText || 'Unknown error'}\n${responseText}`;
}

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

  requiresApiKey(): boolean {
    return true;
  }

  getApiKey(): string | undefined {
    const apiKeyCandidate =
      this.config?.apiKey ||
      (this.config?.apiKeyEnvar
        ? getEnvString(this.config.apiKeyEnvar) || this.env?.[this.config.apiKeyEnvar as keyof any]
        : undefined) ||
      this.env?.VOYAGE_API_KEY ||
      getEnvString('VOYAGE_API_KEY');
    return apiKeyCandidate;
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

    let data,
      cached = false,
      status: number | undefined,
      statusText = '',
      latencyMs: number | undefined;
    try {
      ({ data, cached, status, statusText, latencyMs } = (await fetchWithCache(
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

    if (status !== undefined && (status < 200 || status >= 300)) {
      const errorMessage = formatVoyageApiError(status, statusText, data);
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in Voyage embeddings API response');
      }
      return {
        embedding,
        cached,
        latencyMs,
        tokenUsage: {
          total: data?.usage?.total_tokens,
          numRequests: 1,
        },
      };
    } catch (err) {
      logger.error(typeof data?.error?.message === 'string' ? data.error.message : String(err));
      throw err;
    }
  }
}
