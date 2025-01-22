import type { Cache } from 'cache-manager';
import OpenAI from 'openai';
import { fetchWithCache, getCache, isCacheEnabled } from '../cache';
import { getEnvString, getEnvFloat, getEnvInt } from '../envars';
import logger from '../logger';
import type {
  ApiModerationProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ModerationFlag,
  ProviderEmbeddingResponse,
  ProviderModerationResponse,
  ProviderResponse,
  TokenUsage,
} from '../types';
import type { EnvOverrides } from '../types/env';
import { renderVarsInObject } from '../util';
import { maybeLoadFromExternalFile } from '../util';
import { safeJsonStringify } from '../util/json';
import { sleep } from '../util/time';
import { ellipsize } from '../utils/text';
import type { OpenAiFunction, OpenAiTool } from './openaiUtil';
import { calculateCost, REQUEST_TIMEOUT_MS, parseChatPrompt, toTitleCase } from './shared';

// see https://platform.openai.com/docs/models
export const OPENAI_CHAT_MODELS = [
  ...['o1', 'o1-2024-12-17', 'o1-preview', 'o1-preview-2024-09-12'].map((model) => ({
    id: model,
    cost: {
      input: 15 / 1e6,
      output: 60 / 1e6,
    },
  })),
  ...['o1-mini', 'o1-mini-2024-09-12'].map((model) => ({
    id: model,
    cost: {
      input: 3 / 1e6,
      output: 12 / 1e6,
    },
  })),
  ...['gpt-4o', 'gpt-4o-2024-11-20', 'gpt-4o-2024-08-06'].map((model) => ({
    id: model,
    cost: {
      input: 2.5 / 1e6,
      output: 10 / 1e6,
    },
  })),
  ...['gpt-4o-2024-05-13'].map((model) => ({
    id: model,
    cost: {
      input: 5 / 1000000,
      output: 15 / 1000000,
    },
  })),
  ...['gpt-4o-mini', 'gpt-4o-mini-2024-07-18'].map((model) => ({
    id: model,
    cost: {
      input: 0.15 / 1000000,
      output: 0.6 / 1000000,
    },
  })),
  ...['gpt-4', 'gpt-4-0613'].map((model) => ({
    id: model,
    cost: {
      input: 30 / 1000000,
      output: 60 / 1000000,
    },
  })),
  ...[
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-4-turbo-preview',
    'gpt-4-0125-preview',
    'gpt-4-1106-preview',
  ].map((model) => ({
    id: model,
    cost: {
      input: 10 / 1000000,
      output: 30 / 1000000,
    },
  })),
  {
    id: 'gpt-3.5-turbo',
    cost: {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-0125',
    cost: {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-1106',
    cost: {
      input: 1 / 1000000,
      output: 2 / 1000000,
    },
  },
  ...['gpt-3.5-turbo-instruct'].map((model) => ({
    id: model,
    cost: {
      input: 1.5 / 1000000,
      output: 2 / 1000000,
    },
  })),
];

// See https://platform.openai.com/docs/models/model-endpoint-compatibility
export const OPENAI_COMPLETION_MODELS = [
  {
    id: 'gpt-3.5-turbo-instruct',
    cost: {
      input: 1.5 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'text-davinci-002',
  },
  {
    id: 'text-babbage-002',
  },
];

interface OpenAiSharedOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  organization?: string;
  cost?: number;
  headers?: { [key: string]: string };
}

/** Base options shared between all OpenAI models */
interface OpenAiBaseCompletionOptions extends OpenAiSharedOptions {
  /** For deterministic outputs. Same seed + parameters should return similar results.
   * Check system_fingerprint in response to monitor backend changes affecting determinism.
   */
  seed?: number;

  /** Additional parameters to pass directly to the API. Use with caution. */
  passthrough?: object;

  /** Callback functions to automatically execute when the model calls specific tools.
   * Maps function names to their implementations.
   */
  functionToolCallbacks?: Record<
    OpenAI.FunctionDefinition['name'],
    (arg: string) => Promise<string>
  >;

  /** Up to 4 sequences where the API will stop generating further tokens. */
  stop?: string[];

  /** Optional name for the participant in the conversation.
   * Helps model differentiate between participants with the same role.
   */
  name?: string;

  /** List of tools (currently only functions) that the model may use.
   * Provides a list of functions the model may generate JSON inputs for.
   */
  tools?: OpenAiTool[];

  /** Controls which tool (if any) the model should use.
   * - 'none': model will not use any tool
   * - 'auto': model can choose between generating a message or using tools
   * - 'required': model must use at least one tool
   * - object: forces the model to use a specific tool
   */
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };

  /** Specifies the format that the model must output.
   * - json_object: Ensures the message is valid JSON
   * - json_schema: Enables Structured Outputs matching your schema
   */
  response_format?:
    | {
        type: 'json_object';
      }
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          strict: boolean;
          schema: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
            additionalProperties: false;
            $defs?: Record<string, any>; // For shared schema definitions
          };
        };
      };

  /** The prompt text to send to the model */
  prompt?: string;

  /** Indicates which type of model this is */
  model_type?: 'o1' | 'standard';

  // Standard model parameters
  /** Temperature controls randomness in the model's output. Values between 0 and 2.
   * Higher values (e.g., 0.8) make output more random, lower values (e.g., 0.2) make it more focused.
   */
  temperature?: number;

  /** The maximum number of tokens to generate. */
  max_tokens?: number;

  /** An alternative to temperature for controlling randomness. Value between 0 and 1.
   * Only considers tokens comprising the top_p probability mass. E.g., 0.1 means only top 10% likely tokens are considered.
   */
  top_p?: number;

  /** Number between -2.0 and 2.0. Positive values penalize new tokens based on their frequency,
   * decreasing the model's likelihood to repeat the same line verbatim.
   */
  frequency_penalty?: number;

  /** Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far,
   * increasing the model's likelihood to talk about new topics.
   */
  presence_penalty?: number;

  /** Number of completions to generate for each prompt. Keep as 1 to minimize costs.
   * @deprecated Rarely used in newer models
   */
  best_of?: number;

  /** @deprecated Use tools instead. List of functions the model may generate JSON inputs for. */
  functions?: OpenAiFunction[];

  /** @deprecated Use tool_choice instead. Controls how the model uses functions. */
  function_call?: 'none' | 'auto' | { name: string };

  // o1 model parameters
  /** Maximum number of tokens to generate in the completion.
   * Replaces max_tokens for o1 models.
   */
  max_completion_tokens?: number;

  /** Developer-provided instructions that the model should follow.
   * More authoritative than system messages for controlling model behavior.
   */
  developer_instructions?: string;

  /** Predicted output content for faster responses.
   * Useful when regenerating known content like text files.
   */
  prediction?: {
    content: string | Array<{ type: 'text'; text: string }>;
    type: 'content';
  };

  /** Controls reasoning effort for o1 models.
   * - 'low': Faster responses, fewer tokens on reasoning
   * - 'medium': Balanced approach
   * - 'high': More thorough reasoning, potentially slower and more tokens
   */
  reasoning_effort?: 'low' | 'medium' | 'high';

  /** Controls processing latency tier.
   * - 'auto': Uses scale tier if available, otherwise default
   * - 'default': Lower uptime SLA, no latency guarantee
   */
  service_tier?: 'auto' | 'default';

  /** Whether to store completion for model distillation/evaluation.
   * Enables using the output for improving model performance.
   */
  store?: boolean;
}

