import crypto from 'node:crypto';

import logger from '../../logger';
import { fetchWithTimeout } from '../../util/fetch/index';
import { safeJsonStringify } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';
import { sleep } from '../../util/time';
import { getRequestTimeoutMs } from '../shared';
import { loadTransformModule } from '../transformUtils';
import { createTransformResponse } from './transforms';
import {
  A2AAgentCardSchema,
  A2AMessageSchema,
  A2AProviderConfigSchema,
  A2AStreamResponseSchema,
  A2ATaskSchema,
} from './types';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types/index';
import type { A2ATransformResponseContext } from './transforms';
import type {
  A2AAgentCard,
  A2AAgentInterface,
  A2AFinalResponse,
  A2AMessage,
  A2AProviderConfig,
  A2AStreamResponse,
  A2ATask,
} from './types';

const DEFAULT_PROTOCOL_VERSION = '1.0';
const HTTP_JSON_BINDING = 'HTTP+JSON';
const TERMINAL_TASK_STATES = new Set([
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_REJECTED',
]);
const ATTENTION_TASK_STATES = new Set(['TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED']);

interface A2AEndpoint {
  protocolVersion: string;
  streaming: boolean;
  tenant?: string;
  url: string;
}

interface RequestVars extends Record<string, unknown> {
  prompt: string;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function appendPath(url: string, path: string): string {
  return `${normalizeBaseUrl(url)}${path}`;
}

function getTaskState(task?: A2ATask): string | undefined {
  return typeof task?.status?.state === 'string' ? task.status.state : undefined;
}

function isTerminalTask(task?: A2ATask): boolean {
  const state = getTaskState(task);
  return state ? TERMINAL_TASK_STATES.has(state) : false;
}

function needsCallerAction(task?: A2ATask): boolean {
  const state = getTaskState(task);
  return state ? ATTENTION_TASK_STATES.has(state) : false;
}

function textFromPart(part: unknown): string[] {
  if (!part || typeof part !== 'object') {
    return [];
  }
  const candidate = part as { text?: unknown; data?: unknown };
  if (typeof candidate.text === 'string') {
    return [candidate.text];
  }
  if (candidate.text && typeof candidate.text === 'object') {
    const nestedText = (candidate.text as { text?: unknown }).text;
    if (typeof nestedText === 'string') {
      return [nestedText];
    }
  }
  if (typeof candidate.data === 'string') {
    return [candidate.data];
  }
  return [];
}

function textFromMessage(message?: A2AMessage): string[] {
  return message?.parts?.flatMap(textFromPart) ?? [];
}

function renderString(value: string, vars: RequestVars, context?: CallApiContextParams): string {
  return getNunjucksEngine(context?.filters).renderString(value, vars);
}

function renderTemplate(
  value: unknown,
  vars: RequestVars,
  context?: CallApiContextParams,
): unknown {
  if (typeof value === 'string') {
    return renderString(value, vars, context);
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderTemplate(item, vars, context));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        renderTemplate(nestedValue, vars, context),
      ]),
    );
  }
  return value;
}

function generateMessageId(prompt: string, context?: CallApiContextParams): string {
  const identity = {
    evaluationId: context?.evaluationId,
    prompt,
    promptIdx: context?.promptIdx,
    repeatIndex: context?.repeatIndex,
    testCaseId: context?.testCaseId,
    testIdx: context?.testIdx,
  };
  return `promptfoo-${crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24)}`;
}

function getSessionId(context?: CallApiContextParams): string | undefined {
  const sessionId = context?.vars?.sessionId;
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined;
}

function selectedInterfaceFromCard(card: A2AAgentCard): A2AAgentInterface | undefined {
  return card.supportedInterfaces?.find(
    (entry) => entry.protocolBinding?.toUpperCase() === HTTP_JSON_BINDING,
  );
}

function getDefaultMessage(prompt: string): A2AMessage {
  return {
    role: 'ROLE_USER',
    parts: [{ text: prompt }],
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`A2A response was not valid JSON: ${String(error)}. Received: ${text}`);
  }
}

function providerError(error: unknown): ProviderResponse {
  const message = error instanceof Error ? error.message : String(error);
  return { error: `A2A Provider error: ${message}` };
}

