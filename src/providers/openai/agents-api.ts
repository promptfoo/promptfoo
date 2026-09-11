import logger from '../../logger';
import { fetchWithRetries, readBoundedText } from '../../util/fetch/index';
import { renderVarsInObject } from '../../util/render';
import {
  isNonCredentialHeader,
  isSecretField,
  REDACTED,
  sanitizeUrlForLogging,
} from '../../util/sanitizer';
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

interface ToolCallSummary {
  id: string | null;
  type: string;
  name?: string;
  status?: string;
  turnId: string;
}

interface Page<T> {
  data: T[];
  has_more: boolean;
  last_id: string | null;
}

const MAX_TIMER_MS = 2_147_483_647;
const MAX_ERROR_DETAIL_LENGTH = 1_024;
const TRANSIENT_STATUS_CODES = new Set([500, 502, 503, 504]);
// Assistant messages, messages between agents, and reasoning are not tool activity.
const MESSAGE_ITEM_TYPES = new Set(['message', 'agent_message', 'reasoning']);
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 8_000;
const CLEANUP_RETRY_MAX_DELAY_MS = 5_000;
// Session usage normally follows root-turn usage within seconds.
const TURN_USAGE_GRACE_MS = 5_000;
// Shorter credentials are redacted only as separate tokens, so words containing them stay intact.
const MIN_CREDENTIAL_LENGTH = 8;
// A single character is no secret, and redacting it would erase that character from diagnostics.
const MIN_TOKEN_CREDENTIAL_LENGTH = 2;
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
    if (candidate.length >= MIN_TOKEN_CREDENTIAL_LENGTH) {
      credentials.add(candidate);
      credentials.add(encodeURIComponent(candidate));
    }
  }
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Decode URL userinfo as Node's HTTP client does, keeping a malformed escape as written. */
function decodeUserinfo(url: URL): string | undefined {
  return url.username || url.password
    ? `${decodeUrlComponent(url.username)}:${decodeUrlComponent(url.password)}`
    : undefined;
}

function basicCredential(userinfo: string): string {
  return `Basic ${Buffer.from(userinfo).toString('base64')}`;
}

/**
 * Promptfoo's fetch helper would Base64-encode URL userinfo while it is still percent-encoded, so
 * request URLs omit it and the provider sends a decoded Basic credential instead.
 */
function splitUserinfo(apiUrl: string): { url: string; userinfo?: string } {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    return { url: apiUrl };
  }
  const userinfo = decodeUserinfo(url);
  if (!userinfo) {
    return { url: apiUrl };
  }
  url.username = '';
  url.password = '';
  return { url: url.toString(), userinfo };
}

/**
 * Credential values carried by a URL: userinfo, including the decoded pair and the Basic
 * credential derived from it, and credential-named query parameters. Raw and decoded spellings
 * are both returned for redaction.
 */
function getUrlCredentials(value: string): string[] {
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    return [];
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Strings that are not valid URLs carry no URL credentials.
    return [];
  }
  const found = [url.username, url.password].flatMap((part) => [part, decodeUrlComponent(part)]);
  const userinfo = decodeUserinfo(url);
  if (userinfo) {
    found.push(userinfo, basicCredential(userinfo));
  }
  for (const segment of url.pathname.split('/')) {
    if (sanitizeUrlForLogging(`/${segment}`) === '/%5BREDACTED%5D') {
      found.push(segment, decodeUrlComponent(segment));
    }
  }
  for (const segment of url.search.slice(1).split(/[&;]/)) {
    const separator = segment.indexOf('=');
    const [param] = new URLSearchParams(segment);
    if (separator !== -1 && param && isCredentialName(param[0])) {
      // A raw `+` decodes to a space; keep both spellings a server might echo.
      found.push(segment.slice(separator + 1), param[1]);
    }
  }
  return found.filter((credential) => credential.trim().length > 0);
}

