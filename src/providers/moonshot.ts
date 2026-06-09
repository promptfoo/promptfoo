import { OpenAiChatCompletionProvider } from './openai/chat';

import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

type MoonshotConfig = OpenAiCompletionOptions;

type MoonshotProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: {
    config?: MoonshotConfig;
  };
};

// Moonshot AI (Kimi) exposes an OpenAI-compatible API, so the standard chat
// provider handles requests once the base URL and key envar are pointed at it.
// https://platform.moonshot.ai/docs/api/chat
class MoonshotProvider extends OpenAiChatCompletionProvider {
  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  constructor(modelName: string, providerOptions: MoonshotProviderOptions) {
    const moonshotConfig = providerOptions.config?.config;

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        ...moonshotConfig,
        apiKeyEnvar: 'MOONSHOT_API_KEY',
        apiBaseUrl: 'https://api.moonshot.ai/v1',
      },
    });
  }

  id(): string {
    return `moonshot:${this.modelName}`;
  }

  toString(): string {
    return `[Moonshot Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'moonshot',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.apiKey && { apiKey: undefined }),
      },
    };
  }
}

export function createMoonshotProvider(
  providerPath: string,
  options: MoonshotProviderOptions = {},
): ApiProvider {
  // Accept `moonshot:<model>` and `moonshot:chat:<model>`; everything after the
  // optional `chat:` segment is the model id (which can itself contain colons).
  const splits = providerPath.split(':');
  const rest = splits.slice(1);
  if (rest[0] === 'chat') {
    rest.shift();
  }
  const modelName = rest.join(':');
  return new MoonshotProvider(modelName, options);
}
