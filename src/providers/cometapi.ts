import { fetchWithCache, getHeadersForCacheKey, getScopedCacheKey, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { createModelDiscoveryCache } from './modelDiscovery';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { OpenAiImageProvider } from './openai/image';
import { getRequestTimeoutMs } from './shared';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions, OpenAiSharedOptions } from './openai/types';

export interface CometApiModel {
  id: string;
}

// Note: We no longer filter models - users specify intent via provider syntax like :chat:, :image:, :embedding:

const modelCache = createModelDiscoveryCache<CometApiModel>(isCacheEnabled);

export function clearCometApiModelsCache() {
  modelCache.clear();
}

export async function fetchCometApiModels(env?: EnvOverrides): Promise<CometApiModel[]> {
  try {
    const apiKey = env?.COMETAPI_KEY || getEnvString('COMETAPI_KEY');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const url = 'https://api.cometapi.com/v1/models';
    const key = getScopedCacheKey(JSON.stringify(getHeadersForCacheKey(url, { headers })));
    return await modelCache.get(key, async () => {
      // Keep credentialed discovery out of the persistent HTTP cache.
      const { data, status } = await fetchWithCache<unknown>(
        url,
        { headers },
        getRequestTimeoutMs(),
        'json',
        true,
        2,
      );
      if (status < 200 || status >= 300) {
        throw new Error(`HTTP ${status}`);
      }
      const body = data as { data?: unknown; models?: unknown } | null;
      const raw = body?.data ?? body?.models ?? data;
      if (!Array.isArray(raw)) {
        throw new Error('Invalid CometAPI model catalogue');
      }
      // Task selection remains the caller's choice, independent of model names.
      return raw.map((model: unknown) => {
        const item = model as { id?: unknown; model?: unknown; name?: unknown } | null;
        const id = typeof model === 'string' ? model : (item?.id ?? item?.model ?? item?.name);
        if (typeof id !== 'string' || !id.trim()) {
          throw new Error('Invalid CometAPI model ID');
        }
        return { id };
      });
    });
  } catch (err) {
    logger.warn('Failed to fetch cometapi models', { error: err });
    return [];
  }
}

/**
 * CometAPI Image Provider - extends OpenAI Image Provider for CometAPI's image generation models
 */
export class CometApiImageProvider extends OpenAiImageProvider {
  constructor(
    modelName: string,
    options: { config?: OpenAiSharedOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiKeyEnvar: 'COMETAPI_KEY',
        apiBaseUrl: 'https://api.cometapi.com/v1',
      },
    });
  }

  getApiKey(): string | undefined {
    if (this.config?.apiKey) {
      return this.config.apiKey;
    }
    return getEnvString('COMETAPI_KEY');
  }

  getApiUrlDefault(): string {
    return 'https://api.cometapi.com/v1';
  }
}

/**
 * Factory for creating CometAPI providers using OpenAI-compatible endpoints.
 */
export function createCometApiProvider(
  providerPath: string,
  options: { config?: ProviderOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const type = splits[1];
  const modelName = splits.slice(2).join(':');

  const openaiOptions = {
    ...options,
    config: {
      ...(options.config || {}),
      apiBaseUrl: 'https://api.cometapi.com/v1',
      apiKeyEnvar: 'COMETAPI_KEY',
    } as OpenAiCompletionOptions,
  };

  if (type === 'chat') {
    return new OpenAiChatCompletionProvider(modelName, openaiOptions);
  } else if (type === 'completion') {
    return new OpenAiCompletionProvider(modelName, openaiOptions);
  } else if (type === 'embedding' || type === 'embeddings') {
    return new OpenAiEmbeddingProvider(modelName, openaiOptions);
  } else if (type === 'image') {
    return new CometApiImageProvider(modelName, openaiOptions);
  }

  // Default to chat provider when no type is specified
  const defaultModel = splits.slice(1).join(':');
  return new OpenAiChatCompletionProvider(defaultModel, openaiOptions);
}
