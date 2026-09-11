import logger from '../../logger';
import { fetchWithRetries, readBoundedText } from '../../util/fetch/index';
import { renderVarsInObject } from '../../util/render';
import { isSecretField, REDACTED } from '../../util/sanitizer';
import { analyzeTemplateReference } from '../../util/templates';
import { sleepWithAbort } from '../../util/time';
import { buildChatSpanContext, extractProviderResponseAttributes, withGenAISpan } from '../tracing';
import { calculateOpenAIUsageCost } from './billing';
import { OpenAiGenericProvider } from './index';
import { appendOpenAiApiPath, assertOpenAiApiModel } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  VarValue,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

interface AgentsApiOptions extends OpenAiSharedOptions {
  model?: string;
  agent_id?: string;
  agent?: {
    model?: string;
    instructions?: string;
    service_tier?: string;
    [key: string]: unknown;
  };
  environment?: { type: 'none' | 'openai_hosted'; [key: string]: unknown };
  metadata?: Record<string, string>;
  vault_ids?: string[];
  timeoutMs?: number;
  pollIntervalMs?: number;
  cleanupTimeoutMs?: number;
  usageTimeoutMs?: number;
  retainSession?: boolean;
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

interface Session {
  id: string;
  agent: { model: string; service_tier?: string; multi_agent?: { enabled: boolean } };
  status: 'idle' | 'in_progress' | 'requires_action' | 'failed';
  error?: string | null;
  usage?: Usage | null;
  required_actions?: { type: string; name?: string }[];
}

interface Turn {
  id: string;
  subagent_id: string | null;
  status: 'queued' | 'in_progress' | 'waiting' | 'completed' | 'failed' | 'cancelled';
  error?: { code?: string; message: string } | null;
  usage?: Usage | null;
}

interface Item {
  id: string | null;
  type: string;
  turn_id: string;
  status?: string;
  role?: string;
  phase?: 'commentary' | 'final_answer' | null;
  content?: { type: string; text?: string }[];
  name?: string;
}

interface Page<T> {
  data: T[];
  has_more: boolean;
  last_id: string | null;
}

const MAX_TIMER_MS = 2_147_483_647;
const MAX_ERROR_DETAIL_LENGTH = 1_024;
const TRANSIENT_STATUS_CODES = new Set([500, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 8_000;
const CLEANUP_RETRY_MAX_DELAY_MS = 5_000;
// Session usage normally follows root-turn usage within seconds.
const TURN_USAGE_GRACE_MS = 5_000;
// Redacting short values such as `x-api-key: 1` would corrupt unrelated error text.
const MIN_CREDENTIAL_LENGTH = 8;
const CREDENTIAL_NAME =
  /(?:authorization|api[-_]?key|token|secret|signature|credential|cookie|password|(?:^|[-_])key$)/i;

class AgentsApiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AgentsApiHttpError';
  }
}

function isCredentialName(name: string): boolean {
  return isSecretField(name) || CREDENTIAL_NAME.test(name);
}

function addCredential(credentials: Set<string>, value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }
  const trimmed = value.trim();
  for (const candidate of [trimmed, trimmed.replace(/^(?:Bearer|Basic|Token)\s+/i, '')]) {
    if (candidate.length >= MIN_CREDENTIAL_LENGTH) {
      credentials.add(candidate);
      credentials.add(encodeURIComponent(candidate));
    }
  }
}

/** Collect credential values from credential-named keys and secret URL query parameters. */
function collectConfigCredentials(value: unknown, credentials: Set<string>, key = ''): void {
  if (typeof value === 'string') {
    if (key && isCredentialName(key)) {
      addCredential(credentials, value);
    }
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        addCredential(credentials, decodeURIComponent(url.password));
        for (const [name, param] of url.searchParams) {
          if (isCredentialName(name)) {
            addCredential(credentials, param);
          }
        }
      } catch {
        // Strings that are not valid URLs contain no query credentials.
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectConfigCredentials(item, credentials, key);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [childKey, item] of Object.entries(value)) {
      collectConfigCredentials(item, credentials, childKey);
    }
  }
}

function sortCredentials(credentials: Set<string>): string[] {
  // Replace longer values first so a credential containing another is fully removed.
  return [...credentials].sort((left, right) => right.length - left.length);
}

