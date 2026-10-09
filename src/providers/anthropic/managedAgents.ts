import Anthropic from '@anthropic-ai/sdk';
import {
  buildChatSpanContext,
  extractProviderResponseAttributes,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { renderVarsInObject } from '../../util/render';
import { AnthropicGenericProvider } from './generic';
import type { AgentCreateParams } from '@anthropic-ai/sdk/resources/beta/agents/agents';
import type { EnvironmentCreateParams } from '@anthropic-ai/sdk/resources/beta/environments/environments';
import type { BetaManagedAgentsSessionEvent } from '@anthropic-ai/sdk/resources/beta/sessions/events';
import type {
  BetaManagedAgentsSessionUsage,
  SessionCreateParams,
} from '@anthropic-ai/sdk/resources/beta/sessions/sessions';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { AnthropicBaseOptions } from './types';

// The public October 2026 workflow API is newer than the pinned SDK's types.
// Keep this extension local; request bodies are forwarded by the SDK unchanged.
type AgentRoster = NonNullable<AgentCreateParams['multiagent']>['agents'];
type AgentDelegation =
  | { type: 'disabled' }
  | {
      type: 'enabled';
      inline_agents?: { type: 'enabled' | 'disabled' };
      predefined_agents?: AgentRoster;
    };
type AgentDefinition = Omit<AgentCreateParams, 'multiagent' | 'betas' | 'workspace_id'> & {
  multiagent?:
    | AgentCreateParams['multiagent']
    | {
        type: 'multiagent_20261001';
        workflows?: AgentDelegation;
        subagents?: AgentDelegation;
        advisor?: { type: 'disabled' } | { type: 'enabled'; model: string };
      };
};
type WorkflowEvent = {
  id: string;
  type: `workflow_run.${string}`;
  workflow_run_id: string | null;
  name?: string;
  result?: { type: string; error?: { type: string; message: string } };
};
type WorkflowRun = { id: string; name?: string; status: string; result?: WorkflowEvent['result'] };

class SessionState {
  output?: string;
  usage?: BetaManagedAgentsSessionUsage;
  completed = false;
  sessionError?: string;
  stopReason?: string;
  runs = new Map<string, WorkflowRun>();
  openRuns = new Set<string>();
  toolCalls: { id: string; name: string; input: unknown; output?: unknown; is_error?: boolean }[] =
    [];

  recordWorkflow(event: WorkflowEvent): void {
    const id = event.workflow_run_id;
    if (!id) {
      return;
    }
    const run = this.runs.get(id) ?? { id, status: 'created' };
    if (event.name) {
      run.name = event.name;
    }
    if (
      ['workflow_run.created', 'workflow_run.status_running', 'workflow_run.status_idle'].includes(
        event.type,
      )
    ) {
      this.openRuns.add(id);
      run.status = event.type.replace('workflow_run.', '').replace('status_', '');
    } else if (event.type === 'workflow_run.status_ended') {
      this.openRuns.delete(id);
      run.status = 'ended';
      run.result = event.result;
    }
    this.runs.set(id, run);
  }

  record(event: BetaManagedAgentsSessionEvent | WorkflowEvent): void {
    if (event.type.startsWith('workflow_run.')) {
      this.recordWorkflow(event as WorkflowEvent);
      return;
    }
    switch (event.type) {
      case 'agent.message':
        this.output =
          event.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n') || undefined;
        break;
      case 'agent.tool_use':
      case 'agent.mcp_tool_use':
      case 'agent.custom_tool_use':
        this.toolCalls.push({ id: event.id, name: event.name, input: event.input });
        if (event.type === 'agent.custom_tool_use' || event.evaluated_permission === 'ask') {
          throw new Error(
            `Claude Managed Agents requires client action for tool event ${event.id}; custom tools and permission confirmations are not supported`,
          );
        }
        break;
      case 'agent.tool_result':
      case 'agent.mcp_tool_result': {
        const toolUseId =
          event.type === 'agent.mcp_tool_result' ? event.mcp_tool_use_id : event.tool_use_id;
        const call = this.toolCalls.find((tool) => tool.id === toolUseId);
        if (call) {
          call.output = event.content;
          call.is_error = event.is_error ?? false;
        }
        break;
      }
      case 'session.usage':
        this.usage = event.usage;
        break;
      case 'session.error':
        // Transient errors can be followed by automatic rescheduling.
        this.sessionError = event.error.type;
        break;
      case 'session.status_idle':
        this.stopReason = event.stop_reason?.type;
        if (this.stopReason !== 'end_turn') {
          throw new Error(
            `Claude Managed Agents stopped: ${this.stopReason ?? 'unknown'}${this.sessionError ? ` (${this.sessionError})` : ''}`,
          );
        }
        this.completed = this.openRuns.size === 0;
        break;
      case 'session.status_terminated':
        throw new Error(
          `Claude Managed Agents session terminated before completion${this.sessionError ? ` (${this.sessionError})` : ''}`,
        );
    }
  }

  finalOutput(): string {
    if (!this.completed) {
      throw new Error('Claude Managed Agents event stream ended before the session completed');
    }
    if (this.output === undefined) {
      throw new Error('Claude Managed Agents completed without a text response');
    }
    const failedRun = [...this.runs.values()].find((run) => run.result?.type !== 'completed');
    if (failedRun) {
      throw new Error(
        `Claude Managed Agents workflow ${failedRun.id} ended with ${failedRun.result?.type ?? 'unknown result'}`,
      );
    }
    return this.output;
  }
}

interface ManagedAgentsOptions extends AnthropicBaseOptions {
  agent_id?: string;
  agent_version?: number;
  agent?: AgentDefinition;
  environment_id?: string;
  environment?: Omit<EnvironmentCreateParams, 'betas' | 'workspace_id'>;
  session?: Pick<SessionCreateParams, 'budget' | 'resources' | 'vault_ids' | 'metadata' | 'title'>;
  workspace_id?: string;
  timeoutMs?: number;
  cleanupTimeoutMs?: number;
  retainSession?: boolean;
}

function validateDuration(name: string, value: number | undefined): void {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
  ) {
    throw new Error(`${name} must be a positive integer no greater than 2147483647`);
  }
}

