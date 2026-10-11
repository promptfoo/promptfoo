import { OpenAiChatCompletionProvider } from './openai/chat';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';

export class LlamaApiProvider extends OpenAiChatCompletionProvider {
  constructor(modelName: string, options: ProviderOptions = {}) {
    super(modelName, {
      ...options,
      config: {
        ...options.config,
        apiBaseUrl: 'https://api.llama.com/compat/v1',
        apiKeyEnvar: 'LLAMA_API_KEY',
        passthrough: {
          ...options.config?.passthrough,
        },
      },
    });
  }

  id(): string {
    return `llamaapi:${this.modelName}`;
  }

  toString(): string {
    return `[Llama API Provider ${this.modelName}]`;
  }

  toJSON() {
    const { apiKey: _redacted, ...restConfig } = this.config ?? {};
    return {
      provider: 'llamaapi',
      model: this.modelName,
      config: restConfig,
    };
  }
}

/**
 * Creates a Llama API provider using OpenAI-compatible endpoints
 */
export function createLlamaApiProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(splits[1] === 'chat' ? 2 : 1).join(':');

  return new LlamaApiProvider(modelName, {
    ...options.config,
    id: options.id,
    env: options.env,
  });
}
