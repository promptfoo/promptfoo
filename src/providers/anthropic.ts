import Anthropic, { APIError } from '@anthropic-ai/sdk';
import { getCache, isCacheEnabled } from '../cache';
import { getEnvString, getEnvFloat, getEnvInt } from '../envars';
import logger from '../logger';
import type { ApiProvider, ProviderResponse, TokenUsage } from '../types';
import type { EnvOverrides } from '../types/env';
import { maybeLoadFromExternalFile } from '../util';
import { calculateCost } from './shared';

const ANTHROPIC_MODELS = [
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
  ...['claude-3-haiku-20240307', 'claude-3-haiku-latest'].map((model) => ({
    id: model,
    cost: {
      input: 0.00025 / 1000,
      output: 0.00125 / 1000,
    },
  })),
  ...['claude-3-opus-20240229', 'claude-3-opus-latest'].map((model) => ({
    id: model,
    cost: {
      input: 0.015 / 1000,
      output: 0.075 / 1000,
    },
  })),
  ...['claude-3-5-haiku-20241022', 'claude-3-5-haiku-latest'].map((model) => ({
    id: model,
    cost: {
      input: 1 / 1e6,
      output: 5 / 1e6,
    },
  })),
  ...[
    'claude-3-sonnet-20240229',
    'claude-3-sonnet-latest',
    'claude-3-5-sonnet-20240620',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-latest',
  ].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6,
      output: 15 / 1e6,
    },
  })),
];

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
  headers?: Record<string, string>;
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

export function parseMessages(messages: string): {
  system?: Anthropic.TextBlockParam[];
  extractedMessages: Anthropic.MessageParam[];
} {
  try {
    const parsed = JSON.parse(messages);
    if (Array.isArray(parsed)) {
      const systemMessage = parsed.find((msg) => msg.role === 'system');
      return {
        extractedMessages: parsed
          .filter((msg) => msg.role !== 'system')
          .map((msg) => ({
            role: msg.role,
            content: Array.isArray(msg.content)
              ? msg.content
              : [{ type: 'text', text: msg.content }],
          })),
        system: systemMessage
          ? Array.isArray(systemMessage.content)
            ? systemMessage.content
            : [{ type: 'text', text: systemMessage.content }]
          : undefined,
      };
    }
  } catch {
    // Not JSON, parse as plain text
  }
  const lines = messages
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line);
  let system: Anthropic.TextBlockParam[] | undefined;
  const extractedMessages: Anthropic.MessageParam[] = [];
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent: string[] = [];

  const pushMessage = () => {
    if (currentRole && currentContent.length > 0) {
      extractedMessages.push({
        role: currentRole,
        content: [{ type: 'text', text: currentContent.join('\n') }],
      });
      currentContent = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('system:')) {
      system = [{ type: 'text', text: line.slice(7).trim() }];
    } else if (line.startsWith('user:') || line.startsWith('assistant:')) {
      pushMessage();
      currentRole = line.startsWith('user:') ? 'user' : 'assistant';
      currentContent.push(line.slice(line.indexOf(':') + 1).trim());
    } else if (currentRole) {
      currentContent.push(line);
    } else {
      // If no role is set, assume it's a user message
      currentRole = 'user';
      currentContent.push(line);
    }
  }

  pushMessage();

  if (extractedMessages.length === 0 && !system) {
    extractedMessages.push({
      role: 'user',
      content: [{ type: 'text', text: messages.trim() }],
    });
  }

  return { system, extractedMessages };
}

export function calculateAnthropicCost(
  modelName: string,
  config: AnthropicMessageOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCost(modelName, config, promptTokens, completionTokens, ANTHROPIC_MODELS);
}

export class AnthropicMessagesProvider implements ApiProvider {
  modelName: string;
  config: AnthropicMessageOptions;
  env?: EnvOverrides;
  apiKey?: string;
  anthropic: Anthropic;

  static ANTHROPIC_MODELS = ANTHROPIC_MODELS;

