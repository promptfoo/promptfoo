import { createHmac } from 'crypto';

import { getCache, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import { rateLimitTimingFromHeaders } from '../../util/fetch';
import {
  extractRateLimitErrorCode,
  extractRateLimitErrorType,
  formatRateLimitErrorMessage,
  HttpRateLimitError,
} from '../../util/fetch/errors';
import {
  CallbackPathTraversalError,
  loadCallbackFromFileUrl,
  wrapError,
} from '../../util/functions/loadFunction';
import {
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../util/index';
import { accumulateTokenUsage } from '../../util/tokenUsageUtils';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { ResponsesProcessor } from '../responses/index';
import { getResponsesTokenUsage } from '../responses/processor';
import {
  buildChatSpanContext,
  emitTurnMarkerSpan,
  extractProviderResponseAttributes,
  GenAIAttributes,
  getGenAITracer,
  withGenAISpan,
  withGenAIToolSpan,
} from '../tracing';
import {
  formatContentFilterResponse,
  isContentFilterError,
  isRateLimitError,
  isServiceError,
} from './errors';
import { AzureGenericProvider } from './generic';
import { calculateAzureCost } from './util';
import type { Agent, AIProjectClient as AzureAIProjectClient } from '@azure/ai-projects';
import type { Span } from '@opentelemetry/api';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  TokenUsage,
} from '../../types/index';
import type { CallbackContext, ReasoningEffort } from '../openai/types';
import type { AzureAssistantOptions, AzureAssistantProviderOptions } from './types';

type FoundryAgent = Agent;
type FoundryResponses = ReturnType<AzureAIProjectClient['getOpenAIClient']>['responses'];
type FoundryResponseCreateParams = Parameters<FoundryResponses['create']>[0] & { stream?: false };
type CachedFoundryAgentResponse = ProviderResponse & {
  __promptfooFoundryAgent?: Pick<FoundryAgent, 'id' | 'name'>;
};
// Foundry bundles its own OpenAI SDK, whose response types can differ from ours.
type FoundryResponse = Extract<
  Awaited<ReturnType<FoundryResponses['create']>>,
  { output: unknown[] }
>;
type ResponseFunctionCallItem = Extract<
  FoundryResponse['output'][number],
  { type: 'function_call' }
>;
type EffectiveFoundryConfig = AzureAssistantOptions & Record<string, any>;
type FunctionToolCallbacks = AzureAssistantOptions['functionToolCallbacks'];

function hashFoundryAgentCacheValue(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return createHmac('sha256', 'promptfoo:azure-foundry-agent:cache-key:v2')
    .update(serialized ?? String(value))
    .digest('hex');
}

interface AgentReferenceOption {
  name: string;
  type: 'agent_reference';
}

interface FoundryResponseCreateOptions {
  body?: {
    agent_reference?: AgentReferenceOption;
  };
}

/**
 * Name/value pairs out of whichever header carrier an SDK error is holding.
 *
 * Web `Headers` and Azure Core's `HttpHeaders` are both declared
 * `Iterable<[name, value]>`, but only the Web one has `.entries()`. Azure's
 * `HttpHeadersImpl` — what an `@azure/ai-projects` `RestError` carries —
 * exposes `get()`, `toJSON()` and `[Symbol.iterator]` and nothing else, so
 * `.entries()` is undefined on it and `Object.entries()` yields its private
 * `_headersMap` instead of any header. Iterating covers both, `toJSON()`
 * covers a carrier that only has the record, and a plain record stays a plain
 * record.
 */
function headerEntries(raw: object): [string, unknown][] {
  if (typeof (raw as Iterable<unknown>)[Symbol.iterator] === 'function') {
    return Array.from(raw as Iterable<unknown>).filter(
      (pair): pair is [string, unknown] => Array.isArray(pair) && typeof pair[0] === 'string',
    );
  }
  const toJSON = (raw as { toJSON?: () => unknown }).toJSON;
  if (typeof toJSON === 'function') {
    const json = toJSON.call(raw);
    if (typeof json === 'object' && json !== null) {
      return Object.entries(json as Record<string, unknown>);
    }
  }
  return Object.entries(raw as Record<string, unknown>);
}

/**
 * Normalize the headers an SDK error carries (a plain record, a Web `Headers`
 * or an Azure `HttpHeaders`, on the error itself or on its `response`) to
 * lowercase keys.
 */
function sdkErrorHeaders(err: {
  headers?: unknown;
  response?: { headers?: unknown };
}): Record<string, string> | undefined {
  const raw = err.headers ?? err.response?.headers;
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of headerEntries(raw)) {
    if (typeof value === 'string') {
      headers[key.toLowerCase()] = value;
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Provider response for a structured rate-limit error. The HTTP status and
 * headers travel in `metadata.http` so the scheduler can honour the
 * advertised Retry-After instead of its default backoff.
 */
function rateLimitResponse(error: HttpRateLimitError, details?: string): ProviderResponse {
  return {
    error: formatRateLimitErrorMessage(error, details),
    metadata: {
      rateLimitKind: error.kind,
      http: {
        status: error.status,
        statusText: error.statusText,
        headers: error.headers ?? {},
      },
    },
  };
}

/**
 * Adapt an SDK 429 into the shared quota/retry classification. Prefer the
 * modern `err.status` shape, falling back to `err.response.status`.
 * The body code takes priority over a wrapper's transport code; type aliases
 * are only a fallback when neither level provides an actual code.
 */
function rateLimitFromSdkError(error: unknown): HttpRateLimitError | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const err = error as {
    status?: unknown;
    headers?: unknown;
    response?: { status?: unknown; headers?: unknown };
    error?: unknown;
  };
  const status = typeof err.status === 'number' ? err.status : err.response?.status;
  if (status !== 429) {
    return null;
  }
  // Prefer body-level code; fall back to top-level / `type` aliases. The type
  // is forwarded separately so a billing-specific code the allowlist does not
  // know still classifies as quota via `type: "insufficient_quota"`.
  const code = extractRateLimitErrorCode(err);
  const type = extractRateLimitErrorType(err.error) ?? extractRateLimitErrorType(err);
  // Retry-After decides whether a hard-quota code is really a short per-window
  // throttle (see HttpRateLimitError), so the SDK's headers must reach it.
  const headers = sdkErrorHeaders(err);
  const timing = headers ? rateLimitTimingFromHeaders(headers) : undefined;
  return new HttpRateLimitError({
    status: 429,
    code,
    type,
    retryAfterMs: timing?.retryAfterMs,
    resetAt: timing?.resetAt,
    headers,
  });
}

export class AzureFoundryAgentProvider extends AzureGenericProvider {
  assistantConfig: AzureAssistantOptions;
  private loadedFunctionCallbacks: Record<string, Function> = {};
  private processor: ResponsesProcessor;
  private projectClient?: Promise<AzureAIProjectClient>;
  private projectUrl: string;
  private agentPromise?: Promise<FoundryAgent>;
  private resolvedAgent: FoundryAgent | null = null;
  private warnedUnsupportedFields = new Set<string>();

  override async initialize(): Promise<void> {
    // Foundry authenticates through DefaultAzureCredential in initializeClient().
  }

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
      // Invocation accounting includes every turn, including failed responses.
      costCalculator: () => undefined,
    });

    if (this.assistantConfig.functionToolCallbacks) {
      void this.preloadFunctionCallbacks();
    }
  }

  private initializeClient(): Promise<AzureAIProjectClient> {
    this.projectClient ??= this.createProjectClient().catch((error) => {
      this.projectClient = undefined;
      throw error;
    });
    return this.projectClient;
  }

  private async createProjectClient(): Promise<AzureAIProjectClient> {
    try {
      const { AIProjectClient } = await import('@azure/ai-projects');
      const { DefaultAzureCredential } = await import('@azure/identity');

      const projectClient = new AIProjectClient(
        this.projectUrl,
        new DefaultAzureCredential(),
      ) as AzureAIProjectClient;
      logger.debug('Azure AI Project client initialized successfully');
      return projectClient;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize Azure AI Project client: ${errorMessage}`);
      throw new Error(`Failed to initialize Azure AI Project client: ${errorMessage}`);
    }
  }

  private resolveAgent(client: AzureAIProjectClient): Promise<FoundryAgent> {
    this.agentPromise ??= this.lookupAgent(client)
      .then((agent) => {
        this.resolvedAgent = agent;
        return agent;
      })
      .catch((error) => {
        this.agentPromise = undefined;
        throw error;
      });
    return this.agentPromise;
  }

  private async lookupAgent(client: AzureAIProjectClient): Promise<FoundryAgent> {
    try {
      return await client.agents.get(this.deploymentName);
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
    try {
      return await loadCallbackFromFileUrl(fileRef);
    } catch (error) {
      if (error instanceof CallbackPathTraversalError) {
        throw error;
      }
      throw wrapError(`Error loading function from ${fileRef}: ${(error as Error).message}`, error);
    }
  }

  private async executeFunctionCallback(
    functionName: string,
    args: string,
    context?: CallbackContext,
    callbacks?: FunctionToolCallbacks,
    callId?: string,
  ): Promise<string> {
    try {
      return await withGenAIToolSpan({ name: functionName, arguments: args, callId }, async () => {
        const effectiveCallbacks = callbacks ?? this.assistantConfig.functionToolCallbacks;
        const callbackRef = effectiveCallbacks?.[functionName];
        const isProviderCallback =
          callbackRef === this.assistantConfig.functionToolCallbacks?.[functionName];
        let callback = isProviderCallback ? this.loadedFunctionCallbacks[functionName] : undefined;

        if (!callback) {
          if (callbackRef && typeof callbackRef === 'string') {
            if (callbackRef.startsWith('file://')) {
              callback = await this.loadExternalFunction(callbackRef);
            } else {
              callback = new Function('return ' + callbackRef)();
            }
          } else if (typeof callbackRef === 'function') {
            callback = callbackRef;
          }

          if (callback && isProviderCallback) {
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
      });
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
      config.frequency_penalty === undefined ? null : 'frequency_penalty',
      config.presence_penalty === undefined ? null : 'presence_penalty',
      config.retryOptions ? 'retryOptions' : null,
      config.seed === undefined ? null : 'seed',
      config.stop?.length ? 'stop' : null,
      config.timeoutMs === undefined ? null : 'timeoutMs',
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
      ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
      ...(config.top_p === undefined ? {} : { top_p: config.top_p }),
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
        typeof item.call_id === 'string' &&
        item.call_id.length > 0 &&
        typeof item.name === 'string' &&
        item.name.length > 0 &&
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

    // A batch is atomic: malformed or duplicate calls must not partially execute.
    const pendingCalls = response.output.filter((item) => item.type === 'function_call');
    if (
      functionCalls.length !== pendingCalls.length ||
      new Set(functionCalls.map((call) => call.call_id)).size !== functionCalls.length
    ) {
      return [];
    }

    const missingCallbacks = functionCalls.filter(
      (call) => !Object.prototype.hasOwnProperty.call(callbacks, call.name),
    );
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
          call.call_id,
        ),
      })),
    );
  }

  private getAgentReference(agent: FoundryAgent): FoundryResponseCreateOptions {
    // Azure AI Foundry replaced the top-level `agent` field in the responses
    // create body with `agent_reference`. Sending `agent` returns a 400 similar
    // to: "The 'agent' property is deprecated. Use 'agent_reference' instead."
    return {
      body: {
        agent_reference: {
          name: agent.name,
          type: 'agent_reference',
        },
      },
    };
  }

  private responseFailureMessage(response: FoundryResponse): string | undefined {
    if (response.error) {
      return response.error.message || response.error.code || 'Azure Foundry agent response failed';
    }
    if (response.status && response.status !== 'completed') {
      const reason = response.incomplete_details?.reason;
      return `Azure Foundry agent response status: ${response.status}${reason ? ` (${reason})` : ''}`;
    }
    return undefined;
  }

  private calculateResponseCost(
    response: FoundryResponse,
    config: EffectiveFoundryConfig,
  ): number | undefined {
    const usage = response.usage;
    const modelOverride = (config.passthrough as { model?: string } | undefined)?.model;
    return calculateAzureCost(
      response.model || modelOverride || config.modelName || this.deploymentName,
      config,
      usage?.input_tokens,
      usage?.output_tokens,
      usage?.input_tokens_details?.cached_tokens,
      // Some Foundry models report additional modality-specific usage details.
      (usage?.input_tokens_details as any)?.audio_tokens,
      (usage?.output_tokens_details as any)?.audio_tokens,
      (usage?.input_tokens_details as any)?.image_tokens,
      (usage?.input_tokens_details as any)?.cached_tokens_details?.audio_tokens,
      (usage?.input_tokens_details as any)?.cached_tokens_details?.image_tokens,
      (usage?.output_tokens_details as any)?.image_tokens,
    );
  }

  private buildContinuationBody(
    body: Record<string, any>,
    response: FoundryResponse,
    outputs: Array<{ type: 'function_call_output'; call_id: string; output: string }>,
  ): Record<string, any> {
    const { input: _input, previous_response_id: _previousId, conversation, ...settings } = body;
    // Preserve the first turn's forced tool call, then allow a final answer.
    if (settings.tool_choice === 'required' || settings.tool_choice?.type === 'function') {
      settings.tool_choice = 'auto';
    } else if (settings.tool_choice?.type === 'allowed_tools') {
      settings.tool_choice = { ...settings.tool_choice, mode: 'auto' };
    }
    return {
      ...settings,
      input: outputs,
      ...(conversation == null ? { previous_response_id: response.id } : { conversation }),
    };
  }

  private validateResponseConfig(
    body: Record<string, any>,
    config: EffectiveFoundryConfig,
  ): string | undefined {
    const maxLoopTimeMs = config.maxPollTimeMs ?? 300000;
    if (!Number.isFinite(maxLoopTimeMs) || maxLoopTimeMs < 0) {
      return 'Azure Foundry agent maxPollTimeMs must be a finite, non-negative number.';
    }
    if (body.conversation != null && body.previous_response_id != null) {
      return 'Azure Foundry agent conversation and previous_response_id cannot be used together.';
    }
    if (body.stream || body.background) {
      return 'Azure Foundry agents require non-streaming, foreground Responses requests; stream and background are not supported.';
    }
    if (body.store !== undefined && typeof body.store !== 'boolean') {
      return 'Azure Foundry agent store must be a boolean.';
    }
    if (body.store === false && Object.keys(config.functionToolCallbacks ?? {}).length > 0) {
      return 'Azure Foundry automatic function callbacks require stored responses. Remove store: false or functionToolCallbacks; stateless tool history is not supported by this provider.';
    }
    return undefined;
  }

  private async processResponse(
    response: FoundryResponse,
    effectiveConfig: EffectiveFoundryConfig,
  ): Promise<ProviderResponse> {
    const failure = this.responseFailureMessage(response);
    // Normalize any partial output without allowing response errors or callbacks
    // to bypass the invocation's failure and tool-execution policies.
    const result = await this.processor.processResponseOutput(
      response.error ? { ...response, error: null } : response,
      { ...effectiveConfig, functionToolCallbacks: undefined },
      false,
    );
    const metadata = {
      ...result.metadata,
      ...(response.status && { responseStatus: response.status }),
      ...(response.incomplete_details?.reason && {
        incompleteReason: response.incomplete_details.reason,
      }),
    };
    if (failure) {
      return {
        ...result,
        ...(result.error && response.output_text && { output: response.output_text }),
        error: failure,
        raw: response,
        metadata,
      };
    }
    if (result.error && response.output_text) {
      return { ...result, error: undefined, output: response.output_text, raw: response, metadata };
    }
    return { ...result, metadata };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const spanContext = buildChatSpanContext({
      system: 'azure',
      model: this.assistantConfig.modelName || this.deploymentName,
      providerId: this.id(),
      prompt,
      context,
    });

    return withGenAISpan(
      {
        ...spanContext,
        operationName: 'invoke_agent',
        agentName: this.resolvedAgent?.name ?? this.deploymentName,
        agentId: this.resolvedAgent?.id,
      },
      (span) => this.callApiInternal(prompt, span, context, callApiOptions),
      extractProviderResponseAttributes,
    );
  }

  private async callApiInternal(
    prompt: string,
    span: Span,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const { body, effectiveConfig } = await this.buildResponsesBody(prompt, context);
    const maxLoopTimeMs = effectiveConfig.maxPollTimeMs ?? 300000;
    const configError = this.validateResponseConfig(body, effectiveConfig);
    if (configError) {
      return { error: configError };
    }
    const projectScope = hashFoundryAgentCacheValue(this.projectUrl);
    const cacheKey = `azure_foundry_agent:${this.deploymentName}:${projectScope}:${hashFoundryAgentCacheValue(body)}`;

    // Client-side tool behavior is absent from the serialized request body.
    // Callback closures cannot be safely represented in a persistent cache key.
    const useCache =
      isCacheEnabled() &&
      !Object.keys(effectiveConfig.functionToolCallbacks ?? {}).length &&
      effectiveConfig.maxPollTimeMs === undefined &&
      body.conversation == null &&
      body.previous_response_id == null;
    if (useCache) {
      try {
        const cache = await getCache();
        const cachedResult = await cache.get<CachedFoundryAgentResponse>(cacheKey);
        if (cachedResult) {
          logger.debug('Cache hit for Foundry agent response', {
            deploymentName: this.deploymentName,
            cacheKey,
          });
          const { __promptfooFoundryAgent: cachedAgent, ...response } = cachedResult;
          if (cachedAgent) {
            span.setAttribute(GenAIAttributes.AGENT_ID, cachedAgent.id);
            span.setAttribute(GenAIAttributes.AGENT_NAME, cachedAgent.name);
            span.updateName(`invoke_agent ${cachedAgent.name}`);
          }

          const tokenUsage = response.tokenUsage;
          return {
            ...response,
            ...(tokenUsage && {
              tokenUsage: {
                ...tokenUsage,
                ...(tokenUsage.total !== undefined && { cached: tokenUsage.total }),
                ...(tokenUsage.cached !== undefined &&
                  tokenUsage.completionDetails?.cacheReadInputTokens === undefined && {
                    completionDetails: {
                      ...tokenUsage.completionDetails,
                      cacheReadInputTokens: tokenUsage.cached,
                    },
                  }),
              },
            }),
            cached: true,
          };
        }
      } catch (error) {
        logger.warn(`Error checking cache for Azure Foundry agent response: ${error}`);
      }
    }

    const tokenUsage: TokenUsage = { numRequests: 0 };
    let knownCost = 0;
    let costComplete = true;
    let usageComplete = true;
    const aggregateResult = (result: ProviderResponse): ProviderResponse => {
      if (!tokenUsage.numRequests) {
        return result;
      }
      return {
        ...result,
        tokenUsage,
        ...(costComplete ? { cost: knownCost } : { cost: undefined }),
        metadata: {
          ...result.metadata,
          ...(!costComplete && { costIncomplete: true, knownCost }),
          ...(!usageComplete && { usageIncomplete: true }),
        },
      };
    };

    try {
      const client = await this.initializeClient();
      const agent = await this.resolveAgent(client);
      span.setAttribute(GenAIAttributes.AGENT_ID, agent.id);
      span.setAttribute(GenAIAttributes.AGENT_NAME, agent.name);
      span.updateName(`invoke_agent ${agent.name}`);
      const openAIClient = client.getOpenAIClient();
      const responseOptions = this.getAgentReference(agent);
      const tracer = getGenAITracer();
      let turnCount = 0;

      const emitTurnSpan = (callStartedAt: number, callEndedAt: number, errorMessage?: string) => {
        turnCount += 1;
        emitTurnMarkerSpan({
          tracer,
          index: turnCount,
          startTime: callStartedAt,
          endTime: callEndedAt,
          attributes: {
            'gen_ai.turn.index': turnCount,
            [GenAIAttributes.PROVIDER_NAME]: 'azure.ai.openai',
          },
          errorMessage,
          logLabel: 'AzureFoundryAgent',
        });
      };

      const requestResponse = async (
        requestBody: Record<string, any>,
      ): Promise<FoundryResponse> => {
        const turnStartedAt = Date.now();
        // SDK-level attempts are observable; internal transport retries are not.
        accumulateTokenUsage(tokenUsage, { numRequests: 1 });
        try {
          const response = await openAIClient.responses.create(
            requestBody as FoundryResponseCreateParams,
            responseOptions,
          );
          accumulateTokenUsage(tokenUsage, {
            ...getResponsesTokenUsage(response, false),
            cached: response.usage?.input_tokens_details?.cached_tokens,
            numRequests: 0,
          });
          usageComplete &&= response.usage != null;
          const responseCost = this.calculateResponseCost(response, effectiveConfig);
          if (responseCost === undefined) {
            costComplete = false;
          } else {
            knownCost += responseCost;
          }
          emitTurnSpan(turnStartedAt, Date.now(), this.responseFailureMessage(response));
          return response;
        } catch (err) {
          costComplete = false;
          usageComplete = false;
          emitTurnSpan(turnStartedAt, Date.now(), err instanceof Error ? err.message : String(err));
          throw err;
        }
      };

      let response = await requestResponse(body);
      const startTime = Date.now();
      // Check the shared budget between turns; pending requests and callbacks
      // are allowed to finish rather than being interrupted by this limit.
      const outOfBudget = () => Date.now() - startTime >= maxLoopTimeMs;
      const toolLoopTimeoutError =
        `Azure Foundry agent tool-calling loop timed out after ${maxLoopTimeMs}ms. ` +
        'Increase maxPollTimeMs if this evaluation legitimately needs a longer tool-calling loop.';
      let functionCalls = this.responseFailureMessage(response)
        ? []
        : this.getCallableFunctionCalls(response, effectiveConfig.functionToolCallbacks);
      const hadCallableFunctionCalls = functionCalls.length > 0;
      while (functionCalls.length > 0 && !outOfBudget()) {
        const outputs = await this.buildFunctionCallOutputs(
          functionCalls,
          response,
          agent,
          effectiveConfig.functionToolCallbacks,
        );
        // Callbacks can exhaust the budget on their own. Stop before spending
        // another round trip on outputs the loop can no longer act on.
        if (outOfBudget()) {
          return aggregateResult({ error: toolLoopTimeoutError });
        }
        logger.debug(
          `[AzureFoundryAgentProvider] Submitting ${outputs.length} function_call_output item(s)`,
        );
        response = await requestResponse(this.buildContinuationBody(body, response, outputs));
        functionCalls = this.responseFailureMessage(response)
          ? []
          : this.getCallableFunctionCalls(response, effectiveConfig.functionToolCallbacks);
      }

      // Check all outstanding calls, including batches with missing callbacks.
      // A final answer may still be returned when the last request ran over time.
      if (
        hadCallableFunctionCalls &&
        !this.responseFailureMessage(response) &&
        outOfBudget() &&
        response.output?.some((item) => item.type === 'function_call')
      ) {
        return aggregateResult({ error: toolLoopTimeoutError });
      }

      const result = aggregateResult(await this.processResponse(response, effectiveConfig));
      if (useCache && !result.error) {
        try {
          const cache = await getCache();
          await cache.set(cacheKey, {
            ...result,
            __promptfooFoundryAgent: { id: agent.id, name: agent.name },
          } satisfies CachedFoundryAgentResponse);
        } catch (error) {
          logger.warn(`Error caching Azure Foundry agent response: ${error}`);
        }
      }
      return result;
    } catch (error: any) {
      logger.error(`Error in Azure Foundry Agent API call: ${error}`);
      return aggregateResult(this.formatError(error));
    }
  }

  private formatError(error: unknown): ProviderResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof HttpRateLimitError) {
      return rateLimitResponse(error);
    }

    // The OpenAI SDK throws APIError-shaped objects with `status` and a body
    // that carries the same `error.code` shape we parse for fetch-based paths.
    // Adapt to HttpRateLimitError so SDK-raised 429s share the same message
    // formatter; pass the SDK-supplied message as `details` so operator
    // context (deployment name, token counts) is preserved.
    const sdkRateLimit = rateLimitFromSdkError(error);
    if (sdkRateLimit) {
      return rateLimitResponse(sdkRateLimit, errorMessage);
    }

    if (isContentFilterError(errorMessage)) {
      return formatContentFilterResponse(errorMessage);
    }

    if (isRateLimitError(errorMessage)) {
      return { error: `Rate limit exceeded: ${errorMessage}` };
    }
    if (isServiceError(errorMessage)) {
      return { error: `Service error: ${errorMessage}` };
    }

    return { error: `Error in Azure Foundry Agent API call: ${errorMessage}` };
  }
}