function redactCredentials(text: string, credentials: readonly string[]): string {
  let redacted = text;
  for (const credential of credentials) {
    redacted = redacted.split(credential).join(REDACTED);
  }
  return redacted
    .replace(/\bsk-[\w-]{16,}/g, REDACTED)
    .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/gi, `$1 ${REDACTED}`);
}

function referencesVariable(template: string, names: string[]): boolean {
  return names.some((name) => {
    const reference = analyzeTemplateReference(template, name);
    return reference.parsed && reference.referenced;
  });
}

/** Render only strings that reference test vars, preserving literal braces in commands and code. */
function renderConfigTemplates(
  value: unknown,
  vars: Record<string, VarValue>,
  names: string[],
): unknown {
  if (typeof value === 'string') {
    return (value.includes('{{') || value.includes('{%')) && referencesVariable(value, names)
      ? renderVarsInObject(value, vars)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderConfigTemplates(item, vars, names));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, renderConfigTemplates(item, vars, names)]),
    );
  }
  return typeof value === 'function' ? renderVarsInObject(value, vars) : value;
}

/** Managed Codex sessions, distinct from the local @openai/agents SDK provider. */
export class OpenAiAgentsApiProvider extends OpenAiGenericProvider {
  declare config: AgentsApiOptions;
  private readonly modelOverride: string;
  private credentials: string[] = [];

