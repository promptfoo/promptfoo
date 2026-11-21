import { fetchWithCache } from '../../cache';
import invariant from '../../util/invariant';
import { getRequestTimeoutMs, shouldBustProviderCache } from '../shared';
import { DEFAULT_AZURE_API_VERSION } from './defaults';
import { AzureGenericProvider } from './generic';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
} from '../../types/index';

interface AzureEmbeddingData {
  data?: { embedding?: number[] }[];
  usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
}

export class AzureEmbeddingProvider extends AzureGenericProvider {
  readonly supportsEmbeddingCancellation = true;

  async callEmbeddingApi(
    text: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderEmbeddingResponse> {
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');
    if (!this.getApiBaseUrl()) {
      throw new Error('Azure API host must be set.');
    }

    const body = {
      input: text,
      model: this.deploymentName,
      ...(this.config.dimensions === undefined ? {} : { dimensions: this.config.dimensions }),
    };
    const failedRequestUsage = { total: 0, prompt: 0, completion: 0, numRequests: 1 };
    let response;
    try {
      response = await fetchWithCache<AzureEmbeddingData>(
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
          ...(options?.abortSignal && { signal: options.abortSignal }),
        },
        getRequestTimeoutMs(),
        'json',
        shouldBustProviderCache(context),
      );
    } catch (err) {
      options?.abortSignal?.throwIfAborted();
      return { error: `API call error: ${String(err)}`, tokenUsage: failedRequestUsage };
    }

    const { cached, data, status, statusText } = response;
    if (status < 200 || status >= 300) {
      const detail = typeof data === 'string' ? data : JSON.stringify(data);
      return {
        error: `API error: ${status} ${statusText}\n${detail}`,
        tokenUsage: failedRequestUsage,
      };
    }

    const usage = data?.usage;
    const tokenUsage = cached
      ? { cached: usage?.total_tokens, total: usage?.total_tokens, numRequests: 1 }
      : {
          total: usage?.total_tokens,
          prompt: usage?.prompt_tokens,
          completion: usage?.completion_tokens,
          numRequests: 1,
        };
    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        await response.deleteFromCache?.();
        throw new Error('No embedding returned');
      }
      return { embedding, cached, tokenUsage };
    } catch (err) {
      return { error: `API response error: ${String(err)}: ${JSON.stringify(data)}`, tokenUsage };
    }
  }
}