export type OpenAiCompletionOptions = OpenAiBaseCompletionOptions;

/** Type guard to check if config has o1 features */
function isO1Config(config: OpenAiCompletionOptions): boolean {
  return config.model_type === 'o1' || (
    'max_completion_tokens' in config ||
    'developer_instructions' in config ||
    'prediction' in config ||
    'reasoning_effort' in config ||
    'service_tier' in config ||
    'store' in config
  );
}

/** Type guard to check if config has standard features */
function isStandardConfig(config: OpenAiCompletionOptions): boolean {
  return config.model_type === 'standard' || (
    'max_tokens' in config ||
    'temperature' in config ||
    'top_p' in config ||
    'presence_penalty' in config ||
    'frequency_penalty' in config ||
    'best_of' in config ||
    'functions' in config ||
    'function_call' in config
  );
}

export function failApiCall(err: any) {
  if (err instanceof OpenAI.APIError) {
    return {
      error: `API error: ${err.type} ${err.message}`,
    };
  }
  return {
    error: `API error: ${String(err)}`,
  };
}

export function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    if (cached) {
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens };
    } else {
      return {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
      };
    }
  }
  return {};
}

export class OpenAiGenericProvider implements ApiProvider {
  modelName: string;

  config: OpenAiSharedOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: OpenAiSharedOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return this.config.apiHost || this.config.apiBaseUrl
      ? this.modelName
      : `openai:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Provider ${this.modelName}]`;
  }

  getOrganization(): string | undefined {
    return (
      this.config.organization ||
      this.env?.OPENAI_ORGANIZATION ||
      getEnvString('OPENAI_ORGANIZATION')
    );
  }

  getApiUrlDefault(): string {
    return 'https://api.openai.com/v1';
  }

  getApiUrl(): string {
    const apiHost =
      this.config.apiHost || this.env?.OPENAI_API_HOST || getEnvString('OPENAI_API_HOST');
    if (apiHost) {
      return `https://${apiHost}/v1`;
    }
    return (
      this.config.apiBaseUrl ||
      this.env?.OPENAI_API_BASE_URL ||
      this.env?.OPENAI_BASE_URL ||
      getEnvString('OPENAI_API_BASE_URL') ||
      getEnvString('OPENAI_BASE_URL') ||
      this.getApiUrlDefault()
    );
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.OPENAI_API_KEY ||
      getEnvString('OPENAI_API_KEY')
    );
  }

  // @ts-ignore: Params are not used in this implementation
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class OpenAiEmbeddingProvider extends OpenAiGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    if (!this.getApiKey()) {
      throw new Error('OpenAI API key must be set for similarity comparison');
    }

    const body = {
      input: text,
      model: this.modelName,
    };
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.getApiUrl()}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      logger.error(`API call error: ${err}`);
      throw err;
    }
    logger.debug(`\tOpenAI embeddings API response: ${JSON.stringify(data)}`);

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in OpenAI embeddings API response');
      }
      return {
        embedding,
        tokenUsage: getTokenUsage(data, cached),
      };
    } catch (err) {
      logger.error(data.error.message);
      throw err;
    }
  }
}

