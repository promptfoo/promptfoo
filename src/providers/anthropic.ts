import Anthropic, { APIError } from '@anthropic-ai/sdk';
import logger from '../logger';

import type { ApiProvider, EnvOverrides, ProviderResponse, TokenUsage } from '../types.js';

import { getCache, isCacheEnabled } from '../cache';
import { parseChatPrompt } from './shared';

interface AnthropicMessageOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  model?: string;
  cost?: number;
  tools?: Anthropic.Tool[];
  tool_choice?:
    | Anthropic.MessageCreateParams.ToolChoiceAny
    | Anthropic.MessageCreateParams.ToolChoiceAuto
    | Anthropic.MessageCreateParams.ToolChoiceTool;
}

function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    const total_tokens = data.usage.input_tokens + data.usage.output_tokens;
    if (cached) {
      return { cached: total_tokens, total: total_tokens };
    } else {
      return {
        total: total_tokens,
        prompt: data.usage.input_tokens || 0,
        completion: data.usage.output_tokens || 0,
      };
    }
  }
  return {};
}

export function outputFromMessage(message: Anthropic.Messages.Message) {
  const hasToolUse = message.content.some((block) => block.type === 'tool_use');
  if (hasToolUse) {
    return message.content
      .map((block) => {
        if (block.type === 'text') {
          return block.text;
        }
        return JSON.stringify(block);
      })
      .join('\n\n');
  }
  return message.content
    .map((block) => {
      return (block as Anthropic.Messages.TextBlock).text;
    })
    .join('\n\n');
}

export function calculateCost(
  modelName: string,
  config: AnthropicMessageOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = [...AnthropicMessagesProvider.ANTHROPIC_MODELS].find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  return inputCost * promptTokens + outputCost * completionTokens || undefined;
}

interface AnthropicMessageInput {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam>;
}

export function parseMessages(messages: string) {
  // We need to be able to handle the 'system' role prompts that
  // are in the style of OpenAI's chat prompts.
  // As a result, AnthropicMessageInput is the same as Anthropic.MessageParam
  // just with the system role added on
  const chats = parseChatPrompt<AnthropicMessageInput[]>(messages, [
    { role: 'user' as const, content: messages },
  ]);
  // Convert from OpenAI to Anthropic format
  const systemMessage = chats.find((m) => m.role === 'system')?.content;
  const system = typeof systemMessage === 'string' ? systemMessage : undefined;
  const extractedMessages: Anthropic.MessageParam[] = chats
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const role = m.role as 'user' | 'assistant';
      if (typeof m.content === 'string') {
        const content = [{ type: 'text' as const, text: m.content }];
        return { role, content };
      } else {
        const content = [...m.content];
        return { role, content };
      }
    });
  return { system, extractedMessages };
}

export class AnthropicMessagesProvider implements ApiProvider {
  modelName: string;
  config: AnthropicMessageOptions;
  env?: EnvOverrides;
  apiKey?: string;
  anthropic: Anthropic;

  static ANTHROPIC_MODELS = [
    ...['claude-instant-1.2'].map((model) => ({
      id: model,
      cost: {
        input: 0.0008 / 1000,
        output: 0.0024 / 1000,
      },
    })),
    ...['claude-2.0'].map((model) => ({
      id: model,
      cost: {
        input: 0.008 / 1000,
        output: 0.024 / 1000,
      },
    })),
    ...['claude-2.1'].map((model) => ({
      id: model,
      cost: {
        input: 0.008 / 1000,
        output: 0.024 / 1000,
      },
    })),
    ...['claude-3-haiku-20240307'].map((model) => ({
      id: model,
      cost: {
        input: 0.00025 / 1000,
        output: 0.00125 / 1000,
      },
    })),
    ...['claude-3-sonnet-20240229'].map((model) => ({
      id: model,
      cost: {
        input: 0.003 / 1000,
        output: 0.015 / 1000,
      },
    })),
    ...['claude-3-opus-20240229'].map((model) => ({
      id: model,
      cost: {
        input: 0.015 / 1000,
        output: 0.075 / 1000,
      },
    })),
    ...['claude-3-5-sonnet-20240620'].map((model) => ({
      id: model,
      cost: {
        input: 3 / 1e6,
        output: 15 / 1e6,
      },
    })),
  ];

  static ANTHROPIC_MODELS_NAMES = AnthropicMessagesProvider.ANTHROPIC_MODELS.map(
    (model) => model.id,
  );

