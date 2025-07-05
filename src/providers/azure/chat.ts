import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt } from '../../envars';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import { maybeLoadToolsFromExternalFile, renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util/file';
import invariant from '../../util/invariant';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToOpenAi } from '../mcp/transform';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import { DEFAULT_AZURE_API_VERSION } from './defaults';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

export class AzureChatCompletionProvider extends AzureGenericProvider {
  private mcpClient: MCPClient | null = null;

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
    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

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

    logger.debug(`Azure API response: ${JSON.stringify(data)}`);
    try {
      if (data.error) {
        if (data.error.code === 'content_filter' && data.error.status === 400) {
          return {
            output: data.error.message,
            guardrails: {
              flagged: true,
              flaggedInput: true,
              flaggedOutput: false,
            },
          };
        }
        return {
          error: `API response error: ${data.error.code} ${data.error.message}`,
        };
      }
      const hasDataSources = !!config.dataSources;
      const choice = hasDataSources
        ? data.choices.find(
            (choice: { message: { role: string; content: string } }) =>
              choice.message.role === 'assistant',
          )
        : data.choices[0];

      const message = choice?.message;

      // Handle structured output
      let output = message.content;

      if (output == null) {
        if (choice.finish_reason === 'content_filter') {
          output =
            "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.";
        } else {
          // Restore tool_calls and function_call handling
          output = message.tool_calls ?? message.function_call;
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

      const logProbs = data.choices[0].logprobs?.content?.map(
        (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
      );

      const contentFilterResults = data.choices[0]?.content_filter_results;
      const promptFilterResults = data.prompt_filter_results;

      const guardrailsTriggered = !!(
        (contentFilterResults && Object.keys(contentFilterResults).length > 0) ||
        (promptFilterResults && promptFilterResults.length > 0)
      );

      const flaggedInput =
        promptFilterResults?.some((result: any) =>
          Object.values(result.content_filter_results).some((filter: any) => filter.filtered),
        ) ?? false;

      const flaggedOutput = Object.values(contentFilterResults || {}).some(
        (filter: any) => filter.filtered,
      );

      if (flaggedOutput) {
        logger.warn(
          `Azure model ${this.deploymentName} output was flagged by content filter: ${JSON.stringify(
            contentFilterResults,
          )}`,
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
        cost: calculateAzureCost(
          this.deploymentName,
          config,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
        ),
        ...(guardrailsTriggered
          ? {
              guardrails: {
                flaggedInput,
                flaggedOutput,
                flagged: flaggedInput || flaggedOutput,
              },
            }
          : {}),
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
