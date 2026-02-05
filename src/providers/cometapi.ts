import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { OpenAiImageProvider } from './openai/image';
import { REQUEST_TIMEOUT_MS } from './shared';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions, OpenAiSharedOptions } from './openai/types';

export interface CometApiModel {
  id: string;
}

// Note: We no longer filter models - users specify intent via provider syntax like :chat:, :image:, :embedding:

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
      models = raw.map((m: any) => ({
        id: m.id || m.model || m.name || (typeof m === 'string' ? m : ''),
      }));
    }

    // Return all models - let users specify their intent with :chat:, :image:, :embedding: prefixes
    modelCache = models;
  } catch (err) {
    logger.warn(`Failed to fetch cometapi models: ${String(err)}`);
    modelCache = [];
  }

  return modelCache;
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
