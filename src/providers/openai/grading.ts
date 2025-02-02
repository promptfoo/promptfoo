import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiGenericProvider } from './index';
import type { OpenAiSharedOptions, OpenAiModelsResponse } from './types';

const GPT4o_MODEL = 'gpt-4o-2024-05-13';
const O3_MINI_MODEL = 'o3-mini';

let modelsCache: OpenAiModelsResponse | null = null;
let modelsCachePromise: Promise<OpenAiModelsResponse> | null = null;

async function getAvailableModels(options?: {
  config?: OpenAiSharedOptions;
  env?: any;
}): Promise<OpenAiModelsResponse> {
  // Return cached result if available
  if (modelsCache) {
    return modelsCache;
  }

  // Return in-flight promise if one exists
  if (modelsCachePromise) {
    return modelsCachePromise;
  }

  const provider = new OpenAiGenericProvider(GPT4o_MODEL, options);

  modelsCachePromise = provider
    .getAvailableModels()
    .then((models) => {
      modelsCache = models;
      modelsCachePromise = null;
      return models;
    })
    .catch((error) => {
      modelsCachePromise = null;
      throw error;
    });

  return modelsCachePromise;
}

export async function getBestGradingModel(options?: {
  config?: OpenAiSharedOptions;
  env?: any;
}): Promise<string> {
  try {
    const models = await getAvailableModels(options);
    const isO3MiniAvailable = models.data.some((model) => model.id === O3_MINI_MODEL);
    return isO3MiniAvailable ? O3_MINI_MODEL : GPT4o_MODEL;
  } catch {
    // If we can't fetch models (e.g., no API key), default to GPT-4o
    return GPT4o_MODEL;
  }
}

export async function createGradingProvider(options?: {
  config?: OpenAiSharedOptions;
  env?: any;
}): Promise<OpenAiChatCompletionProvider> {
  const modelName = await getBestGradingModel(options);
  return new OpenAiChatCompletionProvider(modelName, options);
}

export async function createGradingJsonProvider(options?: {
  config?: OpenAiSharedOptions;
  env?: any;
}): Promise<OpenAiChatCompletionProvider> {
  const modelName = await getBestGradingModel(options);
  return new OpenAiChatCompletionProvider(modelName, {
    ...options,
    config: {
      ...options?.config,
      response_format: { type: 'json_object' },
    },
  });
}