/**
 * Collect credential values from credential-named keys, credential-bearing URLs, and every value in
 * a `headers` map, such as provider or remote MCP tool headers, except non-credential headers.
 */
function collectConfigCredentials(
  value: unknown,
  credentials: Set<string>,
  key = '',
  inHeaders = false,
): void {
  if (typeof value === 'string') {
    if ((key && isCredentialName(key)) || (inHeaders && !isNonCredentialHeader(key))) {
      addCredential(credentials, value);
    }
    for (const credential of getUrlCredentials(value)) {
      addCredential(credentials, credential);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectConfigCredentials(item, credentials, key, inHeaders);
    }
    return;
  }
  if (value && typeof value === 'object') {
    const childInHeaders = inHeaders || key.toLowerCase() === 'headers';
    for (const [childKey, item] of Object.entries(value)) {
      collectConfigCredentials(item, credentials, childKey, childInHeaders);
    }
  }
}

/**
 * Credential-named header values are redacted and satisfy the credential requirement. Any custom
 * header outside the non-credential allowlist may authenticate a gateway.
 */
function scanRequestHeaders(
  headers: Headers,
  credentials: Set<string>,
): { hasHeaderCredential: boolean; hasCustomHeader: boolean } {
  let hasHeaderCredential = false;
  let hasCustomHeader = false;
  headers.forEach((value, name) => {
    const present = value.trim().length > 0;
    if (isCredentialName(name)) {
      hasHeaderCredential ||= present;
      addCredential(credentials, value);
    }
    hasCustomHeader ||= present && name !== 'authorization' && !isNonCredentialHeader(name);
  });
  return { hasHeaderCredential, hasCustomHeader };
}

/** Credentials a call can send or echo: its resolved key, effective base URL, and config values. */
function collectCallCredentials(provider: OpenAiGenericProvider, credentials: Set<string>): void {
  addCredential(credentials, provider.getApiKey());
  for (const credential of getUrlCredentials(provider.getApiUrl())) {
    addCredential(credentials, credential);
  }
  collectConfigCredentials(provider.config, credentials);
}

function sortCredentials(credentials: Set<string>): string[] {
  // Replace longer values first so a credential containing another is fully removed.
  return [...credentials].sort((left, right) => right.length - left.length);
}

/**
 * Match a short credential only as a separate token, not next to a character that continues one.
 * `=` may precede a value, as in `api-key=s3cr3t`, but continues a token when it follows.
 */
