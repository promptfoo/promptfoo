import type OpenAI from 'openai';
import { OpenAiGenericProvider } from '.';
import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt } from '../../envars';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from '../shared';
import type { OpenAiSharedOptions } from './types';
import { calculateOpenAICost } from './util';
import {
  formatOpenAiError,
  getTokenUsage,
  OPENAI_CHAT_MODELS,
  type OpenAiFunction,
  type OpenAiTool,
} from './util';

export type OpenAiCompletionOptions = OpenAiSharedOptions & {
  temperature?: number;
  max_completion_tokens?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: OpenAiFunction[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: OpenAiTool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function?: { name: string } };
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
          };
        };
      };
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

  protected isReasoningModel(): boolean {
    return this.modelName.startsWith('o1') || this.modelName.startsWith('o3');
  }

  protected supportsTemperature(): boolean {
    // OpenAI's o1 and o3 models don't support temperature but some 3rd
    // party reasoning models do.
    return !this.isReasoningModel();
  }

  getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const isReasoningModel = this.isReasoningModel();
    const maxCompletionTokens = isReasoningModel
      ? (config.max_completion_tokens ?? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS'))
      : undefined;
    const maxTokens = isReasoningModel
      ? undefined
      : (config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024));

    const temperature = this.supportsTemperature()
      ? (config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0))
      : undefined;
    const reasoningEffort = isReasoningModel
      ? renderVarsInObject(config.reasoning_effort, context?.vars)
      : undefined;

    const body = {
      model: this.modelName,
      messages,
      seed: config.seed,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(maxCompletionTokens ? { max_completion_tokens: maxCompletionTokens } : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(temperature ? { temperature } : {}),
      ...(config.top_p !== undefined || process.env.OPENAI_TOP_P
        ? { top_p: config.top_p ?? Number.parseFloat(process.env.OPENAI_TOP_P || '1') }
        : {}),
      ...(config.presence_penalty !== undefined || process.env.OPENAI_PRESENCE_PENALTY
        ? {
            presence_penalty:
              config.presence_penalty ??
              Number.parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
          }
        : {}),
      ...(config.frequency_penalty !== undefined || process.env.OPENAI_FREQUENCY_PENALTY
        ? {
            frequency_penalty:
              config.frequency_penalty ??
              Number.parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
          }
        : {}),
      ...(config.functions
        ? {
            functions: maybeLoadFromExternalFile(
              renderVarsInObject(config.functions, context?.vars),
            ),
          }
        : {}),
      ...(config.function_call ? { function_call: config.function_call } : {}),
      ...(config.tools
        ? { tools: maybeLoadFromExternalFile(renderVarsInObject(config.tools, context?.vars)) }
        : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.tool_resources ? { tool_resources: config.tool_resources } : {}),
      ...(config.response_format
        ? {
            response_format: maybeLoadFromExternalFile(
              renderVarsInObject(config.response_format, context?.vars),
            ),
          }
        : {}),
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(config.stop ? { stop: config.stop } : {}),
      ...(config.passthrough || {}),
    };

    return { body, config };
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

    const { body, config } = this.getOpenAiBody(prompt, context, callApiOptions);
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
            ...config.headers,
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
      if (message.reasoning) {
        output = message.reasoning;
      } else if (message.content && (message.function_call || message.tool_calls)) {
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
      if (config.response_format?.type === 'json_schema' && typeof output === 'string') {
        try {
          output = JSON.parse(output);
        } catch (error) {
          logger.error(`Failed to parse JSON output: ${error}`);
        }
      }

      // Handle function tool callbacks
      const functionCalls = message.function_call ? [message.function_call] : message.tool_calls;
      if (functionCalls && config.functionToolCallbacks) {
        const results = [];
        for (const functionCall of functionCalls) {
          const functionName = functionCall.name || functionCall.function?.name;
          if (config.functionToolCallbacks[functionName]) {
            try {
              const functionResult = await config.functionToolCallbacks[functionName](
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
              config,
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
          config,
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