function parseEvent(data: string[]): BetaManagedAgentsSessionEvent | WorkflowEvent {
  let event: BetaManagedAgentsSessionEvent | WorkflowEvent | { type: 'error' };
  try {
    event = JSON.parse(data.join('\n'));
  } catch {
    throw new Error('Claude Managed Agents stream contains invalid JSON');
  }
  if (!event || typeof event.type !== 'string') {
    throw new Error('Claude Managed Agents stream contains an invalid event');
  }
  if (event.type === 'error') {
    throw new Error('Claude Managed Agents stream reported an API error');
  }
  return event;
}

function applyUsage(response: ProviderResponse, usage?: BetaManagedAgentsSessionUsage): void {
  const metadata = response.metadata!;
  if (usage) {
    metadata.usage = usage;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite =
      (usage.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
      (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0);
    const promptTokens =
      usage.input_tokens === undefined ? undefined : usage.input_tokens + cacheRead + cacheWrite;
    response.tokenUsage = {
      prompt: promptTokens,
      completion: usage.output_tokens,
      total:
        promptTokens !== undefined && usage.output_tokens !== undefined
          ? promptTokens + usage.output_tokens
          : undefined,
      cached: usage.cache_read_input_tokens,
      completionDetails: {
        cacheReadInputTokens: cacheRead,
        cacheCreationInputTokens: cacheWrite,
      },
    };
    if (usage.list_cost?.currency === 'USD' && /^\d+$/.test(usage.list_cost.amount)) {
      response.cost = Number(usage.list_cost.amount) / 100;
    }
  }
}

/** The SDK's SSE allowlist drops workflow_run.* and session.usage events. */
async function* readEvents(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<BetaManagedAgentsSessionEvent | WorkflowEvent> {
  if (!response.body) {
    throw new Error('Claude Managed Agents stream has no body');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let eventSize = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      let newline: RegExpExecArray | null;
      while ((newline = /\r\n|\r|\n/.exec(buffer))) {
        // A CR at the end of a chunk may be the first half of CRLF.
        if (!done && newline[0] === '\r' && newline.index === buffer.length - 1) {
          break;
        }
        const line = buffer.slice(0, newline.index);
        buffer = buffer.slice(newline.index + newline[0].length);
        if (line.startsWith('data:')) {
          const text = line.slice(5).replace(/^ /, '');
          eventSize += text.length;
          data.push(text);
        } else if (line === '') {
          if (data.length) {
            yield parseEvent(data);
          }
          data = [];
          eventSize = 0;
        }
        if (eventSize > 16 * 1024 * 1024) {
          throw new Error('Claude Managed Agents stream event exceeds 16 MiB');
        }
      }
      if (buffer.length + eventSize > 16 * 1024 * 1024) {
        throw new Error('Claude Managed Agents stream event exceeds 16 MiB');
      }
      if (done) {
        if (buffer.trim() || data.length) {
          throw new Error('Claude Managed Agents stream ended with an incomplete event');
        }
        return;
      }
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Every invocation owns a fresh hosted session; responses are deliberately not cached. */
export class AnthropicManagedAgentsProvider extends AnthropicGenericProvider {
  declare config: ManagedAgentsOptions;

  constructor(
    options: {
      config?: ManagedAgentsOptions;
      id?: string;
      label?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    super('managed-agents', options);
    const config = this.config;
    if (Boolean(config.agent_id) === Boolean(config.agent)) {
      throw new Error('Claude Managed Agents requires exactly one of agent_id or agent');
    }
    if (Boolean(config.environment_id) === Boolean(config.environment)) {
      throw new Error(
        'Claude Managed Agents requires exactly one of environment_id or environment',
      );
    }
    if (config.agent && (!config.agent.name || !config.agent.model)) {
      throw new Error('Claude Managed Agents agent requires name and model');
    }
    if (config.environment && !config.environment.name) {
      throw new Error('Claude Managed Agents environment requires name');
    }
    if (config.environment?.config?.type === 'self_hosted') {
      throw new Error(
        'Claude Managed Agents requires a cloud environment; local tool execution is not supported',
      );
    }
    if (
      config.agent_version !== undefined &&
      (!config.agent_id || !Number.isSafeInteger(config.agent_version) || config.agent_version < 1)
    ) {
      throw new Error('agent_version requires agent_id and must be a positive integer');
    }
    validateDuration('timeoutMs', config.timeoutMs);
    validateDuration('cleanupTimeoutMs', config.cleanupTimeoutMs);
  }

  id(): string {
    return `anthropic:managed-agents${this.config.agent_id ? `:${this.config.agent_id}` : ''}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    return withGenAISpan(
      buildChatSpanContext({
        system: 'anthropic',
        model: this.modelName,
        providerId: this.id(),
        prompt,
        context,
      }),
      () => this.runSession(prompt, context, options),
      extractProviderResponseAttributes,
    );
  }

  private async runSession(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const config = renderVarsInObject(this.config, context?.vars ?? {}) as ManagedAgentsOptions;
    const controller = new AbortController();
    const timeoutMs = config.timeoutMs ?? 600_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options?.abortSignal
      ? AbortSignal.any([controller.signal, options.abortSignal])
      : controller.signal;
    const params = { workspace_id: config.workspace_id };
    // Mutations must not be retried: a lost response can otherwise start duplicate paid runs.
    const request = { signal, maxRetries: 0, headers: config.headers };
    let agentId = config.agent_id;
    let environmentId = config.environment_id;
    let sessionId: string | undefined;
    let stream: Response | undefined;
    const state = new SessionState();
    const metadata: Record<string, unknown> = { workflowRuns: [], toolCalls: state.toolCalls };
    const response: ProviderResponse = { metadata, cached: false };

    try {
      signal.throwIfAborted();
      if (config.agent) {
        const agent = await this.anthropic.beta.agents.create(
          { ...config.agent, ...params } as AgentCreateParams,
          request,
        );
        agentId = agent.id;
        metadata.createdAgentId = agentId;
      }
      if (config.environment) {
        const environment = await this.anthropic.beta.environments.create(
          { ...config.environment, ...params },
          request,
        );
        environmentId = environment.id;
        metadata.createdEnvironmentId = environmentId;
      }
      signal.throwIfAborted();
      const session = await this.anthropic.beta.sessions.create(
        {
          title: config.session?.title,
          metadata: config.session?.metadata,
          budget: config.session?.budget,
          resources: config.session?.resources,
          vault_ids: config.session?.vault_ids,
          ...params,
          agent: config.agent_version
            ? { type: 'agent', id: agentId!, version: config.agent_version }
            : agentId!,
          environment_id: environmentId!,
        },
        request,
      );
      sessionId = session.id;
      metadata.sessionId = sessionId;
      metadata.agentId = agentId;
      metadata.environmentId = environmentId;

      // Streams do not replay history. Subscribe before sending the user's message.
      stream = await this.anthropic.beta.sessions.events
        .stream(sessionId, params, request)
        .asResponse();
      await this.anthropic.beta.sessions.events.send(
        sessionId,
        {
          ...params,
          events: [{ type: 'user.message', content: [{ type: 'text', text: prompt }] }],
        },
        request,
      );

      let eventCount = 0;
      for await (const event of readEvents(stream, signal)) {
        signal.throwIfAborted();
        if (++eventCount > 100_000) {
          throw new Error('Claude Managed Agents exceeded the event limit');
        }
        state.record(event);
        if (state.completed) {
          break;
        }
      }
      signal.throwIfAborted();
      const output = state.finalOutput();
      // Authoritative totals include every workflow thread and hosted runtime cost.
      state.usage = (await this.anthropic.beta.sessions.retrieve(sessionId, params, request)).usage;
      response.output = output;
    } catch (error) {
      // Retrying the entire invocation could duplicate hosted side effects and billing.
      metadata.rateLimitRetryable = false;
      if (error instanceof Anthropic.APIError && error.status !== undefined) {
        metadata.http = { status: error.status };
      }
      response.error = signal.aborted
        ? options?.abortSignal?.aborted
          ? 'Claude Managed Agents invocation aborted'
          : `Claude Managed Agents timed out after ${timeoutMs}ms`
        : this.describeError(error);
    } finally {
      clearTimeout(timer);
      await stream?.body?.cancel().catch(() => {});
      controller.abort();
      metadata.workflowRuns = [...state.runs.values()];
      metadata.openWorkflowRunIds = [...state.openRuns];
      metadata.stopReason = state.stopReason;
      applyUsage(response, state.usage);
      await this.cleanupResources(config, { agentId, environmentId, sessionId }, response);
    }
    return response;
  }

  private async cleanupResources(
    config: ManagedAgentsOptions,
    ids: { agentId?: string; environmentId?: string; sessionId?: string },
    response: ProviderResponse,
  ): Promise<void> {
    const { agentId, environmentId, sessionId } = ids;
    const metadata = response.metadata!;
    const params = { workspace_id: config.workspace_id };
    if (config.retainSession && !response.error) {
      metadata.sessionArchived = false;
      return;
    }
    // Cleanup has its own deadline, including when the caller cancelled the run.
    const cleanupController = new AbortController();
    const cleanupTimeoutMs = config.cleanupTimeoutMs ?? 10_000;
    const cleanupTimer = setTimeout(() => cleanupController.abort(), cleanupTimeoutMs);
    const cleanupRequest = {
      signal: cleanupController.signal,
      timeout: cleanupTimeoutMs,
      maxRetries: 0,
      headers: config.headers,
    };
    const cleanupErrors: string[] = [];
    try {
      if (sessionId) {
        try {
          await this.anthropic.beta.sessions.archive(sessionId, params, cleanupRequest);
          metadata.sessionArchived = true;
        } catch (error) {
          metadata.sessionArchived = false;
          cleanupErrors.push(`Session ${sessionId}: ${this.describeError(error)}`);
        }
      }
      // Leave definitions available for recovery when session archival failed.
      if (!sessionId || metadata.sessionArchived) {
        for (const [kind, id] of [
          ['agent', config.agent ? agentId : undefined],
          ['environment', config.environment ? environmentId : undefined],
        ] as const) {
          if (id) {
            try {
              if (kind === 'agent') {
                await this.anthropic.beta.agents.archive(id, params, cleanupRequest);
              } else {
                await this.anthropic.beta.environments.archive(id, params, cleanupRequest);
              }
            } catch (error) {
              cleanupErrors.push(`${kind} ${id}: ${this.describeError(error)}`);
            }
          }
        }
      }
    } finally {
      clearTimeout(cleanupTimer);
    }
    if (cleanupErrors.length) {
      metadata.rateLimitRetryable = false;
      metadata.cleanupErrors = cleanupErrors;
      response.error = [
        response.error,
        `Claude Managed Agents cleanup failed: ${cleanupErrors.join('; ')}`,
      ]
        .filter(Boolean)
        .join('. ');
    }
  }

  private describeError(error: unknown): string {
    // SDK HTTP errors include the response body, which can echo credentials from resources.
    if (error instanceof Anthropic.APIError) {
      return `Claude Managed Agents API request failed (HTTP ${error.status ?? 'connection error'})`;
    }
    return error instanceof Error ? error.message : 'Claude Managed Agents request failed';
  }
}
