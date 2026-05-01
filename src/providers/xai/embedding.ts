import { getEnvString } from '../../envars';
import invariant from '../../util/invariant';
import { OpenAiEmbeddingProvider } from '../openai/embedding';

import type { ProviderOptions } from '../../types/providers';
import type { OpenAiSharedOptions } from '../openai/types';

export type XAIEmbeddingOptions = OpenAiSharedOptions & {
  region?: string;
};

export class XAIEmbeddingProvider extends OpenAiEmbeddingProvider {
  config: XAIEmbeddingOptions;

  constructor(modelName: string, options: ProviderOptions = {}) {
    const config = (options.config || {}) as XAIEmbeddingOptions;
    const mergedConfig: XAIEmbeddingOptions = {
      ...config,
      apiKeyEnvar: 'XAI_API_KEY',
      apiBaseUrl:
        config.apiBaseUrl || (config.region ? `https://${config.region}.api.x.ai/v1` : undefined),
    };

    super(modelName, {
      ...options,
      config: mergedConfig,
    });

    this.config = mergedConfig;
  }

  id(): string {
    return `xai:embedding:${this.modelName}`;
  }

  toString(): string {
    return `[xAI Embedding Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    if (this.config.region) {
      return `https://${this.config.region}.api.x.ai/v1`;
    }
    return 'https://api.x.ai/v1';
  }

  getApiUrl(): string {
    if (this.config.apiHost) {
      return `https://${this.config.apiHost}/v1`;
    }

    return (
      this.config.apiBaseUrl ||
      this.env?.XAI_API_BASE_URL ||
      getEnvString('XAI_API_BASE_URL') ||
      this.getApiUrlDefault()
    );
  }
}

export function createXAIEmbeddingProvider(
  providerPath: string,
  options: ProviderOptions = {},
): XAIEmbeddingProvider {
  const parts = providerPath.split(':');
  const modelName = parts.slice(2).join(':');
  invariant(modelName, 'Model name is required');
  return new XAIEmbeddingProvider(modelName, options);
}
