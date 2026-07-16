import { type FetchWithCacheResult, fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import {
  buildChatSpanContext,
  extractProviderResponseAttributes,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { sha256 } from '../../util/createHash';
import {
  formatRateLimitErrorMessage,
  HttpRateLimitError,
  isAbortError,
} from '../../util/fetch/errors';
import { fetchWithRetries } from '../../util/fetch/index';
import {
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../util/index';
import { sleep } from '../../util/time';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { ResponsesProcessor } from '../responses/index';
import { readResponsesStream } from '../responses/stream';
import { getRequestTimeoutMs, LONG_RUNNING_MODEL_TIMEOUT_MS } from '../shared';
import { OpenAiGenericProvider } from '.';
import { calculateObservableOpenAIToolCost, calculateOpenAIUsageCost } from './billing';
import { formatOpenAiError, getTokenUsage } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiCompletionOptions, ReasoningEffort } from './types';

// OpenAI SDK has APIError class for exceptions, but not a type for error responses
// in the JSON body. This interface represents the structure when the API returns
// an error object in the response body (not as an exception).
interface OpenAIErrorResponse {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

interface OpenAIResponsesResponse {
  id?: string;
  status?: string;
  output?: Array<{
    content?: Array<{
      type: string;
      text?: string;
      thinking?: { reasoning_text?: string };
      refusal?: string;
    }>;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

interface BackgroundResponseResult {
  data: OpenAIResponsesResponse;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  error?: string;
  retried?: boolean;
  cancelled?: boolean;
  shared?: boolean;
}

const BACKGROUND_RESPONSE_CANCEL_TIMEOUT_MS = 10_000;
const BACKGROUND_STREAM_ABORT_GRACE_MS = 1_000;
const inFlightBackgroundResponses = new Map<string, Promise<BackgroundResponseResult>>();
const backgroundAbortSignalIds = new WeakMap<AbortSignal, number>();
let nextBackgroundAbortSignalId = 0;

function getAbortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }
  const error = new Error(reason instanceof Error ? reason.message : 'Request was aborted');
  error.name = 'AbortError';
  return error;
}

async function cancelBackgroundResponse(
  responseId: string,
  url: string,
  headers: Record<string, string>,
): Promise<void> {
  try {
    await fetchWithCache<OpenAIResponsesResponse>(
      `${url}/${encodeURIComponent(responseId)}/cancel`,
      { method: 'POST', headers },
      BACKGROUND_RESPONSE_CANCEL_TIMEOUT_MS,
      'json',
      true,
      0,
    );
  } catch (error) {
    logger.warn(`Failed to cancel background response ${responseId}: ${String(error)}`);
  }
}

async function pollBackgroundResponse(
  initial: OpenAIResponsesResponse,
  url: string,
  headers: Record<string, string>,
  timeout: number,
  maxRetries?: number,
  signal?: AbortSignal,
): Promise<BackgroundResponseResult> {
  if (!initial.id) {
    return {
      data: initial,
      status: 0,
      statusText: 'Error',
      error: 'Background response is missing its response ID.',
    };
  }

  let data = initial;
  let status = 200;
  let statusText = 'OK';
  let responseHeaders: Record<string, string> | undefined;
  const deadline = Date.now() + timeout;
  let firstPoll = true;
  let deadlineSignal: AbortSignal | undefined;

  try {
    while (data.status === 'queued' || data.status === 'in_progress') {
      signal?.throwIfAborted();
      if (!firstPoll) {
        await sleep(Math.min(1000, Math.max(0, deadline - Date.now())));
        signal?.throwIfAborted();
      }
      firstPoll = false;

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        await cancelBackgroundResponse(initial.id, url, headers);
        return {
          data,
          status: 0,
          statusText: 'Error',
          error: `Background response ${initial.id} timed out after ${timeout}ms.`,
        };
      }

      deadlineSignal = AbortSignal.timeout(remainingMs);
      const pollSignal = signal ? AbortSignal.any([signal, deadlineSignal]) : deadlineSignal;
      const polled = await fetchWithCache<OpenAIResponsesResponse>(
        `${url}/${encodeURIComponent(initial.id)}`,
        { method: 'GET', headers, signal: pollSignal },
        remainingMs,
        'json',
        true,
        maxRetries,
      );
      data = polled.data;
      status = polled.status;
      statusText = polled.statusText;
      responseHeaders = polled.headers;
      if (status < 200 || status >= 300) {
        const shouldCancel =
          status >= 400 && status < 500 && ![404, 408, 409, 410, 425, 429].includes(status);
        if (shouldCancel) {
          await cancelBackgroundResponse(initial.id, url, headers);
        }
        return {
          data,
          status,
          statusText,
          headers: responseHeaders,
          error: `API error: ${status} ${statusText}\n${JSON.stringify(data)}`,
          cancelled: shouldCancel,
        };
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      await cancelBackgroundResponse(initial.id, url, headers);
      throw error;
    }
    if (deadlineSignal?.aborted || Date.now() >= deadline) {
      await cancelBackgroundResponse(initial.id, url, headers);
      return {
        data,
        status: 0,
        statusText: 'Error',
        error: `Background response ${initial.id} timed out after ${timeout}ms.`,
      };
    }
    throw error;
  }

  return { data, status, statusText, headers: responseHeaders };
}

async function createBackgroundResponseWithCancellation(
  url: string,
  request: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
  timeout: number,
  bustCache: boolean | undefined,
  maxRetries: number | undefined,
): Promise<FetchWithCacheResult<OpenAIResponsesResponse>> {
  const signal = request.signal;
  const creation = fetchWithCache<OpenAIResponsesResponse>(
    url,
    { method: request.method, headers: request.headers, body: request.body },
    timeout,
    'json',
    bustCache,
    maxRetries,
  );
  if (!signal) {
    return creation;
  }

  let onAbort: (() => void) | undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      void creation
        .then(async (created) => {
          if (
            created.data.id &&
            (created.data.status === 'queued' || created.data.status === 'in_progress')
          ) {
            await cancelBackgroundResponse(created.data.id, url, request.headers);
          }
          await created.deleteFromCache?.();
        })
        .catch((error) => {
          logger.warn(`Failed to clean up an aborted background response: ${String(error)}`);
        });
      reject(getAbortError(signal));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([creation, cancellation]);
  } finally {
    if (onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

async function resolveBackgroundResponse(
  initial: OpenAIResponsesResponse,
  url: string,
  request: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
  timeout: number,
  maxRetries: number | undefined,
  cached: boolean,
  deleteFromCache: (() => Promise<void>) | undefined,
): Promise<BackgroundResponseResult> {
  const polled = await pollBackgroundResponse(
    initial,
    url,
    request.headers,
    timeout,
    maxRetries,
    request.signal,
  );
  if (!cached || !polled.error || (polled.status !== 404 && polled.status !== 410)) {
    return polled;
  }

  await deleteFromCache?.();
  const retried = await fetchWithCache<OpenAIResponsesResponse>(
    url,
    request,
    timeout,
    'json',
    false,
    maxRetries,
  );
  if (retried.status < 200 || retried.status >= 300) {
    return {
      data: retried.data,
      status: retried.status,
      statusText: retried.statusText,
      headers: retried.headers,
      error: `API error: ${retried.status} ${retried.statusText}\n${JSON.stringify(retried.data)}`,
      retried: true,
    };
  }

  if (retried.data.status === 'queued' || retried.data.status === 'in_progress') {
    return {
      ...(await pollBackgroundResponse(
        retried.data,
        url,
        request.headers,
        timeout,
        maxRetries,
        request.signal,
      )),
      retried: true,
    };
  }

  return {
    data: retried.data,
    status: retried.status,
    statusText: retried.statusText,
    headers: retried.headers,
    retried: true,
  };
}

async function coalesceBackgroundResponse(
  initial: OpenAIResponsesResponse,
  url: string,
  request: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
  timeout: number,
  maxRetries: number | undefined,
  cached: boolean,
  deleteFromCache: (() => Promise<void>) | undefined,
): Promise<BackgroundResponseResult> {
  let signalId: number | undefined;
  if (request.signal) {
    signalId = backgroundAbortSignalIds.get(request.signal);
    if (signalId === undefined) {
      signalId = ++nextBackgroundAbortSignalId;
      backgroundAbortSignalIds.set(request.signal, signalId);
    }
  }
  const cacheKey = sha256(
    JSON.stringify({
      url,
      id: initial.id,
      headers: Object.entries(request.headers).sort(([left], [right]) => left.localeCompare(right)),
      signalId,
    }),
  );
  const inFlight = inFlightBackgroundResponses.get(cacheKey);
  if (inFlight) {
    const result = await inFlight;
    return result.error ? result : { ...result, shared: true };
  }

  const pending = resolveBackgroundResponse(
    initial,
    url,
    request,
    timeout,
    maxRetries,
    cached,
    deleteFromCache,
  );
  inFlightBackgroundResponses.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    inFlightBackgroundResponses.delete(cacheKey);
  }
}

export class OpenAiResponsesProvider extends OpenAiGenericProvider {
  private functionCallbackHandler = new FunctionCallbackHandler();
  private processor: ResponsesProcessor;

  static OPENAI_RESPONSES_MODEL_NAMES = [
    'gpt-4o',
    'gpt-4o-2024-08-06',
    'gpt-4o-2024-11-20',
    'gpt-4o-2024-05-13',
    'gpt-4o-2024-07-18',
    'gpt-4o-mini',
    'gpt-4o-mini-2024-07-18',
    'gpt-4.1',
    'gpt-4.1-2025-04-14',
    'gpt-4.1-mini',
    'gpt-4.1-mini-2025-04-14',
    'gpt-4.1-nano',
    'gpt-4.1-nano-2025-04-14',
    // GPT-5 models
    'gpt-5',
    'gpt-5-2025-08-07',
    'gpt-5-chat',
    'gpt-5-chat-latest',
    'gpt-5-nano',
    'gpt-5-nano-2025-08-07',
    'gpt-5-mini',
    'gpt-5-mini-2025-08-07',
    'gpt-5-pro',
    'gpt-5-pro-2025-10-06',
    // GPT-5.1 models
    'gpt-5.1',
    'gpt-5.1-2025-11-13',
    'gpt-5.1-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
    'gpt-5.1-chat-latest',
    // GPT-5.2 models
    'gpt-5.2',
    'gpt-5.2-2025-12-11',
    'gpt-5.2-chat-latest',
    'gpt-5.2-codex',
    'gpt-5.2-pro',
    'gpt-5.2-pro-2025-12-11',
    // GPT-5.3 models
    'gpt-5.3-chat-latest',
    'gpt-5.3-codex',
    // GPT-5.6 models
    'gpt-5.6',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    // GPT-5.5 models
    'gpt-5.5',
    'gpt-5.5-2026-04-23',
    'gpt-5.5-pro',
    'gpt-5.5-pro-2026-04-23',
    // GPT-5.4 models
    'gpt-5.4',
    'gpt-5.4-2026-03-05',
    'gpt-5.4-mini',
    'gpt-5.4-mini-2026-03-17',
    'gpt-5.4-nano',
    'gpt-5.4-nano-2026-03-17',
    'gpt-5.4-pro',
    'gpt-5.4-pro-2026-03-05',
    // Computer use model
    'computer-use-preview',
    'computer-use-preview-2025-03-11',
    // NOTE: gpt-image-1, gpt-image-1-mini, and gpt-image-1.5 are NOT supported with the Responses API.
    // Use openai:image:gpt-image-1, openai:image:gpt-image-1-mini, or openai:image:gpt-image-1.5 instead (which uses /images/generations endpoint)
    // Reasoning models
    'o1',
    'o1-2024-12-17',
    'o1-preview',
    'o1-preview-2024-09-12',
    'o1-mini',
    'o1-mini-2024-09-12',
    'o1-pro',
    'o1-pro-2025-03-19',
    'o3-pro',
    'o3-pro-2025-06-10',
    'o3',
    'o3-2025-04-16',
    'o4-mini',
    'o4-mini-2025-04-16',
    'o3-mini',
    'o3-mini-2025-01-31',
    // GPT-4.5 models deprecated as of 2025-07-14, removed from API
    'codex-mini-latest',
    'gpt-5-codex',
    // Deep research models
    'o3-deep-research',
    'o3-deep-research-2025-06-26',
    'o4-mini-deep-research',
    'o4-mini-deep-research-2025-06-26',
  ];

  config: OpenAiCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config ? { ...options.config } : {};

    // Initialize the shared response processor
    this.processor = new ResponsesProcessor({
      modelName: this.modelName,
      providerType: 'openai',
      functionCallbackHandler: this.functionCallbackHandler,
      costCalculator: () => undefined,
    });
  }

  protected isReasoningModel(): boolean {
    return this.getCapabilityModelName() === 'codex-mini-latest' || super.isReasoningModel();
  }

  protected getBillingUsage(data: any, _config: OpenAiCompletionOptions): any {
    return data.usage;
  }

  protected applyBilling(
    result: ProviderResponse,
    data: any,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): ProviderResponse {
    const serviceTier =
      (data as { service_tier?: string | null }).service_tier ?? config.service_tier;
    const billingModelName = this.getBillingModelName(config);
    const responseCost = calculateOpenAIUsageCost(
      billingModelName,
      config,
      this.getBillingUsage(data, config),
      {
        apiUrl: this.getApiUrl(),
        cachedResponse: cached,
        serviceTier,
      },
    );
    const observableToolCost = cached
      ? 0
      : calculateObservableOpenAIToolCost(data, billingModelName, config);

    return {
      ...result,
      ...(responseCost === undefined ? {} : { cost: responseCost + observableToolCost }),
    };
  }

  private isAzureOpenAiEndpoint(value: string | undefined): boolean {
    if (!value) {
      return false;
    }

    const endpoint = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const hostname = new URL(endpoint).hostname.toLowerCase();
      return hostname === 'openai.azure.com' || hostname.endsWith('.openai.azure.com');
    } catch {
      return false;
    }
  }

  private getDeploymentCapabilities(config: OpenAiCompletionOptions) {
    const hasAzureCustomDeploymentHost = [config.apiHost, config.apiBaseUrl, this.getApiUrl()].some(
      (endpoint) => this.isAzureOpenAiEndpoint(endpoint),
    );
    const isAzureResponsesDeploymentWithReasoningConfig =
      hasAzureCustomDeploymentHost &&
      (config.reasoning !== undefined || config.reasoning_effort !== undefined);
    const isAzureResponsesDeploymentWithVerbosityConfig =
      hasAzureCustomDeploymentHost && config.verbosity !== undefined;
    // Verbosity is a GPT-5 feature separate from reasoning; only reasoning config
    // should promote a custom deployment to "reasoning model" status, otherwise
    // max_output_tokens defaults change unexpectedly.
    const isReasoningModel =
      this.isReasoningModel() || isAzureResponsesDeploymentWithReasoningConfig;
    const isGPT5Model = this.isGPT5Model() || isAzureResponsesDeploymentWithVerbosityConfig;

    return {
      isAzureResponsesDeploymentWithReasoningConfig,
      isReasoningModel,
      isGPT5Model,
    };
  }

  async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ) {
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

    const { isAzureResponsesDeploymentWithReasoningConfig, isReasoningModel, isGPT5Model } =
      this.getDeploymentCapabilities(config);
    const maxOutputTokensDefault = config.omitDefaults
      ? getEnvString('OPENAI_MAX_TOKENS') === undefined
        ? undefined
        : getEnvInt('OPENAI_MAX_TOKENS')
      : getEnvInt('OPENAI_MAX_TOKENS', 1024);
    const reasoningMaxOutputTokensDefault =
      getEnvInt('OPENAI_MAX_COMPLETION_TOKENS') ?? getEnvInt('OPENAI_MAX_TOKENS');
    const maxOutputTokens =
      config.max_output_tokens ??
      (isReasoningModel ? reasoningMaxOutputTokensDefault : maxOutputTokensDefault);

    const renderedReasoning = renderVarsInObject(
      config.reasoning,
      context?.vars,
    ) as typeof config.reasoning;
    const renderedReasoningEffort = isReasoningModel
      ? (renderVarsInObject(config.reasoning_effort, context?.vars) as ReasoningEffort)
      : undefined;
    const effectiveReasoningEffort = renderedReasoning?.effort ?? renderedReasoningEffort;
    const hasAzureReasoningEffort =
      isAzureResponsesDeploymentWithReasoningConfig &&
      effectiveReasoningEffort !== undefined &&
      effectiveReasoningEffort !== 'none';

    const temperatureDefault = config.omitDefaults
      ? getEnvString('OPENAI_TEMPERATURE') === undefined
        ? undefined
        : getEnvFloat('OPENAI_TEMPERATURE')
      : getEnvFloat('OPENAI_TEMPERATURE', 0);
    const temperature =
      this.supportsTemperature() && !hasAzureReasoningEffort
        ? (config.temperature ?? temperatureDefault)
        : undefined;
    const reasoningEffort = isReasoningModel ? effectiveReasoningEffort : undefined;

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

        // IMPORTANT: json_object format requires the word 'json' in the input prompt
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

    // Add verbosity for GPT-5 models if configured
    if (isGPT5Model && config.verbosity) {
      textFormat = { ...textFormat, verbosity: config.verbosity };
    }

    // Load tools from external file if needed
    // Store in variable so we can include in both body and returned config
    const loadedTools = config.tools
      ? await maybeLoadToolsFromExternalFile(config.tools, context?.vars)
      : undefined;
    const responsesTools = Array.isArray(loadedTools)
      ? loadedTools.map((tool) => {
          if (tool?.type !== 'function' || !tool.function) {
            return tool;
          }
          const { function: functionDefinition, ...rest } = tool;
          return { ...rest, ...functionDefinition };
        })
      : loadedTools;
    const toolChoice =
      config.tool_choice &&
      typeof config.tool_choice === 'object' &&
      config.tool_choice.type === 'function' &&
      config.tool_choice.function?.name
        ? { type: 'function', name: config.tool_choice.function.name }
        : config.tool_choice;

    const body = {
      model: this.modelName,
      input,
      ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      ...(temperature === undefined ? {} : { temperature }),
      ...(instructions ? { instructions } : {}),
      ...((!reasoningEffort || reasoningEffort === 'none') &&
      (config.top_p !== undefined || getEnvString('OPENAI_TOP_P'))
        ? { top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1) }
        : {}),
      ...(responsesTools ? { tools: responsesTools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      ...(config.max_tool_calls ? { max_tool_calls: config.max_tool_calls } : {}),
      ...(config.include === undefined ? {} : { include: config.include }),
      ...(config.previous_response_id ? { previous_response_id: config.previous_response_id } : {}),
      text: textFormat,
      ...(config.truncation ? { truncation: config.truncation } : {}),
      ...(config.metadata ? { metadata: config.metadata } : {}),
      ...('parallel_tool_calls' in config
        ? { parallel_tool_calls: Boolean(config.parallel_tool_calls) }
        : {}),
      ...(config.stream ? { stream: config.stream } : {}),
      ...('store' in config ? { store: Boolean(config.store) } : {}),
      ...(config.background ? { background: config.background } : {}),
      ...(config.webhook_url ? { webhook_url: config.webhook_url } : {}),
      ...(config.user ? { user: config.user } : {}),
      ...(config.prompt_cache_key === undefined
        ? {}
        : { prompt_cache_key: config.prompt_cache_key }),
      ...(config.prompt_cache_options === undefined
        ? {}
        : { prompt_cache_options: config.prompt_cache_options }),
      ...(config.prompt_cache_retention === undefined
        ? {}
        : { prompt_cache_retention: config.prompt_cache_retention }),
      ...(config.passthrough || {}),
    };

    // Handle reasoning parameters for o-series and gpt-5 models
    // Note: reasoning_effort is deprecated and has been moved to reasoning.effort
    // Merge with existing body.reasoning (from reasoning_effort) so that
    // config.reasoning extra fields (e.g. summary) don't silently drop effort.
    if (renderedReasoning && isReasoningModel) {
      body.reasoning = { ...body.reasoning, ...renderedReasoning };
    }

    // The Responses API uses max_output_tokens, never max_tokens; strip max_tokens if it
    // leaked in via passthrough or YAML anchors.
    if ('max_tokens' in body) {
      delete body.max_tokens;
    }

    return {
      body,
      config: {
        ...config,
        tools: Array.isArray(body.tools) ? body.tools : loadedTools, // Include effective tools for downstream validation.
        response_format: responseFormat,
      },
    };
  }

  // The `gen_ai.system` span attribute. Subclasses serving a different vendor
  // through the Responses wire format override this so traces attribute to the
  // actual provider system.
  protected getGenAISystem(): string {
    return 'openai';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    callApiOptions?.abortSignal?.throwIfAborted();
    if (this.requiresApiKey() && !this.getApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    // Resolve the effective request config first so spanContext reflects what
    // we actually send (merged config from getOpenAiBody, not raw this.config).
    // The Responses API uses `max_output_tokens` rather than `max_tokens`.
    const resolved = await this.getOpenAiBody(prompt, context, callApiOptions);
    const effectiveBody = resolved.body as Record<string, any>;
    // Read request params from the resolved body (what we actually send) rather
    // than the raw config, so defaults/env-derived values (e.g. a default
    // temperature, OPENAI_TOP_P) are reflected on the span. The Responses API
    // has no `stop` param, so stopSequences is only set if the body carries it.
    const asNumber = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

    const spanContext = buildChatSpanContext({
      system: this.getGenAISystem(),
      model: this.modelName,
      providerId: this.id(),
      prompt,
      context,
      request: {
        maxTokens: asNumber(effectiveBody.max_output_tokens),
        temperature: asNumber(effectiveBody.temperature),
        topP: asNumber(effectiveBody.top_p),
        stopSequences: Array.isArray(effectiveBody.stop) ? effectiveBody.stop : undefined,
      },
    });

    return withGenAISpan(
      spanContext,
      () =>
        this.callApiInternal(context, {
          ...resolved,
          abortSignal: callApiOptions?.abortSignal,
        }),
      extractProviderResponseAttributes,
    );
  }

  private async callApiInternal(
    context: CallApiContextParams | undefined,
    // `callApi` always resolves the body once (so spanContext reflects what we
    // send) and passes it here, avoiding a second getOpenAiBody call. The prompt
    // is already baked into `prepared.body`, so it is not needed here.
    prepared: { body: any; config: any; abortSignal?: AbortSignal },
  ): Promise<ProviderResponse> {
    const { body, config, abortSignal } = prepared;

    // Validate deep research models have required tools. Use the capability model name so
    // detection stays consistent with the other capability checks (isGPT5Model, isReasoningModel,
    // the gpt-5-pro timeout regex) for subclasses that strip a vendor prefix.
    const isDeepResearchModel = this.getCapabilityModelName().includes('deep-research');
    if (isDeepResearchModel) {
      const hasWebSearchTool = config.tools?.some(
        (tool: any) => tool.type === 'web_search_preview',
      );
      if (!hasWebSearchTool) {
        return {
          error: `Deep research model ${this.modelName} requires the web_search_preview tool to be configured. Add it to your provider config:\ntools:\n  - type: web_search_preview`,
        };
      }

      // Validate MCP configuration for deep research
      const mcpTools = config.tools?.filter((tool: any) => tool.type === 'mcp') || [];
      for (const mcpTool of mcpTools) {
        if (mcpTool.require_approval !== 'never') {
          return {
            error: `Deep research model ${this.modelName} requires MCP tools to have require_approval: 'never'. Update your MCP tool configuration:\ntools:\n  - type: mcp\n    require_approval: never`,
          };
        }
      }
    }

    // Calculate timeout for long-running models and background responses.
    let timeout = getRequestTimeoutMs();
    const isGpt5ProModel = /(^|\/)gpt-5(?:\.\d+)?-pro(?:-|$)/.test(this.getCapabilityModelName());
    const isLongRunningModel = isDeepResearchModel || isGpt5ProModel || body.background === true;
    if (isLongRunningModel) {
      const evalTimeout = getEnvInt('PROMPTFOO_EVAL_TIMEOUT_MS', 0);
      timeout = evalTimeout > 0 ? evalTimeout : LONG_RUNNING_MODEL_TIMEOUT_MS;
      logger.debug(`Using timeout of ${timeout}ms for long-running model ${this.modelName}`);
    }

    let data: OpenAIResponsesResponse;
    let status: number;
    let statusText: string;
    let cached = false;
    let deleteFromCache: (() => Promise<void>) | undefined;
    let updateCache:
      | ((
          data: OpenAIResponsesResponse,
          status: number,
          statusText: string,
          headers?: Record<string, string>,
        ) => Promise<void>)
      | undefined;
    let responseHeaders: Record<string, string> | undefined;
    let pollingBackground = false;
    try {
      const url = `${this.getApiUrl()}/responses`;
      const customHeaders = this.getOpenAiRequestHeaders(config.headers);
      const hasCustomHeader = (name: string) =>
        Object.keys(customHeaders).some((header) => header.toLowerCase() === name);
      const request = {
        method: 'POST',
        headers: {
          ...(hasCustomHeader('content-type') ? {} : { 'Content-Type': 'application/json' }),
          ...(this.getApiKey() && !hasCustomHeader('authorization')
            ? { Authorization: `Bearer ${this.getApiKey()}` }
            : {}),
          ...customHeaders,
        },
        body: JSON.stringify(body),
        ...(abortSignal ? { signal: abortSignal } : {}),
      };

      if (body.stream && body.background) {
        let backgroundResponseId: string | undefined;
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeout);
        let abortGraceHandle: ReturnType<typeof setTimeout> | undefined;
        const abortStream = () => {
          if (backgroundResponseId) {
            controller.abort(abortSignal?.reason);
            return;
          }
          abortGraceHandle = setTimeout(
            () => controller.abort(abortSignal?.reason),
            BACKGROUND_STREAM_ABORT_GRACE_MS,
          );
        };
        abortSignal?.addEventListener('abort', abortStream, { once: true });
        try {
          const response = await fetchWithRetries(
            url,
            { ...request, signal: controller.signal },
            timeout,
            config.maxRetries,
          );
          status = response.status;
          statusText = response.statusText;
          responseHeaders = Object.fromEntries(response.headers.entries());
          if (status >= 200 && status < 300) {
            data = await readResponsesStream(response, 'OpenAI', logger, (streamedResponse) => {
              if (typeof streamedResponse.id === 'string') {
                backgroundResponseId = streamedResponse.id;
                if (abortSignal?.aborted) {
                  clearTimeout(abortGraceHandle);
                  controller.abort(abortSignal.reason);
                }
              }
            });
          } else {
            const text = await response.text();
            try {
              data = JSON.parse(text);
            } catch {
              data = text as OpenAIResponsesResponse;
            }
          }
        } catch (err) {
          if (backgroundResponseId && (controller.signal.aborted || abortSignal?.aborted)) {
            await cancelBackgroundResponse(backgroundResponseId, url, request.headers);
          }
          if (controller.signal.aborted && !abortSignal?.aborted) {
            throw new Error(`OpenAI streaming response timed out after ${timeout}ms`);
          }
          throw err;
        } finally {
          clearTimeout(timeoutHandle);
          clearTimeout(abortGraceHandle);
          abortSignal?.removeEventListener('abort', abortStream);
        }
      } else if (body.stream) {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeout);
        const signal = abortSignal
          ? AbortSignal.any([controller.signal, abortSignal])
          : controller.signal;
        try {
          const response = await fetchWithCache<string>(
            url,
            { ...request, signal },
            timeout,
            'text',
            true,
            config.maxRetries,
          );
          status = response.status;
          statusText = response.statusText;
          responseHeaders = response.headers;
          if (status >= 200 && status < 300) {
            data = await readResponsesStream(new Response(response.data), 'OpenAI', logger);
          } else {
            try {
              data = JSON.parse(response.data);
            } catch {
              data = response.data as OpenAIResponsesResponse;
            }
          }
        } catch (err) {
          if (controller.signal.aborted) {
            throw new Error(`OpenAI streaming response timed out after ${timeout}ms`);
          }
          throw err;
        } finally {
          clearTimeout(timeoutHandle);
        }
      } else {
        ({
          data,
          cached,
          status,
          statusText,
          deleteFromCache,
          updateCache,
          headers: responseHeaders,
        } = body.background
          ? await createBackgroundResponseWithCancellation(
              url,
              request,
              timeout,
              this.shouldBustCache(context),
              config.maxRetries,
            )
          : await fetchWithCache<OpenAIResponsesResponse>(
              url,
              request,
              timeout,
              'json',
              this.shouldBustCache(context),
              config.maxRetries,
            ));
      }

      if (status < 200 || status >= 300) {
        const errorMessage = `API error: ${status} ${statusText}\n${
          typeof data === 'string' ? data : JSON.stringify(data)
        }`;

        // Check if this is an invalid_prompt error code (indicates refusal)
        if (typeof data === 'object' && data?.error?.code === 'invalid_prompt') {
          return {
            output: errorMessage,
            tokenUsage: data?.usage ? getTokenUsage(data, cached) : undefined,
            isRefusal: true,
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

      if (body.background && (data.status === 'queued' || data.status === 'in_progress')) {
        pollingBackground = true;
        const polled = await coalesceBackgroundResponse(
          data,
          url,
          request,
          timeout,
          config.maxRetries,
          cached,
          deleteFromCache,
        );
        if (polled.shared) {
          cached = true;
        } else if (
          polled.retried ||
          (!polled.error &&
            (polled.data.status === 'completed' || polled.data.status === 'incomplete'))
        ) {
          cached = false;
        }
        data = polled.data;
        status = polled.status;
        statusText = polled.statusText;
        responseHeaders = polled.headers;
        if (!polled.error && (data.status === 'completed' || data.status === 'incomplete')) {
          await updateCache?.(data, status, statusText, responseHeaders);
        }
        if (polled.error) {
          if (polled.status === 0 || polled.cancelled) {
            await deleteFromCache?.();
          }
          return {
            error: polled.error,
            metadata: { http: { status, statusText, headers: responseHeaders ?? {} } },
          };
        }
      }

      if (body.background && (data.status === 'cancelled' || data.status === 'failed')) {
        await deleteFromCache?.();
        const upstreamError = data.error?.message;
        return {
          error: upstreamError
            ? `Background response ${data.id} ${data.status}: ${upstreamError}`
            : `Background response ${data.id} was ${data.status}.`,
          metadata: { http: { status, statusText, headers: responseHeaders ?? {} } },
        };
      }
    } catch (err) {
      if (isAbortError(err) || abortSignal?.aborted) {
        if (pollingBackground) {
          await deleteFromCache?.();
        }
        throw err;
      }
      if (err instanceof HttpRateLimitError) {
        return {
          error: formatRateLimitErrorMessage(err),
          metadata: {
            rateLimitKind: err.kind,
            http: {
              status: err.status,
              statusText: err.statusText,
              headers: err.headers ?? {},
            },
          },
        };
      }
      logger.error(`API call error: ${String(err)}`);
      if (!pollingBackground) {
        await deleteFromCache?.();
      }
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

    if (data.error?.message) {
      await deleteFromCache?.();
      return {
        error: formatOpenAiError(data as OpenAIErrorResponse),
        metadata: {
          http: {
            status,
            statusText,
            headers: responseHeaders ?? {},
          },
        },
      };
    }

    // Use shared processor for consistent behavior with Azure
    const result = await this.processor.processResponseOutput(data, config, cached, {
      suppressReasoningOutput: Boolean(body.stream),
    });
    const billedResult = this.applyBilling(result, data, config, cached);

    // Merge HTTP metadata with any existing metadata from the processor
    return {
      ...billedResult,
      metadata: {
        ...billedResult.metadata,
        http: {
          status,
          statusText,
          headers: responseHeaders ?? {},
        },
      },
    };
  }
}
