import { OpenAiChatCompletionProvider } from '../openai/chat';
import { groqSupportsTemperature, isGroqReasoningModel } from './util';

import type { CallApiContextParams, CallApiOptionsParams } from '../../types/index';
import type { GroqCompletionOptions, GroqProviderOptions } from './types';

const GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Groq Chat Completions API Provider
 *
 * Extends OpenAI Chat Completions provider with Groq-specific configuration.
 * Supports reasoning models (DeepSeek R1, GPT-OSS, Qwen) with temperature control.
 *
 * Usage:
 *   groq:llama-3.3-70b-versatile
 *   groq:openai/gpt-oss-120b
 *   groq:qwen/qwen3-32b
 */
export class GroqProvider extends OpenAiChatCompletionProvider {
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

  constructor(modelName: string, providerOptions: GroqProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'GROQ_API_KEY',
        apiBaseUrl: GROQ_API_BASE_URL,
      },
    });
  }

  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const { body, config } = await super.getOpenAiBody(prompt, context, callApiOptions);
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
