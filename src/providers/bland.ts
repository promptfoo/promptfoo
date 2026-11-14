import { getEnvString, getProviderEnvString } from '../envars';
import logger from '../logger';
import { fetchWithTimeout } from '../util/fetch/index';
import { readWithResponseDeadline } from '../util/fetch/responseDeadline';
import { preserveResponseHeadersObserverError } from '../util/fetch/responseHeadersObserver';
import { getNunjucksEngine } from '../util/templates';
import { getRequestTimeoutMs, parseChatPrompt } from './shared';

import type { EnvOverrides } from '../contracts/env';
import type { ProviderResponse } from '../contracts/providers';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
} from '../types/providers';

const BLAND_API_BASE_URL = 'https://api.bland.ai';

/** Turn retries on 429. Bland rejects a rate-limited turn before running it, so resending is safe. */
const MAX_RATE_LIMIT_RETRIES = 4;
const DEFAULT_RATE_LIMIT_DELAY_MS = 2000;

export type BlandTargetType = 'agent' | 'pathway';

export interface BlandProviderConfig {
  /** Bland API key. Defaults to the BLAND_API_KEY environment variable. */
  apiKey?: string;
  /** API base URL. Defaults to https://api.bland.ai. */
  apiBaseUrl?: string;
  /**
   * Agent environment or version to chat with (agents only): `production`, `staging`,
   * `dev`, `latest`, a semver, or `branch:<name>`. Bland uses the production pin when unset.
   */
  agentVersion?: string;
  /** Pathway version number (pathways only). Bland uses the production version when unset. */
  pathwayVersion?: number;
  /** Node to start from instead of the pathway's start node (pathways only). */
  startNodeId?: string;
  /** Run the chat on Bland's candidate model. */
  useCandidateModel?: boolean;
  /**
   * Variables the conversation starts with, available in the agent as `{{name}}`.
   * String values are rendered with the test's vars, so `"{{customer_name}}"` works.
   */
  requestData?: Record<string, unknown>;
  /**
   * Ask for the agent's opening message before sending the first user turn. On by default,
   * because most agents greet first and treat the first turn as the reply to that greeting.
   */
  includeGreeting?: boolean;
  /** Request timeout in milliseconds. */
  timeout?: number;
}

interface BlandEnvelope<T> {
  data?: T;
  errors?: unknown;
}

interface BlandCreateChatData {
  chat_id?: string;
  message?: string;
  variables?: Record<string, unknown> | null;
}

export interface BlandTurnData {
  chat_id?: string;
  assistant_responses?: string[];
  current_node_id?: string;
  current_node_name?: string;
  variables?: Record<string, unknown>;
  variable_changes?: {
    added?: Record<string, unknown>;
    modified?: Record<string, unknown>;
    removed?: string[] | Record<string, unknown>;
  } | null;
  completed?: boolean;
}

/** One exchange in the conversation the provider ran. */
interface BlandTurn {
  user: string | null;
  assistant: string[];
  nodeId?: string;
  nodeName?: string;
}

class BlandApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BlandApiError';
  }
}

/**
 * The user turns to send, in order.
 *
 * A plain prompt is one turn. A chat-formatted prompt (a JSON or YAML list of
 * `{role, content}` messages, which is also what stateless multi-turn red team
 * strategies send) is replayed turn by turn: user messages are sent, while
 * assistant messages are skipped because the agent produces its own replies.
 */
export function getUserTurns(prompt: string): string[] {
  let parsed: unknown;
  try {
    parsed = parseChatPrompt<unknown>(prompt, null);
  } catch {
    return [prompt];
  }
  if (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every((m) => m && typeof m === 'object' && typeof (m as any).role === 'string')
  ) {
    const turns = parsed
      .filter((m: any) => m.role === 'user')
      .map((m: any) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
    if (turns.length > 0) {
      return turns;
    }
  }
  return [prompt];
}

function describeErrors(errors: unknown): string {
  if (!errors) {
    return '';
  }
  if (Array.isArray(errors)) {
    return errors
      .map((e) => (typeof e === 'string' ? e : (e?.message ?? e?.error ?? JSON.stringify(e))))
      .join('; ');
  }
  return typeof errors === 'string' ? errors : JSON.stringify(errors);
}

function retryAfterMs(response: Response): number {
  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
      return Math.max(0, date - Date.now());
    }
  }
  return DEFAULT_RATE_LIMIT_DELAY_MS;
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError');
}

