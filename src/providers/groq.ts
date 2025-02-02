import type { ProviderOptions } from '../types/providers';
import { OpenAiChatCompletionProvider, type OpenAiCompletionOptions } from './openai';

type GroqCompletionOptions = OpenAiCompletionOptions & {
  systemPrompt?: string;
  parallel_tool_calls?: boolean | null;
  reasoning_format?: string | null;
};

type GroqProviderOptions = ProviderOptions & {
  config?: GroqCompletionOptions;
};

export class GroqProvider extends OpenAiChatCompletionProvider {
  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  protected isReasoningModel(): boolean {
    // Groq's reasoning models include deepseek-r1 models and any others they may add
    return this.modelName.includes('deepseek-r1') || super.isReasoningModel();
  }

  protected supportsTemperature(): boolean {
    // Groq's deepseek models support temperature, even though they're reasoning models
    if (this.modelName.includes('deepseek-r1')) {
      return true;
    }
    return super.supportsTemperature();
  }

  constructor(modelName: string, providerOptions: GroqProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'GROQ_API_KEY',
        apiBaseUrl: 'https://api.groq.com/openai/v1',
      },
    });
  }

  id(): string {
    return `groq:${this.modelName}`;
  }

  toString(): string {
    return `[Groq Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'groq',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.apiKey && { apiKey: undefined }),
      },
    };
  }
}
