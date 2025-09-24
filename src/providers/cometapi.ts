import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { REQUEST_TIMEOUT_MS } from './shared';

import type { ApiProvider, ProviderOptions } from '../types/index';
import type { EnvOverrides } from '../types/env';
import type { OpenAiCompletionOptions } from './openai/types';

export interface CometApiModel {
  id: string;
}

const COMETAPI_IGNORE_PATTERNS: string[] = [
  // Image models
  'dall-e',
  'dalle',
  'midjourney',
  'mj_',
  'stable-diffusion',
  'sd-',
  'flux-',
  'playground-v',
  'ideogram',
  'recraft-',
  'black-forest-labs',
  '/recraft-v3',
  'recraftv3',
  'stability-ai/',
  'sdxl',
  // Audio models
  'suno_',
  'tts',
  'whisper',
  // Video models
  'runway',
  'luma_',
  'luma-',
  'veo',
  'kling_',
  'minimax_video',
  'hunyuan-t1',
  // Utility models
  'embedding',
  'search-gpts',
  'files_retrieve',
  'moderation',
  // deepl-related models
  'deepl-',
];

let modelCache: CometApiModel[] | null = null;

export function clearCometApiModelsCache() {
  modelCache = null;
}

export async function fetchCometApiModels(env?: EnvOverrides): Promise<CometApiModel[]> {
  if (modelCache) {
    return modelCache;
  }

  try {
    const apiKey = env?.COMETAPI_KEY || getEnvString('COMETAPI_KEY');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const { data } = await fetchWithCache<any>(
      'https://api.cometapi.com/v1/models',
      { headers },
      REQUEST_TIMEOUT_MS,
    );

    const raw = data?.data || data?.models || data;
    let models: CometApiModel[] = [];
    if (Array.isArray(raw)) {
      models = raw.map((m: any) => ({ id: m.id || m.model || m.name || m }));
    }

    // Filter out non-chat models using ignore patterns
    const filtered = models.filter((m) => {
      const id = (m.id || '').toLowerCase();
      return !COMETAPI_IGNORE_PATTERNS.some((pat) => id.includes(pat));
    });

    modelCache = filtered;
  } catch (err) {
    logger.warn(`Failed to fetch cometapi models: ${String(err)}`);
    modelCache = [];
  }

  return modelCache;
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
  }

  // Default to chat provider when no type is specified
  const defaultModel = splits.slice(1).join(':');
  return new OpenAiChatCompletionProvider(defaultModel, openaiOptions);
}
