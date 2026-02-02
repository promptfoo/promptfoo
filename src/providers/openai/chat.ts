import path from 'path';

import { fetchWithCache } from '../../cache';
import cliState from '../../cliState';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { isJavascriptFile } from '../../util/fileExtensions';
import { FINISH_REASON_MAP, normalizeFinishReason } from '../../util/finishReason';
import {
  maybeLoadFromExternalFileWithVars,
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../util/index';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToOpenAi } from '../mcp/transform';
import { parseChatPrompt, REQUEST_TIMEOUT_MS, transformToolChoice } from '../shared';
import { OpenAiGenericProvider } from './';
import { calculateOpenAICost, getTokenUsage, OPENAI_CHAT_MODELS } from './util';
import type OpenAI from 'openai';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';

export class OpenAiChatCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_CHAT_MODELS = OPENAI_CHAT_MODELS;

  static OPENAI_CHAT_MODEL_NAMES = OPENAI_CHAT_MODELS.map((model) => model.id);

  config: OpenAiCompletionOptions;
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private loadedFunctionCallbacks: Record<string, Function> = {};

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

  /**
   * Loads a function from an external file
   * @param fileRef The file reference in the format 'file://path/to/file:functionName'
   * @returns The loaded function
   */
  private async loadExternalFunction(fileRef: string): Promise<Function> {
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

    if (filePath.includes(':')) {
      const splits = filePath.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filePath, functionName] = splits;
      }
    }

    try {
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      logger.debug(
        `Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
      );

      const requiredModule = await importModule(resolvedPath, functionName);

      if (typeof requiredModule === 'function') {
        return requiredModule;
      } else if (
        requiredModule &&
        typeof requiredModule === 'object' &&
        functionName &&
        functionName in requiredModule
      ) {
        const fn = requiredModule[functionName];
        if (typeof fn === 'function') {
          return fn;
        }
      }

      throw new Error(
        `Function callback malformed: ${filePath} must export ${
          functionName
            ? `a named function '${functionName}'`
            : 'a function or have a default export as a function'
        }`,
      );
    } catch (error: any) {
      throw new Error(`Error loading function from ${filePath}: ${error.message || String(error)}`);
    }
  }

  /**
   * Executes a function callback with proper error handling
   */
  private async executeFunctionCallback(
    functionName: string,
    args: string,
    config: OpenAiCompletionOptions,
  ): Promise<string> {
    try {
      // Check if we've already loaded this function
      let callback = this.loadedFunctionCallbacks[functionName];

      // If not loaded yet, try to load it now
      if (!callback) {
        const callbackRef = config.functionToolCallbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          // Cache for future use
          this.loadedFunctionCallbacks[functionName] = callback;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedFunctionCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute the callback
      logger.debug(`Executing function '${functionName}' with args: ${args}`);
      const result = await callback(args);

      // Format the result
      if (result === undefined || result === null) {
        return '';
      } else if (typeof result === 'object') {
        try {
          return JSON.stringify(result);
        } catch (error) {
          logger.warn(`Error stringifying result from function '${functionName}': ${error}`);
          return String(result);
        }
      } else {
        return String(result);
      }
    } catch (error: any) {
      logger.error(`Error executing function '${functionName}': ${error.message || String(error)}`);
      throw error; // Re-throw so caller can handle fallback behavior
    }
  }

  protected isGPT5Model(): boolean {
    // Handle both direct model names (gpt-5-mini) and prefixed names (openai/gpt-5-mini)
    return this.modelName.startsWith('gpt-5') || this.modelName.includes('/gpt-5');
  }

  protected isReasoningModel(): boolean {
    return (
      this.modelName.startsWith('o1') ||
      this.modelName.startsWith('o3') ||
      this.modelName.startsWith('o4') ||
      this.modelName.includes('/o1') ||
      this.modelName.includes('/o3') ||
      this.modelName.includes('/o4') ||
      this.isGPT5Model()
    );
  }

  protected supportsTemperature(): boolean {
    // OpenAI's o1 and o3 models don't support temperature but some 3rd
    // party reasoning models do.
    return !this.isReasoningModel();
  }

  async getOpenAiBody(
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
    const isGPT5Model = this.isGPT5Model();
    const maxCompletionTokens = isReasoningModel
      ? (config.max_completion_tokens ?? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS'))
      : undefined;
    const maxTokens =
      isReasoningModel || isGPT5Model
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
      ? (await maybeLoadToolsFromExternalFile(config.tools, context?.vars)) || []
      : [];
    const allTools = [...mcpTools, ...fileTools];
    // --- End MCP tool injection logic ---

    const body = {
      model: this.modelName,
      messages,
      seed: config.seed,
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      ...(maxCompletionTokens !== undefined ? { max_completion_tokens: maxCompletionTokens } : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
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
            functions: maybeLoadFromExternalFileWithVars(config.functions, context?.vars),
          }
        : {}),
      ...(config.function_call ? { function_call: config.function_call } : {}),
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      ...(config.tool_choice ? { tool_choice: transformToolChoice(config.tool_choice, 'openai') } : {}),
      ...(config.tool_resources ? { tool_resources: config.tool_resources } : {}),
      ...(config.response_format
        ? {
            response_format: maybeLoadResponseFormatFromExternalFile(
              config.response_format,
              context?.vars,
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
      // GPT-5 only: attach verbosity if provided
      ...(isGPT5Model && config.verbosity ? { verbosity: config.verbosity } : {}),
    };

    // Handle reasoning_effort and reasoning parameters for reasoning models
    if (config.reasoning_effort && (isReasoningModel || this.modelName.includes('gpt-oss'))) {
      body.reasoning_effort = config.reasoning_effort;
    }

    if (
      config.reasoning &&
      (this.modelName.startsWith('o1') ||
        this.modelName.startsWith('o3') ||
        this.modelName.startsWith('o4') ||
        this.modelName.includes('/o1') ||
        this.modelName.includes('/o3') ||
        this.modelName.includes('/o4'))
    ) {
      body.reasoning = config.reasoning;
    }

    // Add other basic parameters
    if (config.service_tier) {
      body.service_tier = config.service_tier;
    }
    if (config.user) {
      body.user = config.user;
    }
    if (config.metadata) {
      body.metadata = config.metadata;
    }
    if (config.store !== undefined) {
      body.store = config.store;
    }

    return { body, config };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(
        `API key is not set. Set the ${this.config.apiKeyEnvar || 'OPENAI_API_KEY'} environment variable or add \`apiKey\` to the provider config.`,
      );
    }

    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'openai',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      // Optional request parameters
      maxTokens: this.config.max_tokens,
      temperature: this.config.temperature,
      topP: this.config.top_p,
      stopSequences: this.config.stop,
      // Promptfoo context from test case if available
      evalId: context?.evaluationId || context?.test?.metadata?.evaluationId,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
      // Request body for debugging/observability
      requestBody: prompt,
    };

    // Result extractor to set response attributes on the span
    const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
      const result: GenAISpanResult = {};

      if (response.tokenUsage) {
        result.tokenUsage = {
          prompt: response.tokenUsage.prompt,
          completion: response.tokenUsage.completion,
          total: response.tokenUsage.total,
          cached: response.tokenUsage.cached,
          completionDetails: {
            reasoning: response.tokenUsage.completionDetails?.reasoning,
            acceptedPrediction: response.tokenUsage.completionDetails?.acceptedPrediction,
            rejectedPrediction: response.tokenUsage.completionDetails?.rejectedPrediction,
          },
        };
      }

      // Extract finish reason if available
      if (response.finishReason) {
        result.finishReasons = [response.finishReason];
      }

      // Cache hit status
      if (response.cached !== undefined) {
        result.cacheHit = response.cached;
      }

      // Response body for debugging/observability
      if (response.output !== undefined) {
        result.responseBody =
          typeof response.output === 'string' ? response.output : JSON.stringify(response.output);
      }

      return result;
    };

    // Wrap the API call in a span
    return withGenAISpan(
      spanContext,
      () => this.callApiInternal(prompt, context, callApiOptions),
      resultExtractor,
    );
  }

  /**
   * Internal implementation of callApi without tracing wrapper.
   * This is called by callApi after setting up the tracing span.
   */
  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);

    type OpenAIChatCompletionResponse = OpenAI.ChatCompletion & {
      choices: Array<
        OpenAI.ChatCompletion.Choice & {
          message: OpenAI.ChatCompletion.Choice['message'] & {
            reasoning?: string;
            reasoning_content?: string;
            audio?: {
              id: string;
              expires_at: number;
              data: string;
              transcript: string;
              format?: string;
            };
          };
        }
      >;
      usage?: OpenAI.ChatCompletion['usage'] & {
        audio_prompt_tokens?: number;
        audio_completion_tokens?: number;
      };
      error?: {
        code?: string;
        message?: string;
      };
    };

    let data: OpenAIChatCompletionResponse;
    let status: number;
    let statusText: string;
    let cached = false;
    let latencyMs: number | undefined;
    let deleteFromCache: (() => Promise<void>) | undefined;
    let responseHeaders: Record<string, string> | undefined;
    try {
      ({
        data,
        cached,
        status,
        statusText,
        latencyMs,
        deleteFromCache,
        headers: responseHeaders,
      } = await fetchWithCache<OpenAIChatCompletionResponse>(
        `${this.getApiUrl()}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.getApiKey() ? { Authorization: `Bearer ${this.getApiKey()}` } : {}),
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
            ...config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        context?.bustCache ?? context?.debug,
        this.config.maxRetries,
      ));

      if (status < 200 || status >= 300) {
        const errorMessage = `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`;

        // Check if this is an invalid_prompt error code (indicates refusal)
        if (typeof data === 'object' && data?.error?.code === 'invalid_prompt') {
          return {
            output: errorMessage,
            tokenUsage: data?.usage ? getTokenUsage(data, cached) : undefined,
            latencyMs,
            isRefusal: true,
            guardrails: {
              flagged: true,
              flaggedInput: true, // This error specifically indicates input was rejected
            },
            metadata: {
              http: {
                status,
                statusText,
                headers: responseHeaders ?? {},
              },
            },
          };
        }

        return {
          error: errorMessage,
          metadata: {
            http: {
              status,
              statusText,
              headers: responseHeaders ?? {},
            },
          },
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      await deleteFromCache?.();
      return {
        error: `API call error: ${String(err)}`,
        metadata: {
          http: {
            status: 0,
            statusText: 'Error',
            headers: responseHeaders ?? {},
          },
        },
      };
    }

    try {
      const message = data.choices[0].message;
      const finishReason = normalizeFinishReason(data.choices[0].finish_reason);

      // Track content filtering for guardrails
      const contentFiltered = finishReason === FINISH_REASON_MAP.content_filter;

      if (message.refusal) {
        return {
          output: message.refusal,
          tokenUsage: getTokenUsage(data, cached),
          cached,
          latencyMs,
          isRefusal: true,
          ...(finishReason && { finishReason }),
          guardrails: { flagged: true }, // Refusal is ALWAYS a guardrail violation
          metadata: {
            http: {
              status,
              statusText,
              headers: responseHeaders ?? {},
            },
          },
        };
      }

      // Check if content was filtered
      if (contentFiltered) {
        return {
          output: message.content || 'Content filtered by provider',
          tokenUsage: getTokenUsage(data, cached),
          cached,
          latencyMs,
          isRefusal: true,
          finishReason: FINISH_REASON_MAP.content_filter,
          guardrails: {
            flagged: true,
          },
          metadata: {
            http: {
              status,
              statusText,
              headers: responseHeaders ?? {},
            },
          },
        };
      }

      let reasoning = '';
      let output: any = '';
      if (message.reasoning) {
        reasoning = message.reasoning;
        output = message.content;
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
      // Handle reasoning as thinking content if present and showThinking is enabled
      if (reasoning && (this.config.showThinking ?? true)) {
        output = `Thinking: ${reasoning}\n\n${output}`;
      }

      // Handle function tool callbacks
      const functionCalls: any = message.function_call
        ? [message.function_call]
        : message.tool_calls;
      if (functionCalls && (config.functionToolCallbacks || this.mcpClient)) {
        const results = [];
        let hasSuccessfulCallback = false;
        for (const functionCall of functionCalls) {
          const functionName = functionCall.name || functionCall.function?.name;

          // Try MCP first if available
          if (this.mcpClient) {
            const mcpTools = this.mcpClient.getAllTools();
            const mcpTool = mcpTools.find((tool) => tool.name === functionName);
            if (mcpTool) {
              try {
                const args = functionCall.arguments || functionCall.function?.arguments || '{}';
                const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
                const mcpResult = await this.mcpClient.callTool(functionName, parsedArgs);

                if (mcpResult?.error) {
                  results.push(`MCP Tool Error (${functionName}): ${mcpResult.error}`);
                } else {
                  // Normalize MCP content to a readable string
                  const normalizeContent = (content: any): string => {
                    if (content == null) {
                      return '';
                    }
                    if (typeof content === 'string') {
                      return content;
                    }
                    if (Array.isArray(content)) {
                      return content
                        .map((part) => {
                          if (typeof part === 'string') {
                            return part;
                          }
                          if (part && typeof part === 'object') {
                            if ('text' in part && (part as any).text != null) {
                              return String((part as any).text);
                            }
                            if ('json' in part) {
                              return JSON.stringify((part as any).json);
                            }
                            if ('data' in part) {
                              return JSON.stringify((part as any).data);
                            }
                            return JSON.stringify(part);
                          }
                          return String(part);
                        })
                        .join('\n');
                    }
                    return JSON.stringify(content);
                  };

                  const content = normalizeContent(mcpResult?.content);
                  results.push(`MCP Tool Result (${functionName}): ${content}`);
                }
                hasSuccessfulCallback = true;
                continue; // Skip to next function call
              } catch (error) {
                logger.debug(`MCP tool execution failed for ${functionName}: ${error}`);
                results.push(`MCP Tool Error (${functionName}): ${error}`);
                hasSuccessfulCallback = true;
                continue; // Skip to next function call
              }
            }
          }

          // Fall back to regular function callbacks
          if (config.functionToolCallbacks && config.functionToolCallbacks[functionName]) {
            try {
              const functionResult = await this.executeFunctionCallback(
                functionName,
                functionCall.arguments || functionCall.function?.arguments,
                config,
              );
              results.push(functionResult);
              hasSuccessfulCallback = true;
            } catch (error) {
              // If callback fails, fall back to original behavior (return the function call)
              logger.debug(
                `Function callback failed for ${functionName} with error ${error}, falling back to original output`,
              );
              hasSuccessfulCallback = false;
              break;
            }
          }
        }
        if (hasSuccessfulCallback && results.length > 0) {
          return {
            output: results.join('\n'),
            tokenUsage: getTokenUsage(data, cached),
            cached,
            latencyMs,
            logProbs,
            ...(finishReason && { finishReason }),
            cost: calculateOpenAICost(
              this.modelName,
              config,
              data.usage?.prompt_tokens,
              data.usage?.completion_tokens,
              data.usage?.audio_prompt_tokens,
              data.usage?.audio_completion_tokens,
            ),
            guardrails: { flagged: contentFiltered },
            metadata: {
              http: {
                status,
                statusText,
                headers: responseHeaders ?? {},
              },
            },
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
          latencyMs,
          logProbs,
          ...(finishReason && { finishReason }),
          cost: calculateOpenAICost(
            this.modelName,
            config,
            data.usage?.prompt_tokens,
            data.usage?.completion_tokens,
            data.usage?.audio_prompt_tokens,
            data.usage?.audio_completion_tokens,
          ),
          guardrails: { flagged: contentFiltered },
          metadata: {
            http: {
              status,
              statusText,
              headers: responseHeaders ?? {},
            },
          },
        };
      }

      return {
        output,
        tokenUsage: getTokenUsage(data, cached),
        cached,
        latencyMs,
        logProbs,
        ...(finishReason && { finishReason }),
        cost: calculateOpenAICost(
          this.modelName,
          config,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
          data.usage?.audio_prompt_tokens,
          data.usage?.audio_completion_tokens,
        ),
        guardrails: { flagged: contentFiltered },
        metadata: {
          http: {
            status,
            statusText,
            headers: responseHeaders ?? {},
          },
        },
      };
    } catch (err) {
      await deleteFromCache?.();
      return {
        error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
        metadata: {
          http: {
            status,
            statusText,
            headers: responseHeaders ?? {},
          },
        },
      };
    }
  }
}
