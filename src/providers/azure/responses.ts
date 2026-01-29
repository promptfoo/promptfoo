import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import {
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../util/index';
import invariant from '../../util/invariant';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { ResponsesProcessor } from '../responses/index';
import { LONG_RUNNING_MODEL_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from '../shared';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { ReasoningEffort } from '../openai/types';

// Azure Responses API uses the v1 preview API version
const AZURE_RESPONSES_API_VERSION = 'preview';

export class AzureResponsesProvider extends AzureGenericProvider {
  private functionCallbackHandler = new FunctionCallbackHandler();
  private processor: ResponsesProcessor;

  constructor(...args: ConstructorParameters<typeof AzureGenericProvider>) {
    super(...args);

    // Initialize the shared response processor
    this.processor = new ResponsesProcessor({
      modelName: this.deploymentName,
      providerType: 'azure',
      functionCallbackHandler: this.functionCallbackHandler,
      costCalculator: (modelName: string, usage: any, _config?: any) =>
        calculateAzureCost(modelName, usage) ?? 0,
    });

    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  private async initializeMCP(): Promise<void> {
    // TODO: Initialize MCP if needed
  }

  /**
   * Check if the current deployment is a reasoning model.
   * Reasoning models use max_completion_tokens instead of max_tokens,
   * don't support temperature, and accept reasoning_effort parameter.
   */
  isReasoningModel(): boolean {
    // Check explicit config flags first (match chat.ts behavior)
    if (this.config.isReasoningModel || this.config.o1) {
      return true;
    }

    const lowerName = this.deploymentName.toLowerCase();
    return (
      // OpenAI reasoning models
      lowerName.startsWith('o1') ||
      lowerName.includes('-o1') ||
      lowerName.startsWith('o3') ||
      lowerName.includes('-o3') ||
      lowerName.startsWith('o4') ||
      lowerName.includes('-o4') ||
      // GPT-5 series (reasoning by default)
      lowerName.startsWith('gpt-5') ||
      lowerName.includes('-gpt-5') ||
      // DeepSeek reasoning models
      lowerName.includes('deepseek-r1') ||
      lowerName.includes('deepseek_r1') ||
      // Microsoft Phi reasoning models
      lowerName.includes('phi-4-reasoning') ||
      lowerName.includes('phi-4-mini-reasoning') ||
      // xAI Grok reasoning models
      (lowerName.includes('grok') && lowerName.includes('reasoning'))
    );
  }

  supportsTemperature(): boolean {
    return !this.isReasoningModel();
  }

  async getAzureResponsesBody(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<Record<string, any>> {
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

    // Load response_format from external file if needed (handles nested schema loading)
    const responseFormat = maybeLoadResponseFormatFromExternalFile(
      config.response_format,
      context?.vars,
    );

    let textFormat;
    if (responseFormat) {
      if (responseFormat.type === 'json_object') {
        textFormat = {
          format: {
            type: 'json_object',
          },
        };
      } else if (responseFormat.type === 'json_schema') {
        // Schema is already loaded by maybeLoadResponseFormatFromExternalFile
        const schema = responseFormat.schema || responseFormat.json_schema?.schema;
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

    // Add verbosity for reasoning models if configured
    if (isReasoningModel && config.verbosity) {
      textFormat = { ...textFormat, verbosity: config.verbosity };
    }

    // Azure Responses API uses 'model' field for deployment name
    const body = {
      model: this.deploymentName,
      input,
      ...(maxOutputTokens !== undefined ? { max_output_tokens: maxOutputTokens } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(instructions ? { instructions } : {}),
      ...(config.top_p !== undefined || getEnvString('OPENAI_TOP_P')
        ? { top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1) }
        : {}),
      ...(config.tools
        ? { tools: await maybeLoadToolsFromExternalFile(config.tools, context?.vars) }
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

    logger.debug('Azure Responses API request body', { body });
    return body;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');

    // Improved error messages for common configuration issues
    if (!this.getApiBaseUrl()) {
      throw new Error(
        'Azure API configuration missing. Set AZURE_API_HOST environment variable or configure apiHost in provider config.\n' +
          'Example: AZURE_API_HOST=your-resource.openai.azure.com',
      );
    }
    if (!this.authHeaders['api-key'] && !this.authHeaders.Authorization) {
      throw new Error(
        'Azure API authentication failed. Set AZURE_API_KEY environment variable or configure apiKey in provider config.\n' +
          'You can also use Microsoft Entra ID authentication.',
      );
    }

    // Validate response_format for better UX
    if (
      this.config.response_format &&
      typeof this.config.response_format === 'string' &&
      (this.config.response_format as string).startsWith('file://')
    ) {
      try {
        // Validate that the file can be loaded (will throw if file doesn't exist)
        maybeLoadResponseFormatFromExternalFile(this.config.response_format, {});
      } catch (error) {
        throw new Error(
          `Failed to load response_format file: ${this.config.response_format}\n` +
            `Error: ${error instanceof Error ? error.message : String(error)}\n` +
            `Make sure the file exists and contains valid JSON schema format.`,
        );
      }
    }

    const body = await this.getAzureResponsesBody(prompt, context, callApiOptions);

    // Calculate timeout for deep research models
    const isDeepResearchModel = this.deploymentName.includes('deep-research');
    let timeout = REQUEST_TIMEOUT_MS;
    if (isDeepResearchModel) {
      const evalTimeout = getEnvInt('PROMPTFOO_EVAL_TIMEOUT_MS', 0);
      timeout = evalTimeout > 0 ? evalTimeout : LONG_RUNNING_MODEL_TIMEOUT_MS;
      logger.debug(`Using timeout of ${timeout}ms for deep research model ${this.deploymentName}`);
    }

    logger.debug('Calling Azure Responses API', { body });

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

    logger.debug('\tAzure Responses API response', { data });

    // Use the shared response processor for all response processing
    return this.processor.processResponseOutput(data, body, cached);
  }
}
