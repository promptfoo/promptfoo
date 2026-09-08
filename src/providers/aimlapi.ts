import { fetchWithCache, getHeadersForCacheKey, getScopedCacheKey, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { createModelDiscoveryCache } from './modelDiscovery';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { getRequestTimeoutMs } from './shared';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

export interface AimlApiModel {
  id: string;
  aliases?: string[];
}

const modelCache = createModelDiscoveryCache<AimlApiModel>(isCacheEnabled);

export function clearAimlApiModelsCache() {
  modelCache.clear();
}

export async function fetchAimlApiModels(env?: EnvOverrides): Promise<AimlApiModel[]> {
  try {
    const apiKey = env?.AIML_API_KEY || getEnvString('AIML_API_KEY');
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const url = 'https://api.aimlapi.com/v1/models';
    // Reuse the process-salted header identity and caller namespace, never raw credentials.
    const key = getScopedCacheKey(JSON.stringify(getHeadersForCacheKey(url, { headers })));
    return await modelCache.get(key, async () => {
      // This cache owns discovery expiry; do not replay a 14-day HTTP cache entry.
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
      const models = body?.data ?? body?.models ?? data;
      if (!Array.isArray(models)) {
        throw new Error('Invalid AIML API model catalogue');
      }
      return models.map((model: unknown) => {
        const item = model as {
          id?: unknown;
          model?: unknown;
          name?: unknown;
          aliases?: unknown;
        } | null;
        const id = typeof model === 'string' ? model : (item?.id ?? item?.model ?? item?.name);
        if (typeof id !== 'string' || !id.trim()) {
          throw new Error('Invalid AIML API model ID');
        }
        if (item?.aliases !== undefined) {
          if (
            !Array.isArray(item.aliases) ||
            item.aliases.some((alias) => typeof alias !== 'string' || !alias.trim())
          ) {
            throw new Error('Invalid AIML API model aliases');
          }
          return { id, aliases: [...new Set(item.aliases as string[])] };
        }
        return { id };
      });
    });
  } catch (err) {
    logger.warn('Failed to fetch aimlapi models', { error: err });
    return [];
  }
}

/**
 * Factory for creating AI/ML API providers using OpenAI-compatible endpoints.
 */
export function createAimlApiProvider(
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
      apiBaseUrl: 'https://api.aimlapi.com/v1',
      apiKeyEnvar: 'AIML_API_KEY',
    } as OpenAiCompletionOptions,
  };

  if (type === 'chat') {
    return new OpenAiChatCompletionProvider(modelName, openaiOptions);
  } else if (type === 'completion') {
    return new OpenAiCompletionProvider(modelName, openaiOptions);
  } else if (type === 'embedding' || type === 'embeddings') {
    return new OpenAiEmbeddingProvider(modelName, openaiOptions);
  }

  // Default to chat provider when no type is specified
  const defaultModel = splits.slice(1).join(':');
  return new OpenAiChatCompletionProvider(defaultModel, openaiOptions);
}
