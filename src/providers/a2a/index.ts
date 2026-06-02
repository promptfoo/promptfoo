import crypto from 'node:crypto';

import logger from '../../logger';
import { fetchWithTimeout } from '../../util/fetch/index';
import { safeJsonStringify } from '../../util/json';
import { getNunjucksEngine } from '../../util/templates';
import { sleep } from '../../util/time';
import { normalizeRenderedAuth } from '../mcp/auth';
import {
  applyQueryParams,
  getAuthHeaders,
  getAuthQueryParams,
  getOAuthTokenWithExpiry,
} from '../mcp/util';
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
import type {
  MCPOAuthClientCredentialsAuth,
  MCPOAuthPasswordAuth,
  MCPServerConfig,
} from '../mcp/types';
import type { A2ATransformResponseContext } from './transforms';
import type {
  A2AAgentCard,
  A2AAgentInterface,
  A2AArtifact,
  A2AFinalResponse,
  A2AMessage,
  A2APart,
  A2AProviderConfig,
  A2AStreamResponse,
  A2ATask,
} from './types';

const DEFAULT_PROTOCOL_VERSION = '1.0';
const HTTP_JSON_BINDING = 'HTTP+JSON';
const BASE64_PREVIEW_LENGTH = 64;
const TERMINAL_TASK_STATES = new Set([
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_CANCELLED',
  'TASK_STATE_REJECTED',
]);
const ATTENTION_TASK_STATES = new Set(['TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED']);
const AGENT_ROLES = new Set(['agent', 'assistant', 'model', 'role_agent']);
const MEDIA_STRATEGY_DEFAULTS = {
  audio: {
    fallbackVarName: 'audio',
    filename: 'promptfoo-audio.mp3',
    injectVarMetadataKey: 'audioInjectVar',
    mediaType: 'audio/mpeg',
  },
  image: {
    fallbackVarName: 'image',
    filename: 'promptfoo-image.png',
    injectVarMetadataKey: 'imageInjectVar',
    mediaType: 'image/png',
  },
  video: {
    fallbackVarName: 'video',
    filename: 'promptfoo-video.mp4',
    injectVarMetadataKey: 'videoInjectVar',
    mediaType: 'video/mp4',
  },
} as const;

type MediaStrategyId = keyof typeof MEDIA_STRATEGY_DEFAULTS;

interface A2AEndpoint {
  protocolVersion: string;
  streaming: boolean;
  tenant?: string;
  url: string;
}

interface A2ARequestAuth {
  headers: Record<string, string>;
  queryParams: Record<string, string>;
}