function parseSendPayload(payload: unknown): A2AFinalResponse {
  const raw = payload;
  const maybeEnvelope =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const task = maybeEnvelope.task
    ? A2ATaskSchema.parse(maybeEnvelope.task)
    : maybeEnvelope.id && maybeEnvelope.status
      ? A2ATaskSchema.parse(payload)
      : undefined;
  const message = maybeEnvelope.message
    ? A2AMessageSchema.parse(maybeEnvelope.message)
    : maybeEnvelope.role && maybeEnvelope.parts
      ? A2AMessageSchema.parse(payload)
      : undefined;
  return { events: [], message, raw, task };
}

function mergeStreamEvent(
  event: A2AStreamResponse,
  current: Pick<A2AFinalResponse, 'message' | 'task'>,
): Pick<A2AFinalResponse, 'message' | 'task'> {
  if (event.message) {
    return { ...current, message: event.message };
  }
  if (event.task) {
    return { ...current, task: event.task };
  }
  if (event.artifactUpdate?.artifact) {
    const existingTask = current.task ?? { id: event.artifactUpdate.taskId };
    return {
      ...current,
      task: {
        ...existingTask,
        artifacts: [...(existingTask.artifacts ?? []), event.artifactUpdate.artifact],
      },
    };
  }
  if (event.statusUpdate?.status) {
    const existingTask = current.task ?? { id: event.statusUpdate.taskId };
    return {
      ...current,
      task: {
        ...existingTask,
        contextId: existingTask.contextId ?? event.statusUpdate.contextId,
        status: event.statusUpdate.status,
      },
    };
  }
  return current;
}

function splitSseFrames(buffer: string): { frames: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  return {
    frames: parts.slice(0, -1),
    remainder: parts.at(-1) ?? '',
  };
}

function parseSseFrame(frame: string): unknown | undefined {
  const dataLines = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart());
  if (dataLines.length === 0) {
    return undefined;
  }
  const data = dataLines.join('\n');
  if (data === '[DONE]') {
    return undefined;
  }
  return JSON.parse(data);
}

export class A2AProvider implements ApiProvider {
  config: A2AProviderConfig;
  private readonly providerId: string;
  private readonly transformResponse: Promise<
    (
      json: A2AFinalResponse,
      text: string,
      context: A2ATransformResponseContext,
    ) => Promise<ProviderResponse>
  >;

  constructor(providerPath: string, options: ProviderOptions = {}) {
    const shorthandUrl = providerPath.startsWith('a2a:') ? providerPath.slice('a2a:'.length) : '';
    this.providerId = options.id ?? providerPath;
    this.config = A2AProviderConfigSchema.parse({
      ...(options.config ?? {}),
      url: options.config?.url ?? (shorthandUrl || undefined),
    });
    this.transformResponse = loadTransformModule(this.config.transformResponse).then(
      createTransformResponse,
    );
  }

  id(): string {
    return this.providerId;
  }

  toString(): string {
    return `[A2A Provider ${this.providerId}]`;
  }

  toJSON() {
    return {
      id: this.id(),
      config: this.config,
    };
  }

