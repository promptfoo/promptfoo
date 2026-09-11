import logger from '../../logger';
import { fetchWithRetries, readBoundedText } from '../../util/fetch/index';
import { renderVarsInObject } from '../../util/render';
import { sleepWithAbort } from '../../util/time';
import { calculateOpenAIUsageCost } from './billing';
import { OpenAiGenericProvider } from './index';
import { appendOpenAiApiPath, assertOpenAiApiModel } from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { OpenAiSharedOptions } from './types';

interface AgentsApiOptions extends OpenAiSharedOptions {
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
  error?: { message: string } | null;
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

/** Managed Codex sessions, distinct from the local @openai/agents SDK provider. */
export class OpenAiAgentsApiProvider extends OpenAiGenericProvider {
  declare config: AgentsApiOptions;
  private readonly modelOverride: string;

  constructor(
    modelName = '',
    options: { config?: AgentsApiOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const config = options.config ?? {};
    super(modelName || config.agent?.model || (config.agent_id ? '' : 'gpt-6-astra'), options);
    this.modelOverride = modelName;
    for (const key of ['timeoutMs', 'pollIntervalMs'] as const) {
      const value = config[key];
      if (
        value !== undefined &&
        (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
      ) {
        throw new Error(`Agents API ${key} must be a positive integer no greater than 2147483647`);
      }
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

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE',
    headers: Headers,
    signal: AbortSignal,
    body?: unknown,
    query?: string,
  ): Promise<T> {
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
      // Replaying a session creation can start another billable agent task.
      method === 'POST' ? 0 : this.config.maxRetries,
    );
    if (method === 'DELETE' && response.status === 404) {
      // A previous deletion may have succeeded even if its response was lost.
      await response.body?.cancel();
      return undefined as T;
    }
    if (!response.ok) {
      let detail = '';
      try {
        const body = JSON.parse(await readBoundedText(response, 8_192));
        const message = typeof body?.error === 'string' ? body.error : body?.error?.message;
        if (typeof message === 'string') {
          detail = message;
          // Error messages may echo request credentials, including custom auth headers.
          const credentials = [
            this.getApiKey(),
            ...Object.values(this.config.headers ?? {}),
            headers.get('Authorization')?.replace(/^(Bearer|Basic)\s+/i, ''),
          ];
          for (const credential of credentials) {
            if (credential) {
              detail = detail.split(credential).join('[REDACTED]');
            }
          }
          detail = detail.slice(0, 1_024);
        }
      } catch {
        signal.throwIfAborted();
      }
      throw new Error(
        `Agents API ${method} failed: HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
      );
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
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
      if (!Array.isArray(page.data)) {
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
    try {
      const mergedConfig = { ...this.config, ...context?.prompt?.config };
      // Promptfoo can attach a live provider here; do not render its methods or state.
      delete mergedConfig.provider;
      const config = renderVarsInObject(mergedConfig, context?.vars) as AgentsApiOptions;
      // Keep request credentials and lifecycle settings isolated across concurrent calls.
      const callProvider = new OpenAiAgentsApiProvider(this.modelOverride, {
        config,
        env: this.env,
      });
      return await callProvider.runSession(prompt, options);
    } catch (error) {
      options?.abortSignal?.throwIfAborted();
      return { cached: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async runSession(
    prompt: string,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    options?.abortSignal?.throwIfAborted();
    const headers = new Headers(this.getOpenAiRequestHeaders());
    const apiKey = this.getApiKey();
    if (!apiKey && !headers.has('Authorization') && this.requiresApiKey()) {
      return { error: this.getMissingApiKeyErrorMessage() };
    }
    if (apiKey && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${apiKey}`);
    }
    headers.set('Content-Type', 'application/json');
    headers.set('OpenAI-Beta', 'agents=v1');

    const timeoutMs = this.config.timeoutMs ?? 300_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.abortSignal
      ? AbortSignal.any([controller.signal, options.abortSignal])
      : controller.signal;
    let endpoint: string | undefined;
    let completed = false;
    const result: ProviderResponse = { cached: false };
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
      if (!session.id || typeof session.id !== 'string') {
        throw new Error('Agents API did not return a session ID');
      }
      endpoint = `agents/sessions/${encodeURIComponent(session.id)}`;
      result.metadata = { sessionId: session.id };
      const { session: finished, turn } = await this.waitForTurn(
        session,
        endpoint,
        headers,
        signal,
      );
      const items = (await this.list<Item>(`${endpoint}/items`, headers, signal)).filter(
        (item) => item.turn_id === turn.id,
      );
      // Session usage includes subagent work; root-turn usage can undercount it.
      const usage = finished.usage ?? turn.usage;
      const model = finished.agent.model;
      result.output = this.getFinalAnswer(items);
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
      result.metadata = {
        ...result.metadata,
        turnId: turn.id,
        model,
        costScope: hasSubagents
          ? 'unavailable for aggregate subagent usage'
          : 'model tokens only; excludes tools and sandbox charges',
        toolCalls: items
          .filter((item) => item.type !== 'message' && item.type !== 'reasoning')
          .map(({ id, type, name, status }) => ({ id, type, name, status })),
      };
      completed = true;
    } catch (error) {
      options?.abortSignal?.throwIfAborted();
      result.error = controller.signal.aborted
        ? `Agents API request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    } finally {
      clearTimeout(timer);
      if (endpoint && (!completed || !this.config.retainSession)) {
        try {
          // Cleanup must still run after the eval's signal has been aborted.
          await this.request(endpoint, 'DELETE', headers, AbortSignal.timeout(10_000));
          result.metadata = { ...result.metadata, sessionDeleted: true };
        } catch (error) {
          const cleanupError = error instanceof Error ? error.message : String(error);
          result.metadata = { ...result.metadata, sessionDeleted: false, cleanupError };
          logger.warn('[OpenAI Agents API] Failed to delete session', {
            sessionId: result.metadata?.sessionId,
            error: cleanupError,
          });
        }
      }
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
        throw new Error(`Agents API session failed: ${session.error ?? 'unknown error'}`);
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
        throw new Error(`Agents API turn ${turn.status}: ${turn.error?.message ?? turn.id}`);
      }
      if (turn?.status === 'completed') {
        session = await this.request<Session>(endpoint, 'GET', headers, signal);
        return { session, turn };
      }
      await sleepWithAbort(this.config.pollIntervalMs ?? 1_000, signal);
      session = await this.request<Session>(endpoint, 'GET', headers, signal);
    }
  }
}