  constructor(
    modelName: string,
    options: { id?: string; config?: AnthropicMessageOptions; env?: EnvOverrides } = {},
  ) {
    if (!AnthropicMessagesProvider.ANTHROPIC_MODELS_NAMES.includes(modelName)) {
      logger.warn(`Using unknown Anthropic model: ${modelName}`);
    }
    const { id, config, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
    this.apiKey = config?.apiKey || env?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.anthropic = new Anthropic({ apiKey: this.apiKey, baseURL: this.config.apiBaseUrl });
  }

  id(): string {
    return `anthropic:messages:${this.modelName || 'claude-2.1'}`;
  }

  toString(): string {
    return `[Anthropic Messages Provider ${this.modelName || 'claude-2.1'}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const { system, extractedMessages } = parseMessages(prompt);
    const params: Anthropic.MessageCreateParams = {
      model: this.modelName,
      ...(system ? { system } : {}),
      max_tokens: this.config?.max_tokens || 1024,
      messages: extractedMessages,
      stream: false,
      temperature: this.config.temperature || 0,
      ...(this.config.tools ? { tools: this.config.tools } : {}),
      ...(this.config.tool_choice ? { tool_choice: this.config.tool_choice } : {}),
    };

    logger.debug(`Calling Anthropic Messages API: ${JSON.stringify(params)}`);

    const cache = await getCache();
    const cacheKey = `anthropic:${JSON.stringify(params)}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get<string | undefined>(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        try {
          const parsedCachedResponse = JSON.parse(cachedResponse) as Anthropic.Messages.Message;
          return {
            output: outputFromMessage(parsedCachedResponse),
            tokenUsage: {},
          };
        } catch (err) {
          // Could be an old cache item, which was just the text content from TextBlock.
          return {
            output: cachedResponse,
            tokenUsage: {},
          };
        }
      }
    }

    try {
      const response = await this.anthropic.messages.create(params);

      logger.debug(`Anthropic Messages API response: ${JSON.stringify(response)}`);

      if (isCacheEnabled()) {
        try {
          await cache.set(cacheKey, JSON.stringify(response));
        } catch (err) {
          logger.error(`Failed to cache response: ${String(err)}`);
        }
      }

      return {
        output: outputFromMessage(response),
        tokenUsage: getTokenUsage(response, false),
        cost: calculateCost(
          this.modelName,
          this.config,
          response.usage?.input_tokens,
          response.usage?.output_tokens,
        ),
      };
    } catch (err) {
      logger.error(`Anthropic Messages API call error: ${String(err)}`);
      if (err instanceof APIError && err.error) {
        const errorDetails = err.error as { error: { message: string; type: string } };
        return {
          error: `API call error: ${errorDetails.error.message}, status ${err.status}, type ${errorDetails.error.type}`,
        };
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}

interface AnthropicCompletionOptions {
  apiKey?: string;
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

export class AnthropicCompletionProvider implements ApiProvider {
  static ANTHROPIC_COMPLETION_MODELS = [
    'claude-1',
    'claude-1-100k',
    'claude-instant-1',
    'claude-instant-1.2',
    'claude-instant-1-100k',
    'claude-2',
    'claude-2.1',
  ];

  modelName: string;
  apiKey?: string;
  anthropic: Anthropic;
  config: AnthropicCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: AnthropicCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.modelName = modelName;
    this.apiKey = config?.apiKey || env?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.anthropic = new Anthropic({ apiKey: this.apiKey });
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `anthropic:${this.modelName}`;
  }

  toString(): string {
    return `[Anthropic Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key is not set. Set the ANTHROPIC_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    let stop: string[];
    try {
      stop = process.env.ANTHROPIC_STOP
        ? JSON.parse(process.env.ANTHROPIC_STOP)
        : ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`ANTHROPIC_STOP is not a valid JSON string: ${err}`);
    }

    const params: Anthropic.CompletionCreateParams = {
      model: this.modelName,
      prompt: `${Anthropic.HUMAN_PROMPT} ${prompt} ${Anthropic.AI_PROMPT}`,
      max_tokens_to_sample:
        this.config?.max_tokens_to_sample || parseInt(process.env.ANTHROPIC_MAX_TOKENS || '1024'),
      temperature: this.config.temperature ?? parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0'),
      stop_sequences: stop,
    };

    logger.debug(`Calling Anthropic API: ${JSON.stringify(params)}`);

    const cache = await getCache();
    const cacheKey = `anthropic:${JSON.stringify(params)}`;

    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
        return {
          output: JSON.parse(cachedResponse as string),
          tokenUsage: {},
        };
      }
    }

    let response;
    try {
      response = await this.anthropic.completions.create(params);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tAnthropic API response: ${JSON.stringify(response)}`);
    if (isCacheEnabled()) {
      try {
        await cache.set(cacheKey, JSON.stringify(response.completion));
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }
    try {
      return {
        output: response.completion,
        tokenUsage: {}, // TODO: add token usage once Anthropic API supports it
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(response)}`,
      };
    }
  }
}

export const DefaultGradingProvider = new AnthropicMessagesProvider('claude-3-opus-20240229');
export const DefaultGradingJsonProvider = new AnthropicMessagesProvider('claude-3-opus-20240229');
export const DefaultSuggestionsProvider = new AnthropicMessagesProvider('claude-3-opus-20240229');
