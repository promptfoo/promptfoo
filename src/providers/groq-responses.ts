import { OpenAiResponsesProvider } from './openai/responses';

import type { ProviderOptions } from '../types/providers';
import type { OpenAiCompletionOptions } from './openai/types';
import type { CallApiContextParams, CallApiOptionsParams } from '../types';

type GroqResponsesOptions = OpenAiCompletionOptions & {
  systemPrompt?: string;
  parallel_tool_calls?: boolean | null;
  reasoning_format?: 'parsed' | 'raw' | 'hidden' | null;
  include_reasoning?: boolean;
};

type GroqResponsesProviderOptions = ProviderOptions & {
  config?: GroqResponsesOptions;
};

export class GroqResponsesProvider extends OpenAiResponsesProvider {
  static GROQ_RESPONSES_MODEL_NAMES = [
    // Production models
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'meta-llama/llama-guard-4-12b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    // Preview models
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'moonshotai/kimi-k2-instruct-0905',
    'openai/gpt-oss-safeguard-20b',
    'qwen/qwen3-32b',
  ];

  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  protected isReasoningModel(): boolean {
    // Groq's reasoning models include deepseek-r1, gpt-oss, and qwen models
    return (
      this.modelName.includes('deepseek-r1') ||
      this.modelName.includes('gpt-oss') ||
      this.modelName.includes('qwen') ||
      super.isReasoningModel()
    );
  }

  protected supportsTemperature(): boolean {
    // Groq's deepseek, gpt-oss, and qwen models support temperature, even though they're reasoning models
    if (
      this.modelName.includes('deepseek-r1') ||
      this.modelName.includes('gpt-oss') ||
      this.modelName.includes('qwen')
    ) {
      return true;
    }
    return super.supportsTemperature();
  }

  constructor(modelName: string, providerOptions: GroqResponsesProviderOptions) {
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
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const { body, config } = super.getOpenAiBody(prompt, context, callApiOptions);

    // Note: Groq Responses API doesn't support include_reasoning or reasoning_format
    // These are only for the Chat Completions API
    // Reasoning is controlled via the reasoning.effort parameter in the Responses API

    return { body, config };
  }

  id(): string {
    return `groq-responses:${this.modelName}`;
  }

  toString(): string {
    return `[Groq Responses Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'groq-responses',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.apiKey && { apiKey: undefined }),
      },
    };
  }
}
