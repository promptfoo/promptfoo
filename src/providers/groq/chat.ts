import { getEnvString } from '../../envars';
import { OpenAiChatCompletionProvider } from '../openai/chat';
import { serializeProvider } from '../serialization';
import {
  assertGroqChatServiceTier,
  getGroqProviderOptions,
  groqSupportsTemperature,
  isGroqReasoningModel,
} from './util';

import type { CallApiContextParams, CallApiOptionsParams } from '../../types/index';
import type { GroqCompletionOptions, GroqProviderOptions } from './types';

/**
 * Groq Chat Completions API Provider
 *
 * Extends OpenAI Chat Completions provider with Groq-specific configuration.
 * Supports reasoning models (GPT-OSS, Qwen) with temperature control.
 *
 * Usage:
 *   groq:openai/gpt-oss-120b
 *   groq:openai/gpt-oss-20b
 *   groq:qwen/qwen3.6-27b
 */
export class GroqProvider extends OpenAiChatCompletionProvider {
  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  override getApiKey(): string | undefined {
    const apiKeyEnvar = this.config.apiKeyEnvar || 'GROQ_API_KEY';
    return this.config.apiKey || getEnvString(apiKeyEnvar) || this.env?.[apiKeyEnvar];
  }

  protected isReasoningModel(modelName = this.modelName): boolean {
    return isGroqReasoningModel(modelName) || super.isReasoningModel(modelName);
  }

  protected override isReasoningCapabilityModel(modelName: string): boolean {
    return isGroqReasoningModel(modelName) || super.isReasoningCapabilityModel(modelName);
  }

  protected supportsTemperature(): boolean {
    // Groq's reasoning models support temperature, unlike OpenAI's o1 models
    if (groqSupportsTemperature(this.modelName)) {
      return true;
    }
    return super.supportsTemperature();
  }

  protected override supportsTemperatureForCapabilityModel(modelName: string): boolean {
    return groqSupportsTemperature(modelName)
      ? true
      : super.supportsTemperatureForCapabilityModel(modelName);
  }

  constructor(modelName: string, providerOptions: GroqProviderOptions) {
    super(modelName, getGroqProviderOptions(providerOptions));
  }

  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    const { body, config } = await super.getOpenAiBody(prompt, context, callApiOptions);
    if (typeof body.model === 'string' && this.isReasoningModel(body.model)) {
      const maxCompletionTokens =
        config.passthrough?.max_completion_tokens ??
        config.max_completion_tokens ??
        config.passthrough?.max_tokens ??
        config.max_tokens ??
        body.max_tokens;
      if (maxCompletionTokens !== undefined) {
        body.max_completion_tokens = maxCompletionTokens;
      }
      delete body.max_tokens;
    }
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

    assertGroqChatServiceTier(body.service_tier);

    return { body, config };
  }

  id(): string {
    return `groq:${this.modelName}`;
  }

  toString(): string {
    return `[Groq Provider ${this.modelName}]`;
  }

  toJSON() {
    return serializeProvider(this, 'groq', () => this.apiKey);
  }
}
