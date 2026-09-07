import { fetchWithCache } from '../../cache';
import invariant from '../../util/invariant';
import { getRequestTimeoutMs } from '../shared';
import { DEFAULT_AZURE_API_VERSION } from './defaults';
import { AzureGenericProvider } from './generic';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
} from '../../types/index';

export class AzureEmbeddingProvider extends AzureGenericProvider {
  readonly capabilities = ['callEmbeddingApi'] as const;

  async callEmbeddingApi(
    text: string,
    _context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderEmbeddingResponse> {
    options?.abortSignal?.throwIfAborted();
    await this.ensureInitialized(options?.abortSignal);
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
          signal: options?.abortSignal,
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
        tokenUsage: {
          total: 0,
          prompt: 0,
          completion: 0,
          numRequests: 1,
        },
      };
    }

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned');
      }
      const ret: ProviderEmbeddingResponse = {
        embedding,
        cached, // surface the cache hit so downstream skips rate-limit delays / metrics are accurate
        tokenUsage: cached
          ? { cached: data?.usage?.total_tokens, total: data?.usage?.total_tokens, numRequests: 1 }
          : {
              total: data?.usage?.total_tokens,
              prompt: data?.usage?.prompt_tokens,
              completion: data?.usage?.completion_tokens,
              numRequests: 1,
            },
      };
      return ret;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        tokenUsage: cached
          ? {
              cached: data?.usage?.total_tokens,
              total: data?.usage?.total_tokens,
              numRequests: 1,
            }
          : {
              total: data?.usage?.total_tokens,
              prompt: data?.usage?.prompt_tokens,
              completion: data?.usage?.completion_tokens,
              numRequests: 1,
            },
      };
    }
  }
}
