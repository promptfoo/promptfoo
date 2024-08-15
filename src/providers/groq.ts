import Groq from 'groq-sdk';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
  ProviderResponse,
} from '../types';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

interface GroqCompletionOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class GroqProvider implements ApiProvider {
  modelName: string;
  apiKey?: string;
  groq: Groq;
  config: GroqCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: GroqCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.modelName = modelName;
    this.apiKey = config?.apiKey || env?.GROQ_API_KEY || process.env.GROQ_API_KEY;
    this.config = config || {};
    this.id = id ? () => id : this.id;
    this.groq = new Groq({
      apiKey: this.apiKey,
      maxRetries: 2,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  id(): string {
    return `groq:${this.modelName}`;
  }

  toString(): string {
    return `[Groq Provider ${this.modelName}]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const messages: Groq.Chat.ChatCompletionMessageParam[] = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const params = {
      messages,
      model: this.config.model || this.modelName,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    logger.debug(`Calling Groq API: ${JSON.stringify(params)}`);

    try {
      const chatCompletion = await this.groq.chat.completions.create(params);

      logger.debug(`\tGroq API response: ${JSON.stringify(chatCompletion)}`);

      return {
        output: chatCompletion.choices[0].message.content || '',
        tokenUsage: {
          total: chatCompletion.usage?.total_tokens,
          prompt: chatCompletion.usage?.prompt_tokens,
          completion: chatCompletion.usage?.completion_tokens,
        },
      };
    } catch (err) {
      if (err instanceof Groq.APIError) {
        return {
          error: `API call error: ${err.status} ${err.name}: ${err.message}`,
        };
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}