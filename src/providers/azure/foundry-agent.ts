import path from 'path';

import { getCache, isCacheEnabled } from '../../cache';
import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { isJavascriptFile } from '../../util/fileExtensions';
import {
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../util/index';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { ResponsesProcessor } from '../responses/index';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';
import type { Agent, AIProjectClient as AzureAIProjectClient } from '@azure/ai-projects';
import type {
  Response as OpenAIResponse,
  ResponseCreateParamsNonStreaming,
  ResponseFunctionToolCall,
  ResponseFunctionToolCallOutputItem,
} from 'openai/resources/responses/responses';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { CallbackContext, ReasoningEffort } from '../openai/types';
import type { AzureAssistantOptions, AzureAssistantProviderOptions } from './types';

type FoundryAgent = Agent;
type FoundryResponse = OpenAIResponse;
type ResponseFunctionCallItem = ResponseFunctionToolCall;
type EffectiveFoundryConfig = AzureAssistantOptions & Record<string, any>;
type FunctionToolCallbacks = AzureAssistantOptions['functionToolCallbacks'];

interface AgentReferenceOption {
  name: string;
  type: 'agent_reference';
}

interface FoundryResponseCreateOptions {
  body?: {
    agent?: AgentReferenceOption;
  };
}

export class AzureFoundryAgentProvider extends AzureGenericProvider {
  assistantConfig: AzureAssistantOptions;
  private loadedFunctionCallbacks: Record<string, Function> = {};
  private processor: ResponsesProcessor;
  private projectClient: AzureAIProjectClient | null = null;
  private projectUrl: string;
  private resolvedAgent: FoundryAgent | null = null;
  private warnedUnsupportedFields = new Set<string>();

  constructor(deploymentName: string, options: AzureAssistantProviderOptions = {}) {
    super(deploymentName, options);
    this.assistantConfig = options.config || {};
    this.projectUrl = options.config?.projectUrl || process.env.AZURE_AI_PROJECT_URL || '';

    if (!this.projectUrl) {
      throw new Error(
        'Azure AI Project URL must be provided via projectUrl option or AZURE_AI_PROJECT_URL environment variable',
      );
    }

    this.processor = new ResponsesProcessor({
      modelName: this.assistantConfig.modelName || deploymentName,
      providerType: 'azure',
      functionCallbackHandler: new FunctionCallbackHandler(),
      costCalculator: (_modelName: string, usage: any, requestConfig?: any) =>
        calculateAzureCost(
          requestConfig?.model || this.assistantConfig.modelName || this.deploymentName,
          usage,
        ) ?? 0,
    });

    if (this.assistantConfig.functionToolCallbacks) {
      void this.preloadFunctionCallbacks();
    }
  }

  private async initializeClient(): Promise<AzureAIProjectClient> {
    if (this.projectClient) {
      return this.projectClient;
    }

    try {
      const { AIProjectClient } = await import('@azure/ai-projects');
      const { DefaultAzureCredential } = await import('@azure/identity');

      const projectClient = new AIProjectClient(
        this.projectUrl,
        new DefaultAzureCredential(),
      ) as AzureAIProjectClient;
      this.projectClient = projectClient;
      logger.debug('Azure AI Project client initialized successfully');
      return projectClient;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize Azure AI Project client: ${errorMessage}`);
      throw new Error(`Failed to initialize Azure AI Project client: ${errorMessage}`);
    }
  }

  private async resolveAgent(client: AzureAIProjectClient): Promise<FoundryAgent> {
    if (this.resolvedAgent) {
      return this.resolvedAgent;
    }

    try {
      const agent = await client.agents.get(this.deploymentName);
      this.resolvedAgent = agent;
      return agent;
    } catch (error) {
      logger.debug(
        `[AzureFoundryAgentProvider] Direct agent lookup failed for '${this.deploymentName}', falling back to list lookup`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    for await (const agent of client.agents.list()) {
      if (agent.id === this.deploymentName || agent.name === this.deploymentName) {
        this.resolvedAgent = agent;
        return agent;
      }
    }

    throw new Error(
      `Azure Foundry agent '${this.deploymentName}' was not found by name or legacy ID in project '${this.projectUrl}'. The Azure AI Projects v2 SDK resolves agents by name. Update the provider to use azure:foundry-agent:<agent-name>, or keep using the legacy ID format and ensure the agent still exists in this project.`,
    );
  }

  private async preloadFunctionCallbacks() {
    if (!this.assistantConfig.functionToolCallbacks) {
      return;
    }

    const callbacks = this.assistantConfig.functionToolCallbacks;
    for (const [name, callback] of Object.entries(callbacks)) {
      try {
        if (typeof callback === 'string') {
          if (callback.startsWith('file://')) {
            this.loadedFunctionCallbacks[name] = await this.loadExternalFunction(callback);
          } else {
            this.loadedFunctionCallbacks[name] = new Function('return ' + callback)();
          }
        } else if (typeof callback === 'function') {
          this.loadedFunctionCallbacks[name] = callback;
        }
      } catch (error) {
        logger.error(`Failed to preload function callback '${name}': ${error}`);
      }
    }
  }

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
      const requiredModule = await importModule(resolvedPath, functionName);

      if (typeof requiredModule === 'function') {
        return requiredModule;
      }

      if (
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

  private async executeFunctionCallback(
    functionName: string,
    args: string,
    context?: CallbackContext,
    callbacks?: FunctionToolCallbacks,
  ): Promise<string> {
    try {
      let callback = this.loadedFunctionCallbacks[functionName];
      const effectiveCallbacks = callbacks || this.assistantConfig.functionToolCallbacks;

      if (!callback) {
        const callbackRef = effectiveCallbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          if (callbackRef.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackRef);
          } else {
            callback = new Function('return ' + callbackRef)();
          }
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
        }

        if (callback) {
          this.loadedFunctionCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      const result = await callback(args, context);
      if (result === undefined || result === null) {
        return '';
      }
      if (typeof result === 'object') {
        return JSON.stringify(result);
      }
      return String(result);
    } catch (error: any) {
      logger.error(`Error executing function '${functionName}': ${error.message || String(error)}`);
      return JSON.stringify({
        error: `Error in ${functionName}: ${error.message || String(error)}`,
      });
    }
  }

  private parsePromptInput(prompt: string): string | Array<Record<string, any>> {
    try {
      const parsedJson = JSON.parse(prompt);
      if (Array.isArray(parsedJson)) {
        return parsedJson;
      }
    } catch {
      // Fall through to message wrapping.
    }

    return [
      {
        type: 'message',
        role: 'user',
        content: prompt,
      },
    ];
  }

  private warnForUnsupportedConfig(config: AzureAssistantOptions) {
    const unsupportedFields = [
      config.frequency_penalty !== undefined ? 'frequency_penalty' : null,
      config.presence_penalty !== undefined ? 'presence_penalty' : null,
      config.retryOptions ? 'retryOptions' : null,
      config.seed !== undefined ? 'seed' : null,
      config.stop?.length ? 'stop' : null,
      config.timeoutMs !== undefined ? 'timeoutMs' : null,
      config.tool_resources ? 'tool_resources' : null,
    ].filter(Boolean) as string[];

    if (unsupportedFields.length === 0) {
      return;
    }

    const warningKey = unsupportedFields.sort().join(',');
    if (this.warnedUnsupportedFields.has(warningKey)) {
      return;
    }
    this.warnedUnsupportedFields.add(warningKey);

    logger.warn(
      `[AzureFoundryAgentProvider] The Azure AI Projects v2 agent runtime ignores these per-request settings: ${unsupportedFields.join(
        ', ',
      )}. Configure them on the agent itself, or pass supported Responses API fields instead.`,
    );
  }

  private async buildResponsesBody(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<{ body: Record<string, any>; effectiveConfig: EffectiveFoundryConfig }> {
    const config = {
      ...this.assistantConfig,
      ...context?.prompt?.config,
    };

    this.warnForUnsupportedConfig(config);

    const responseFormat = maybeLoadResponseFormatFromExternalFile(
      config.response_format,
      context?.vars,
    );
    const loadedTools = config.tools
      ? await maybeLoadToolsFromExternalFile(config.tools, context?.vars)
      : undefined;
    const reasoningEffort = config.reasoning_effort
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;
    const maxOutputTokens =
      config.max_output_tokens ?? config.max_completion_tokens ?? config.max_tokens;

    let text: Record<string, any> | undefined;
    if (responseFormat?.type === 'json_object') {
      text = { format: { type: 'json_object' } };
    } else if (responseFormat?.type === 'json_schema') {
      const schema = responseFormat.schema || responseFormat.json_schema?.schema;
      const schemaName =
        responseFormat.json_schema?.name || responseFormat.name || 'response_schema';
      const strict = responseFormat.json_schema?.strict ?? responseFormat.strict ?? true;
      text = {
        format: {
          type: 'json_schema',
          name: schemaName,
          schema,
          strict,
        },
      };
    }

    if (config.verbosity) {
      text = { ...(text || {}), verbosity: config.verbosity };
    }

    const body = {
      input: this.parsePromptInput(prompt),
      ...(config.instructions ? { instructions: config.instructions } : {}),
      ...(config.metadata ? { metadata: config.metadata } : {}),
      ...(config.modelName ? { model: config.modelName } : {}),
      ...(maxOutputTokens !== undefined ? { max_output_tokens: maxOutputTokens } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.top_p !== undefined ? { top_p: config.top_p } : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(loadedTools ? { tools: loadedTools } : {}),
      ...(text ? { text } : {}),
      ...(config.passthrough || {}),
    };

    return {
      body,
      effectiveConfig: {
        ...config,
        response_format: responseFormat,
        tools: loadedTools,
      },
    };
  }

  private getFunctionCalls(response: FoundryResponse): ResponseFunctionCallItem[] {
    return (response.output || []).filter((item): item is ResponseFunctionCallItem => {
      return (
        item?.type === 'function_call' &&
        typeof item.id === 'string' &&
        typeof item.call_id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.arguments === 'string'
      );
    });
  }

  private getCallableFunctionCalls(
    response: FoundryResponse,
    callbacks?: FunctionToolCallbacks,
  ): ResponseFunctionCallItem[] {
    const functionCalls = this.getFunctionCalls(response);

    if (functionCalls.length === 0 || !callbacks || Object.keys(callbacks).length === 0) {
      return [];
    }

    const missingCallbacks = functionCalls.filter((call) => !(call.name in callbacks));
    if (missingCallbacks.length > 0) {
      logger.debug(
        `[AzureFoundryAgentProvider] Returning unresolved function calls because callbacks are missing for: ${missingCallbacks
          .map((call) => call.name)
          .join(', ')}`,
      );
      return [];
    }

    return functionCalls;
  }

  private async buildFunctionCallOutputs(
    functionCalls: ResponseFunctionCallItem[],
    response: FoundryResponse,
    agent: FoundryAgent,
    callbacks?: FunctionToolCallbacks,
  ): Promise<Array<{ type: 'function_call_output'; call_id: string; output: string }>> {
    const callbackContext: CallbackContext = {
      threadId: response.conversation?.id || response.id,
      runId: response.id,
      assistantId: agent.id,
      provider: 'azure-foundry',
    };

    return Promise.all(
      functionCalls.map(async (call) => ({
        type: 'function_call_output' as const,
        call_id: call.call_id,
        output: await this.executeFunctionCallback(
          call.name,
          call.arguments,
          callbackContext,
          callbacks,
        ),
      })),
    );
  }

  private getAgentReference(agent: FoundryAgent): FoundryResponseCreateOptions {
    return {
      body: {
        agent: {
          name: agent.name,
          type: 'agent_reference',
        },
      },
    };
  }

  private async processResponse(
    response: FoundryResponse,
    effectiveConfig: EffectiveFoundryConfig,
  ): Promise<ProviderResponse> {
    const result = await this.processor.processResponseOutput(response, effectiveConfig, false);
    if (!result.error) {
      return result;
    }

    if (response.output_text) {
      logger.debug(
        `[AzureFoundryAgentProvider] ResponsesProcessor returned an error, falling back to output_text`,
        { processorError: result.error },
      );
      return {
        ...result,
        error: undefined,
        output: response.output_text,
        raw: response,
      };
    }

    return result;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { body, effectiveConfig } = await this.buildResponsesBody(prompt, context);
    const cacheKey = `azure_foundry_agent:${this.deploymentName}:${JSON.stringify(body)}`;

    if (isCacheEnabled()) {
      try {
        const cache = await getCache();
        const cachedResult = await cache.get<ProviderResponse>(cacheKey);
        if (cachedResult) {
          logger.debug(`Cache hit for Foundry agent prompt: ${prompt.substring(0, 50)}...`);
          return { ...cachedResult, cached: true };
        }
      } catch (error) {
        logger.warn(`Error checking cache for Azure Foundry agent response: ${error}`);
      }
    }

    try {
      const client = await this.initializeClient();
      const agent = await this.resolveAgent(client);
      const openAIClient = client.getOpenAIClient();
      const responseOptions = this.getAgentReference(agent);
      const maxLoopTimeMs = this.assistantConfig.maxPollTimeMs || 300000;
      const startTime = Date.now();

      let response = await openAIClient.responses.create(
        body as ResponseCreateParamsNonStreaming,
        responseOptions,
      );
      while (Date.now() - startTime <= maxLoopTimeMs) {
        const functionCalls = this.getCallableFunctionCalls(
          response,
          effectiveConfig.functionToolCallbacks,
        );
        if (functionCalls.length === 0) {
          break;
        }

        const outputs = await this.buildFunctionCallOutputs(
          functionCalls,
          response,
          agent,
          effectiveConfig.functionToolCallbacks,
        );
        logger.debug(
          `[AzureFoundryAgentProvider] Submitting ${outputs.length} function_call_output item(s)`,
        );
        response = await openAIClient.responses.create(
          {
            input: outputs as ResponseFunctionToolCallOutputItem[],
            previous_response_id: response.id,
          } as ResponseCreateParamsNonStreaming,
          responseOptions,
        );
      }

      if (Date.now() - startTime > maxLoopTimeMs) {
        return {
          error: `Azure Foundry agent tool-calling loop timed out after ${maxLoopTimeMs}ms.`,
        };
      }

      const result = await this.processResponse(response, effectiveConfig);
      if (isCacheEnabled() && !result.error) {
        try {
          const cache = await getCache();
          await cache.set(cacheKey, result);
        } catch (error) {
          logger.warn(`Error caching Azure Foundry agent response: ${error}`);
        }
      }
      return result;
    } catch (error: any) {
      logger.error(`Error in Azure Foundry Agent API call: ${error}`);
      return this.formatError(error);
    }
  }

  private formatError(error: unknown): ProviderResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (this.isContentFilterError(errorMessage)) {
      const lowerErrorMessage = errorMessage.toLowerCase();
      const isInputFiltered =
        lowerErrorMessage.includes('prompt') || lowerErrorMessage.includes('input');
      const isOutputFiltered =
        lowerErrorMessage.includes('output') || lowerErrorMessage.includes('response');

      return {
        output:
          "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.",
        guardrails: {
          flagged: true,
          flaggedInput: isInputFiltered,
          flaggedOutput: isOutputFiltered || (!isInputFiltered && !isOutputFiltered),
        },
      };
    }

    if (this.isRateLimitError(errorMessage)) {
      return { error: `Rate limit exceeded: ${errorMessage}` };
    }
    if (this.isServiceError(errorMessage)) {
      return { error: `Service error: ${errorMessage}` };
    }

    return { error: `Error in Azure Foundry Agent API call: ${errorMessage}` };
  }

  private isContentFilterError(errorMessage: string): boolean {
    const lowerErrorMessage = errorMessage.toLowerCase();
    return (
      lowerErrorMessage.includes('content_filter') ||
      lowerErrorMessage.includes('content filter') ||
      lowerErrorMessage.includes('filtered due to') ||
      lowerErrorMessage.includes('content filtering') ||
      lowerErrorMessage.includes('inappropriate content') ||
      lowerErrorMessage.includes('safety guidelines') ||
      lowerErrorMessage.includes('guardrail')
    );
  }

  private isRateLimitError(errorMessage: string): boolean {
    return (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('Rate limit') ||
      errorMessage.includes('429')
    );
  }

  private isServiceError(errorMessage: string): boolean {
    return (
      errorMessage.includes('Service unavailable') ||
      errorMessage.includes('Bad gateway') ||
      errorMessage.includes('Gateway timeout') ||
      errorMessage.includes('Server is busy') ||
      errorMessage.includes('Sorry, something went wrong')
    );
  }
}
