import type { IncomingMessage } from 'node:http';

import { ProxyAgent } from 'proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import WebSocket from 'ws';
import { isSecretField, REDACTED } from '../../util/sanitizer';
import { accumulateTokenUsage } from '../../util/tokenUsageUtils';
import { convertG711ToPcm16, convertPcm16ToWav } from './audio';
import { calculateOpenAIUsageCost } from './billing';
import { getOpenAICompletionTokenDetails, resolveMaxToolIterations } from './util';
import type OpenAI from 'openai';

import type { ProviderResponse, TokenUsage } from '../../types/index';
import type { LiveAudioFormat, LiveInputMessage } from './liveInput';
import type {
  LiveDelegationHandler,
  LiveFunctionCallHandler,
  LiveTranscriptDelta,
  OpenAiLiveOptions,
} from './liveTypes';

interface LiveEvent {
  type: string;
  [key: string]: any;
}
interface ToolCall {
  call_id: string;
  name: string;
  arguments: string;
}
interface BackendTurn {
  id: string;
  calls: Map<string, ToolCall>;
}
interface LiveApiError {
  code?: string;
  type?: string;
  message?: string;
  param?: string;
  clientEventId?: string;
}
interface LiveDelegation {
  id: string;
  target: 'client' | 'responses';
  offsetMs?: number;
}

interface SessionOptions {
  url: string;
  headers: Record<string, string>;
  model: string;
  config: OpenAiLiveOptions;
  format: LiveAudioFormat;
  input: LiveInputMessage[];
  audio: Buffer;
  responseWindowMs: number;
  websocketTimeout: number;
  closeTimeoutMs: number;
  requestTimeoutMs: number;
  delegationHandler?: LiveDelegationHandler;
  functionCallHandler?: LiveFunctionCallHandler;
  signal: AbortSignal;
}

export const LIVE_FRAME_MS = 20;

const OPENING_INSTRUCTION_ID = 'promptfoo_start';
const OPENING_COMMENTARY_ID = 'promptfoo_opening';
const MAX_API_ERRORS = 20;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_TRANSCRIPT_BYTES = 1024 * 1024;
const MAX_TRANSCRIPT_DELTAS = 20_000;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_AUDIO_CHUNKS = 50_000;
const MAX_HANDSHAKE_BODY_BYTES = 8 * 1024;
const HANDSHAKE_BODY_TIMEOUT_MS = 2_000;
const PENDING_WORK_ERROR =
  'GPT-Live capture window ended with backend work pending. Increase responseWindowMs.';
const LATE_WORK_ERROR =
  'GPT-Live backend requested work after the capture window ended. Increase responseWindowMs.';
const CREDENTIAL_HEADER =
  /(?:authorization|api[-_]?key|token|secret|signature|credential|cookie|password)/i;
const GUARDRAIL_ERROR_CODES = new Set([
  'moderation_blocked',
  'content_policy_violation',
  'content_filter',
]);

/** Credential-named headers authenticate compatible gateways and are redacted from diagnostics. */
export function isLiveCredentialHeader(name: string): boolean {
  return isSecretField(name) || CREDENTIAL_HEADER.test(name);
}

function collectCredentials(headers: Record<string, string>): string[] {
  return Object.entries(headers)
    .filter(([name, value]) => typeof value === 'string' && isLiveCredentialHeader(name))
    .flatMap(([, value]) => credentialForms(value))
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length);
}

function safeLabel(value: unknown): string | undefined {
  return typeof value === 'string' && /^[\w.-]{1,80}$/.test(value) ? value : undefined;
}

function describeApiError({ code, type, message }: LiveApiError): string {
  const label = code ?? type;
  const detail = message?.replace(/[\s.]+$/, '');
  return `${label ? ` (${label})` : ''}${detail ? `: ${detail}` : ''}.`;
}

/** Accept canonical base64 with or without padding. */
function decodeBase64(value: string): Buffer | undefined {
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')
    ? bytes
    : undefined;
}

function readErrorMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body);
    const message = typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message;
    return typeof message === 'string' && message.trim() ? message.trim() : undefined;
  } catch {
    return undefined;
  }
}