function shortCredentialPattern(credential: string): RegExp {
  const escaped = credential.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w.~+/-])${escaped}(?![\\w.~+/=-])`, 'g');
}

function redactCredentials(text: string, credentials: readonly string[]): string {
  let redacted = text;
  for (const credential of credentials) {
    redacted =
      credential.length >= MIN_CREDENTIAL_LENGTH
        ? redacted.split(credential).join(REDACTED)
        : redacted.replace(shortCredentialPattern(credential), REDACTED);
  }
  return redacted
    .replace(/\bsk-[\w-]{16,}/g, REDACTED)
    .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/gi, `$1 ${REDACTED}`);
}

function isUsage(value: unknown): value is Usage {
  const usage = value as Usage | null | undefined;
  return (
    typeof usage?.input_tokens === 'number' &&
    typeof usage.output_tokens === 'number' &&
    typeof usage.total_tokens === 'number'
  );
}

function toTokenUsage(usage: Usage) {
  return {
    prompt: usage.input_tokens,
    completion: usage.output_tokens,
    total: usage.total_tokens,
    cached: usage.input_tokens_details?.cached_tokens,
    completionDetails: { reasoning: usage.output_tokens_details?.reasoning_tokens },
  };
}

function addUsage(left: Usage, right: Usage): Usage {
  return {
    input_tokens: left.input_tokens + right.input_tokens,
    output_tokens: left.output_tokens + right.output_tokens,
    total_tokens: left.total_tokens + right.total_tokens,
    input_tokens_details: {
      cached_tokens:
        (left.input_tokens_details?.cached_tokens ?? 0) +
        (right.input_tokens_details?.cached_tokens ?? 0),
    },
    output_tokens_details: {
      reasoning_tokens:
        (left.output_tokens_details?.reasoning_tokens ?? 0) +
        (right.output_tokens_details?.reasoning_tokens ?? 0),
    },
  };
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
  // Provider credentials replaced by prompt settings are still redacted if an error echoes them.
  private readonly inheritedCredentials = new Set<string>();

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

  /** Validate credentials per call, after merging prompt settings and gateway authentication. */
  requiresApiKey(): boolean {
    return false;
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
        appendOpenAiApiPath(splitUserinfo(this.getApiUrl()).url, endpoint, query),
        {
          method,
          headers,
          signal,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        30_000,
        idempotent ? this.config.maxRetries : 0,
      );
      // Bodies stay out of debug logs; the status is enough to follow the session lifecycle.
      logger.debug('[OpenAI Agents API] Response', { method, endpoint, status: response.status });
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

  private async listSubagentIds(
    endpoint: string,
    headers: Headers,
    signal: AbortSignal,
  ): Promise<string[]> {
    const subagents = await this.list<{ id?: unknown }>(`${endpoint}/subagents`, headers, signal);
    return subagents.map(({ id }) => {
      if (typeof id !== 'string' || !id) {
        throw new Error('Agents API returned an invalid subagent');
      }
      return id;
    });
  }

  /**
   * In live multi-agent sessions, session totals equaled the root turn's usage while each subagent
   * turn reported its own. The API does not say whether session totals include subagent turns, so
   * their usage is recorded beside the totals, never added, and the totals are marked.
   */
  private async getSubagentUsageMetadata(
    endpoint: string,
    headers: Headers,
    signal: AbortSignal,
    evalSignal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    try {
      const subagentIds = await this.listSubagentIds(endpoint, headers, signal);
      if (!subagentIds.length) {
        return {};
      }
      let sum: Usage | undefined;
      let complete = true;
      for (const id of subagentIds) {
        const turns = await this.list<Turn>(
          `${endpoint}/subagents/${encodeURIComponent(id)}/turns`,
          headers,
          signal,
        );
        for (const turn of turns) {
          if (isUsage(turn.usage)) {
            sum = sum ? addUsage(sum, turn.usage) : turn.usage;
          } else {
            complete = false;
          }
        }
      }
      return {
        usageMayExcludeSubagents: true,
        // A partial sum would understate subagent work, so it is reported only when complete.
        ...(complete && sum ? { subagentUsage: toTokenUsage(sum) } : {}),
      };
    } catch (error) {
      evalSignal?.throwIfAborted();
      logger.debug('[OpenAI Agents API] Subagent turn usage unavailable', {
        endpoint,
        error: this.redact(error instanceof Error ? error.message : String(error)),
      });
      // Subagents may have run, so the session totals may still exclude their work.
      return { usageMayExcludeSubagents: true };
    }
  }

  /**
   * Session items cover only the root agent; each subagent keeps its own item history.
   * Returns undefined when those histories cannot be read so the gap is reported, not hidden.
   */
  private async listSubagentItems(
    endpoint: string,
    headers: Headers,
    signal: AbortSignal,
    evalSignal?: AbortSignal,
  ): Promise<Item[] | undefined> {
    try {
      const items: Item[] = [];
      for (const id of await this.listSubagentIds(endpoint, headers, signal)) {
        items.push(
          ...(await this.list<Item>(
            `${endpoint}/subagents/${encodeURIComponent(id)}/items`,
            headers,
            signal,
          )),
        );
      }
      return items;
    } catch (error) {
      evalSignal?.throwIfAborted();
      // A completed answer stays successful when only subagent tool metadata cannot be read.
      logger.debug('[OpenAI Agents API] Subagent tool items unavailable', {
        endpoint,
        error: this.redact(error instanceof Error ? error.message : String(error)),
      });
      return undefined;
    }
  }

  /** Summarize root and subagent tool activity; messages between agents are not tool calls. */
  private async summarizeToolCalls(
    endpoint: string,
    sessionItems: Item[],
    hasSubagents: boolean,
    headers: Headers,
    signal: AbortSignal,
    evalSignal?: AbortSignal,
  ): Promise<{ toolCalls: ToolCallSummary[]; subagentToolCallsUnavailable?: true }> {
    const subagentItems = hasSubagents
      ? await this.listSubagentItems(endpoint, headers, signal, evalSignal)
      : [];
    const toolCalls = [...sessionItems, ...(subagentItems ?? [])]
      .filter((item) => !MESSAGE_ITEM_TYPES.has(item.type))
      .map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        status: item.status,
        turnId: item.turn_id,
      }));
    return subagentItems ? { toolCalls } : { toolCalls, subagentToolCallsUnavailable: true };
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
    const promptConfig = context?.prompt?.config;
    const mergedConfig = {
      ...this.config,
      ...(promptConfig?.apiBaseUrl !== undefined && { apiHost: undefined }),
      ...(promptConfig?.apiHost !== undefined && { apiBaseUrl: undefined }),
      ...(promptConfig?.apiKeyEnvar !== undefined && { apiKey: undefined }),
      ...(promptConfig?.apiKey !== undefined && { apiKeyEnvar: undefined }),
      ...promptConfig,
    };
    // Promptfoo can attach a live provider here; do not render its methods or state.
    delete mergedConfig.provider;
    let config = mergedConfig;
    try {
      const vars = context?.vars;
      if (vars) {
        config = renderConfigTemplates(mergedConfig, vars, Object.keys(vars)) as AgentsApiOptions;
      }
      // Keep request credentials and lifecycle settings isolated across concurrent calls.
      const callProvider = new OpenAiAgentsApiProvider(this.modelOverride, {
        config,
        env: this.env,
      });
      collectCallCredentials(this, callProvider.inheritedCredentials);
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
      // Redact this call's own key, key variable, and base URL, including prompt-level overrides.
      const credentials = new Set<string>();
      collectCallCredentials(this, credentials);
      for (const callConfig of new Set([mergedConfig, config])) {
        collectCallCredentials(
          new OpenAiGenericProvider('', { config: callConfig, env: this.env }),
          credentials,
        );
      }
      return {
        cached: false,
        error: redactCredentials(
          error instanceof Error ? error.message : String(error),
          sortCredentials(credentials),
        ),
      };
    }
  }

  private sendsToOpenAiApi(): boolean {
    try {
      return new URL(this.getApiUrl()).hostname.toLowerCase() === 'api.openai.com';
    } catch {
      return false;
    }
  }

  /**
   * A configured Authorization header takes precedence over this value. An explicit key, or any
   * key sent to the OpenAI API, uses Bearer auth; otherwise URL userinfo uses decoded Basic auth.
   * An ambient OPENAI_API_KEY never reaches another host that has URL credentials or any custom
   * header outside the non-credential allowlist, because such a header may authenticate a gateway.
   */
  private getAuthorization(
    apiKey: string | undefined,
    hasGatewayCredential: boolean,
  ): string | undefined {
    const sendApiKey =
      Boolean(this.config.apiKey || this.config.apiKeyEnvar) ||
      !hasGatewayCredential ||
      this.sendsToOpenAiApi();
    if (apiKey && sendApiKey) {
      return `Bearer ${apiKey}`;
    }
    const { userinfo } = splitUserinfo(this.getApiUrl());
    return userinfo && basicCredential(userinfo);
  }

  private async runSession(
    prompt: string,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const headers = new Headers(this.getOpenAiRequestHeaders());
    const apiKey = this.getApiKey();
    const credentials = new Set<string>(this.inheritedCredentials);
    collectCallCredentials(this, credentials);
    // Userinfo and credential query parameters authenticate a gateway just as headers do.
    const hasUrlCredential = getUrlCredentials(this.getApiUrl()).length > 0;
    const { hasHeaderCredential, hasCustomHeader } = scanRequestHeaders(headers, credentials);
    this.credentials = sortCredentials(credentials);
    // Only a credential-named header or URL credential replaces the API key requirement.
    if (
      !apiKey &&
      !hasHeaderCredential &&
      !hasUrlCredential &&
      (this.config.apiKeyRequired ?? true)
    ) {
      return { error: this.getMissingApiKeyErrorMessage() };
    }
    const authorization = this.getAuthorization(apiKey, hasUrlCredential || hasCustomHeader);
    if (authorization && !headers.has('Authorization')) {
      headers.set('Authorization', authorization);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('OpenAI-Beta', 'agents=v1');
    // Promptfoo's generic request log records raw response bodies, which can echo credentials.
    headers.set('x-promptfoo-silent', 'true');

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
      const sessionItems = await this.list<Item>(`${endpoint}/items`, headers, signal);
      // Only root-turn messages are scored.
      const output = this.getFinalAnswer(sessionItems.filter((item) => item.turn_id === turn.id));
      const hasSubagents =
        completedSession.agent.multi_agent?.enabled ||
        sessionItems.some((item) => item.type === 'create_subagent_call');
      const toolActivity = await this.summarizeToolCalls(
        endpoint,
        sessionItems,
        hasSubagents,
        headers,
        signal,
        options?.abortSignal,
      );
      const {
        session: finished,
        usage,
        usageMetadata,
      } = await this.waitForFinalUsage(
        completedSession,
        turn,
        endpoint,
        headers,
        signal,
        deadline,
        hasSubagents,
        options?.abortSignal,
      );
      const subagentUsageMetadata = hasSubagents
        ? await this.getSubagentUsageMetadata(endpoint, headers, signal, options?.abortSignal)
        : {};
      const model = finished.agent.model;
      result.output = output;
      result.tokenUsage = usage ? toTokenUsage(usage) : undefined;
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
        ...toolActivity,
        ...usageMetadata,
        ...subagentUsageMetadata,
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
    // Cleanup ignores eval cancellation so the session is released; honor it before returning.
    options?.abortSignal?.throwIfAborted();
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

  /**
   * Usage is attached shortly after the root turn completes; deleting the session sooner loses it.
   * Session totals are preferred. A single-agent run accepts root-turn usage after a short grace
   * period, while a run with subagents waits until the usage deadline for session totals.
   */
  private async waitForFinalUsage(
    session: Session,
    turn: Turn,
    endpoint: string,
    headers: Headers,
    signal: AbortSignal,
    deadline: number,
    hasSubagents: boolean,
    evalSignal?: AbortSignal,
  ): Promise<{ session: Session; usage?: Usage; usageMetadata: Record<string, true> }> {
    const waitUntil = Math.min(Date.now() + (this.config.usageTimeoutMs ?? 15_000), deadline);
    const pollIntervalMs = Math.min(this.config.pollIntervalMs ?? 1_000, 1_000);
    const turnEndpoint = `${endpoint}/turns/${encodeURIComponent(turn.id)}`;
    const latest = { session, turn };
    let turnUsageSeenAt: number | undefined;
    try {
      while (!latest.session.usage && Date.now() < waitUntil) {
        if (latest.turn.usage && !hasSubagents) {
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
    const usage = latest.session.usage ?? latest.turn.usage ?? undefined;
    if (!usage) {
      return { session: latest.session, usageMetadata: { usageUnavailable: true } };
    }
    return {
      session: latest.session,
      usage,
      // Without session totals, a run with subagents reports its root turn's usage and says so.
      usageMetadata: hasSubagents && !latest.session.usage ? { usageFromRootTurn: true } : {},
    };
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
