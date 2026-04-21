import { OpenAiResponsesProvider } from '../openai/responses';
import { groqSupportsTemperature, isGroqReasoningModel } from './util';

import type { GroqResponsesProviderOptions } from './types';

const GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Groq Responses API Provider
 *
 * Extends OpenAI Responses API provider with Groq-specific configuration.
 * Supports reasoning models (DeepSeek R1, GPT-OSS, Qwen) with temperature control.
 *
 * Note: Unlike the Chat Completions API, the Responses API does NOT support
 * `reasoning_format` or `include_reasoning` parameters. Reasoning is controlled
 * via the `reasoning.effort` parameter inherited from OpenAiCompletionOptions.
 *
 * Usage:
 *   groq:responses:llama-3.3-70b-versatile
 *   groq:responses:openai/gpt-oss-120b
 *   groq:responses:qwen/qwen3-32b
 */
export class GroqResponsesProvider extends OpenAiResponsesProvider {
  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  protected isReasoningModel(): boolean {
    return isGroqReasoningModel(this.modelName) || super.isReasoningModel();
  }

  protected supportsTemperature(): boolean {
    // Groq's reasoning models support temperature, unlike OpenAI's o1 models
    if (groqSupportsTemperature(this.modelName)) {
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
        apiBaseUrl: GROQ_API_BASE_URL,
      },
    });
  }

  id(): string {
    return `groq:responses:${this.modelName}`;
  }

  toString(): string {
    return `[Groq Responses Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'groq:responses',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.apiKey && { apiKey: undefined }),
      },
    };
  }
}
