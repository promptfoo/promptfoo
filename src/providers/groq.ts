import { OpenAiChatCompletionProvider } from './openai/chat';

import type { ProviderOptions } from '../types/providers';
import type { OpenAiCompletionOptions } from './openai/types';

type GroqCompletionOptions = OpenAiCompletionOptions & {
  systemPrompt?: string;
  parallel_tool_calls?: boolean | null;
  reasoning_format?: 'parsed' | 'raw' | 'hidden' | null;
  include_reasoning?: boolean;
  compound_custom?: {
    tools?: {
      enabled_tools?: string[];
      wolfram_settings?: {
        authorization?: string;
      };
    };
  };
  search_settings?: {
    exclude_domains?: string[];
    include_domains?: string[];
    country?: string;
  };
};

type GroqProviderOptions = ProviderOptions & {
  config?: GroqCompletionOptions;
};

export class GroqProvider extends OpenAiChatCompletionProvider {
  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  protected isReasoningModel(): boolean {
    // Groq's reasoning models include deepseek-r1 and gpt-oss models
    return (
      this.modelName.includes('deepseek-r1') ||
      this.modelName.includes('gpt-oss') ||
      super.isReasoningModel()
    );
  }

  protected supportsTemperature(): boolean {
    // Groq's deepseek and gpt-oss models support temperature, even though they're reasoning models
    if (this.modelName.includes('deepseek-r1') || this.modelName.includes('gpt-oss')) {
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

  override getOpenAiBody(
    prompt: string,
    context?: import('../types').CallApiContextParams,
    callApiOptions?: import('../types').CallApiOptionsParams,
  ) {
    const { body, config } = super.getOpenAiBody(prompt, context, callApiOptions);
    const groqConfig = this.config as GroqCompletionOptions;

    // Add Groq-specific reasoning parameters
    if (groqConfig.reasoning_format !== undefined) {
      body.reasoning_format = groqConfig.reasoning_format;
    }
    if (groqConfig.include_reasoning !== undefined) {
      body.include_reasoning = groqConfig.include_reasoning;
    }

    // Add Compound model parameters
    if (groqConfig.compound_custom) {
      body.compound_custom = groqConfig.compound_custom;
    }
    if (groqConfig.search_settings) {
      body.search_settings = groqConfig.search_settings;
    }

    return { body, config };
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
