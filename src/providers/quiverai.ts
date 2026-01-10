import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';

const QUIVERAI_API_BASE_URL = 'https://api.quiver.ai/v1';

/**
 * QuiverAI chat provider extends OpenAI chat completion provider.
 * QuiverAI's chat API is OpenAI-compatible and excels at SVG generation.
 */
export class QuiverAiChatProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, providerOptions: ProviderOptions = {}) {
    const config = providerOptions.config || {};
    super(modelName, {
      ...providerOptions,
      config: {
        ...config,
        apiBaseUrl: config.apiBaseUrl || QUIVERAI_API_BASE_URL,
        apiKeyEnvar: 'QUIVERAI_API_KEY',
      },
    });
  }

  id(): string {
    return `quiverai:${this.modelName}`;
  }

  toString(): string {
    return `[QuiverAI Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    return QUIVERAI_API_BASE_URL;
  }
}

export function createQuiverAiProvider(
  providerPath: string,
  providerOptions: ProviderOptions = {},
  env?: EnvOverrides,
): ApiProvider {
  const splits = providerPath.split(':');
  const modelType = splits[1];
  const effectiveEnv = env || providerOptions.env;

  // For 'chat' or direct model name, create chat provider
  const modelName =
    (modelType === 'chat' ? splits.slice(2) : splits.slice(1)).join(':') || 'arrow-0.5';
  return new QuiverAiChatProvider(modelName, { ...providerOptions, env: effectiveEnv });
}
