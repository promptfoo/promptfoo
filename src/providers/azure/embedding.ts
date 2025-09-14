import { fetchWithCache } from '../../cache.js';
import invariant from '../../util/invariant.js';
import { REQUEST_TIMEOUT_MS } from '../shared.js';
import { DEFAULT_AZURE_API_VERSION } from './defaults.js';
import { AzureGenericProvider } from './generic.js';

import type { ProviderEmbeddingResponse } from '../../types/index.js';

export class AzureEmbeddingProvider extends AzureGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');
    if (!this.getApiBaseUrl()) {
      throw new Error('Azure API host must be set.');
    }

    const body = {
      input: text,
      model: this.deploymentName,
    };
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.getApiBaseUrl()}/openai/deployments/${this.deploymentName}/embeddings?api-version=${
          this.config.apiVersion || DEFAULT_AZURE_API_VERSION
        }`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
        tokenUsage: {
          total: 0,
          prompt: 0,
          completion: 0,
        },
      };
    }

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned');
      }
      const ret = {
        embedding,
        tokenUsage: cached
          ? { cached: data.usage.total_tokens, total: data.usage.total_tokens }
          : {
              total: data.usage.total_tokens,
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
            },
      };
      return ret;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        tokenUsage: cached
          ? {
              cached: data.usage.total_tokens,
              total: data.usage.total_tokens,
            }
          : {
              total: data?.usage?.total_tokens,
              prompt: data?.usage?.prompt_tokens,
              completion: data?.usage?.completion_tokens,
            },
      };
    }
  }
}
