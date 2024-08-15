import Groq from 'groq-sdk';
import { getCache, isCacheEnabled } from '../cache';
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
  frequency_penalty?: number;
  logit_bias?: Record<string, number> | null;
  logprobs?: boolean;
  max_tokens?: number;
  n?: number;
  presence_penalty?: number;
  response_format?: { type: 'json_object' } | null;
  seed?: number;
  stop?: string | string[] | null;
  stream?: boolean;
  stream_options?: Record<string, any> | null;
  temperature?: number;
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
    };
  }> | null;
  top_logprobs?: number;
  top_p?: number;
  user?: string;
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
    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const params = {
      frequency_penalty: this.config.frequency_penalty,
      logit_bias: this.config.logit_bias,
      logprobs: this.config.logprobs,
      max_tokens: this.config.max_tokens,
      messages,
      model: this.config.model || this.modelName,
      n: this.config.n,
      presence_penalty: this.config.presence_penalty,
      response_format: this.config.response_format,
      seed: this.config.seed,
      stop: this.config.stop,
      stream_options: this.config.stream_options,
      stream: this.config.stream,
      temperature: this.config.temperature,
      tool_choice: this.config.tool_choice,
      tools: this.config.tools,
      top_logprobs: this.config.top_logprobs,
      top_p: this.config.top_p,
      user: this.config.user,
    } as Record<string, any>;
    Object.keys(params).forEach((key) => params[key] === undefined && delete params[key]);

    logger.debug(`Calling Groq API: ${JSON.stringify(params)}`);

    const cache = await getCache();
    const cacheKey = `groq:${this.modelName}:${JSON.stringify(params)}`;

    if (isCacheEnabled()) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        const parsedResponse = JSON.parse(cachedResponse as string) as ProviderResponse;
        if (parsedResponse.tokenUsage) {
          parsedResponse.tokenUsage.cached = parsedResponse.tokenUsage.total;
        }
        return parsedResponse;
      }
    }

    try {
      const chatCompletion = await this.groq.chat.completions.create(params as any);

      logger.debug(`\tGroq API response: ${JSON.stringify(chatCompletion)}`);

      const response: ProviderResponse = {
        output: chatCompletion.choices[0].message.content || '',
        tokenUsage: {
          total: chatCompletion.usage?.total_tokens,
          prompt: chatCompletion.usage?.prompt_tokens,
          completion: chatCompletion.usage?.completion_tokens,
        },
      };

      if (isCacheEnabled()) {
        try {
          await cache.set(cacheKey, JSON.stringify(response));
        } catch (err) {
          logger.error(`Failed to cache response: ${String(err)}`);
        }
      }

      return response;
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        return {
          error: `API call error: ${(err as any).status} ${err.name}: ${err.message}`,
        };
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}