  async getAgentCard(): Promise<A2AAgentCard | undefined> {
    return this.fetchAgentCard({ prompt: '' });
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      const vars = {
        ...context?.vars,
        prompt,
      } as RequestVars;
      const endpoint = await this.resolveEndpoint(vars, context, options);
      const mode = this.resolveMode(endpoint);
      const message = this.buildMessage(prompt, vars, context);
      const body = {
        ...(endpoint.tenant ? { tenant: endpoint.tenant } : {}),
        message,
        ...(this.config.configuration
          ? { configuration: renderTemplate(this.config.configuration, vars, context) }
          : {}),
      };

      const final =
        mode === 'stream'
          ? await this.sendStreaming(endpoint, body, vars, context, options)
          : await this.sendAndPoll(endpoint, body, vars, context, options);
      const output = this.extractOutput(final);
      const transformContext = {
        events: final.events,
        message: final.message,
        mode,
        raw: final.raw,
        task: final.task,
      };
      const transformed = await (await this.transformResponse)(final, output, transformContext);
      return {
        ...transformed,
        raw: transformed.raw ?? final.raw,
        metadata: {
          ...transformed.metadata,
          a2a: {
            events: final.events,
            mode,
            taskId: final.task?.id,
            taskState: getTaskState(final.task),
          },
        },
      };
    } catch (error) {
      logger.error(`[A2A Provider] ${error instanceof Error ? error.message : String(error)}`);
      return providerError(error);
    }
  }

  private async resolveEndpoint(
    vars: RequestVars,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<A2AEndpoint> {
    const card = await this.fetchAgentCard(vars, context, options);

    const cardInterface = card ? selectedInterfaceFromCard(card) : undefined;
    const url = this.config.url
      ? renderString(this.config.url, vars, context)
      : (cardInterface?.url ?? card?.url);
    if (!url) {
      throw new Error('Missing A2A endpoint URL. Set config.url or config.agentCardUrl.');
    }
    return {
      protocolVersion:
        this.config.protocolVersion ?? cardInterface?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
      streaming: this.config.mode === 'stream' || card?.capabilities?.streaming === true,
      tenant: this.config.tenant ?? cardInterface?.tenant,
      url,
    };
  }

  private resolveMode(endpoint: A2AEndpoint): 'send' | 'stream' {
    if (this.config.mode === 'send') {
      return 'send';
    }
    if (this.config.mode === 'stream' || endpoint.streaming) {
      return 'stream';
    }
    return 'send';
  }

  private async fetchAgentCard(
    vars: RequestVars,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<A2AAgentCard | undefined> {
    if (!this.config.agentCardUrl) {
      return undefined;
    }
    const agentCardUrl = renderString(this.config.agentCardUrl, vars, context);
    const response = await fetchWithTimeout(
      agentCardUrl,
      {
        headers: this.renderHeaders(vars, context),
        method: 'GET',
        signal: options?.abortSignal,
      },
      this.getTimeoutMs(),
    );
    return A2AAgentCardSchema.parse(await parseJsonResponse(response));
  }

  private buildMessage(
    prompt: string,
    vars: RequestVars,
    context?: CallApiContextParams,
  ): A2AMessage {
    const configuredMessage = this.config.message
      ? renderTemplate(this.config.message, vars, context)
      : getDefaultMessage(prompt);
    const message = A2AMessageSchema.parse(configuredMessage);
    return {
      ...message,
      contextId: message.contextId ?? getSessionId(context),
      messageId: message.messageId ?? generateMessageId(prompt, context),
    };
  }

  private renderHeaders(vars: RequestVars, context?: CallApiContextParams): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.config.headers ?? {}).map(([key, value]) => [
        key,
        renderString(value, vars, context),
      ]),
    );
  }

  private requestHeaders(
    endpoint: A2AEndpoint,
    vars: RequestVars,
    context?: CallApiContextParams,
    extra?: Record<string, string>,
  ): Record<string, string> {
    return {
      Accept: 'application/a2a+json, application/json',
      'A2A-Version': endpoint.protocolVersion,
      'Content-Type': 'application/a2a+json',
      ...this.renderHeaders(vars, context),
      ...extra,
    };
  }

  private getTimeoutMs(): number {
    return this.config.timeoutMs ?? getRequestTimeoutMs();
  }

  private async sendAndPoll(
    endpoint: A2AEndpoint,
    body: unknown,
    vars: RequestVars,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<A2AFinalResponse> {
    const response = await fetchWithTimeout(
      appendPath(endpoint.url, '/message:send'),
      {
        body: JSON.stringify(body),
        headers: this.requestHeaders(endpoint, vars, context),
        method: 'POST',
        signal: options?.abortSignal,
      },
      this.getTimeoutMs(),
    );
    const payload = await parseJsonResponse(response);
    const final = parseSendPayload(payload);
    if (
      final.task?.id &&
      !isTerminalTask(final.task) &&
      !needsCallerAction(final.task) &&
      this.config.polling.enabled
    ) {
      return {
        ...final,
        task: await this.pollTask(endpoint, final.task.id, vars, context, options),
      };
    }
    this.throwForTaskState(final.task);
    return final;
  }

  private async pollTask(
    endpoint: A2AEndpoint,
    taskId: string,
    vars: RequestVars,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<A2ATask> {
    const startedAt = Date.now();
    let lastTask: A2ATask | undefined;
    while (Date.now() - startedAt <= this.config.polling.timeoutMs) {
      const response = await fetchWithTimeout(
        appendPath(endpoint.url, `/tasks/${encodeURIComponent(taskId)}`),
        {
          headers: this.requestHeaders(endpoint, vars, context, {
            Accept: 'application/a2a+json, application/json',
          }),
          method: 'GET',
          signal: options?.abortSignal,
        },
        this.getTimeoutMs(),
      );
      lastTask = A2ATaskSchema.parse(await parseJsonResponse(response));
      if (isTerminalTask(lastTask) || needsCallerAction(lastTask)) {
        this.throwForTaskState(lastTask);
        return lastTask;
      }
      await sleep(this.config.polling.intervalMs);
    }
    throw new Error(
      `Timed out waiting for A2A task ${taskId} after ${this.config.polling.timeoutMs}ms. Last state: ${
        getTaskState(lastTask) ?? 'unknown'
      }`,
    );
  }

  private async sendStreaming(
    endpoint: A2AEndpoint,
    body: unknown,
    vars: RequestVars,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<A2AFinalResponse> {
    const response = await fetchWithTimeout(
      appendPath(endpoint.url, '/message:stream'),
      {
        body: JSON.stringify(body),
        headers: this.requestHeaders(endpoint, vars, context, { Accept: 'text/event-stream' }),
        method: 'POST',
        signal: options?.abortSignal,
      },
      this.getTimeoutMs(),
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }
    if (!response.body) {
      throw new Error('A2A streaming response did not include a body.');
    }

    const events: unknown[] = [];
    let current: Pick<A2AFinalResponse, 'message' | 'task'> = {};
    let buffer = '';
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const split = splitSseFrames(buffer);
        buffer = split.remainder;
        for (const frame of split.frames) {
          const eventPayload = parseSseFrame(frame);
          if (!eventPayload) {
            continue;
          }
          const event = A2AStreamResponseSchema.parse(eventPayload);
          events.push(eventPayload);
          current = mergeStreamEvent(event, current);
          if (isTerminalTask(current.task)) {
            this.throwForTaskState(current.task);
            return {
              events,
              message: current.message,
              raw: events,
              task: current.task,
            };
          }
          this.throwForTaskState(current.task);
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (buffer.trim()) {
      const eventPayload = parseSseFrame(buffer);
      if (eventPayload) {
        const event = A2AStreamResponseSchema.parse(eventPayload);
        events.push(eventPayload);
        current = mergeStreamEvent(event, current);
      }
    }
    if (
      current.task?.id &&
      !isTerminalTask(current.task) &&
      !needsCallerAction(current.task) &&
      this.config.polling.enabled
    ) {
      current = {
        ...current,
        task: await this.pollTask(endpoint, current.task.id, vars, context, options),
      };
    }
    this.throwForTaskState(current.task);
    return {
      events,
      message: current.message,
      raw: events,
      task: current.task,
    };
  }

  private throwForTaskState(task?: A2ATask): void {
    const state = getTaskState(task);
    if (!state || state === 'TASK_STATE_COMPLETED') {
      return;
    }
    const text = textFromMessage(task?.status?.message).join('\n');
    if (state === 'TASK_STATE_FAILED') {
      throw new Error(`A2A task failed${text ? `: ${text}` : ''}`);
    }
    if (state === 'TASK_STATE_CANCELED') {
      throw new Error(`A2A task was canceled${text ? `: ${text}` : ''}`);
    }
    if (state === 'TASK_STATE_REJECTED') {
      throw new Error(`A2A task was rejected${text ? `: ${text}` : ''}`);
    }
    if (state === 'TASK_STATE_INPUT_REQUIRED') {
      throw new Error(`A2A task requires additional input${text ? `: ${text}` : ''}`);
    }
    if (state === 'TASK_STATE_AUTH_REQUIRED') {
      throw new Error(`A2A task requires additional authentication${text ? `: ${text}` : ''}`);
    }
  }

  private extractOutput(final: A2AFinalResponse): string {
    const messageText = textFromMessage(final.message);
    if (messageText.length > 0) {
      return messageText.join('\n');
    }
    const artifactText =
      final.task?.artifacts?.flatMap((artifact) => artifact.parts?.flatMap(textFromPart) ?? []) ??
      [];
    if (artifactText.length > 0) {
      return artifactText.join('\n');
    }
    const statusText = textFromMessage(final.task?.status?.message);
    if (statusText.length > 0) {
      return statusText.join('\n');
    }
    const historyText = final.task?.history?.flatMap(textFromMessage) ?? [];
    if (historyText.length > 0) {
      return historyText.join('\n');
    }
    return safeJsonStringify(final.raw) ?? '';
  }
}