  static ANTHROPIC_MODELS_NAMES = ANTHROPIC_MODELS.map((model) => model.id);

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
    this.apiKey = config?.apiKey || env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
    this.anthropic = new Anthropic({ apiKey: this.apiKey, baseURL: this.config.apiBaseUrl });
  }

  id(): string {
    return `anthropic:messages:${this.modelName || 'claude-2.1'}`;
  }

  toString(): string {
    return `[Anthropic Messages Provider ${this.modelName || 'claude-2.1'}]`;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getApiBaseUrl(): string | undefined {
    return this.config.apiBaseUrl;
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
      max_tokens: this.config?.max_tokens || getEnvInt('ANTHROPIC_MAX_TOKENS', 1024),
      messages: extractedMessages,
      stream: false,
      temperature: this.config.temperature || getEnvFloat('ANTHROPIC_TEMPERATURE', 0),
      ...(this.config.tools ? { tools: maybeLoadFromExternalFile(this.config.tools) } : {}),
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
        } catch {
          // Could be an old cache item, which was just the text content from TextBlock.
          return {
            output: cachedResponse,
            tokenUsage: {},
          };
        }
      }
    }

    try {
      const response = await this.anthropic.messages.create(params, {
        ...(this.config.headers ? { headers: this.config.headers } : {}),
      });

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
        cost: calculateAnthropicCost(
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
    this.apiKey = config?.apiKey || env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
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
      stop = getEnvString('ANTHROPIC_STOP')
        ? JSON.parse(getEnvString('ANTHROPIC_STOP') || '')
        : ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`ANTHROPIC_STOP is not a valid JSON string: ${err}`);
    }

    const params: Anthropic.CompletionCreateParams = {
      model: this.modelName,
      prompt: `${Anthropic.HUMAN_PROMPT} ${prompt} ${Anthropic.AI_PROMPT}`,
      max_tokens_to_sample:
        this.config?.max_tokens_to_sample || getEnvInt('ANTHROPIC_MAX_TOKENS', 1024),
      temperature: this.config.temperature ?? getEnvFloat('ANTHROPIC_TEMPERATURE', 0),
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

export const DefaultGradingProvider = new AnthropicMessagesProvider('claude-3-5-sonnet-20240620');
export const DefaultGradingJsonProvider = new AnthropicMessagesProvider(
  'claude-3-5-sonnet-20240620',
);
export const DefaultSuggestionsProvider = new AnthropicMessagesProvider(
  'claude-3-5-sonnet-20240620',
);

export class AnthropicLlmRubricProvider extends AnthropicMessagesProvider {
  constructor(modelName: string) {
    super(modelName, {
      config: {
        tool_choice: { type: 'tool', name: 'grade_output' },
        tools: [
          {
            name: 'grade_output',
            description: 'Grade the given output based on specific criteria',
            input_schema: {
              type: 'object',
              properties: {
                pass: {
                  type: 'boolean',
                  description: 'Whether the output passes the criteria',
                },
                score: {
                  type: 'number',
                  description: 'The score assigned to the output',
                },
                reason: {
                  type: 'string',
                  description: 'The reason for the given grade',
                },
              },
              required: ['pass', 'score', 'reason'],
            },
          },
        ],
      },
    });
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const result = await super.callApi(prompt);
    if (typeof result.output !== 'string') {
      return {
        error: `Anthropic LLM rubric grader - malformed non-string output\n\n${JSON.stringify(result.output)}`,
      };
    }
    try {
      const functionCall = JSON.parse(result.output) as {
        type: 'tool_use';
        id: string;
        name: 'grade_output';
        input: {
          pass: boolean;
          score: number;
          reason: string;
        };
      };
      return {
        output: functionCall.input,
      };
    } catch (err) {
      return {
        error: `Anthropic LLM rubric grader - invalid JSON: ${err}\n\n${result.output}`,
      };
    }
  }
}
export const DefaultLlmRubricProvider = new AnthropicLlmRubricProvider(
  'claude-3-5-sonnet-20240620',
);
