import Groq from 'groq-sdk';
import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types';
import type { EnvOverrides } from '../types/env';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../util';
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
  systemPrompt?: string;
}

export class GroqProvider implements ApiProvider {
  private groq: Groq;
  private modelName: string;
  public config: GroqCompletionOptions;
  apiKey?: string;

  constructor(
    modelName: string,
    options: { config?: GroqCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, env } = options;
    this.modelName = modelName;
    this.config = config || {};
    this.apiKey = this.config.apiKey || env?.GROQ_API_KEY || process.env.GROQ_API_KEY;
    this.groq = new Groq({
      apiKey: this.apiKey,
      maxRetries: 2,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  id = () => `groq:${this.modelName}`;

  public getModelName(): string {
    return this.modelName;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
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
        content: this.config.systemPrompt || 'You are a helpful assistant.',
      },
      ...parseChatPrompt(prompt, [{ role: 'user' as const, content: prompt }]),
    ];

    const params = {
      messages,
      model: this.config.model || this.modelName,
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.max_tokens ?? 1000,
      top_p: this.config.top_p ?? 1,
      tools: this.config.tools ? maybeLoadFromExternalFile(this.config.tools) : undefined,
      tool_choice: this.config.tool_choice ?? 'auto',
    };

    if (context?.vars && this.config.tools) {
      params.tools = maybeLoadFromExternalFile(renderVarsInObject(this.config.tools, context.vars));
    }

    const cacheKey = `groq:${JSON.stringify(params)}`;
    if (isCacheEnabled()) {
      const cachedResult = await getCache().get<ProviderResponse>(cacheKey);
      if (cachedResult) {
        logger.debug(`Returning cached response for ${prompt}: ${JSON.stringify(cachedResult)}`);
        return {
          ...cachedResult,
          tokenUsage: {
            ...cachedResult.tokenUsage,
            cached: cachedResult.tokenUsage?.total,
          },
        };
      }
    }

    try {
      const chatCompletion = await this.groq.chat.completions.create(params);

      if (!chatCompletion?.choices?.[0]) {
        throw new Error('Invalid response from Groq API');
      }

      const { message } = chatCompletion.choices[0];
      let output = message.content || '';

      if (message.tool_calls?.length) {
        const toolCalls = message.tool_calls.map((toolCall) => ({
          id: toolCall.id,
          type: toolCall.type,
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          },
        }));
        output = JSON.stringify(toolCalls);

        // Handle function tool callbacks
        if (this.config.functionToolCallbacks) {
          for (const toolCall of message.tool_calls) {
            if (toolCall.function && this.config.functionToolCallbacks[toolCall.function.name]) {
              const functionResult = await this.config.functionToolCallbacks[
                toolCall.function.name
              ](toolCall.function.arguments);
              output += `\n\n[Function Result: ${functionResult}]`;
            }
          }
        }
      }

      const result: ProviderResponse = {
        output,
        tokenUsage: {
          total: chatCompletion.usage?.total_tokens,
          prompt: chatCompletion.usage?.prompt_tokens,
          completion: chatCompletion.usage?.completion_tokens,
        },
      };

      if (isCacheEnabled()) {
        try {
          await getCache().set(cacheKey, result);
        } catch (err) {
          logger.error(`Failed to cache response: ${String(err)}`);
        }
      }

      return result;
    } catch (err: any) {
      logger.error(`Groq API call error: ${err}`);
      const errorMessage = err.status ? `${err.status} ${err.name}: ${err.message}` : `${err}`;
      return { error: `API call error: ${errorMessage}` };
    }
  }
}
