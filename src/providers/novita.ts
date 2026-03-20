import { getEnvString } from '../envars';
import { fetchWithProxy } from '../util/fetch/index';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

export interface NovitaModel {
  id: string;
}

let modelCache: NovitaModel[] | null = null;

export function clearNovitaModelsCache() {
  modelCache = null;
}

export async function fetchNovitaModels(env?: EnvOverrides): Promise<NovitaModel[]> {
  if (modelCache) {
    return modelCache;
  }

  try {
    const apiKey = env?.NOVITA_API_KEY || getEnvString('NOVITA_API_KEY');
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetchWithProxy('https://api.novita.ai/v3/openai/models', { headers });
    const data = await response.json();

    const models = data?.data || data?.models || data;
    if (Array.isArray(models)) {
      modelCache = models.map((m: any) => ({ id: m.id || m.model || m.name || m }));
    } else {
      modelCache = [];
    }
  } catch {
    modelCache = [];
  }

  return modelCache ?? [];
}

export function createNovitaProvider(
  providerPath: string,
  options: { config?: ProviderOptions; id?: string; env?: EnvOverrides } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const type = splits[1];
  const modelName = splits.slice(2).join(':');

  const config = options.config?.config || {};

  const novitaOptions = {
    ...options,
    config: {
      ...config,
      apiBaseUrl: 'https://api.novita.ai/openai',
      apiKeyEnvar: 'NOVITA_API_KEY',
    } as OpenAiCompletionOptions,
  };

  if (type === 'chat') {
    return new OpenAiChatCompletionProvider(modelName, novitaOptions);
  } else if (type === 'completion') {
    return new OpenAiCompletionProvider(modelName, novitaOptions);
  } else if (type === 'embedding' || type === 'embeddings') {
    return new OpenAiEmbeddingProvider(modelName, novitaOptions);
  }

  const defaultModel = splits.slice(1).join(':');
  return new OpenAiChatCompletionProvider(defaultModel, novitaOptions);
}
