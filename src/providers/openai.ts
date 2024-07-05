import type { Cache } from 'cache-manager';
import OpenAI from 'openai';
import { fetchWithCache, getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import type {
  ApiModerationProvider,
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
  ModerationFlag,
  ProviderEmbeddingResponse,
  ProviderModerationResponse,
  ProviderResponse,
  TokenUsage,
} from '../types.js';
import { renderVarsInObject } from '../util';
import { safeJsonStringify } from '../util';
import { OpenAiFunction, OpenAiTool } from './openaiUtil';
import { REQUEST_TIMEOUT_MS, parseChatPrompt, toTitleCase } from './shared';

const OPENAI_CHAT_MODELS = [
  ...['gpt-4', 'gpt-4-0314', 'gpt-4-0613'].map((model) => ({
    id: model,
    cost: {
      input: 0.03 / 1000,
      output: 0.06 / 1000,
    },
  })),
  ...[
    'gpt-4-1106-preview',
    'gpt-4-1106-vision-preview',
    'gpt-4-0125-preview',
    'gpt-4-turbo-2024-04-09',
    'gpt-4-turbo-preview',
    'gpt-4-turbo',
  ].map((model) => ({
    id: model,
    cost: {
      input: 0.01 / 1000,
      output: 0.03 / 1000,
    },
  })),
  ...['gpt-4-32k', 'gpt-4-32k-0314'].map((model) => ({
    id: model,
    cost: {
      input: 0.06 / 1000,
      output: 0.12 / 1000,
    },
  })),
  ...['gpt-4o', 'gpt-4o-2024-05-13'].map((model) => ({
    id: model,
    cost: {
      input: 0.005 / 1000,
      output: 0.015 / 1000,
    },
  })),
  ...[
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0301',
    'gpt-3.5-turbo-0613',
    'gpt-3.5-turbo-1106',
    'gpt-3.5-turbo-0125',
    'gpt-3.5-turbo-16k',
    'gpt-3.5-turbo-16k-0613',
  ].map((model) => ({
    id: model,
    cost: {
      input: 0.0005 / 1000,
      output: 0.0015 / 1000,
    },
  })),
];

const OPENAI_COMPLETION_MODELS = [
  {
    id: 'gpt-3.5-turbo-instruct',
    cost: {
      input: 0.0015 / 1000,
      output: 0.002 / 1000,
    },
  },
  {
    id: 'gpt-3.5-turbo-instruct-0914',
    cost: {
      input: 0.0015 / 1000,
      output: 0.002 / 1000,
    },
  },
  {
    id: 'text-davinci-003',
  },
  {
    id: 'text-davinci-002',
  },
  {
    id: 'text-curie-001',
  },
  {
    id: 'text-babbage-001',
  },
  {
    id: 'text-ada-001',
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

type OpenAiCompletionOptions = OpenAiSharedOptions & {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: OpenAiFunction[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: OpenAiTool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };
  response_format?: { type: 'json_object' };
  stop?: string[];
  seed?: number;
  passthrough?: object;

  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  functionToolCallbacks?: Record<
    OpenAI.FunctionDefinition['name'],
    (arg: string) => Promise<string>
  >;
};

function failApiCall(err: any) {
  if (err instanceof OpenAI.APIError) {
    return {
      error: `API error: ${err.type} ${err.message}`,
    };
  }
  return {
    error: `API error: ${String(err)}`,
  };
}

function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
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
      this.config.organization || this.env?.OPENAI_ORGANIZATION || process.env.OPENAI_ORGANIZATION
    );
  }

  getApiUrlDefault(): string {
    return 'https://api.openai.com/v1';
  }

  getApiUrl(): string {
    const apiHost = this.config.apiHost || this.env?.OPENAI_API_HOST || process.env.OPENAI_API_HOST;
    if (apiHost) {
      return `https://${apiHost}/v1`;
    }
    return (
      this.config.apiBaseUrl ||
      this.env?.OPENAI_API_BASE_URL ||
      this.env?.OPENAI_BASE_URL ||
      process.env.OPENAI_API_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
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
      process.env.OPENAI_API_KEY
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

function formatOpenAiError(data: {
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

function calculateCost(
  modelName: string,
  config: OpenAiSharedOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = [...OPENAI_CHAT_MODELS, ...OPENAI_COMPLETION_MODELS].find(
    (m) => m.id === modelName,
  );
  if (!model || !model.cost) {
    return undefined;
  }

  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  return inputCost * promptTokens + outputCost * completionTokens || undefined;
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
      stop = process.env.OPENAI_STOP
        ? JSON.parse(process.env.OPENAI_STOP)
        : this.config?.stop || ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
    }
    const body = {
      model: this.modelName,
      prompt,
      seed: this.config.seed || 0,
      max_tokens: this.config.max_tokens ?? parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
      temperature: this.config.temperature ?? parseFloat(process.env.OPENAI_TEMPERATURE || '0'),
      top_p: this.config.top_p ?? parseFloat(process.env.OPENAI_TOP_P || '1'),
      presence_penalty:
        this.config.presence_penalty ?? parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        this.config.frequency_penalty ?? parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      best_of: this.config.best_of ?? parseInt(process.env.OPENAI_BEST_OF || '1'),
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
        cost: calculateCost(
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

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const body = {
      model: this.modelName,
      messages: messages,
      seed: this.config.seed || 0,
      max_tokens: this.config.max_tokens ?? parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
      temperature: this.config.temperature ?? parseFloat(process.env.OPENAI_TEMPERATURE || '0'),
      top_p: this.config.top_p ?? parseFloat(process.env.OPENAI_TOP_P || '1'),
      presence_penalty:
        this.config.presence_penalty ?? parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        this.config.frequency_penalty ?? parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      ...(this.config.functions
        ? { functions: renderVarsInObject(this.config.functions, context?.vars) }
        : {}),
      ...(this.config.function_call ? { function_call: this.config.function_call } : {}),
      ...(this.config.tools ? { tools: renderVarsInObject(this.config.tools, context?.vars) } : {}),
      ...(this.config.tool_choice ? { tool_choice: this.config.tool_choice } : {}),
      ...(this.config.response_format ? { response_format: this.config.response_format } : {}),
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(this.config.stop ? { stop: this.config.stop } : {}),
      ...(this.config.passthrough || {}),
    };
    logger.debug(`Calling OpenAI API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
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
      )) as unknown as { data: any; cached: boolean });
    } catch (err) {
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
      let output = '';
      if (message.content && (message.function_call || message.tool_calls)) {
        output = message;
      } else if (message.content === null) {
        output = message.function_call || message.tool_calls;
      } else {
        output = message.content;
      }
      const logProbs = data.choices[0].logprobs?.content?.map(
        (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
      );

      // Handle function tool callbacks
      const functionCalls = message.function_call ? [message.function_call] : message.tool_calls;
      if (functionCalls && this.config.functionToolCallbacks) {
        for (const functionCall of functionCalls) {
          const functionName = functionCall.name;
          if (this.config.functionToolCallbacks[functionName]) {
            const functionResult = await this.config.functionToolCallbacks[functionName](
              message.function_call.arguments,
            );
            return {
              output: functionResult,
              tokenUsage: getTokenUsage(data, cached),
              cached,
              logProbs,
              cost: calculateCost(
                this.modelName,
                this.config,
                data.usage?.prompt_tokens,
                data.usage?.completion_tokens,
              ),
            };
          }
        }
      }

      return {
        output,
        tokenUsage: getTokenUsage(data, cached),
        cached,
        logProbs,
        cost: calculateCost(
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
    | { type: 'function'; function?: { name: string } }
    | { type: 'file_search' };
  attachments?: OpenAI.Beta.Threads.Message.Attachment[];
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
      tools: renderVarsInObject(this.assistantConfig.tools, context?.vars) || undefined,
      metadata: this.assistantConfig.metadata || undefined,
      temperature: this.assistantConfig.temperature || undefined,
      tool_choice: this.assistantConfig.toolChoice || undefined,
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

      await new Promise((resolve) => setTimeout(resolve, 1000));

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
      /*
      tokenUsage: {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
      },
      */
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
      try {
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
      } catch (error) {
        return {
          error: `OpenAI threw error: ${(error as Error).message}`,
        };
      }
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
    const ellipsizedPrompt =
      sanitizedPrompt.length > 50 ? `${sanitizedPrompt.substring(0, 47)}...` : sanitizedPrompt;
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
export const DefaultGradingProvider = new OpenAiChatCompletionProvider('gpt-4o');
export const DefaultGradingJsonProvider = new OpenAiChatCompletionProvider('gpt-4o', {
  config: {
    response_format: { type: 'json_object' },
  },
});
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider('gpt-4o');
export const DefaultModerationProvider = new OpenAiModerationProvider('text-moderation-latest');
