import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt } from '../../envars';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile, renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util/file';
import { FINISH_REASON_MAP, normalizeFinishReason } from '../../util/finishReason';
import invariant from '../../util/invariant';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToOpenAi } from '../mcp/transform';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import { DEFAULT_AZURE_API_VERSION } from './defaults';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';

export class AzureChatCompletionProvider extends AzureGenericProvider {
  private mcpClient: MCPClient | null = null;
  private functionCallbackHandler = new FunctionCallbackHandler();

  constructor(...args: ConstructorParameters<typeof AzureGenericProvider>) {
    super(...args);
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
   * Check if the current deployment is configured as a reasoning model
   */
  protected isReasoningModel(): boolean {
    return !!this.config.isReasoningModel || !!this.config.o1;
  }

  getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Record<string, any> {
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Parse chat prompt
    let messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    // Inject system prompt if configured
    if (config.systemPrompt) {
      // Check if there's already a system message
      const existingSystemMessageIndex = messages.findIndex((msg: any) => msg.role === 'system');

      if (existingSystemMessageIndex >= 0) {
        // Replace existing system message
        messages[existingSystemMessageIndex] = {
          role: 'system',
          content: config.systemPrompt,
        };
      } else {
        // Prepend new system message
        messages = [
          {
            role: 'system',
            content: config.systemPrompt,
          },
          ...messages,
        ];
      }
    }

    // Response format with variable rendering
    const responseFormat = config.response_format
      ? {
          response_format: maybeLoadFromExternalFile(
            renderVarsInObject(config.response_format, context?.vars),
          ),
        }
      : {};

    // Check if this is configured as a reasoning model
    const isReasoningModel = this.isReasoningModel();

    // Get max tokens based on model type
    const maxTokens = config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024);
    const maxCompletionTokens = config.max_completion_tokens;

    // Get reasoning effort for reasoning models
    const reasoningEffort = config.reasoning_effort ?? 'medium';

    // --- MCP tool injection logic ---
    const mcpTools = this.mcpClient ? transformMCPToolsToOpenAi(this.mcpClient.getAllTools()) : [];
    const fileTools = config.tools
      ? maybeLoadToolsFromExternalFile(config.tools, context?.vars) || []
      : [];
    const allTools = [...mcpTools, ...fileTools];
    // --- End MCP tool injection logic ---

    // Build the request body
    const body = {
      model: this.deploymentName,
      messages,
      ...(isReasoningModel
        ? {
            max_completion_tokens: maxCompletionTokens ?? maxTokens,
            reasoning_effort: renderVarsInObject(reasoningEffort, context?.vars),
          }
        : {
            max_tokens: maxTokens,
            temperature: config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0),
          }),
      top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1),
      presence_penalty: config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
      frequency_penalty: config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
      ...(config.seed === undefined ? {} : { seed: config.seed }),
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
      ...(config.deployment_id ? { deployment_id: config.deployment_id } : {}),
      ...(config.dataSources ? { dataSources: config.dataSources } : {}),
      ...responseFormat,
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(config.stop ? { stop: config.stop } : {}),
      ...(config.passthrough || {}),
    };

    logger.debug(`Azure API request body: ${JSON.stringify(body)}`);
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
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');

    if (!this.getApiBaseUrl()) {
      throw new Error('Azure API host must be set.');
    }

    const { body, config } = this.getOpenAiBody(prompt, context, callApiOptions);

    let data;
    let cached = false;
    let httpStatus: number;
    try {
      const url = config.dataSources
        ? `${this.getApiBaseUrl()}/openai/deployments/${
            this.deploymentName
          }/extensions/chat/completions?api-version=${config.apiVersion || DEFAULT_AZURE_API_VERSION}`
        : `${this.getApiBaseUrl()}/openai/deployments/${
            this.deploymentName
          }/chat/completions?api-version=${config.apiVersion || DEFAULT_AZURE_API_VERSION}`;

      const {
        data: responseData,
        cached: isCached,
        status,
      } = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
            ...this.config.headers,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
        context?.bustCache ?? context?.debug,
      );

      cached = isCached;
      httpStatus = status;

      // Handle the response data
      if (typeof responseData === 'string') {
        try {
          data = JSON.parse(responseData);
        } catch {
          return {
            error: `API returned invalid JSON response (status ${status}): ${responseData}\n\nRequest body: ${JSON.stringify(body, null, 2)}`,
          };
        }
      } else {
        data = responseData;
      }
    } catch (err) {
      return {
        error: `API call error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    logger.debug(`Azure API response (status ${httpStatus}): ${JSON.stringify(data)}`);

    // Inputs and outputs can be flagged by content filters.
    // See https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/content-filter
    let flaggedInput = false;
    let flaggedOutput = false;
    let output = '';
    let logProbs: any;
    let finishReason: string;

    try {
      if (data.error) {
        // Was the input prompt deemed inappropriate?
        if (data.error.status === 400 && data.error.code === FINISH_REASON_MAP.content_filter) {
          flaggedInput = true;
          output = data.error.message;
          finishReason = FINISH_REASON_MAP.content_filter;
        } else {
          return {
            error: `API response error: ${data.error.code} ${data.error.message}`,
          };
        }
      } else {
        const hasDataSources = !!config.dataSources;
        const choice = hasDataSources
          ? data.choices.find(
              (choice: { message: { role: string; content: string } }) =>
                choice.message.role === 'assistant',
            )
          : data.choices[0];

        const message = choice?.message;

        // NOTE: The `n` parameter is currently (250709) not supported; if and when it is, `finish_reason` must be
        // checked on all choices; in other words, if n>1 responses are requested, n>1 responses can trigger filters.
        finishReason = normalizeFinishReason(choice?.finish_reason) as string;

        // Handle structured output
        output = message?.content;

        // Check for errors indicating that the content filters did not run on the completion.
        if (choice.content_filter_results && choice.content_filter_results.error) {
          const { code, message } = choice.content_filter_results.error;
          logger.warn(
            `Content filtering system is down or otherwise unable to complete the request in time: ${code} ${message}`,
          );
        } else {
          // Was the completion filtered?
          flaggedOutput = finishReason === FINISH_REASON_MAP.content_filter;
        }

        if (output == null) {
          // Handle tool_calls and function_call
          const toolCalls = message.tool_calls;
          const functionCall = message.function_call;

          // Process function/tool calls if callbacks are configured
          if (config.functionToolCallbacks && (toolCalls || functionCall)) {
            // Combine all calls into a single array for processing
            const allCalls = [];
            if (toolCalls) {
              allCalls.push(...(Array.isArray(toolCalls) ? toolCalls : [toolCalls]));
            }
            if (functionCall) {
              allCalls.push(functionCall);
            }

            output = await this.functionCallbackHandler.processCalls(
              allCalls.length === 1 ? allCalls[0] : allCalls,
              config.functionToolCallbacks,
            );
          } else {
            // No callbacks configured, return raw tool/function calls
            output = toolCalls ?? functionCall;
          }
        } else if (
          config.response_format?.type === 'json_schema' ||
          config.response_format?.type === 'json_object'
        ) {
          try {
            output = JSON.parse(output);
          } catch (err) {
            logger.error(`Failed to parse JSON output: ${err}. Output was: ${output}`);
          }
        }

        logProbs = data.choices[0].logprobs?.content?.map(
          (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
        );
      }

      return {
        output,
        tokenUsage: cached
          ? { cached: data.usage?.total_tokens, total: data?.usage?.total_tokens }
          : {
              total: data.usage?.total_tokens,
              prompt: data.usage?.prompt_tokens,
              completion: data.usage?.completion_tokens,
              ...(data.usage?.completion_tokens_details
                ? {
                    completionDetails: {
                      reasoning: data.usage.completion_tokens_details.reasoning_tokens,
                      acceptedPrediction:
                        data.usage.completion_tokens_details.accepted_prediction_tokens,
                      rejectedPrediction:
                        data.usage.completion_tokens_details.rejected_prediction_tokens,
                    },
                  }
                : {}),
            },
        cached,
        logProbs,
        finishReason,
        cost: calculateAzureCost(
          this.deploymentName,
          config,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
        ),
        guardrails: {
          flagged: flaggedInput || flaggedOutput,
          flaggedInput,
          flaggedOutput,
        },
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