/** Waits out a rate-limit backoff, giving up as soon as the caller cancels. */
function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Bland provider: chats with a Bland agent or conversational pathway through the
 * pathway chat API, turn by turn, so a voice agent's logic can be evaluated and
 * red teamed in text without placing calls.
 *
 * - `bland:agent:<agent_id>` chats with a v2 agent (`config.agentVersion` picks the environment).
 * - `bland:pathway:<pathway_id>` chats with a conversational pathway.
 *
 * @see https://docs.bland.ai/api-v1/post/pathway-chat-create
 * @see https://docs.bland.ai/api-v1/post/pathway-chat
 */
export class BlandProvider implements ApiProvider {
  /**
   * Turns are not idempotent: each one advances the conversation, runs any webhook or
   * tool steps for real, and is billed. Never let the scheduler replay a call.
   */
  get handlesOwnRetries(): boolean {
    return true;
  }

  readonly config: BlandProviderConfig;
  private readonly targetType: BlandTargetType;
  private readonly targetId: string;
  private readonly env?: EnvOverrides;
  private readonly providerId?: string;
  /**
   * Chats this provider opened in the current evaluation, with their transcripts so far.
   * `vars.sessionId` only continues one of these: red team configs commonly set
   * `sessionId` to a client-side UUID for correlation, and treating that as a Bland chat
   * ID would skip creating the chat.
   */
  private readonly openedChats = new Map<
    string,
    { evaluationId?: string; last?: BlandTurnData; transcript: BlandTurn[] }
  >();

  constructor(
    targetType: BlandTargetType,
    targetId: string,
    options: { config?: BlandProviderConfig; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!targetId) {
      throw new Error(
        `Bland provider requires a ${targetType} ID, e.g. bland:${targetType}:<${targetType}_id>`,
      );
    }
    this.targetType = targetType;
    this.targetId = targetId;
    this.config = options.config ?? {};
    this.env = options.env;
    this.providerId = options.id;

    if (
      targetType === 'agent' &&
      (this.config.pathwayVersion !== undefined || this.config.startNodeId)
    ) {
      // Bland refuses these with agent_id: an agent chat always starts at the agent's entry.
      throw new Error(
        'Bland agents do not accept pathwayVersion or startNodeId; use agentVersion instead.',
      );
    }
    if (targetType === 'pathway' && this.config.agentVersion) {
      throw new Error('agentVersion only applies to bland:agent targets; use pathwayVersion.');
    }
  }

  id(): string {
    return this.providerId ?? `bland:${this.targetType}:${this.targetId}`;
  }

  toString(): string {
    return `[Bland Provider ${this.targetType} ${this.targetId}]`;
  }