export class LiveSession {
  private ws!: WebSocket;
  private proxyAgent?: ProxyAgent;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private startupTimer?: ReturnType<typeof setTimeout>;
  private resolve!: (response: ProviderResponse) => void;
  private done = false;
  private started = false;
  private closing = false;
  private finalized = false;
  private sessionId?: string;
  private error?: string;
  private guardrailReason?: string;
  private reason?: string;
  private voiceSeconds?: number;
  private audioChunks: Buffer[] = [];
  private audioBytes = 0;
  private inputBytesSent = 0;
  private streamStartedAt = 0;
  private framesSent = 0;
  /** Undefined until a text prompt's opening instruction is acknowledged. */
  private captureEndFrame?: number;
  private transcript: LiveTranscriptDelta[] = [];
  private transcriptBytes = 0;
  private apiErrors: LiveApiError[] = [];
  private commands = new Map<string, { name: string; pending: boolean }>();
  private commandCount = 0;
  private readonly credentials: string[];
  private tokenUsage: TokenUsage = { numRequests: 1 };
  private backendCost: number | undefined = 0;
  private backendResponses: { id: string; model: string; usage: unknown }[] = [];
  private delegations: LiveDelegation[] = [];
  private pendingHandlers = 0;
  private backendTurns = new Map<string, BackendTurn>();
  private finishedResponses = new Set<string>();
  private backendResponseCount = 0;
  private completedToolCalls = new Set<string>();
  private receivedToolCallCount = 0;
  private handlerController = new AbortController();

  constructor(private options: SessionOptions) {
    this.credentials = collectCredentials(options.headers);
  }

