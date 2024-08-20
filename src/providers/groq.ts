import Groq from 'groq-sdk';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
  ProviderResponse,
} from '../types';
import { maybeLoadFromExternalFile } from '../util';
import { renderVarsInObject } from '../util';
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
  functionToolCallbacks?: Record<string, (arg: string) => Promise<string>>;
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
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content:
          'You are a helpful assistant that provides weather information. Always use the get_weather function to retrieve weather data.',
      },
      ...parseChatPrompt(prompt, [{ role: 'user' as const, content: prompt }]),
    ];

    const params = {
      messages,
      model: this.config.model || this.modelName,
      temperature: this.config.temperature || 0.7,
      max_tokens: this.config.max_tokens || 1000,
      top_p: this.config.top_p || 1,
      tools: maybeLoadFromExternalFile(renderVarsInObject(this.config.tools, context?.vars)),
      tool_choice: this.config.tool_choice || 'auto',
    };

    try {
      const chatCompletion = await this.groq.chat.completions.create(params as any);

      if (!chatCompletion || !chatCompletion.choices || chatCompletion.choices.length === 0) {
        throw new Error('Invalid response from Groq API');
      }

      const choice = chatCompletion.choices[0];
      let output = '';

      if (choice.message.content) {
        output = choice.message.content;
      }

      if (choice.message.tool_calls) {
        const toolCalls = choice.message.tool_calls.map((toolCall) => ({
          id: toolCall.id,
          type: toolCall.type,
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        }));
        output = JSON.stringify(toolCalls);
      }

      // Handle function tool callbacks
      if (this.config.functionToolCallbacks && choice.message.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          if (toolCall.function && this.config.functionToolCallbacks[toolCall.function.name]) {
            const functionResult = await this.config.functionToolCallbacks[toolCall.function.name](
              toolCall.function.arguments,
            );
            output += `\n\n[Function Result: ${functionResult}]`;
          }
        }
      }

      const response: ProviderResponse = {
        output,
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