  private getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      getProviderEnvString(this.env, 'BLAND_API_KEY') ||
      getEnvString('BLAND_API_KEY')
    );
  }

  private getBaseUrl(): string {
    return (this.config.apiBaseUrl || BLAND_API_BASE_URL).replace(/\/+$/, '');
  }

  private renderRequestData(context?: CallApiContextParams): Record<string, unknown> | undefined {
    if (!this.config.requestData) {
      return undefined;
    }
    const nunjucks = getNunjucksEngine();
    const vars = context?.vars ?? {};
    const render = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return nunjucks.renderString(value, vars);
      }
      if (Array.isArray(value)) {
        return value.map(render);
      }
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, render(v)]));
      }
      return value;
    };
    return render(this.config.requestData) as Record<string, unknown>;
  }

  private async post<T>(
    path: string,
    body: Record<string, unknown>,
    apiKey: string,
    callOptions?: CallApiOptionsParams,
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    const timeout = this.config.timeout ?? getRequestTimeoutMs();
    for (let attempt = 0; ; attempt++) {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { authorization: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          ...(callOptions?.abortSignal && { signal: callOptions.abortSignal }),
          disableTransientRetries: true,
        },
        timeout,
      );

      if (response.status === 429) {
        const delay = retryAfterMs(response);
        // Let the scheduler mark the shared queue rate limited, so other queued Bland
        // calls wait for the same window instead of each burning their own retries.
        // The final 429 is published too, so the queue keeps the real Retry-After.
        if (callOptions?.onResponseHeaders) {
          const headers = Object.fromEntries(response.headers.entries());
          callOptions.onResponseHeaders(headers, {
            headers,
            status: 429,
            resetAt: Date.now() + delay,
          });
        }
      }
      if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const delay = retryAfterMs(response);
        // Release the connection instead of leaving an unread body behind.
        await response.body?.cancel().catch(() => undefined);
        logger.debug('[Bland] Rate limited, retrying the same request', { path, delay, attempt });
        await waitForRetry(delay, callOptions?.abortSignal);
        continue;
      }

      const text = await readWithResponseDeadline(response, () => response.text());
      let json: BlandEnvelope<T> | undefined;
      try {
        json = text ? (JSON.parse(text) as BlandEnvelope<T>) : undefined;
      } catch {
        json = undefined;
      }

      if (!response.ok || !json || json.errors) {
        const detail = describeErrors(json?.errors) || text.slice(0, 500) || response.statusText;
        throw new BlandApiError(
          `Bland API ${response.status} on ${path}: ${detail}`,
          response.status,
        );
      }
      return json.data as T;
    }
  }

  private async createChat(
    apiKey: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<string> {
    const body: Record<string, unknown> =
      this.targetType === 'agent' ? { agent_id: this.targetId } : { pathway_id: this.targetId };
    if (this.config.agentVersion) {
      body.agent_version = this.config.agentVersion;
    }
    if (this.config.pathwayVersion !== undefined) {
      body.pathway_version = this.config.pathwayVersion;
    }
    if (this.config.startNodeId) {
      body.start_node_id = this.config.startNodeId;
    }
    if (this.config.useCandidateModel !== undefined) {
      body.use_candidate_model = this.config.useCandidateModel;
    }
    const requestData = this.renderRequestData(context);
    if (requestData) {
      body.request_data = requestData;
    }

    const data = await this.post<BlandCreateChatData>(
      '/v1/pathway/chat/create',
      body,
      apiKey,
      callOptions,
    );
    if (!data?.chat_id) {
      throw new Error('Bland did not return a chat_id for the new chat');
    }
    return data.chat_id;
  }

  private async sendTurn(
    chatId: string,
    message: string | null,
    apiKey: string,
    callOptions?: CallApiOptionsParams,
  ): Promise<BlandTurnData> {
    return this.post<BlandTurnData>(
      `/v1/pathway/chat/${encodeURIComponent(chatId)}`,
      message === null ? {} : { message },
      apiKey,
      callOptions,
    );
  }

  /**
   * Opens a chat if there is none (taking the greeting unless disabled), then sends each
   * turn until the agent completes. Progress is recorded in `state` and `transcript` as it
   * happens, so a failure part way through still reports what was said.
   */
  private async converse(
    state: { chatId?: string; last?: BlandTurnData },
    turns: string[],
    transcript: BlandTurn[],
    apiKey: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<void> {
    const record = (user: string | null, data: BlandTurnData) => {
      state.last = data;
      transcript.push({
        user,
        assistant: data.assistant_responses ?? [],
        nodeId: data.current_node_id,
        nodeName: data.current_node_name,
      });
    };

    if (!state.chatId) {
      state.chatId = await this.createChat(apiKey, context, callOptions);
      if (this.config.includeGreeting !== false) {
        record(null, await this.sendTurn(state.chatId, null, apiKey, callOptions));
      }
    }

    for (const turn of turns) {
      if (state.last?.completed) {
        // The agent ended the conversation; later turns would be refused.
        break;
      }
      record(turn, await this.sendTurn(state.chatId, turn, apiKey, callOptions));
    }
  }

  private buildResponse(
    chatId: string | undefined,
    last: BlandTurnData | undefined,
    transcript: BlandTurn[],
  ): ProviderResponse {
    const lastExchange = transcript[transcript.length - 1];
    return {
      output: (lastExchange?.assistant ?? []).join('\n'),
      sessionId: chatId,
      metadata: {
        bland: {
          chatId,
          currentNodeId: last?.current_node_id,
          currentNodeName: last?.current_node_name,
          variables: last?.variables,
          variableChanges: last?.variable_changes ?? undefined,
          completed: last?.completed ?? false,
          transcript,
        },
      },
      ...(last?.completed && {
        conversationEnded: true,
        conversationEndReason: 'agent_completed',
      }),
    };
  }

  /** Forget this evaluation's chats so a later run in the same process starts fresh ones. */
  cleanupAfterEvaluation(): void {
    this.openedChats.clear();
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'Bland API key is not set. Set the BLAND_API_KEY environment variable or add apiKey to the provider config.',
      };
    }

    const sessionId = context?.vars?.sessionId;
    const previous = typeof sessionId === 'string' ? this.openedChats.get(sessionId) : undefined;
    const chat = previous?.evaluationId === context?.evaluationId ? previous : undefined;
    const turns = chat ? getUserTurns(prompt).slice(-1) : getUserTurns(prompt);
    const transcript = [...(chat?.transcript ?? [])];
    const state: { chatId?: string; last?: BlandTurnData } = {
      chatId: chat ? String(sessionId) : undefined,
      last: chat?.last,
    };

    try {
      await this.converse(state, turns, transcript, apiKey, context, callOptions);
    } catch (err) {
      if (
        callOptions?.abortSignal?.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[Bland] Chat failed', {
        target: this.id(),
        chatId: state.chatId,
        error: message,
      });
      // A throwing onResponseHeaders callback is the caller's error, not a Bland rate limit.
      return preserveResponseHeadersObserverError(callOptions?.onResponseHeaders, err, {
        error: message,
        ...(state.chatId && { sessionId: state.chatId }),
        metadata: {
          bland: { chatId: state.chatId, transcript },
          ...(err instanceof BlandApiError && err.status === 429 && { rateLimitRetryable: false }),
        },
      });
    } finally {
      if (state.chatId) {
        this.openedChats.set(state.chatId, {
          evaluationId: context?.evaluationId,
          last: state.last,
          transcript,
        });
      }
    }
    // Not cached: a response carries a live chat ID that stateful callers continue, and
    // every conversation runs the agent's real tools and webhooks.
    return this.buildResponse(state.chatId, state.last, transcript);
  }
}

/**
 * Creates a Bland provider from a provider path:
 * `bland:agent:<agent_id>` or `bland:pathway:<pathway_id>`.
 */
export function createBlandProvider(
  providerPath: string,
  providerOptions: ProviderOptions = {},
  env?: EnvOverrides,
): ApiProvider {
  const [, targetType, ...rest] = providerPath.split(':');
  const targetId = rest.join(':');
  if (targetType !== 'agent' && targetType !== 'pathway') {
    throw new Error(
      `Unknown Bland target "${targetType ?? ''}". Use bland:agent:<agent_id> or bland:pathway:<pathway_id>.`,
    );
  }
  return new BlandProvider(targetType, targetId, {
    config: providerOptions.config as BlandProviderConfig,
    id: providerOptions.id,
    env: providerOptions.env ?? env,
  });
}
