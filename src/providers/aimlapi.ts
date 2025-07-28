import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { REQUEST_TIMEOUT_MS } from './shared';

import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import type { OpenAiCompletionOptions } from './openai/types';

export interface AimlApiModel {
  id: string;
}

let modelCache: AimlApiModel[] | null = null;

export function clearAimlApiModelsCache() {
  modelCache = null;
}

export async function fetchAimlApiModels(env?: EnvOverrides): Promise<AimlApiModel[]> {
  if (modelCache) {
    return modelCache;
  }

  try {
    const apiKey = env?.AIML_API_KEY || getEnvString('AIML_API_KEY');
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const { data } = await fetchWithCache<any>(
      'https://api.aimlapi.com/models',
      { headers },
      REQUEST_TIMEOUT_MS,
    );

    const models = data?.data || data?.models || data;
    if (Array.isArray(models)) {
      modelCache = models.map((m: any) => ({ id: m.id || m.model || m.name || m }));
    } else {
      modelCache = [];
    }
  } catch (err) {
    logger.warn(`Failed to fetch aimlapi models: ${String(err)}`);
    modelCache = [];
  }

  return modelCache;
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
