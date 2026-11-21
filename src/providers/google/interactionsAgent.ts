import logger from '../../logger';
import { computeRateLimitWaitMs, fetchWithTimeout } from '../../util/fetch/index';
import { getCallerAbortError } from '../../util/fetch/requestSignal';
import { readWithResponseDeadline } from '../../util/fetch/responseDeadline';
import { sanitizeUrl } from '../../util/sanitizer';
import { getRequestTimeoutMs, throwIfAborted, waitForPromiseWithAbort } from '../shared';
import {
  calculateExplicitInteractionCost,
  getInteractionModalityTokenCount,
  getInteractionsEndpoint,
  getModelOutputContent,
  hasSemanticInteractionInput,
  type InteractionResponse,
  interactionFields,
  mergeGoogleInteractionsRequestConfig,
  normalizeInteractionCitation,
  parseInteractionInput,
} from './interactions';
import { GOOGLE_MODELS } from './shared';
import {
  calculateGoogleCost,
  getNativeGeminiApiKey,
  normalizeGoogleServiceTier,
  resolveGoogleToolConfig,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { GoogleProviderConfig } from './types';

/** Configuration for Gemini managed agents called through the Interactions API. */
export interface GoogleInteractionsAgentConfig extends GoogleProviderConfig {
  /**
   * Agent settings sent as `agent_config`, using Google's field names (for example
   * `thinking_summaries` or `max_total_tokens`). `type` is filled in for Deep Research and
   * Antigravity agents when omitted.
   */
  agentConfig?: Record<string, unknown>;
  /** Sandbox: `"remote"`, an existing environment ID, or an `EnvironmentConfig` object. */
  environment?: string | Record<string, unknown>;
  /** Delay between status checks in milliseconds. Default: 10000. */
  pollIntervalMs?: number;
  /** Maximum time to wait for the agent to finish, in milliseconds. Default: 3600000. */
  maxPollTimeMs?: number;
}

type AgentInteractionResponse = InteractionResponse & {
  agent?: string;
  environment_id?: string;
  service_tier?: string;
  errors?: Array<{ code?: string; message?: string }>;
  usage?: InteractionResponse['usage'] & {
    grounding_tool_count?: Array<{ type?: string; count?: number }>;
  };
};

type AgentBilling = {
  config: GoogleInteractionsAgentConfig;
  pricingModel?: string;
  /** Service tier from the create response; status checks may omit it. */
  serviceTier?: string;
};

type PreparedAgentRequest = {
  body: Record<string, unknown>;
  endpoint: string;
  headers: Record<string, string>;
  billing: AgentBilling;
  pollIntervalMs: number;
  maxPollTimeMs: number;
};

type AgentRequestResult =
  | { ok: true; data: AgentInteractionResponse }
  | {
      ok: false;
      response?: Response;
      message: string;
      transient: boolean;
    };

const DEFAULT_POLL_INTERVAL_MS = 10_000;
// Google documents a 60-minute maximum research time for Deep Research.
const DEFAULT_MAX_POLL_TIME_MS = 60 * 60 * 1000;
const CANCEL_TIMEOUT_MS = 10_000;
// Upper bound for the backoff after failed status checks, which are free to repeat.
const MAX_POLL_BACKOFF_MS = 60_000;
// A 429 means Google did not create the task, so the create request can be sent again.
const MAX_CREATE_RATE_LIMIT_RETRIES = 3;
const INTERACTIONS_API_REVISION = '2026-05-20';

// Fields promptfoo owns on agent requests. `store` is validated separately because background
// execution requires stored interactions.
const RESERVED_AGENT_REQUEST_FIELDS = new Set([
  'agent',
  'model',
  'input',
  'background',
  'stream',
  'store',
  'agent_config',
  'agentConfig',
  'environment',
  'previous_interaction_id',
  'previousInteractionId',
  'toolConfig',
  'tool_config',
]);

// Agents whose `agent_config.type` and environment defaults Google documents.
function getBuiltInAgentType(agentId: string): 'deep-research' | 'antigravity' | undefined {
  if (agentId.startsWith('deep-research-')) {
    return 'deep-research';
  }
  if (agentId.startsWith('antigravity-')) {
    return 'antigravity';
  }
  return undefined;
}

/**
 * Model used to price token usage. Google bills managed agents at the underlying model's list
 * rates, but the response does not name that model. Only the Antigravity release whose default
 * model Google documents, or an explicit `agent_config.model`, can be priced from the catalog.
 */
function getPricingModel(agentId: string, agentConfig: Record<string, unknown> | undefined) {
  if (typeof agentConfig?.model === 'string' && agentConfig.model.trim()) {
    return agentConfig.model.trim();
  }
  return agentId === 'antigravity-preview-09-2026' ? 'gemini-4-hydrogen' : undefined;
}

function parsePositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Options that would fail or misbehave on an agent request, rejected before any task starts. */
function getAgentConfigError(
  config: GoogleInteractionsAgentConfig,
  passthrough: Record<string, unknown>,
): string | undefined {
  if (config.vertexai) {
    return 'Gemini managed agents are supported only through the Gemini API. Remove vertexai: true and use a Gemini API key.';
  }
  if (passthrough.store !== undefined && passthrough.store !== true) {
    return 'Gemini managed agents run in the background, which requires store: true.';
  }
  if (Array.isArray(config.tools) ? config.tools.length > 0 : Boolean(config.tools)) {
    return 'Gemini managed agents require Interactions-native tool declarations in config.passthrough.tools.';
  }
  const tools = passthrough.tools;
  if (
    Array.isArray(tools) &&
    tools.some((tool) => ['function', 'computer_use'].includes(String(tool?.type)))
  ) {
    return 'Gemini managed agent function and computer-use tools are not supported because Promptfoo does not handle requires_action responses.';
  }
  return undefined;
}

function getInteractionErrorMessage(data: AgentInteractionResponse): string | undefined {
  const messages = [
    data.error?.message,
    ...(Array.isArray(data.errors) ? data.errors.map((error) => error?.message) : []),
  ].filter((message): message is string => typeof message === 'string' && message.length > 0);
  return messages.length > 0 ? messages.join('; ') : undefined;
}

function waitForPoll(ms: number, signal?: AbortSignal): Promise<void> {
  let timer: NodeJS.Timeout;
  const elapsed = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return waitForPromiseWithAbort(elapsed, signal).finally(() => clearTimeout(timer));
}

async function readInteractionResponse(response: Response): Promise<AgentRequestResult> {
  // fetchWithTimeout stops its timer when headers arrive; keep the request deadline for the body.
  const body = await readWithResponseDeadline(response, () => response.text());
  let data: AgentInteractionResponse | undefined;
  try {
    data = body ? (JSON.parse(body) as AgentInteractionResponse) : {};
  } catch {
    data = undefined;
  }
  // A failed interaction is still a successful read: it carries a status and its own error.
  if (response.ok && data && (data.status !== undefined || !data.error?.message)) {
    return { ok: true, data };
  }
  const message =
    data?.error?.message ||
    `HTTP ${response.status} ${response.statusText}${data ? '' : ': non-JSON response'}`.trim();
  return {
    ok: false,
    response,
    message,
    transient: response.ok
      ? data === undefined
      : response.status === 408 || response.status === 429 || response.status >= 500,
  };
}

export class GoogleInteractionsAgentProvider implements ApiProvider {
  agentId: string;
  config: GoogleInteractionsAgentConfig;
  env?: EnvOverrides;
  // Each create request starts a billed task. The scheduler must never replay the call.
  readonly handlesOwnRetries = true;
  private providerId?: string;

  constructor(
    agentId: string,
    options: { config?: GoogleInteractionsAgentConfig; env?: EnvOverrides; id?: string } = {},
  ) {
    this.agentId = agentId;
    this.config = options.config || {};
    this.env = options.env;
    this.providerId = options.id;
  }

  id(): string {
    return this.providerId || `google:interactions:agent:${this.agentId}`;
  }

  toString(): string {
    return `[Google Interactions Agent Provider ${this.agentId}]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const signal = options?.abortSignal;
    throwIfAborted(signal);
    const request = this.prepareRequest(prompt, context);
    if ('error' in request) {
      return { error: request.error };
    }
    const deadline = Date.now() + request.maxPollTimeMs;

    const created = await this.createInteraction(request, deadline, signal);
    if (!('data' in created)) {
      return created;
    }
    const interactionId = created.data.id;
    if (!interactionId) {
      return {
        error: 'Gemini agent API response did not include an interaction ID.',
        metadata: { agent: this.agentId, status: created.data.status, rateLimitRetryable: false },
      };
    }
    request.billing.serviceTier = created.data.service_tier;
    logger.info(
      `[Google Interactions Agent] Started ${this.agentId} interaction ${interactionId}; polling every ${request.pollIntervalMs}ms for up to ${request.maxPollTimeMs}ms`,
    );

    const interactionUrl = `${request.endpoint}/${encodeURIComponent(interactionId)}`;
    try {
      return await this.waitForCompletion(
        created.data,
        interactionId,
        interactionUrl,
        request,
        deadline,
        signal,
      );
    } catch (err) {
      if (signal?.aborted) {
        await this.cancelInteraction(interactionUrl, request.headers, interactionId);
        throw getCallerAbortError(signal);
      }
      // Never let an unexpected failure surface as a thrown, retryable error: the task exists.
      return this.errorResponse(
        created.data,
        interactionId,
        `Gemini agent interaction ${interactionId} failed while waiting for completion: ${String(err)}. Retrieve it with GET ${sanitizeUrl(interactionUrl)}.`,
        request.billing,
      );
    }
  }

  private prepareRequest(
    prompt: string,
    context?: CallApiContextParams,
  ): PreparedAgentRequest | { error: string } {
    const promptConfig = context?.prompt?.config as
      | Partial<GoogleInteractionsAgentConfig>
      | undefined;
    const config = mergeGoogleInteractionsRequestConfig(
      this.config,
      promptConfig,
    ) as GoogleInteractionsAgentConfig;
    const field = interactionFields(this.config, promptConfig);
    const passthrough: Record<string, unknown> = {
      ...this.config.passthrough,
      ...promptConfig?.passthrough,
      store: field('store'),
    };
    const toolMode =
      resolveGoogleToolConfig(promptConfig ?? {}).toolConfig?.functionCallingConfig?.mode ??
      resolveGoogleToolConfig(this.config).toolConfig?.functionCallingConfig?.mode;
    if (toolMode === 'NONE') {
      delete config.tools;
      delete passthrough.tools;
    }
    const configError = getAgentConfigError(config, passthrough);
    if (configError) {
      return { error: configError };
    }
    const pollIntervalMs = parsePositiveNumber(config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    const maxPollTimeMs = parsePositiveNumber(config.maxPollTimeMs ?? DEFAULT_MAX_POLL_TIME_MS);
    if (pollIntervalMs === undefined || maxPollTimeMs === undefined) {
      return { error: 'Gemini agent pollIntervalMs and maxPollTimeMs must be positive numbers.' };
    }
    const apiKey = getNativeGeminiApiKey({ apiKey: config.apiKey }, this.env);
    if (!apiKey) {
      return {
        error:
          'Gemini managed agents require an API key. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or PALM_API_KEY, or add apiKey to the provider config.',
      };
    }

    const { input: parsedInput, systemInstruction } = parseInteractionInput(prompt, true);
    const input = passthrough.input ?? parsedInput;
    if (!hasSemanticInteractionInput(input)) {
      return { error: 'Gemini agent prompt must contain at least one input item.' };
    }

    const builtInType = getBuiltInAgentType(this.agentId);
    const configuredAgentConfig = field('agentConfig', 'agent_config');
    const agentConfig = isPlainObject(configuredAgentConfig)
      ? { ...(builtInType ? { type: builtInType } : {}), ...configuredAgentConfig }
      : undefined;
    const environment =
      field('environment') ?? (builtInType === 'antigravity' ? 'remote' : undefined);
    const previousInteractionId = field('previousInteractionId', 'previous_interaction_id');
    const extraFields = Object.fromEntries(
      Object.entries(passthrough).filter(([field]) => !RESERVED_AGENT_REQUEST_FIELDS.has(field)),
    );

    return {
      body: {
        agent: this.agentId,
        input,
        ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
        ...(agentConfig ? { agent_config: agentConfig } : {}),
        ...(environment === undefined ? {} : { environment }),
        ...(previousInteractionId === undefined
          ? {}
          : { previous_interaction_id: previousInteractionId }),
        ...extraFields,
        background: true,
      },
      endpoint: getInteractionsEndpoint(config, this.env),
      headers: {
        'Content-Type': 'application/json',
        'Api-Revision': INTERACTIONS_API_REVISION,
        'x-goog-api-key': apiKey,
        ...config.headers,
      },
      billing: { config, pricingModel: getPricingModel(this.agentId, agentConfig) },
      pollIntervalMs,
      maxPollTimeMs,
    };
  }

  /**
   * Creating an agent interaction starts a billed background task. Promptfoo resends the request
   * only after an HTTP 429, which means Google did not create the task. Any other failure may
   * have started a task, so it is reported instead of retried.
   */
  private async createInteraction(
    request: PreparedAgentRequest,
    deadline: number,
    signal?: AbortSignal,
  ): Promise<{ data: AgentInteractionResponse } | ProviderResponse> {
    const body = JSON.stringify(request.body);
    for (let attempt = 0; ; attempt++) {
      throwIfAborted(signal);
      // The request itself is not tied to the caller's signal: once Google receives it, the task
      // exists, and its ID is needed to cancel it.
      const pending = fetchWithTimeout(
        request.endpoint,
        {
          method: 'POST',
          headers: request.headers,
          body,
          disableTransientRetries: true,
        },
        getRequestTimeoutMs(),
      ).then(readInteractionResponse);

      let created: AgentRequestResult;
      try {
        created = await waitForPromiseWithAbort(pending, signal);
      } catch (err) {
        if (signal?.aborted) {
          void pending
            .then((late) =>
              late.ok && late.data.id && late.data.status === 'in_progress'
                ? this.cancelInteraction(
                    `${request.endpoint}/${encodeURIComponent(late.data.id)}`,
                    request.headers,
                    late.data.id,
                  )
                : undefined,
            )
            .catch(() => undefined);
          throw getCallerAbortError(signal);
        }
        return {
          error: `Gemini agent request failed: ${String(err)}. Promptfoo does not retry agent requests because Google may already have started a billed background task.`,
          metadata: { agent: this.agentId, rateLimitRetryable: false },
        };
      }
      if (created.ok) {
        return { data: created.data };
      }
      const { response } = created;
      if (response?.status === 429 && attempt < MAX_CREATE_RATE_LIMIT_RETRIES) {
        const delay = response.headers.has('retry-after')
          ? computeRateLimitWaitMs(response)
          : 5_000 * 2 ** attempt;
        if (delay < deadline - Date.now()) {
          await waitForPoll(delay, signal);
          if (Date.now() < deadline) {
            continue;
          }
        }
      }
      return {
        error: `Gemini agent API error: ${created.message}`,
        metadata: {
          agent: this.agentId,
          rateLimitRetryable: false,
          ...(response && {
            http: {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers),
            },
          }),
        },
      };
    }
  }

  private async waitForCompletion(
    initial: AgentInteractionResponse,
    interactionId: string,
    interactionUrl: string,
    request: PreparedAgentRequest,
    deadline: number,
    signal?: AbortSignal,
  ): Promise<ProviderResponse> {
    let data = initial;
    let consecutiveFailures = 0;
    let lastFailure: string | undefined;
    let pollCount = 0;
    const retrieveHint = `Retrieve it with GET ${sanitizeUrl(interactionUrl)}.`;
    while (data.status === 'in_progress') {
      // Status checks are idempotent, so transient failures back off until the deadline.
      const delay = Math.min(
        request.pollIntervalMs * 2 ** consecutiveFailures,
        Math.max(request.pollIntervalMs, MAX_POLL_BACKOFF_MS),
        deadline - Date.now(),
      );
      if (delay > 0) {
        await waitForPoll(delay, signal);
      }
      throwIfAborted(signal);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return this.errorResponse(
          data,
          interactionId,
          `Gemini agent interaction ${interactionId} did not finish within ${request.maxPollTimeMs}ms (last status: ${data.status}${lastFailure ? `; last status check failed: ${lastFailure}` : ''}). Promptfoo stopped waiting but did not cancel it, so it may still complete and incur charges. ${retrieveHint}`,
          request.billing,
        );
      }
      let polled: AgentRequestResult;
      try {
        const response = await fetchWithTimeout(
          interactionUrl,
          {
            method: 'GET',
            headers: request.headers,
            disableTransientRetries: true,
            ...(signal ? { signal } : {}),
          },
          Math.min(getRequestTimeoutMs(), remaining),
        );
        polled = await readInteractionResponse(response);
      } catch (err) {
        throwIfAborted(signal);
        polled = { ok: false, message: String(err), transient: true };
      }
      pollCount++;

      if (polled.ok) {
        consecutiveFailures = 0;
        lastFailure = undefined;
        data = polled.data;
        logger.debug('[Google Interactions Agent] Polled interaction', {
          pollCount,
          status: data.status,
        });
        continue;
      }
      consecutiveFailures++;
      lastFailure = polled.message;
      logger.debug('[Google Interactions Agent] Poll failed', {
        consecutiveFailures,
        status: polled.response?.status,
        message: polled.message,
      });
      if (!polled.transient) {
        return this.errorResponse(
          data,
          interactionId,
          `Gemini agent interaction ${interactionId} could not be retrieved: ${polled.message}. The task may still be running. ${retrieveHint}`,
          request.billing,
        );
      }
    }
    return this.finalResponse(data, interactionId, request.billing);
  }

  private async cancelInteraction(
    interactionUrl: string,
    headers: Record<string, string>,
    interactionId: string,
  ): Promise<void> {
    try {
      const response = await fetchWithTimeout(
        `${interactionUrl}/cancel`,
        { method: 'POST', headers, body: '{}', disableTransientRetries: true },
        CANCEL_TIMEOUT_MS,
      );
      if (response.ok) {
        logger.info(`[Google Interactions Agent] Cancelled interaction ${interactionId}`);
      } else {
        logger.warn(
          `[Google Interactions Agent] Could not cancel interaction ${interactionId}: HTTP ${response.status}`,
        );
      }
    } catch (err) {
      logger.warn(
        `[Google Interactions Agent] Could not cancel interaction ${interactionId}: ${String(err)}`,
      );
    }
  }

  private getUsage(data: AgentInteractionResponse, billing: AgentBilling) {
    const { config, pricingModel } = billing;
    const usage = data.usage;
    if (!usage) {
      return { tokenUsage: undefined, cost: undefined };
    }
    const promptTokens = (usage.total_input_tokens ?? 0) + (usage.total_tool_use_tokens ?? 0);
    const outputTokens = usage.total_output_tokens ?? 0;
    const thoughtTokens = usage.total_reasoning_tokens ?? usage.total_thought_tokens ?? 0;
    const cachedTokens = usage.total_cached_tokens ?? 0;
    const tokenUsage = {
      prompt: promptTokens,
      completion: outputTokens,
      total: usage.total_tokens ?? promptTokens + outputTokens + thoughtTokens,
      cached: cachedTokens,
      numRequests: 1,
      ...(thoughtTokens > 0 ? { completionDetails: { reasoning: thoughtTokens } } : {}),
    };

    const imageModalities = ['image', 'document', 'video'];
    const audioInputTokens =
      getInteractionModalityTokenCount(usage.input_tokens_by_modality, ['audio']) +
      getInteractionModalityTokenCount(usage.tool_use_tokens_by_modality, ['audio']);
    const imageInputTokens =
      getInteractionModalityTokenCount(usage.input_tokens_by_modality, imageModalities) +
      getInteractionModalityTokenCount(usage.tool_use_tokens_by_modality, imageModalities);
    const cost =
      pricingModel && GOOGLE_MODELS.some((model) => model.id === pricingModel)
        ? calculateGoogleCost(
            pricingModel,
            config,
            promptTokens,
            outputTokens + thoughtTokens,
            false,
            audioInputTokens,
            getInteractionModalityTokenCount(usage.output_tokens_by_modality, ['audio']),
            getInteractionModalityTokenCount(usage.output_tokens_by_modality, ['video']),
            imageInputTokens,
            cachedTokens,
            getInteractionModalityTokenCount(usage.cached_tokens_by_modality, ['audio']),
            getInteractionModalityTokenCount(usage.cached_tokens_by_modality, imageModalities),
            normalizeGoogleServiceTier(data.service_tier ?? billing.serviceTier) as
              | 'standard'
              | 'priority'
              | 'flex'
              | undefined,
          )
        : calculateExplicitInteractionCost(
            config,
            promptTokens,
            outputTokens + thoughtTokens,
            audioInputTokens,
            0,
            0,
            imageInputTokens,
          );
    return { tokenUsage, cost };
  }

  private getMetadata(data: AgentInteractionResponse, interactionId: string) {
    const toolCallCounts: Record<string, number> = {};
    for (const step of data.steps || []) {
      if (step.type?.endsWith('_call')) {
        toolCallCounts[step.type] = (toolCallCounts[step.type] ?? 0) + 1;
      }
    }
    const groundingToolCount = data.usage?.grounding_tool_count;
    return {
      interactionId,
      agent: this.agentId,
      status: data.status,
      ...(data.environment_id ? { environmentId: data.environment_id } : {}),
      ...(Object.keys(toolCallCounts).length > 0 ? { toolCallCounts } : {}),
      ...(Array.isArray(groundingToolCount) && groundingToolCount.length > 0
        ? { groundingToolCount }
        : {}),
    };
  }

  private errorResponse(
    data: AgentInteractionResponse,
    interactionId: string,
    error: string,
    billing: AgentBilling,
  ): ProviderResponse {
    const { tokenUsage, cost } = this.getUsage(data, billing);
    return {
      error,
      ...(tokenUsage ? { tokenUsage } : {}),
      ...(cost === undefined ? {} : { cost }),
      // The task already exists. A scheduler retry would start a second billed task.
      metadata: { ...this.getMetadata(data, interactionId), rateLimitRetryable: false },
    };
  }

  private finalResponse(
    data: AgentInteractionResponse,
    interactionId: string,
    billing: AgentBilling,
  ): ProviderResponse {
    if (data.status !== 'completed' && data.status !== 'incomplete') {
      const reason = getInteractionErrorMessage(data);
      const description =
        data.status === 'requires_action'
          ? 'requires client action, which Promptfoo does not support for managed agents'
          : `ended with status ${data.status ?? 'unknown'}`;
      return this.errorResponse(
        data,
        interactionId,
        `Gemini agent interaction ${interactionId} ${description}${reason ? `: ${reason}` : ''}`,
        billing,
      );
    }

    const outputContent = getModelOutputContent(data);
    const output = outputContent
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    if (!output) {
      return this.errorResponse(
        data,
        interactionId,
        `Gemini agent interaction ${interactionId} (status: ${data.status}) did not return text output.`,
        billing,
      );
    }
    if (data.status === 'incomplete') {
      logger.warn(
        `[Google Interactions Agent] Interaction ${interactionId} returned incomplete results`,
      );
    }
    const citations = outputContent.flatMap((part) =>
      Array.isArray(part.annotations)
        ? part.annotations.flatMap((annotation) =>
            normalizeInteractionCitation(annotation, part.text),
          )
        : [],
    );
    const { tokenUsage, cost } = this.getUsage(data, billing);
    return {
      output,
      cached: false,
      ...(tokenUsage ? { tokenUsage } : {}),
      cost,
      metadata: {
        ...this.getMetadata(data, interactionId),
        ...(citations.length > 0 ? { citations } : {}),
      },
    };
  }
}