interface RequestVars extends Record<string, unknown> {
  prompt: string;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function appendPath(url: string, path: string): string {
  const parsedUrl = new URL(url);
  parsedUrl.pathname = `${normalizeBaseUrl(parsedUrl.pathname)}${path}`;
  return parsedUrl.toString();
}

function appendQueryParams(url: string, queryParams: Record<string, string>): string {
  return applyQueryParams(url, queryParams);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getTaskState(task?: A2ATask): string | undefined {
  return typeof task?.status?.state === 'string' ? task.status.state : undefined;
}

function normalizeTaskState(state: string | undefined): string | undefined {
  if (!state) {
    return undefined;
  }
  const normalized = state.trim().toUpperCase().replace(/-/g, '_');
  if (!normalized) {
    return undefined;
  }
  return normalized.startsWith('TASK_STATE_') ? normalized : `TASK_STATE_${normalized}`;
}

function isTerminalTask(task?: A2ATask): boolean {
  const state = normalizeTaskState(getTaskState(task));
  return state ? TERMINAL_TASK_STATES.has(state) : false;
}

function needsCallerAction(task?: A2ATask): boolean {
  const state = normalizeTaskState(getTaskState(task));
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

function isAgentMessage(message?: A2AMessage): boolean {
  return message?.role ? AGENT_ROLES.has(message.role.toLowerCase()) : false;
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

function getInterfaceBinding(entry: A2AAgentInterface): string | undefined {
  return (entry.protocolBinding ?? entry.transport)?.toUpperCase();
}

function selectedInterfaceFromCard(card: A2AAgentCard): A2AAgentInterface | undefined {
  return [...(card.supportedInterfaces ?? []), ...(card.additionalInterfaces ?? [])].find(
    (entry) => getInterfaceBinding(entry) === HTTP_JSON_BINDING,
  );
}

function hasDeclaredInterfaces(card: A2AAgentCard): boolean {
  return (
    (card.supportedInterfaces?.length ?? 0) > 0 || (card.additionalInterfaces?.length ?? 0) > 0
  );
}

function canUseCardUrl(card: A2AAgentCard): boolean {
  const preferredTransport = card.preferredTransport?.toUpperCase();
  return preferredTransport === HTTP_JSON_BINDING;
}

function usesLegacyMessageShape(protocolVersion: string): boolean {
  return protocolVersion.startsWith('0.3');
}

function getTestMetadata(context?: CallApiContextParams): Record<string, unknown> {
  const metadata = context?.test?.metadata;
  return metadata && typeof metadata === 'object' ? metadata : {};
}

function getMediaStrategyId(context?: CallApiContextParams): MediaStrategyId | undefined {
  const strategyId = getTestMetadata(context).strategyId;
  return strategyId === 'audio' || strategyId === 'image' || strategyId === 'video'
    ? strategyId
    : undefined;
}

function parseBase64DataUrl(value: string): { mediaType: string; raw: string } | undefined {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) {
    return undefined;
  }
  return {
    mediaType: match[1],
    raw: match[2],
  };
}

function maybeBase64Payload(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed);
}

function promptContainsMediaPayload(prompt: string, mediaValue: string): boolean {
  const preview = mediaValue.slice(0, Math.min(BASE64_PREVIEW_LENGTH, mediaValue.length));
  return preview.length > 0 && prompt.includes(preview);
}

function shouldUsePromptAsText(prompt: string, mediaValue?: string): boolean {
  if (!nonEmptyString(prompt) || prompt.startsWith('data:') || maybeBase64Payload(prompt)) {
    return false;
  }
  if (mediaValue && (prompt === mediaValue || promptContainsMediaPayload(prompt, mediaValue))) {
    return false;
  }
  return true;
}

function getContextVar(vars: Record<string, unknown>, key: string): string | undefined {
  return nonEmptyString(vars[key]);
}

function getMediaVarName(
  strategyId: MediaStrategyId,
  vars: Record<string, unknown>,
  context?: CallApiContextParams,
): string | undefined {
  const defaults = MEDIA_STRATEGY_DEFAULTS[strategyId];
  const metadataInjectVar = getTestMetadata(context)[defaults.injectVarMetadataKey];
  if (typeof metadataInjectVar === 'string' && getContextVar(vars, metadataInjectVar)) {
    return metadataInjectVar;
  }
  if (getContextVar(vars, defaults.fallbackVarName)) {
    return defaults.fallbackVarName;
  }
  if (getContextVar(vars, 'prompt')) {
    return 'prompt';
  }
  return undefined;
}

function getDefaultTextPart(
  prompt: string,
  protocolVersion: string,
  contextVars: Record<string, unknown>,
  mediaValue?: string,
): A2APart | undefined {
  const text =
    getContextVar(contextVars, 'question') ??
    (shouldUsePromptAsText(prompt, mediaValue) ? prompt : undefined);
  if (!text) {
    return undefined;
  }
  return usesLegacyMessageShape(protocolVersion) ? { kind: 'text', text } : { text };
}

function getDefaultMediaPart(
  protocolVersion: string,
  contextVars: Record<string, unknown>,
  context?: CallApiContextParams,
): A2APart | undefined {
  const strategyId = getMediaStrategyId(context);
  if (!strategyId) {
    return undefined;
  }
  const varName = getMediaVarName(strategyId, contextVars, context);
  const mediaValue = varName ? getContextVar(contextVars, varName) : undefined;
  if (!mediaValue) {
    return undefined;
  }

  const defaults = MEDIA_STRATEGY_DEFAULTS[strategyId];
  const parsedDataUrl = parseBase64DataUrl(mediaValue);
  const raw = parsedDataUrl?.raw ?? mediaValue;
  const mediaType = parsedDataUrl?.mediaType ?? defaults.mediaType;

  if (usesLegacyMessageShape(protocolVersion)) {
    return {
      file: {
        fileWithBytes: raw,
        mimeType: mediaType,
        name: defaults.filename,
      },
      kind: 'file',
    };
  }

  return {
    filename: defaults.filename,
    mediaType,
    raw,
  };
}

function getDefaultMessage(
  prompt: string,
  protocolVersion: string,
  contextVars: Record<string, unknown> = {},
  context?: CallApiContextParams,
): A2AMessage {
  const mediaPart = getDefaultMediaPart(protocolVersion, contextVars, context);
  if (mediaPart) {
    const mediaValue =
      typeof mediaPart.raw === 'string'
        ? mediaPart.raw
        : typeof mediaPart.file === 'object' &&
            mediaPart.file &&
            'fileWithBytes' in mediaPart.file &&
            typeof mediaPart.file.fileWithBytes === 'string'
          ? mediaPart.file.fileWithBytes
          : undefined;
    const textPart = getDefaultTextPart(prompt, protocolVersion, contextVars, mediaValue);
    return {
      role: usesLegacyMessageShape(protocolVersion) ? 'user' : 'ROLE_USER',
      parts: textPart ? [textPart, mediaPart] : [mediaPart],
    };
  }

  if (usesLegacyMessageShape(protocolVersion)) {
    return {
      role: 'user',
      parts: [{ kind: 'text', text: prompt }],
    };
  }

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

function mergeArtifactParts(
  existingParts: A2AArtifact['parts'] = [],
  appendedParts: A2AArtifact['parts'] = [],
): A2AArtifact['parts'] {
  if (existingParts.length === 0 || appendedParts.length === 0) {
    return [...existingParts, ...appendedParts];
  }

  const mergedParts = [...existingParts];
  const lastExistingPart = mergedParts[mergedParts.length - 1];
  const firstAppendedPart = appendedParts[0];
  if (
    lastExistingPart &&
    firstAppendedPart &&
    typeof lastExistingPart.text === 'string' &&
    typeof firstAppendedPart.text === 'string'
  ) {
    mergedParts[mergedParts.length - 1] = {
      ...lastExistingPart,
      text: `${lastExistingPart.text}${firstAppendedPart.text}`,
    };
    return [...mergedParts, ...appendedParts.slice(1)];
  }

  return [...existingParts, ...appendedParts];
}

function mergeArtifactUpdate(
  event: NonNullable<A2AStreamResponse['artifactUpdate']>,
  currentTask?: A2ATask,
): A2ATask {
  const existingTask = currentTask ?? { id: event.taskId };
  const artifact = event.artifact;
  if (!artifact) {
    return existingTask;
  }

  const append = (event as { append?: unknown }).append === true;
  const artifacts = existingTask.artifacts ?? [];
  if (!append) {
    if (artifact.artifactId) {
      const existingIndex = artifacts.findIndex(
        (existingArtifact) => existingArtifact.artifactId === artifact.artifactId,
      );
      if (existingIndex >= 0) {
        return {
          ...existingTask,
          artifacts: artifacts.map((existingArtifact, index) =>
            index === existingIndex ? artifact : existingArtifact,
          ),
        };
      }
    }
    return {
      ...existingTask,
      artifacts: [...artifacts, artifact],
    };
  }

  const artifactId = artifact.artifactId;
  const existingIndex = artifactId
    ? artifacts.findIndex((existingArtifact) => existingArtifact.artifactId === artifactId)
    : artifacts.length - 1;
  if (existingIndex < 0) {
    return {
      ...existingTask,
      artifacts: [...artifacts, artifact],
    };
  }

  return {
    ...existingTask,
    artifacts: artifacts.map((existingArtifact, index) =>
      index === existingIndex
        ? {
            ...existingArtifact,
            ...artifact,
            parts: mergeArtifactParts(existingArtifact.parts, artifact.parts),
          }
        : existingArtifact,
    ),
  };
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
    return {
      ...current,
      task: mergeArtifactUpdate(event.artifactUpdate, current.task),
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
    remainder: parts.length > 0 ? parts[parts.length - 1] : '',
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

function getStreamErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const error = (payload as Record<string, unknown>).error;
  if (!error) {
    return undefined;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    const errorObject = error as Record<string, unknown>;
    const message = nonEmptyString(errorObject.message);
    const code = errorObject.code;
    if (message && code !== undefined) {
      return `${message} (code: ${String(code)})`;
    }
    if (message) {
      return message;
    }
    return safeJsonStringify(errorObject) ?? 'Unknown A2A stream error';
  }
  return `Unknown A2A stream error: ${String(error)}`;
}

function throwForStreamError(payload: unknown): void {
  const message = getStreamErrorMessage(payload);
  if (message) {
    throw new Error(`A2A stream error: ${message}`);
  }
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
    const shorthandUrl = nonEmptyString(
      providerPath.startsWith('a2a:') ? providerPath.slice('a2a:'.length) : undefined,
    );
    this.providerId = options.id ?? providerPath;
    this.config = A2AProviderConfigSchema.parse({
      ...(options.config ?? {}),
      url: nonEmptyString(options.config?.url) ?? shorthandUrl,
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
      const contextVars = { ...(context?.vars ?? {}) };
      const vars = {
        ...contextVars,
        prompt,
      } as RequestVars;
      const endpoint = await this.resolveEndpoint(vars, context, options);
      const mode = this.resolveMode(endpoint);
      const message = this.buildMessage(
        prompt,
        endpoint.protocolVersion,
        vars,
        context,
        contextVars,
      );
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
    const configuredUrl = this.config.url
      ? nonEmptyString(renderString(this.config.url, vars, context))
      : undefined;
    const cardUrl = card && canUseCardUrl(card) ? card.url : undefined;
    const url = configuredUrl ?? cardInterface?.url ?? cardUrl;
    if (!url) {
      if (card && (hasDeclaredInterfaces(card) || card.url)) {
        throw new Error('A2A Agent Card does not advertise a supported HTTP+JSON interface.');
      }
      throw new Error('Missing A2A endpoint URL. Set config.url or config.agentCardUrl.');
    }
    const usesDiscoveredInterface = !configuredUrl && cardInterface?.url === url;
    const usesCardUrl = !configuredUrl && !usesDiscoveredInterface && cardUrl === url;
    return {
      protocolVersion:
        this.config.protocolVersion ??
        (usesDiscoveredInterface ? cardInterface?.protocolVersion : undefined) ??
        (usesCardUrl ? card?.protocolVersion : undefined) ??
        DEFAULT_PROTOCOL_VERSION,
      streaming: this.config.mode === 'stream' || card?.capabilities?.streaming === true,
      tenant:
        (this.config.tenant ? renderString(this.config.tenant, vars, context) : undefined) ??
        (usesDiscoveredInterface ? cardInterface?.tenant : undefined),
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
    const auth = await this.requestAuth(vars, context, agentCardUrl);
    const response = await fetchWithTimeout(
      appendQueryParams(agentCardUrl, auth.queryParams),
      {
        headers: {
          ...this.renderHeaders(vars, context),
          ...auth.headers,
        },
        method: 'GET',
        signal: options?.abortSignal,
      },
      this.getTimeoutMs(),
    );
    return A2AAgentCardSchema.parse(await parseJsonResponse(response));
  }

  private buildMessage(
    prompt: string,
    protocolVersion: string,
    vars: RequestVars,
    context?: CallApiContextParams,
    contextVars: Record<string, unknown> = context?.vars ?? {},
  ): A2AMessage {
    const configuredMessage = this.config.message
      ? renderTemplate(this.config.message, vars, context)
      : getDefaultMessage(prompt, protocolVersion, contextVars, context);
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

  private async requestAuth(
    vars: RequestVars,
    context: CallApiContextParams | undefined,
    serverUrl: string,
  ): Promise<A2ARequestAuth> {
    if (!this.config.auth) {
      return { headers: {}, queryParams: {} };
    }
    const renderedAuth = normalizeRenderedAuth(renderTemplate(this.config.auth, vars, context));
    const server = { auth: renderedAuth } as MCPServerConfig;
    const oauthToken =
      server.auth?.type === 'oauth'
        ? (
            await getOAuthTokenWithExpiry(
              server.auth as MCPOAuthClientCredentialsAuth | MCPOAuthPasswordAuth,
              serverUrl,
            )
          ).accessToken
        : undefined;
    return {
      headers: getAuthHeaders(server, oauthToken),
      queryParams: getAuthQueryParams(server),
    };
  }

  private requestHeaders(
    endpoint: A2AEndpoint,
    vars: RequestVars,
    context?: CallApiContextParams,
    auth: A2ARequestAuth = { headers: {}, queryParams: {} },
    extra?: Record<string, string>,
  ): Record<string, string> {
    return {
      Accept: 'application/a2a+json, application/json',
      'A2A-Version': endpoint.protocolVersion,
      'Content-Type': 'application/a2a+json',
      ...this.renderHeaders(vars, context),
      ...auth.headers,
      ...extra,
    };
  }

  private requestUrl(
    endpoint: A2AEndpoint,
    path: string,
    auth: A2ARequestAuth = { headers: {}, queryParams: {} },
    queryParams: Record<string, string> = {},
  ): string {
    return appendQueryParams(appendPath(endpoint.url, path), {
      ...auth.queryParams,
      ...queryParams,
    });
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
    const auth = await this.requestAuth(vars, context, endpoint.url);
    const response = await fetchWithTimeout(
      this.requestUrl(endpoint, '/message:send', auth),
      {
        body: JSON.stringify(body),
        headers: this.requestHeaders(endpoint, vars, context, auth),
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
      const task = await this.pollTask(endpoint, final.task.id, vars, context, options);
      return {
        ...final,
        raw: task,
        task,
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
      const auth = await this.requestAuth(vars, context, endpoint.url);
      const response = await fetchWithTimeout(
        this.requestUrl(
          endpoint,
          `/tasks/${encodeURIComponent(taskId)}`,
          auth,
          endpoint.tenant ? { tenant: endpoint.tenant } : {},
        ),
        {
          headers: this.requestHeaders(endpoint, vars, context, auth, {
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
    const auth = await this.requestAuth(vars, context, endpoint.url);
    const response = await fetchWithTimeout(
      this.requestUrl(endpoint, '/message:stream', auth),
      {
        body: JSON.stringify(body),
        headers: this.requestHeaders(endpoint, vars, context, auth, {
          Accept: 'text/event-stream',
        }),
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
          throwForStreamError(eventPayload);
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
        throwForStreamError(eventPayload);
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
    const state = normalizeTaskState(getTaskState(task));
    if (!state || state === 'TASK_STATE_COMPLETED') {
      return;
    }
    const text = textFromMessage(task?.status?.message).join('\n');
    if (state === 'TASK_STATE_FAILED') {
      throw new Error(`A2A task failed${text ? `: ${text}` : ''}`);
    }
    if (state === 'TASK_STATE_CANCELED' || state === 'TASK_STATE_CANCELLED') {
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
    const historyText =
      final.task?.history?.flatMap((message) =>
        isAgentMessage(message) ? textFromMessage(message) : [],
      ) ?? [];
    if (historyText.length > 0) {
      return historyText.join('\n');
    }
    return safeJsonStringify(final.raw) ?? '';
  }
}
