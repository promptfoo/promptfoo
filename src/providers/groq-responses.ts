import { OpenAiResponsesProvider } from './openai/responses';

import type { ProviderOptions } from '../types/providers';
import type { OpenAiCompletionOptions } from './openai/types';

/**
 * Groq Responses API options.
 *
 * Note: Unlike the Chat Completions API, the Responses API does NOT support
 * `reasoning_format` or `include_reasoning` parameters. Reasoning is controlled
 * via the `reasoning.effort` parameter inherited from OpenAiCompletionOptions.
 */
type GroqResponsesOptions = OpenAiCompletionOptions & {
  systemPrompt?: string;
  parallel_tool_calls?: boolean | null;
};

type GroqResponsesProviderOptions = ProviderOptions & {
  config?: GroqResponsesOptions;
};

/**
 * Groq Responses API Provider
 *
 * Extends OpenAI Responses API provider with Groq-specific configuration.
 * Supports reasoning models (DeepSeek R1, GPT-OSS, Qwen) with temperature control.
 *
 * Usage:
 *   groq-responses:llama-3.3-70b-versatile
 *   groq-responses:openai/gpt-oss-120b
 *   groq-responses:qwen/qwen3-32b
 */
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