export function formatOpenAiError(data: {
  error: { message: string; type?: string; code?: string };
}): string {
  let errorMessage = `API error: ${data.error.message}`;
  if (data.error.type) {
    errorMessage += `, Type: ${data.error.type}`;
  }
  if (data.error.code) {
    errorMessage += `, Code: ${data.error.code}`;
  }
  errorMessage += '\n\n' + safeJsonStringify(data, true /* prettyPrint */);
  return errorMessage;
}

export function calculateOpenAICost(
  modelName: string,
  config: OpenAiSharedOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCost(modelName, config, promptTokens, completionTokens, [
    ...OPENAI_CHAT_MODELS,
    ...OPENAI_COMPLETION_MODELS,
  ]);
}

export class OpenAiCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_COMPLETION_MODELS = OPENAI_COMPLETION_MODELS;

  static OPENAI_COMPLETION_MODEL_NAMES = OPENAI_COMPLETION_MODELS.map((model) => model.id);

  config: OpenAiCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
    if (
      !OpenAiCompletionProvider.OPENAI_COMPLETION_MODEL_NAMES.includes(modelName) &&
      this.getApiUrl() === this.getApiUrlDefault()
    ) {
      logger.warn(`FYI: Using unknown OpenAI completion model: ${modelName}`);
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    let stop: string;
    try {
      stop = getEnvString('OPENAI_STOP')
        ? JSON.parse(getEnvString('OPENAI_STOP') || '')
        : this.config?.stop || ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
    }
    const body = {
      model: this.modelName,
      prompt,
      seed: this.config.seed,
      max_tokens: this.config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024),
      temperature: this.config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0),
      top_p: this.config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1),
      presence_penalty: this.config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
      frequency_penalty:
        this.config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
      best_of: this.config.best_of ?? getEnvInt('OPENAI_BEST_OF', 1),
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(stop ? { stop } : {}),
      ...(this.config.passthrough || {}),
    };
    logger.debug(`Calling OpenAI API: ${JSON.stringify(body)}`);
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.getApiUrl()}/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tOpenAI completions API response: ${JSON.stringify(data)}`);
    if (data.error) {
      return {
        error: formatOpenAiError(data),
      };
    }
    try {
      return {
        output: data.choices[0].text,
        tokenUsage: getTokenUsage(data, cached),
        cached,
        cost: calculateOpenAICost(
          this.modelName,
          this.config,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
        ),
      };
    } catch (err) {
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export class OpenAiChatCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_CHAT_MODELS = OPENAI_CHAT_MODELS;

  static OPENAI_CHAT_MODEL_NAMES = OPENAI_CHAT_MODELS.map((model) => model.id);

  config: OpenAiCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!OpenAiChatCompletionProvider.OPENAI_CHAT_MODEL_NAMES.includes(modelName)) {
      logger.debug(`Using unknown OpenAI chat model: ${modelName}`);
    }
    super(modelName, options);
    this.config = options.config || {};
  }

  private getOpenAiBody(rawConfig: OpenAiCompletionOptions): Record<string, any> {
    const isO1Model = this.modelName.startsWith('o1');
    const config: OpenAiCompletionOptions = {
      ...rawConfig,
      model_type: isO1Model ? 'o1' : 'standard'
    };

    // Parse messages and handle developer instructions if present
    const messages = parseChatPrompt(rawConfig.prompt || '', [{ 
      role: 'user', 
      content: rawConfig.prompt || '',
      ...(rawConfig.name ? { name: rawConfig.name } : {})
    }]);
    
    // Add developer instructions as a system message if present
    if (isO1Config(config) && config.developer_instructions) {
      messages.unshift({
        role: 'system',
        content: config.developer_instructions,
      });
    }

    const body: Record<string, any> = {
      model: this.modelName,
      messages,
    };

    // Add o1-specific parameters
    if (isO1Model && isO1Config(config)) {
      if (config.max_completion_tokens !== undefined) {
        body.max_completion_tokens = config.max_completion_tokens;
      }
      if (config.prediction !== undefined) {
        body.prediction = config.prediction;
      }
      if (config.reasoning_effort !== undefined) {
        body.reasoning_effort = config.reasoning_effort;
      }
      if (config.service_tier !== undefined) {
        body.service_tier = config.service_tier;
      }
      if (config.store !== undefined) {
        body.store = config.store;
      }
    } else if (!isO1Model && isStandardConfig(config)) {
      // Add standard model parameters
      if (config.max_tokens !== undefined) {
        body.max_tokens = config.max_tokens;
      }
      if (config.temperature !== undefined) {
        body.temperature = config.temperature;
      }
      if (config.top_p !== undefined) {
        body.top_p = config.top_p;
      }
      if (config.presence_penalty !== undefined) {
        body.presence_penalty = config.presence_penalty;
      }
      if (config.frequency_penalty !== undefined) {
        body.frequency_penalty = config.frequency_penalty;
      }
      if (config.best_of !== undefined) {
        body.best_of = config.best_of;
      }
      if (config.functions !== undefined) {
        body.functions = config.functions;
      }
      if (config.function_call !== undefined) {
        body.function_call = config.function_call;
      }
    }

    // Add shared parameters
    if (config.seed !== undefined) {
      body.seed = config.seed;
    }
    if (config.stop !== undefined) {
      body.stop = config.stop;
    }
    if (config.tools !== undefined) {
      body.tools = config.tools;
    }
    if (config.tool_choice !== undefined) {
      body.tool_choice = config.tool_choice;
    }
    if (config.response_format !== undefined) {
      body.response_format = config.response_format;
    }

    return body;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    // Merge provider config with prompt config
    const mergedConfig = {
      ...this.config,
      ...context?.prompt?.config,
      prompt,
    };

    const body = this.getOpenAiBody(mergedConfig);
    logger.debug(`Calling OpenAI API: ${JSON.stringify(body)}`);

    let data, status, statusText;
    let cached = false;
    try {
      ({ data, cached, status, statusText } = await fetchWithCache(
        `${this.getApiUrl()}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      ));

      if (status < 200 || status >= 300) {
        return {
          error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tOpenAI chat completions API response: ${JSON.stringify(data)}`);
    if (data.error) {
      return {
        error: formatOpenAiError(data),
      };
    }
    try {
      const message = data.choices[0].message;
      if (message.refusal) {
        return {
          output: message.refusal,
          tokenUsage: getTokenUsage(data, cached),
          isRefusal: true,
        };
      }
      let output = '';
      if (message.content && (message.function_call || message.tool_calls)) {
        if (Array.isArray(message.tool_calls) && message.tool_calls.length === 0) {
          output = message.content;
        }
        output = message;
      } else if (message.content === null) {
        output = message.function_call || message.tool_calls;
      } else {
        output = message.content;
      }
      const logProbs = data.choices[0].logprobs?.content?.map(
        (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
      );

      // Handle structured output
      if ((mergedConfig.response_format?.type === 'json_schema' || 
           mergedConfig.response_format?.type === 'json_object') && 
          typeof output === 'string') {
        try {
          output = JSON.parse(output);
        } catch (error) {
          logger.error(`Failed to parse JSON output: ${error}`);
        }
      }

      // Handle function tool callbacks
      const functionCalls = message.function_call ? [message.function_call] : message.tool_calls;
      if (functionCalls && this.config.functionToolCallbacks) {
        const results = [];
        for (const functionCall of functionCalls) {
          const functionName = functionCall.name || functionCall.function?.name;
          if (this.config.functionToolCallbacks[functionName]) {
            try {
              const functionResult = await this.config.functionToolCallbacks[functionName](
                functionCall.arguments || functionCall.function?.arguments,
              );
              results.push(functionResult);
            } catch (error) {
              logger.error(`Error executing function ${functionName}: ${error}`);
            }
          }
        }
        if (results.length > 0) {
          return {
            output: results.join('\n'),
            tokenUsage: getTokenUsage(data, cached),
            cached,
            logProbs,
            cost: calculateOpenAICost(
              this.modelName,
              this.config,
              data.usage?.prompt_tokens,
              data.usage?.completion_tokens,
            ),
          };
        }
      }

      return {
        output,
        tokenUsage: getTokenUsage(data, cached),
        cached,
        logProbs,
        cost: calculateOpenAICost(
          this.modelName,
          this.config,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
        ),
      };
    } catch (err) {
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

type OpenAiAssistantOptions = OpenAiSharedOptions & {
  modelName?: string;
  instructions?: string;
  tools?: OpenAI.Beta.Threads.ThreadCreateAndRunParams['tools'];
  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  functionToolCallbacks?: Record<
    OpenAI.FunctionDefinition['name'],
    (arg: string) => Promise<string>
  >;
  metadata?: object[];
  temperature?: number;
  toolChoice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function?: { name: string } }
    | { type: 'file_search' };
  attachments?: OpenAI.Beta.Threads.Message.Attachment[];
  tool_resources?: OpenAI.Beta.Threads.ThreadCreateAndRunParams['tool_resources'];
};

export class OpenAiAssistantProvider extends OpenAiGenericProvider {
  assistantId: string;
  assistantConfig: OpenAiAssistantOptions;

  constructor(
    assistantId: string,
    options: { config?: OpenAiAssistantOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(assistantId, options);
    this.assistantConfig = options.config || {};
    this.assistantId = assistantId;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const openai = new OpenAI({
      apiKey: this.getApiKey(),
      organization: this.getOrganization(),
      baseURL: this.getApiUrl(),
      maxRetries: 3,
      timeout: REQUEST_TIMEOUT_MS,
      defaultHeaders: this.assistantConfig.headers,
    });

    const messages = parseChatPrompt(prompt, [
      {
        role: 'user',
        content: prompt,
        ...(this.assistantConfig.attachments
          ? { attachments: this.assistantConfig.attachments }
          : {}),
      },
    ]) as OpenAI.Beta.Threads.ThreadCreateParams.Message[];
    const body: OpenAI.Beta.Threads.ThreadCreateAndRunParams = {
      assistant_id: this.assistantId,
      model: this.assistantConfig.modelName || undefined,
      instructions: this.assistantConfig.instructions || undefined,
      tools:
        maybeLoadFromExternalFile(renderVarsInObject(this.assistantConfig.tools, context?.vars)) ||
        undefined,
      metadata: this.assistantConfig.metadata || undefined,
      temperature: this.assistantConfig.temperature || undefined,
      tool_choice: this.assistantConfig.toolChoice || undefined,
      tool_resources: this.assistantConfig.tool_resources || undefined,
      thread: {
        messages,
      },
    };

    logger.debug(`Calling OpenAI API, creating thread run: ${JSON.stringify(body)}`);
    let run;
    try {
      run = await openai.beta.threads.createAndRun(body);
    } catch (err) {
      return failApiCall(err);
    }

    logger.debug(`\tOpenAI thread run API response: ${JSON.stringify(run)}`);

    while (
      run.status === 'in_progress' ||
      run.status === 'queued' ||
      run.status === 'requires_action'
    ) {
      if (run.status === 'requires_action') {
        const requiredAction: OpenAI.Beta.Threads.Runs.Run.RequiredAction | null =
          run.required_action;
        if (requiredAction === null || requiredAction.type !== 'submit_tool_outputs') {
          break;
        }
        const functionCallsWithCallbacks: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall[] =
          requiredAction.submit_tool_outputs.tool_calls.filter((toolCall) => {
            return (
              toolCall.type === 'function' &&
              toolCall.function.name in (this.assistantConfig.functionToolCallbacks ?? {})
            );
          });
        if (functionCallsWithCallbacks.length === 0) {
          break;
        }
        logger.debug(
          `Calling functionToolCallbacks for functions: ${functionCallsWithCallbacks.map(
            ({ function: { name } }) => name,
          )}`,
        );
        const toolOutputs = await Promise.all(
          functionCallsWithCallbacks.map(async (toolCall) => {
            logger.debug(
              `Calling functionToolCallbacks[${toolCall.function.name}]('${toolCall.function.arguments}')`,
            );
            const result = await this.assistantConfig.functionToolCallbacks![
              toolCall.function.name
            ](toolCall.function.arguments);
            return {
              tool_call_id: toolCall.id,
              output: result,
            };
          }),
        );
        logger.debug(
          `Calling OpenAI API, submitting tool outputs for ${run.thread_id}: ${JSON.stringify(
            toolOutputs,
          )}`,
        );
        try {
          run = await openai.beta.threads.runs.submitToolOutputs(run.thread_id, run.id, {
            tool_outputs: toolOutputs,
          });
        } catch (err) {
          return failApiCall(err);
        }
        continue;
      }

      await sleep(1000);

      logger.debug(`Calling OpenAI API, getting thread run ${run.id} status`);
      try {
        run = await openai.beta.threads.runs.retrieve(run.thread_id, run.id);
      } catch (err) {
        return failApiCall(err);
      }
      logger.debug(`\tOpenAI thread run API response: ${JSON.stringify(run)}`);
    }

    if (run.status !== 'completed' && run.status !== 'requires_action') {
      if (run.last_error) {
        return {
          error: `Thread run failed: ${run.last_error.message}`,
        };
      }
      return {
        error: `Thread run failed: ${run.status}`,
      };
    }

    // Get run steps
    logger.debug(`Calling OpenAI API, getting thread run steps for ${run.thread_id}`);
    let steps;
    try {
      steps = await openai.beta.threads.runs.steps.list(run.thread_id, run.id, {
        order: 'asc',
      });
    } catch (err) {
      return failApiCall(err);
    }
    logger.debug(`\tOpenAI thread run steps API response: ${JSON.stringify(steps)}`);

    const outputBlocks = [];
    for (const step of steps.data) {
      if (step.step_details.type === 'message_creation') {
        logger.debug(`Calling OpenAI API, getting message ${step.id}`);
        let message;
        try {
          message = await openai.beta.threads.messages.retrieve(
            run.thread_id,
            step.step_details.message_creation.message_id,
          );
        } catch (err) {
          return failApiCall(err);
        }
        logger.debug(`\tOpenAI thread run step message API response: ${JSON.stringify(message)}`);

        const content = message.content
          .map((content) =>
            content.type === 'text' ? content.text.value : `<${content.type} output>`,
          )
          .join('\n');
        outputBlocks.push(`[${toTitleCase(message.role)}] ${content}`);
      } else if (step.step_details.type === 'tool_calls') {
        for (const toolCall of step.step_details.tool_calls) {
          if (toolCall.type === 'function') {
            outputBlocks.push(
              `[Call function ${toolCall.function.name} with arguments ${toolCall.function.arguments}]`,
            );
            outputBlocks.push(`[Function output: ${toolCall.function.output}]`);
          } else if (toolCall.type === 'file_search') {
            outputBlocks.push(`[Ran file search]`);
          } else if (toolCall.type === 'code_interpreter') {
            const output = toolCall.code_interpreter.outputs
              .map((output) => (output.type === 'logs' ? output.logs : `<${output.type} output>`))
              .join('\n');
            outputBlocks.push(`[Code interpreter input]`);
            outputBlocks.push(toolCall.code_interpreter.input);
            outputBlocks.push(`[Code interpreter output]`);
            outputBlocks.push(output);
          } else {
            outputBlocks.push(`[Unknown tool call type: ${(toolCall as any).type}]`);
          }
        }
      } else {
        outputBlocks.push(`[Unknown step type: ${(step.step_details as any).type}]`);
      }
    }

    return {
      output: outputBlocks.join('\n\n').trim(),
      tokenUsage: getTokenUsage(run, false),
    };
  }
}

type OpenAiImageOptions = OpenAiSharedOptions & {
  size?: string;
};

export class OpenAiImageProvider extends OpenAiGenericProvider {
  config: OpenAiImageOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const cache = getCache();
    const cacheKey = `openai:image:${safeJsonStringify({ context, prompt })}`;

    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const openai = new OpenAI({
      apiKey: this.getApiKey(),
      organization: this.getOrganization(),
      baseURL: this.getApiUrl(),
      maxRetries: 3,
      timeout: REQUEST_TIMEOUT_MS,
      defaultHeaders: this.config.headers,
    });

    let response: OpenAI.Images.ImagesResponse | undefined;
    let cached = false;
    if (isCacheEnabled()) {
      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Retrieved cached response for ${prompt}: ${cachedResponse}`);
        response = JSON.parse(cachedResponse as string) as OpenAI.Images.ImagesResponse;
        cached = true;
      }
    }

    if (!response) {
      response = await openai.images.generate({
        model: this.modelName,
        prompt,
        n: 1,
        size:
          ((this.config.size || process.env.OPENAI_IMAGE_SIZE) as
            | '1024x1024'
            | '256x256'
            | '512x512'
            | '1792x1024'
            | '1024x1792'
            | undefined) || '1024x1024',
      });
    }
    const url = response.data[0].url;
    if (!url) {
      return {
        error: `No image URL found in response: ${JSON.stringify(response)}`,
      };
    }

    if (!cached && isCacheEnabled()) {
      try {
        await cache.set(cacheKey, JSON.stringify(response));
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }

    const sanitizedPrompt = prompt
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')');
    const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);
    return {
      output: `![${ellipsizedPrompt}](${url})`,
      cached,
    };
  }
}

