import { OpenAiChatCompletionProvider } from './openai';
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams } from '../types';
import type { EnvOverrides } from '../types/env';
import type { OpenAiCompletionOptions } from './openai';

export interface GroqCompletionOptions extends OpenAiCompletionOptions {
  systemPrompt?: string;
  parallel_tool_calls?: boolean | null;
  reasoning_format?: string | null;
  service_tier?: string | null;
  stream?: boolean | null;
  stream_options?: object | null;
  user?: string | null;
}

export class GroqProvider extends OpenAiChatCompletionProvider implements ApiProvider {
  public config: GroqCompletionOptions;
  apiKey?: string;

  constructor(modelName: string, options: { config?: GroqCompletionOptions; id?: string; env?: EnvOverrides } = {}) {
    const config = options.config || {};
    const apiKey = config.apiKey || (options.env && options.env.GROQ_API_KEY) || process.env.GROQ_API_KEY;
    if (apiKey) {
      config.apiKey = apiKey;
    }
    // Pass the configuration to the OpenAiChatCompletionProvider
    super(modelName, { config, id: options.id, env: options.env });
    this.config = config;
    this.apiKey = apiKey;
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
        ...(this.apiKey && { apiKey: undefined })
      }
    };
  }
}
