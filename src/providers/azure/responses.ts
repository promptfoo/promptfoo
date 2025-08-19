import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { renderVarsInObject, maybeLoadToolsFromExternalFile } from '../../util';
import { maybeLoadFromExternalFile } from '../../util/file';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { AzureGenericProvider } from './generic';
import { formatOpenAiError, getTokenUsage } from '../openai/util';
import { calculateAzureCost } from './util';
import invariant from '../../util/invariant';

import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { OpenAiCompletionOptions, ReasoningEffort } from '../openai/types';

// Azure Responses API uses the v1 preview API version
const AZURE_RESPONSES_API_VERSION = 'preview';

export class AzureResponsesProvider extends AzureGenericProvider {
  private functionCallbackHandler = new FunctionCallbackHandler();

  constructor(...args: ConstructorParameters<typeof AzureGenericProvider>) {
    super(...args);
    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  private async initializeMCP(): Promise<void> {
    // TODO: Initialize MCP if needed
  }

  isReasoningModel(): boolean {
    return (
      this.deploymentName.startsWith('o1') ||
      this.deploymentName.startsWith('o3') ||
      this.deploymentName.startsWith('o4') ||
      this.deploymentName.startsWith('gpt-5')
    );
  }

  supportsTemperature(): boolean {
    return !this.isReasoningModel();
  }

  getAzureResponsesBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Record<string, any> {
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    let input;
    try {
      const parsedJson = JSON.parse(prompt);
      if (Array.isArray(parsedJson)) {
        input = parsedJson;
      } else {
        input = prompt;
      }
    } catch {
      input = prompt;
    }

    const isReasoningModel = this.isReasoningModel();
    const maxOutputTokens =
      config.max_output_tokens ??
      (isReasoningModel
        ? getEnvInt('OPENAI_MAX_COMPLETION_TOKENS')
        : getEnvInt('OPENAI_MAX_TOKENS', 1024));

    const temperature = this.supportsTemperature()
      ? (config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0))
      : undefined;
    const reasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;

    const instructions = config.instructions;

    // Load response_format from external file if needed
    const responseFormat = config.response_format
      ? maybeLoadFromExternalFile(renderVarsInObject(config.response_format, context?.vars))
      : undefined;

    let textFormat;
    if (responseFormat) {
      if (responseFormat.type === 'json_object') {
        textFormat = {
          format: {
            type: 'json_object',
          },
        };
      } else if (responseFormat.type === 'json_schema') {
        const schema = maybeLoadFromExternalFile(
          renderVarsInObject(
            responseFormat.schema || responseFormat.json_schema?.schema,
            context?.vars,
          ),
        );

        const schemaName =
          responseFormat.json_schema?.name || responseFormat.name || 'response_schema';

        textFormat = {
          format: {
            type: 'json_schema',
            name: schemaName,
            schema,
            strict: true,
          },
        };
      } else {
        textFormat = { format: { type: 'text' } };
      }
    } else {
      textFormat = { format: { type: 'text' } };
    }

    // Azure Responses API uses 'model' field for deployment name
    const body = {
      model: this.deploymentName,
      input,
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(instructions ? { instructions } : {}),
      ...(config.top_p !== undefined || getEnvString('OPENAI_TOP_P')
        ? { top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1) }
        : {}),
      ...(config.tools
        ? { tools: maybeLoadToolsFromExternalFile(config.tools, context?.vars) }
        : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.max_tool_calls ? { max_tool_calls: config.max_tool_calls } : {}),
      ...(config.previous_response_id ? { previous_response_id: config.previous_response_id } : {}),
      text: textFormat,
      ...(config.truncation ? { truncation: config.truncation } : {}),
      ...(config.metadata ? { metadata: config.metadata } : {}),
      ...('parallel_tool_calls' in config
        ? { parallel_tool_calls: Boolean(config.parallel_tool_calls) }
        : {}),
      ...(config.stream ? { stream: config.stream } : {}),
      ...('store' in config ? { store: Boolean(config.store) } : {}),
      ...(config.passthrough || {}),
    };

    logger.debug(`Azure Responses API request body: ${JSON.stringify(body)}`);
    return body;
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

    const body = this.getAzureResponsesBody(prompt, context, callApiOptions);

    // Calculate timeout for deep research models
    const isDeepResearchModel = this.deploymentName.includes('deep-research');
    let timeout = REQUEST_TIMEOUT_MS;
    if (isDeepResearchModel) {
      const evalTimeout = getEnvInt('PROMPTFOO_EVAL_TIMEOUT_MS', 0);
      if (evalTimeout > 0) {
        timeout = evalTimeout;
      } else {
        timeout = 600_000; // 10 minutes default for deep research
      }
      logger.debug(`Using timeout of ${timeout}ms for deep research model ${this.deploymentName}`);
    }

    logger.debug(`Calling Azure Responses API: ${JSON.stringify(body)}`);
    
    let data, status, statusText;
    let cached = false;
    try {
      // Azure Responses API URL format - note NO deployment name in URL
      const url = `${this.getApiBaseUrl()}/openai/v1/responses?api-version=${
        this.config.apiVersion || AZURE_RESPONSES_API_VERSION
      }`;

      ({ data, cached, status, statusText } = await fetchWithCache(
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
        timeout,
        'json',
        context?.bustCache ?? context?.debug,
      ));

      if (status < 200 || status >= 300) {
        return {
          error: `API error: ${status} ${statusText}\n${
            typeof data === 'string' ? data : JSON.stringify(data)
          }`,
        };
      }
    } catch (err) {
      logger.error(`API call error: ${String(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tAzure Responses API response: ${JSON.stringify(data)}`);
    if (data.error) {
      return {
        error: formatOpenAiError(data),
      };
    }

    try {
      // Find the assistant message in the output
      const output = data.output;

      // Log the structure for debugging
      if (isDeepResearchModel && output) {
        logger.debug(`Deep research response output structure: ${JSON.stringify(output)}`);
      }

      // Handle cases where output might be an array of messages or a single message
      let assistantMessage;
      if (Array.isArray(output)) {
        assistantMessage = output.find((msg: any) => msg.role === 'assistant');
      } else if (output && typeof output === 'object') {
        assistantMessage = output;
      }

      // Extract the text content
      let assistantText = '';
      if (assistantMessage?.content) {
        if (Array.isArray(assistantMessage.content)) {
          assistantText = assistantMessage.content
            .filter((item: any) => item.type === 'output_text' || item.type === 'text')
            .map((item: any) => item.text || item.output_text || '')
            .join('');
        } else if (typeof assistantMessage.content === 'string') {
          assistantText = assistantMessage.content;
        }
      } else if (data.output_text) {
        // Some responses have output_text at the root level
        assistantText = data.output_text;
      } else if (typeof assistantMessage === 'string') {
        assistantText = assistantMessage;
      }

      const usage = data.usage || {};
      const cost = calculateAzureCost(this.deploymentName, usage);

      return {
        output: assistantText,
        tokenUsage: getTokenUsage(usage, cached),
        cached,
        cost,
      };
    } catch (err) {
      return {
        error: `Error parsing response: ${String(err)}\nResponse: ${JSON.stringify(data)}`,
      };
    }
  }
}