export class OpenAiModerationProvider
  extends OpenAiGenericProvider
  implements ApiModerationProvider
{
  async callModerationApi(
    userPrompt: string, // userPrompt is not supported by OpenAI moderation API
    assistantResponse: string,
  ): Promise<ProviderModerationResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const openai = new OpenAI({
      apiKey: this.getApiKey(),
      organization: this.getOrganization(),
      baseURL: this.getApiUrl(),
      maxRetries: 3,
      timeout: REQUEST_TIMEOUT_MS,
    });

    let cache: Cache | undefined;
    let cacheKey: string | undefined;
    if (isCacheEnabled()) {
      cache = await getCache();
      cacheKey = `openai:${this.modelName}:${JSON.stringify(
        this.config,
      )}:${userPrompt}:${assistantResponse}`;

      // Try to get the cached response
      const cachedResponse = await cache.get(cacheKey);

      if (cachedResponse) {
        logger.debug(`Returning cached response for ${userPrompt}: ${cachedResponse}`);
        return JSON.parse(cachedResponse as string);
      }
    }

    logger.debug(
      `Calling OpenAI moderation API: prompt [${userPrompt}] assistant [${assistantResponse}]`,
    );
    let moderation: OpenAI.Moderations.ModerationCreateResponse | undefined;
    try {
      moderation = await openai.moderations.create({
        model: this.modelName,
        input: assistantResponse,
      });
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tOpenAI moderation API response: ${JSON.stringify(moderation)}`);
    try {
      const { results } = moderation;

      const flags: ModerationFlag[] = [];
      if (!results) {
        throw new Error('API response error: no results');
      }

      if (cache && cacheKey) {
        await cache.set(cacheKey, JSON.stringify(moderation));
      }

      if (results.length === 0) {
        return { flags };
      }

      for (const result of results) {
        if (result.flagged) {
          for (const [category, flagged] of Object.entries(result.categories)) {
            if (flagged) {
              flags.push({
                code: category,
                description: category,
                confidence:
                  result.category_scores[category as keyof OpenAI.Moderation.CategoryScores],
              });
            }
          }
        }
      }
      return { flags };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(moderation)}`,
      };
    }
  }
}

export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider('text-embedding-3-large');
export const DefaultGradingProvider = new OpenAiChatCompletionProvider('gpt-4o-2024-05-13');
export const DefaultGradingJsonProvider = new OpenAiChatCompletionProvider('gpt-4o-2024-05-13', {
  config: {
    response_format: { type: 'json_object' },
  },
});
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider('gpt-4o-2024-05-13');
export const DefaultModerationProvider = new OpenAiModerationProvider('omni-moderation-latest');