  constructor(
    modelName = '',
    options: { config?: AgentsApiOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const config = options.config ?? {};
    super(
      modelName || config.agent?.model || config.model || (config.agent_id ? '' : 'gpt-6-astra'),
      options,
    );
    this.modelOverride = modelName;
    for (const key of ['timeoutMs', 'pollIntervalMs', 'cleanupTimeoutMs'] as const) {
      const value = config[key];
      if (
        value !== undefined &&
        (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TIMER_MS)
      ) {
        throw new Error(
          `Agents API ${key} must be a positive integer no greater than ${MAX_TIMER_MS}`,
        );
      }
    }
    const { usageTimeoutMs } = config;
    if (
      usageTimeoutMs !== undefined &&
      (!Number.isSafeInteger(usageTimeoutMs) || usageTimeoutMs < 0 || usageTimeoutMs > MAX_TIMER_MS)
    ) {
      throw new Error(
        `Agents API usageTimeoutMs must be a non-negative integer no greater than ${MAX_TIMER_MS}`,
      );
    }
    if (config.environment && !['none', 'openai_hosted'].includes(config.environment.type)) {
      throw new Error('Agents API environment.type must be "none" or "openai_hosted"');
    }
    if (this.modelName) {
      assertOpenAiApiModel(this.modelName, this.getApiUrl());
    }
  }

  id(): string {
    return this.modelName ? `openai:agents-api:${this.modelName}` : 'openai:agents-api';
  }

  private redact(text: string): string {
    return redactCredentials(text, this.credentials);
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE',
    headers: Headers,
    signal: AbortSignal,
    body?: unknown,
    query?: string,
    // Replaying a session creation can start another billable agent task.
    idempotent = method !== 'POST',
  ): Promise<T> {
    const maxRetries = Math.max(0, this.config.maxRetries ?? 4);
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      const response = await fetchWithRetries(
        appendOpenAiApiPath(this.getApiUrl(), endpoint, query),
        {
          method,
          headers,
          signal,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        30_000,
        idempotent ? this.config.maxRetries : 0,
      );
      if (idempotent && TRANSIENT_STATUS_CODES.has(response.status) && attempt < maxRetries) {
        await response.body?.cancel();
        await sleepWithAbort(
          Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS),
          signal,
        );
        continue;
      }
      if (method === 'DELETE' && response.status === 404) {
        // A previous deletion may have succeeded even if its response was lost.
        await response.body?.cancel();
        return undefined as T;
      }
      if (!response.ok) {
        let detail = '';
        try {
          const parsed = JSON.parse(await readBoundedText(response, 8_192));
          const message = typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message;
          if (typeof message === 'string') {
            // Error messages may echo request credentials, including custom auth headers.
            detail = this.redact(message).slice(0, MAX_ERROR_DETAIL_LENGTH);
          }
        } catch {
          signal.throwIfAborted();
        }
        throw new AgentsApiHttpError(
          `Agents API ${method} failed: HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
          response.status,
        );
      }
      if (response.status === 204) {
        return undefined as T;
      }
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }

  private async list<T>(endpoint: string, headers: Headers, signal: AbortSignal): Promise<T[]> {
    const items: T[] = [];
    const cursors = new Set<string>();
    let after: string | undefined;
    do {
      const query = new URLSearchParams({ order: 'asc', limit: '100' });
      if (after) {
        query.set('after', after);
      }
      const page = await this.request<Page<T>>(
        endpoint,
        'GET',
        headers,
        signal,
        undefined,
        query.toString(),
      );
      if (!Array.isArray(page?.data)) {
        throw new Error('Agents API returned an invalid list response');
      }
      items.push(...page.data);
      if (!page.has_more) {
        return items;
      }
      if (!page.last_id || cursors.has(page.last_id)) {
        throw new Error('Agents API returned an invalid pagination cursor');
      }
      after = page.last_id;
      cursors.add(after);
    } while (true);
  }

  private getFinalAnswer(items: Item[]): string {
    const messages = items.filter(
      (item) => item.type === 'message' && item.role === 'assistant' && item.status === 'completed',
    );
    const finalMessages = messages.filter((item) => item.phase === 'final_answer');
    const textParts = (
      finalMessages.length ? finalMessages : messages.filter((item) => !item.phase)
    )
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === 'output_text' && typeof part.text === 'string');
    if (!textParts.length) {
      throw new Error('Agents API turn completed without a final assistant answer');
    }
    return textParts.map((part) => part.text).join('\n');
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const mergedConfig = { ...this.config, ...context?.prompt?.config };
    // Promptfoo can attach a live provider here; do not render its methods or state.
    delete mergedConfig.provider;
    try {
      const vars = context?.vars;
      const config = (
        vars ? renderConfigTemplates(mergedConfig, vars, Object.keys(vars)) : mergedConfig
      ) as AgentsApiOptions;
      // Keep request credentials and lifecycle settings isolated across concurrent calls.
      const callProvider = new OpenAiAgentsApiProvider(this.modelOverride, {
        config,
        env: this.env,
      });
      const spanContext = buildChatSpanContext({
        system: 'openai',
        model: callProvider.modelName,
        providerId: this.id(),
        prompt,
        context,
      });
      return await withGenAISpan(
        { ...spanContext, operationName: 'invoke_agent', agentId: config.agent_id },
        () => callProvider.runSession(prompt, options),
        (response) => ({
          ...extractProviderResponseAttributes(response),
          responseModel:
            typeof response.metadata?.model === 'string' ? response.metadata.model : undefined,
        }),
      );
    } catch (error) {
      options?.abortSignal?.throwIfAborted();
      const credentials = new Set<string>();
      addCredential(credentials, this.getApiKey());
      collectConfigCredentials(mergedConfig, credentials);
      return {
        cached: false,
        error: redactCredentials(
          error instanceof Error ? error.message : String(error),
          sortCredentials(credentials),
        ),
      };
    }
  }

  private async runSession(
    prompt: string,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const headers = new Headers(this.getOpenAiRequestHeaders());
    const apiKey = this.getApiKey();
    const credentials = new Set<string>();
    addCredential(credentials, apiKey);
    let hasHeaderCredential = false;
    headers.forEach((value, name) => {
      if (isCredentialName(name)) {
        hasHeaderCredential ||= value.trim().length > 0;
        addCredential(credentials, value);
      }
    });
    collectConfigCredentials(this.config, credentials);
    this.credentials = sortCredentials(credentials);
    if (!apiKey && !hasHeaderCredential && this.requiresApiKey()) {
      return { error: this.getMissingApiKeyErrorMessage() };
    }
    if (apiKey && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${apiKey}`);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('OpenAI-Beta', 'agents=v1');

    const timeoutMs = this.config.timeoutMs ?? 300_000;
    const deadline = Date.now() + timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.abortSignal
      ? AbortSignal.any([controller.signal, options.abortSignal])
      : controller.signal;
    let endpoint: string | undefined;
    let completed = false;
    const result: ProviderResponse = { cached: false };
    const metadata: Record<string, unknown> = {};
    try {
      const session = await this.request<Session>('agents/sessions', 'POST', headers, signal, {
        agent_id: this.config.agent_id,
        agent: {
          ...this.config.agent,
          ...(this.modelName ? { model: this.modelName } : {}),
        },
        environment: this.config.environment ?? { type: 'none' },
        input: prompt,
        metadata: this.config.metadata,
        vault_ids: this.config.vault_ids,
        stream: false,
      });
      if (!session?.id || typeof session.id !== 'string') {
        throw new Error('Agents API did not return a session ID');
      }
      endpoint = `agents/sessions/${encodeURIComponent(session.id)}`;
      metadata.sessionId = session.id;
      const { session: completedSession, turn } = await this.waitForTurn(
        session,
        endpoint,
        headers,
        signal,
      );
      const items = (await this.list<Item>(`${endpoint}/items`, headers, signal)).filter(
        (item) => item.turn_id === turn.id,
      );
      const output = this.getFinalAnswer(items);
      const { session: finished, turn: finishedTurn } = await this.waitForFinalUsage(
        completedSession,
        turn,
        endpoint,
        headers,
        signal,
        deadline,
        options?.abortSignal,
      );
      // Session usage includes subagent work, so prefer it over the root turn's usage.
      const usage = finished.usage ?? finishedTurn.usage;
      const model = finished.agent.model;
      result.output = output;
      result.tokenUsage = usage
        ? {
            prompt: usage.input_tokens,
            completion: usage.output_tokens,
            total: usage.total_tokens,
            cached: usage.input_tokens_details?.cached_tokens,
            completionDetails: { reasoning: usage.output_tokens_details?.reasoning_tokens },
          }
        : undefined;
      const hasSubagents =
        finished.agent.multi_agent?.enabled ||
        items.some((item) => item.type === 'create_subagent_call');
      // Aggregate session tokens do not identify each subagent's model or service tier.
      if (!hasSubagents) {
        result.cost = calculateOpenAIUsageCost(model, this.config, usage, {
          apiUrl: this.getApiUrl(),
          serviceTier: finished.agent.service_tier,
        });
      }
      Object.assign(metadata, {
        turnId: turn.id,
        model,
        costScope: hasSubagents
          ? 'unavailable for aggregate subagent usage'
          : 'model tokens only; excludes tools and sandbox charges',
        toolCalls: items
          .filter((item) => item.type !== 'message' && item.type !== 'reasoning')
          .map(({ id, type, name, status }) => ({ id, type, name, status })),
        ...(usage ? {} : { usageUnavailable: true }),
      });
      completed = true;
    } catch (error) {
      options?.abortSignal?.throwIfAborted();
      result.error = controller.signal.aborted
        ? `Agents API request timed out after ${timeoutMs}ms`
        : this.redact(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
      if (endpoint && (!completed || !this.config.retainSession)) {
        await this.cleanupSession(endpoint, headers, !completed, metadata);
      }
    }
    if (Object.keys(metadata).length) {
      result.metadata = metadata;
    }
    return result;
  }

  private async waitForTurn(
    initialSession: Session,
    endpoint: string,
    headers: Headers,
    signal: AbortSignal,
  ): Promise<{ session: Session; turn: Turn }> {
    let session = initialSession;
    while (true) {
      if (session.status === 'failed') {
        const error = this.redact(session.error ?? 'unknown error');
        throw new Error(`Agents API session failed: ${error.slice(0, MAX_ERROR_DETAIL_LENGTH)}`);
      }
      if (session.status === 'requires_action') {
        const actions = session.required_actions?.map((action) => action.type).join(', ');
        throw new Error(
          `Agents API requires client-side actions (${actions || 'unknown'}). ` +
            'Use hosted tools or MCP servers; function callbacks and self-hosted executors are not supported.',
        );
      }
      const turns = await this.list<Turn>(`${endpoint}/turns`, headers, signal);
      // Subagent completion and an idle session are not proof that the root turn succeeded.
      const turn = turns.find((candidate) => candidate.subagent_id === null);
      if (turn?.status === 'failed' || turn?.status === 'cancelled') {
        const error = this.redact(turn.error?.message ?? turn.id);
        throw new Error(
          `Agents API turn ${turn.status}: ${error.slice(0, MAX_ERROR_DETAIL_LENGTH)}`,
        );
      }
      if (turn?.status === 'completed') {
        session = await this.request<Session>(endpoint, 'GET', headers, signal);
        return { session, turn };
      }
      await sleepWithAbort(this.config.pollIntervalMs ?? 1_000, signal);
      session = await this.request<Session>(endpoint, 'GET', headers, signal);
    }
  }

  /** Usage is attached shortly after the root turn completes; deleting the session sooner loses it. */
  private async waitForFinalUsage(
    session: Session,
    turn: Turn,
    endpoint: string,
    headers: Headers,
    signal: AbortSignal,
    deadline: number,
    evalSignal?: AbortSignal,
  ): Promise<{ session: Session; turn: Turn }> {
    const waitUntil = Math.min(Date.now() + (this.config.usageTimeoutMs ?? 15_000), deadline);
    const pollIntervalMs = Math.min(this.config.pollIntervalMs ?? 1_000, 1_000);
    const turnEndpoint = `${endpoint}/turns/${encodeURIComponent(turn.id)}`;
    const latest = { session, turn };
    let turnUsageSeenAt: number | undefined;
    try {
      while (!latest.session.usage && Date.now() < waitUntil) {
        if (latest.turn.usage) {
          turnUsageSeenAt ??= Date.now();
          if (Date.now() - turnUsageSeenAt >= TURN_USAGE_GRACE_MS) {
            break;
          }
        }
        await sleepWithAbort(Math.min(pollIntervalMs, waitUntil - Date.now()), signal);
        const [nextSession, nextTurn] = await Promise.all([
          this.request<Session>(endpoint, 'GET', headers, signal),
          // Root-turn usage is only a fallback; a failed turn read must not stop session polling.
          this.request<Turn>(turnEndpoint, 'GET', headers, signal).catch((error: unknown) => {
            signal.throwIfAborted();
            logger.debug('[OpenAI Agents API] Root turn usage read failed', {
              sessionId: session.id,
              error: this.redact(error instanceof Error ? error.message : String(error)),
            });
            return undefined;
          }),
        ]);
        latest.session = nextSession;
        latest.turn = nextTurn ?? latest.turn;
      }
    } catch (error) {
      evalSignal?.throwIfAborted();
      // A completed answer stays successful when only its usage cannot be read.
      logger.debug('[OpenAI Agents API] Final session usage unavailable', {
        sessionId: session.id,
        error: this.redact(error instanceof Error ? error.message : String(error)),
      });
    }
    return latest;
  }

  /** Cancel unfinished work, then delete the session once the API allows it. */
  private async cleanupSession(
    endpoint: string,
    headers: Headers,
    cancel: boolean,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const cleanupTimeoutMs = this.config.cleanupTimeoutMs ?? 60_000;
    // Cleanup must still run after the eval's signal has been aborted.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cleanupTimeoutMs);
    let lastError: unknown;
    try {
      if (cancel) {
        try {
          await this.request(
            `${endpoint}/events`,
            'POST',
            headers,
            controller.signal,
            { events: [{ type: 'agent.session.input.cancel' }] },
            undefined,
            true,
          );
          metadata.sessionCancelled = true;
        } catch (error) {
          controller.signal.throwIfAborted();
          // A session without an active turn can reject cancellation; deletion still applies.
          logger.debug('[OpenAI Agents API] Session cancellation was not accepted', {
            sessionId: metadata.sessionId,
            error: this.redact(error instanceof Error ? error.message : String(error)),
          });
        }
      }
      for (let attempt = 0; ; attempt++) {
        try {
          await this.request(endpoint, 'DELETE', headers, controller.signal);
          metadata.sessionDeleted = true;
          return;
        } catch (error) {
          if (!controller.signal.aborted) {
            lastError = error;
          }
          // Deletion is rejected until an active or cancelled turn is durably idle.
          if (!(error instanceof AgentsApiHttpError) || error.status !== 409) {
            throw error;
          }
          await sleepWithAbort(
            Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, CLEANUP_RETRY_MAX_DELAY_MS),
            controller.signal,
          );
        }
      }
    } catch (error) {
      const reason = lastError ?? error;
      const message = reason instanceof Error ? reason.message : String(reason);
      const cleanupError = this.redact(
        controller.signal.aborted
          ? `Agents API session cleanup timed out after ${cleanupTimeoutMs}ms${lastError ? `: ${message}` : ''}`
          : message,
      );
      Object.assign(metadata, { sessionDeleted: false, cleanupError });
      logger.warn('[OpenAI Agents API] Failed to delete session', {
        sessionId: metadata.sessionId,
        error: cleanupError,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
