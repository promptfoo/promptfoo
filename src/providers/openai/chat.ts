import { OpenAiGenericProvider } from '.';
import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { maybeLoadToolsFromExternalFile, renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util/file';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToOpenAi } from '../mcp/transform';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from '../shared';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';
import { calculateOpenAICost } from './util';
import { formatOpenAiError, getTokenUsage, OPENAI_CHAT_MODELS } from './util';

export class OpenAiChatCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_CHAT_MODELS = OPENAI_CHAT_MODELS;

  static OPENAI_CHAT_MODEL_NAMES = OPENAI_CHAT_MODELS.map((model) => model.id);

  config: OpenAiCompletionOptions;
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!OpenAiChatCompletionProvider.OPENAI_CHAT_MODEL_NAMES.includes(modelName)) {
      logger.debug(`Using unknown chat model: ${modelName}`);
    }
    super(modelName, options);
    this.config = options.config || {};

    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  private async initializeMCP(): Promise<void> {
    this.mcpClient = new MCPClient(this.config.mcp!);
    await this.mcpClient.initialize();
  }

  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      await this.initializationPromise;
      await this.mcpClient.cleanup();
      this.mcpClient = null;
    }
  }

  protected isReasoningModel(): boolean {
    return (
      this.modelName.startsWith('o1') ||
      this.modelName.startsWith('o3') ||
      this.modelName.startsWith('o4')
    );
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
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;

    // --- MCP tool injection logic ---
    const mcpTools = this.mcpClient ? transformMCPToolsToOpenAi(this.mcpClient.getAllTools()) : [];
    const fileTools = config.tools
      ? maybeLoadToolsFromExternalFile(config.tools, context?.vars) || []
      : [];
    const allTools = [...mcpTools, ...fileTools];
    // --- End MCP tool injection logic ---

    const body = {
      model: this.modelName,
      messages,
      seed: config.seed,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(maxCompletionTokens ? { max_completion_tokens: maxCompletionTokens } : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(temperature ? { temperature } : {}),
      ...(config.top_p !== undefined || getEnvString('OPENAI_TOP_P')
        ? { top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1) }
        : {}),
      ...(config.presence_penalty !== undefined || getEnvString('OPENAI_PRESENCE_PENALTY')
        ? {
            presence_penalty: config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
          }
        : {}),
      ...(config.frequency_penalty !== undefined || getEnvString('OPENAI_FREQUENCY_PENALTY')
        ? {
            frequency_penalty:
              config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
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
      ...(allTools.length > 0 ? { tools: allTools } : {}),
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
      ...(this.modelName.includes('audio')
        ? {
            modalities: config.modalities || ['text', 'audio'],
            audio: config.audio || { voice: 'alloy', format: 'wav' },
          }
        : {}),
    };

    return { body, config };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(
        `API key is not set. Set the ${this.config.apiKeyEnvar || 'OPENAI_API_KEY'} environment variable or add \`apiKey\` to the provider config.`,
      );
    }

    const { body, config } = this.getOpenAiBody(prompt, context, callApiOptions);
    logger.debug(`Calling ${this.getApiUrl()} API: ${JSON.stringify(body)}`);

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
      await data?.deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tcompletions API response: ${JSON.stringify(data)}`);
    if (data.error) {
      await data.deleteFromCache?.();
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
        } else {
          output = message;
        }
      } else if (
        message.content === null ||
        message.content === undefined ||
        (message.content === '' && message.tool_calls)
      ) {
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
              data.usage?.audio_prompt_tokens,
              data.usage?.audio_completion_tokens,
            ),
          };
        }
      }

      // Handle DeepSeek reasoning model's reasoning_content by prepending it to the output
      if (
        message.reasoning_content &&
        typeof message.reasoning_content === 'string' &&
        typeof output === 'string' &&
        (this.config.showThinking ?? true)
      ) {
        output = `Thinking: ${message.reasoning_content}\n\n${output}`;
      }
      if (message.audio) {
        return {
          output: message.audio.transcript || '',
          audio: {
            id: message.audio.id,
            expiresAt: message.audio.expires_at,
            data: message.audio.data,
            transcript: message.audio.transcript,
            format: message.audio.format || 'wav',
          },
          tokenUsage: getTokenUsage(data, cached),
          cached,
          logProbs,
          cost: calculateOpenAICost(
            this.modelName,
            config,
            data.usage?.prompt_tokens,
            data.usage?.completion_tokens,
            data.usage?.audio_prompt_tokens,
            data.usage?.audio_completion_tokens,
          ),
        };
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
          data.usage?.audio_prompt_tokens,
          data.usage?.audio_completion_tokens,
        ),
      };
    } catch (err) {
      await data?.deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
