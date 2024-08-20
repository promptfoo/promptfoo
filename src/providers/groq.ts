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
  max_tokens?: number;
  top_p?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
    };
  }>;
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}

export class GroqProvider implements ApiProvider {
  private groq: Groq;
  private modelName: string;
  public config: GroqCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: GroqCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, env } = options;
    this.modelName = modelName;
    this.config = config || {};
    const apiKey = this.config.apiKey || env?.GROQ_API_KEY || process.env.GROQ_API_KEY;
    this.groq = new Groq({
      apiKey,
      maxRetries: 2,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  id = () => `groq:${this.modelName}`;

  public getModelName(): string {
    return this.modelName;
  }

  toString(): string {
    return `[Groq Provider ${this.modelName}]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> =
      parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const params = {
      messages,
      model: this.config.model || this.modelName,
      temperature: this.config.temperature,
      max_tokens: this.config.max_tokens,
      top_p: this.config.top_p,
      tools: this.config.tools,
      tool_choice: this.config.tool_choice,
    };

    try {
      const chatCompletion = await this.groq.chat.completions.create(params);

      if (!chatCompletion || !chatCompletion.choices || chatCompletion.choices.length === 0) {
        throw new Error('Invalid response from Groq API');
      }

      const outputBlocks = [];
      if (chatCompletion.choices[0].message.content) {
        outputBlocks.push(chatCompletion.choices[0].message.content);
      }

      if (chatCompletion.choices[0].message.tool_calls) {
        for (const toolCall of chatCompletion.choices[0].message.tool_calls) {
          if (toolCall.function) {
            outputBlocks.push(
              `[Function Call: ${toolCall.function.name}]`,
              `Arguments: ${toolCall.function.arguments}`,
            );
          }
        }
      }

      const response: ProviderResponse = {
        output: outputBlocks.join('\n\n'),
        tokenUsage: {
          total: chatCompletion.usage?.total_tokens,
          prompt: chatCompletion.usage?.prompt_tokens,
          completion: chatCompletion.usage?.completion_tokens,
        },
      };

      return response;
    } catch (err: any) {
      logger.error(`Groq API call error: ${err}`);
      const errorMessage = err.status ? `${err.status} ${err.name}: ${err.message}` : `${err}`;
      return { error: `API call error: ${errorMessage}` };
    }
  }
}
