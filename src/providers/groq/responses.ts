import { OpenAiResponsesProvider } from '../openai/responses';
import {
  assertGroqResponsesServiceTier,
  groqSupportsTemperature,
  isGroqReasoningModel,
} from './util';

import type { OpenAiCompletionOptions } from '../openai/types';
import type { GroqResponsesProviderOptions } from './types';

const GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Groq Responses API Provider
 *
 * Extends OpenAI Responses API provider with Groq-specific configuration.
 * Supports reasoning models (GPT-OSS, Qwen) with temperature control.
 *
 * Note: Unlike the Chat Completions API, the Responses API does NOT support
 * `reasoning_format` or `include_reasoning` parameters. Reasoning is controlled
 * via the `reasoning.effort` parameter inherited from OpenAiCompletionOptions.
 *
 * Usage:
 *   groq:responses:openai/gpt-oss-120b
 *   groq:responses:openai/gpt-oss-20b
 *   groq:responses:qwen/qwen3.6-27b
 */
export class GroqResponsesProvider extends OpenAiResponsesProvider {
  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  protected isReasoningModel(): boolean {
    return isGroqReasoningModel(this.modelName) || super.isReasoningModel();
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

  constructor(modelName: string, providerOptions: GroqResponsesProviderOptions) {
    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        apiKeyEnvar: 'GROQ_API_KEY',
        apiBaseUrl: GROQ_API_BASE_URL,
      } as unknown as OpenAiCompletionOptions,
    });
  }

  override async getOpenAiBody(...args: Parameters<OpenAiResponsesProvider['getOpenAiBody']>) {
    const result = await super.getOpenAiBody(...args);
    assertGroqResponsesServiceTier(result.body.service_tier);
    return result;
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