  run(): Promise<ProviderResponse> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      // Apply HTTP(S)_PROXY and NO_PROXY to the WebSocket upgrade request.
      const proxyUrl = getProxyForUrl(this.options.url.replace(/^ws/, 'http'));
      if (proxyUrl) {
        this.proxyAgent = new ProxyAgent({ getProxyForUrl: () => proxyUrl });
      }
      this.ws = new WebSocket(this.options.url, {
        agent: this.proxyAgent,
        headers: this.options.headers,
        followRedirects: false,
        handshakeTimeout: this.options.websocketTimeout,
        maxPayload: 16 * 1024 * 1024,
      });
      this.options.signal.addEventListener('abort', this.onAbort, { once: true });
      // Startup covers the handshake, session.started, and a text prompt's opening acknowledgment.
      this.startupTimer = this.later(
        () =>
          this.fail(
            this.started
              ? 'GPT-Live timed out waiting for the opening instruction acknowledgment.'
              : 'GPT-Live timed out waiting for session.started.',
          ),
        this.options.websocketTimeout,
      );
      this.later(
        () =>
          this.fail(
            'GPT-Live request timed out before session.closed; final usage is unconfirmed.',
          ),
        this.options.requestTimeoutMs,
      );
      this.ws.on('open', () => {
        this.send({
          type: 'session.start',
          session: {
            model: this.options.model,
            ...(this.options.config.instructions !== undefined && {
              instructions: this.options.config.instructions,
            }),
            input: this.options.input,
            audio: {
              format: this.options.format,
              output: this.options.config.audio?.output ?? { voice: 'marin' },
            },
            delegation: this.options.config.delegation ?? { type: 'client' },
          },
        });
      });
      this.ws.on('message', (raw) => {
        if (this.done) {
          return;
        }
        try {
          const event: LiveEvent = JSON.parse(raw.toString());
          if (!event || typeof event.type !== 'string') {
            throw new Error('Missing event type');
          }
          this.handleEvent(event);
        } catch {
          this.fail('Invalid GPT-Live server event.');
        }
      });
      this.ws.on('error', (error: NodeJS.ErrnoException) => {
        const code = error.code && /^[A-Z][A-Z0-9_]+$/.test(error.code) ? ` (${error.code})` : '';
        this.fail(
          `GPT-Live WebSocket connection failed${code}. Check API access, credentials, and network connectivity.`,
        );
      });
      this.ws.on('unexpected-response', (_request, response) => {
        this.reportHandshakeFailure(response);
      });
      this.ws.on('close', () => {
        if (!this.done) {
          this.fail(
            'GPT-Live connection closed before session.closed; final usage is unconfirmed.',
          );
        }
      });
      if (this.options.signal.aborted) {
        this.onAbort();
      }
    });
  }

  private onAbort = () => this.fail('GPT-Live request aborted.');

  private later(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.done) {
        callback();
      }
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.timers.delete(this.startupTimer);
      this.startupTimer = undefined;
    }
  }

  private send(event: LiveEvent): void {
    if (this.done || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      this.ws.send(JSON.stringify(event));
    } catch {
      this.fail('Failed to send a GPT-Live event.');
    }
  }

  /** Track promptfoo's commands so Live errors can identify rejected or cancelled commands. */
  private registerCommand(name: string, eventId = `promptfoo_${++this.commandCount}`): string {
    this.commands.set(eventId, { name, pending: true });
    return eventId;
  }

  /** Keep the first specific failure; later generic errors never replace it. */
  private setError(error: string): void {
    this.error ??= error;
  }

  private redact(text: string): string {
    let redacted = text;
    for (const credential of this.credentials) {
      redacted = redactCredential(redacted, credential);
    }
    return redacted
      .replace(/\b(Bearer|Basic)\s+(?!\[REDACTED\])[\w.~+/=-]{8,}/gi, `$1 ${REDACTED}`)
      .replace(/\bsk-[\w-]{16,}/g, REDACTED);
  }

  /** Report a rejected upgrade with the bounded API message from its response body. */
  private reportHandshakeFailure(response: IncomingMessage): void {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let reported = false;
    const report = () => {
      if (reported) {
        return;
      }
      reported = true;
      response.destroy();
      const message = readErrorMessage(Buffer.concat(chunks).toString('utf8'));
      const detail = message
        ? `: ${this.redact(message)
            .slice(0, MAX_ERROR_MESSAGE_LENGTH)
            .replace(/[\s.]+$/, '')}`
        : '';
      this.fail(`GPT-Live WebSocket handshake failed (HTTP ${response.statusCode})${detail}.`);
    };
    this.later(report, HANDSHAKE_BODY_TIMEOUT_MS);
    response.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_HANDSHAKE_BODY_BYTES) {
        report();
        return;
      }
      chunks.push(chunk);
    });
    response.once('end', report);
    response.once('error', report);
  }

  private streamAudio(): void {
    const bytesPerSecond =
      this.options.format.rate * (this.options.format.type === 'audio/pcm' ? 2 : 1);
    const frameSize = (bytesPerSecond * LIVE_FRAME_MS) / 1000;
    const silence =
      this.options.format.type === 'audio/pcmu'
        ? 0xff
        : this.options.format.type === 'audio/pcma'
          ? 0xd5
          : 0;
    this.streamStartedAt = performance.now();
    if (this.options.audio.length) {
      // Recorded audio starts the response window when the clip ends.
      this.captureEndFrame = Math.ceil(
        ((this.options.audio.length / bytesPerSecond) * 1000 + this.options.responseWindowMs) /
          LIVE_FRAME_MS,
      );
    }
    const sendFrame = () => {
      if (this.done || this.closing) {
        return;
      }
      if (this.captureEndFrame !== undefined && this.framesSent >= this.captureEndFrame) {
        this.closeSession();
        return;
      }
      const bytes = Buffer.alloc(frameSize, silence);
      this.inputBytesSent += this.options.audio.copy(
        bytes,
        0,
        this.inputBytesSent,
        this.inputBytesSent + frameSize,
      );
      this.send({ type: 'session.input_audio.append', audio: bytes.toString('base64') });
      this.framesSent++;
      this.later(
        sendFrame,
        Math.max(0, this.streamStartedAt + this.framesSent * LIVE_FRAME_MS - performance.now()),
      );
    };
    sendFrame();
  }

  /** A text prompt's response window starts with the opening prompt, not session startup. */
  private startResponseWindow(): void {
    const elapsedMs = performance.now() - this.streamStartedAt;
    this.captureEndFrame = Math.ceil((elapsedMs + this.options.responseWindowMs) / LIVE_FRAME_MS);
  }

  private handleEvent(event: LiveEvent): void {
    switch (event.type) {
      case 'session.started':
        if (this.started || typeof event.session?.id !== 'string') {
          this.fail('Invalid GPT-Live session startup.');
          return;
        }
        this.started = true;
        this.sessionId = event.session.id;
        if (this.options.audio.length) {
          this.clearStartupTimer();
        } else {
          // Acknowledgments follow input frame progress, so silence streams while this is pending.
          this.send({
            type: 'session.instructions.append',
            event_id: this.registerCommand('session.instructions.append', OPENING_INSTRUCTION_ID),
            delegation_id: null,
            content:
              "Immediately answer the user's last message out loud, without waiting for the caller to speak, then pause and listen.",
          });
        }
        this.streamAudio();
        break;
      case 'session.instructions.appended':
        this.acknowledgeCommand(event.client_event_id);
        if (
          event.client_event_id === OPENING_INSTRUCTION_ID &&
          this.captureEndFrame === undefined &&
          !this.closing
        ) {
          this.clearStartupTimer();
          this.send({
            type: 'session.commentary.append',
            event_id: this.registerCommand('session.commentary.append', OPENING_COMMENTARY_ID),
            delegation_id: null,
            content: 'Begin now, following the instructions provided.',
          });
          this.startResponseWindow();
        }
        break;
      case 'session.commentary.appended':
        this.acknowledgeCommand(event.client_event_id);
        break;
      case 'session.input_transcript.delta':
      case 'session.output_transcript.delta':
        if (
          typeof event.delta !== 'string' ||
          !Number.isFinite(event.start_ms) ||
          !Number.isFinite(event.end_ms)
        ) {
          this.fail('Invalid GPT-Live transcript delta.');
          return;
        }
        this.transcriptBytes += Buffer.byteLength(event.delta);
        if (
          this.transcriptBytes > MAX_TRANSCRIPT_BYTES ||
          this.transcript.length >= MAX_TRANSCRIPT_DELTAS
        ) {
          this.fail('GPT-Live transcript exceeded the capture limit.');
          return;
        }
        this.transcript.push({
          role: event.type === 'session.input_transcript.delta' ? 'user' : 'assistant',
          delta: event.delta,
          start_ms: event.start_ms,
          end_ms: event.end_ms,
        });
        break;
      case 'session.output_audio.delta': {
        const bytes = typeof event.delta === 'string' ? decodeBase64(event.delta) : undefined;
        if (!bytes?.length) {
          this.fail('Invalid GPT-Live audio delta.');
          return;
        }
        if (
          this.audioBytes + bytes.length > MAX_AUDIO_BYTES ||
          this.audioChunks.length >= MAX_AUDIO_CHUNKS
        ) {
          this.fail('GPT-Live audio exceeded the capture limit.');
          return;
        }
        this.audioBytes += bytes.length;
        this.audioChunks.push(bytes);
        break;
      }
      case 'session.usage.updated':
        this.readUsage(event);
        break;
      case 'session.delegation.created':
        this.handleDelegation(event);
        break;
      case 'response.event':
        this.handleBackendEvent(event);
        break;
      case 'error':
        this.handleApiError(event);
        break;
      case 'session.closed':
        this.finalized = this.readUsage(event);
        this.reason = safeLabel(event.reason);
        if (this.reason === 'content') {
          this.guardrailReason = 'GPT-Live safety filter ended the session.';
        } else {
          if (this.reason !== 'close_requested' && this.reason !== 'remote_hangup') {
            this.setError(`GPT-Live session ended: ${this.reason ?? 'unknown reason'}.`);
          }
          if (this.inputBytesSent < this.options.audio.length) {
            this.setError('GPT-Live session ended before input audio replay completed.');
          }
        }
        this.finish();
        break;
    }
  }

  /** An acknowledged command is no longer pending, so session.close cannot cancel it. */
  private acknowledgeCommand(clientEventId: unknown): void {
    const command =
      typeof clientEventId === 'string' ? this.commands.get(clientEventId) : undefined;
    if (command) {
      command.pending = false;
    }
  }

  private handleApiError(event: LiveEvent): void {
    const details = event.error && typeof event.error === 'object' ? event.error : {};
    const clientEventId = [details.client_event_id, event.client_event_id].find(
      (id): id is string => typeof id === 'string',
    );
    const apiError: LiveApiError = {
      code: safeLabel(details.code),
      type: safeLabel(details.type),
      message:
        typeof details.message === 'string'
          ? this.redact(details.message).slice(0, MAX_ERROR_MESSAGE_LENGTH)
          : undefined,
      param:
        typeof details.param === 'string' ? this.redact(details.param).slice(0, 200) : undefined,
      clientEventId,
    };
    if (this.apiErrors.length < MAX_API_ERRORS) {
      this.apiErrors.push(apiError);
    }
    const detail = describeApiError(apiError);
    if (!this.started) {
      this.fail(`GPT-Live startup failed${detail}`);
      return;
    }
    const command = clientEventId ? this.commands.get(clientEventId) : undefined;
    const rejected = clientEventId ? `rejected ${command?.name ?? 'a client event'}` : undefined;
    if ([apiError.code, apiError.type].some((label) => label && GUARDRAIL_ERROR_CODES.has(label))) {
      // Safety interventions are refusals, even when they reject one of promptfoo's commands.
      this.guardrailReason ??= `GPT-Live moderation ${rejected ?? 'interrupted the response'}${detail}`;
    } else if (this.closing && command?.pending) {
      // session.close cancels pending appends and queued work; those errors don't change the result.
      return;
    } else {
      this.setError(`GPT-Live ${rejected ?? 'API error'}${detail}`);
    }
    // Without the opening prompt, the model is never asked to speak.
    if (clientEventId === OPENING_INSTRUCTION_ID || clientEventId === OPENING_COMMENTARY_ID) {
      this.closeSession();
    }
  }

  private readUsage(event: LiveEvent): boolean {
    const seconds = event.usage?.seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
      this.voiceSeconds = seconds;
      return true;
    }
    return false;
  }

  private handleDelegation(event: LiveEvent): void {
    const delegation = event.delegation;
    if (!delegation || typeof delegation.id !== 'string') {
      this.fail('Invalid GPT-Live delegation event.');
      return;
    }
    if (this.delegations.some((entry) => entry.id === delegation.id)) {
      return;
    }
    if (delegation.target !== (this.options.config.delegation?.type ?? 'client')) {
      this.fail('Invalid GPT-Live delegation target.');
      return;
    }
    if (
      delegation.target === 'client' &&
      (!Number.isFinite(event.offset_ms) || event.offset_ms < 0)
    ) {
      this.fail('Invalid GPT-Live delegation offset.');
      return;
    }
    const maxToolIterations = resolveMaxToolIterations(this.options.config.maxToolIterations);
    if (this.delegations.length >= maxToolIterations) {
      const target = delegation.target === 'responses' ? 'Responses' : 'client';
      this.setError(
        `GPT-Live ${target} delegations exceeded maxToolIterations=${maxToolIterations}. Increase maxToolIterations if the eval needs more delegations.`,
      );
      this.closeSession();
      return;
    }
    this.delegations.push({
      id: delegation.id,
      target: delegation.target,
      ...(Number.isFinite(event.offset_ms) && { offsetMs: event.offset_ms }),
    });
    if (this.closing) {
      this.setError(LATE_WORK_ERROR);
      return;
    }
    if (delegation.target === 'responses') {
      this.backendTurns.set(delegation.id, {
        id: typeof delegation.response_id === 'string' ? delegation.response_id : '',
        calls: new Map(),
      });
      return;
    }
    this.backendCost = undefined;
    const handler = this.options.delegationHandler;
    if (!handler) {
      this.setError(
        'GPT-Live requested client delegation, but no delegationHandler is configured. Configure a handler or Responses delegation.',
      );
      this.closeSession();
      return;
    }
    const request = {
      id: delegation.id,
      offsetMs: event.offset_ms,
      input: structuredClone(this.options.input),
      transcript: structuredClone(this.transcript),
    };
    this.runHandler(async () => {
      const content = await handler(request, this.handlerController.signal);
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Invalid delegation result');
      }
      if (!this.done && !this.closing) {
        this.send({
          type: 'session.commentary.append',
          event_id: this.registerCommand('session.commentary.append'),
          delegation_id: delegation.id,
          content,
        });
      }
    });
  }

  private handleBackendEvent(envelope: LiveEvent): void {
    const event = envelope.event;
    const delegationId = envelope.delegation_id;
    if (!event || typeof event.type !== 'string' || typeof delegationId !== 'string') {
      this.fail('Invalid GPT-Live Responses envelope.');
      return;
    }
    if (this.options.config.delegation?.type !== 'responses') {
      this.fail('GPT-Live backend event contradicts the configured delegation mode.');
      return;
    }
    const responseLimit = 2 * resolveMaxToolIterations(this.options.config.maxToolIterations);
    if (event.type === 'response.created') {
      if (typeof event.response?.id !== 'string') {
        this.fail('Invalid GPT-Live backend response.');
        return;
      }
      const turn = this.backendTurns.get(delegationId);
      if (turn?.id === event.response.id || this.finishedResponses.has(event.response.id)) {
        return;
      }
      // Each accepted delegation can start one response, plus one continuation per tool call.
      if (this.backendResponseCount >= responseLimit) {
        this.fail('GPT-Live backend response limit exceeded.');
        return;
      }
      this.backendResponseCount++;
      if (this.closing && !this.backendTurns.has(delegationId)) {
        this.setError(LATE_WORK_ERROR);
      }
      this.backendTurns.set(delegationId, { id: event.response.id, calls: new Map() });
    } else if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
      const turn = this.backendTurns.get(delegationId);
      if (!turn) {
        this.fail('GPT-Live function call arrived without a backend response.');
        return;
      }
      if (!turn.calls.has(event.item.call_id)) {
        const maxToolIterations = resolveMaxToolIterations(this.options.config.maxToolIterations);
        if (this.receivedToolCallCount >= maxToolIterations) {
          this.setError(
            `GPT-Live backend function calls exceeded maxToolIterations=${maxToolIterations}. Increase maxToolIterations if the eval needs more calls.`,
          );
          this.closeSession();
          return;
        }
        this.receivedToolCallCount++;
        turn.calls.set(event.item.call_id, event.item);
      }
    } else if (
      ['response.completed', 'response.failed', 'response.incomplete'].includes(event.type)
    ) {
      const response = event.response;
      if (typeof response?.id !== 'string') {
        this.fail('Invalid GPT-Live backend response.');
        return;
      }
      if (this.finishedResponses.has(response.id)) {
        return;
      }
      const turn = this.backendTurns.get(delegationId);
      if (!turn?.id) {
        this.fail('GPT-Live terminal backend event arrived without an active response.');
        return;
      }
      if (turn.id !== response.id) {
        this.fail('GPT-Live backend response ID changed unexpectedly.');
        return;
      }
      if (this.finishedResponses.size >= responseLimit) {
        this.fail('GPT-Live backend response limit exceeded.');
        return;
      }
      this.finishedResponses.add(response.id);
      this.recordBackendUsage(response);
      this.backendTurns.delete(delegationId);
      if (event.type !== 'response.completed') {
        this.setError(`GPT-Live backend ${event.type}.`);
        this.closeSession();
        return;
      }
      if (!turn?.calls.size) {
        return;
      }
      if (this.closing) {
        // After session.close, function results can no longer continue the backend response.
        this.setError(LATE_WORK_ERROR);
        return;
      }
      this.backendTurns.set(delegationId, { id: '', calls: new Map() });
      this.completeTools(turn.calls.values());
    }
  }

  private completeTools(calls: Iterable<ToolCall>): void {
    const handler = this.options.functionCallHandler;
    if (!handler) {
      this.setError(
        'GPT-Live backend requested function calls, but no functionCallHandler is configured.',
      );
      this.closeSession();
      return;
    }
    this.runHandler(async () => {
      const delegation = this.options.config.delegation;
      const tools = delegation?.type === 'responses' ? delegation.responses.tools : [];
      for (const call of calls) {
        if (this.done || this.closing) {
          return;
        }
        if (
          typeof call.call_id !== 'string' ||
          typeof call.arguments !== 'string' ||
          !tools?.some((tool) => tool.type === 'function' && tool.name === call.name)
        ) {
          throw new Error('Unconfigured function call');
        }
        if (this.completedToolCalls.has(call.call_id)) {
          throw new Error('Repeated function call ID');
        }
        this.completedToolCalls.add(call.call_id);
        const output = await handler(call.name, call.arguments, this.handlerController.signal);
        if (typeof output !== 'string') {
          throw new Error('Invalid function result');
        }
        if (this.done || this.closing) {
          return;
        }
        this.send({
          type: 'response.item.create',
          event_id: this.registerCommand('response.item.create'),
          item: { type: 'function_call_output', call_id: call.call_id, output },
        });
      }
      if (!this.done && !this.closing) {
        this.send({ type: 'response.create', event_id: this.registerCommand('response.create') });
      }
    });
  }

  private runHandler(callback: () => Promise<void>): void {
    this.pendingHandlers++;
    void callback()
      .catch(() => {
        if (!this.done && !this.closing) {
          this.setError('GPT-Live backend handler failed.');
          this.closeSession();
        }
      })
      .finally(() => {
        this.pendingHandlers--;
      });
  }

  private recordBackendUsage(response: OpenAI.Responses.Response): void {
    const config = this.options.config.delegation;
    const model = response.model || (config?.type === 'responses' ? config.responses.model : '');
    const usage = response.usage;
    this.backendResponses.push({
      id: response.id,
      model,
      usage: usage && {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        total_tokens: usage.total_tokens,
      },
    });
    accumulateTokenUsage(this.tokenUsage, { numRequests: 1 });
    if (usage) {
      accumulateTokenUsage(this.tokenUsage, {
        total: usage.total_tokens,
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
        cached: usage.input_tokens_details?.cached_tokens,
        completionDetails: getOpenAICompletionTokenDetails(usage),
      });
      const cost = calculateOpenAIUsageCost(model, this.options.config, usage, {
        serviceTier:
          response.service_tier ??
          (config?.type === 'responses' ? config.responses.service_tier : undefined),
      });
      this.backendCost =
        cost !== undefined && this.backendCost !== undefined ? this.backendCost + cost : undefined;
    } else {
      this.backendCost = undefined;
    }
  }

  private closeSession(): void {
    if (this.closing || this.done) {
      return;
    }
    this.closing = true;
    this.clearStartupTimer();
    if (this.pendingHandlers || this.backendTurns.size) {
      this.setError(PENDING_WORK_ERROR);
    }
    this.handlerController.abort();
    this.send({ type: 'session.close' });
    if (this.done) {
      return;
    }
    this.later(
      () => this.fail('GPT-Live timed out waiting for session.closed; final usage is unconfirmed.'),
      this.options.closeTimeoutMs,
    );
  }

  private fail(error: string): void {
    this.setError(error);
    this.finish();
  }

  private finish(): void {
    if (this.done) {
      return;
    }
    this.done = true;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.startupTimer = undefined;
    this.options.signal.removeEventListener('abort', this.onAbort);
    this.handlerController.abort();
    this.ws.terminate();
    this.proxyAgent?.destroy();
    const safetyEnded = this.reason === 'content' && this.finalized;
    if (!safetyEnded && (this.pendingHandlers || this.backendTurns.size)) {
      this.setError('GPT-Live session ended with backend work pending. Increase responseWindowMs.');
    }
    const output = this.transcript
      .filter((part) => part.role === 'assistant')
      .map((part) => part.delta)
      .join('');
    const rawAudio = Buffer.concat(this.audioChunks);
    const pcm = this.options.format.type === 'audio/pcm';
    if (pcm && rawAudio.length % 2) {
      this.setError('GPT-Live returned incomplete PCM16 samples.');
    }
    if (!this.guardrailReason && !this.error && !output && !rawAudio.length) {
      this.setError(
        'GPT-Live returned no transcript or audio. Increase responseWindowMs or check the prompt and input audio.',
      );
    }
    if (!this.finalized) {
      this.setError('GPT-Live final session usage is unconfirmed.');
    }
    // gpt-live-1 and its dated snapshots share the published $0.05/minute rate.
    const rate =
      this.options.config.costPerMinute ??
      (/^gpt-live-1(?:-\d{4}-\d{2}-\d{2})?$/.test(this.options.model) ? 0.05 : undefined);
    const voiceCost =
      this.voiceSeconds !== undefined && rate !== undefined
        ? (this.voiceSeconds * rate) / 60
        : undefined;
    // Client backend costs and hosted tool fees are not reported by the Live session.
    const cost =
      this.finalized &&
      voiceCost !== undefined &&
      this.backendCost !== undefined &&
      !this.delegations.some((delegation) => delegation.target === 'client') &&
      !this.backendTurns.size &&
      !this.pendingHandlers
        ? voiceCost + this.backendCost
        : undefined;
    this.resolve({
      output,
      error: this.error,
      cached: false,
      sessionId: this.sessionId,
      tokenUsage: this.tokenUsage,
      cost,
      // Safety interventions are graded as refusals, not provider errors.
      ...(this.guardrailReason
        ? {
            isRefusal: true,
            guardrails: { flagged: true, flaggedOutput: true, reason: this.guardrailReason },
          }
        : {}),
      ...(this.reason === 'content' && {
        finishReason: 'content_filter',
        conversationEnded: true,
        conversationEndReason: 'content',
      }),
      ...(rawAudio.length && {
        audio: {
          data: convertPcm16ToWav(
            this.options.format.type === 'audio/pcm'
              ? rawAudio
              : convertG711ToPcm16(rawAudio, this.options.format.type),
            this.options.format.rate,
          ).toString('base64'),
          format: 'wav',
          sampleRate: this.options.format.rate,
          channels: 1,
          transcript: output,
        },
      }),
      metadata: {
        transcript: this.transcript,
        inputTranscript: this.transcript
          .filter((part) => part.role === 'user')
          .map((part) => part.delta)
          .join(''),
        voiceSeconds: this.voiceSeconds,
        voiceCost,
        backendCost: this.backendCost,
        finalUsageConfirmed: this.finalized,
        closeReason: this.reason,
        backendResponses: this.backendResponses,
        delegations: this.delegations,
        apiErrors: this.apiErrors,
        responseWindowMs: this.options.responseWindowMs,
      },
    });
  }
}

/** Redact header values, bare tokens, and both parts of decoded Basic credentials. */
function credentialForms(value: string): string[] {
  // HTTP drops surrounding whitespace, so a gateway echoes the trimmed value.
  const trimmed = value.trim();
  const token = trimmed.replace(/^(?:Bearer|Basic)\s+/i, '');
  if (!/^Basic\s/i.test(trimmed)) {
    return [trimmed, token];
  }
  const pair = Buffer.from(token, 'base64').toString('utf8');
  const separator = pair.indexOf(':');
  return [trimmed, token, pair, pair.slice(0, separator), pair.slice(separator + 1)];
}

/** Characters that continue a credential-like token, such as base64 or URL-safe text. */
const TOKEN_CHARACTER = /[A-Za-z0-9._~+/=-]/;

/**
 * Replace a credential in diagnostic text. Values of eight or more characters are replaced
 * anywhere. Shorter values are replaced only as whole tokens, so `api-key abc`,
 * `"api-key":"abc"`, and `user:abc@` lose the secret while longer words containing it stay intact.
 */
function redactCredential(text: string, credential: string): string {
  if (credential.length >= 8) {
    return text.split(credential).join(REDACTED);
  }
  let redacted = '';
  let copied = 0;
  let index = text.indexOf(credential);
  while (index !== -1) {
    const end = index + credential.length;
    const before = text.charAt(index - 1);
    const after = text.charAt(end);
    // A key=value separator can precede a token, and a sentence-ending period can follow it.
    const startsToken = before === '=' || !TOKEN_CHARACTER.test(before);
    const endsToken =
      !TOKEN_CHARACTER.test(after) ||
      (after === '.' && !TOKEN_CHARACTER.test(text.charAt(end + 1)));
    if (startsToken && endsToken) {
      redacted += text.slice(copied, index) + REDACTED;
      copied = end;
      index = text.indexOf(credential, end);
    } else {
      index = text.indexOf(credential, index + 1);
    }
  }
  return redacted + text.slice(copied);
}
