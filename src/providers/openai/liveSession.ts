import type { IncomingMessage } from 'node:http';

import { ProxyAgent } from 'proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import WebSocket from 'ws';
import { accumulateTokenUsage } from '../../util/tokenUsageUtils';
import { convertG711ToPcm16, convertPcm16ToWav } from './audio';
import { calculateOpenAIUsageCost } from './billing';
import { createOpenAiCredentialRedactor } from './credentialRedaction';
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

/** Internal transport hooks for a caller-owned, continuously paced audio connection. */
export interface LiveSessionStream {
  /** Bounded caller-owned output queue, including audio received while peers connect. */
  maxBufferedOutputMs?: number;
  onReady: () => void;
  /** Media has stopped; final usage may still be pending. Errors are already redacted. */
  onClosing?: (event: { error?: string; isRefusal: boolean }) => void;
  onAudio: (audio: Buffer) => void;
  onTranscript: (delta: LiveTranscriptDelta) => void;
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
  captureDurationMs: number;
  maxAudioBytes: number;
  websocketTimeout: number;
  closeTimeoutMs: number;
  requestTimeoutMs: number;
  delegationHandler?: LiveDelegationHandler;
  functionCallHandler?: LiveFunctionCallHandler;
  signal: AbortSignal;
  stream?: LiveSessionStream;
}

export const LIVE_FRAME_MS = 20;

const OPENING_INSTRUCTION_ID = 'promptfoo_start';
const OPENING_COMMENTARY_ID = 'promptfoo_opening';
const MAX_API_ERRORS = 20;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_TRANSCRIPT_BYTES = 1024 * 1024;
const MAX_TRANSCRIPT_DELTAS = 20_000;
const MAX_AUDIO_CHUNKS = 50_000;
const MAX_PROTOCOL_ID_BYTES = 256;
const MAX_FUNCTION_CALL_BYTES = 1024 * 1024;
const MAX_FUNCTION_RESULT_BYTES = 1024 * 1024;
const MAX_COMMENTARY_BYTES = 64 * 1024;
const MAX_STREAM_CONTEXT_BYTES = 2000;
const MAX_PENDING_SNAPSHOT_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_PENDING_SNAPSHOT_ENTRIES = 50_000;
const MAX_HANDSHAKE_BODY_BYTES = 8 * 1024;
const HANDSHAKE_BODY_TIMEOUT_MS = 2_000;
const PENDING_WORK_ERROR =
  'GPT-Live capture window ended with backend work pending. Increase responseWindowMs.';
const LATE_WORK_ERROR =
  'GPT-Live backend requested work after the capture window ended. Increase responseWindowMs.';

function isBoundedProtocolId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Buffer.byteLength(value) <= MAX_PROTOCOL_ID_BYTES
  );
}

const GUARDRAIL_ERROR_CODES = new Set([
  'moderation_blocked',
  'content_policy_violation',
  'content_filter',
]);

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
  const canonical = bytes.toString('base64');
  return value === canonical || value === canonical.replace(/={1,2}$/, '') ? bytes : undefined;
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
  private closingNotified = false;
  private started = false;
  private closing = false;
  private finalized = false;
  private sessionId?: string;
  private error?: string;
  private guardrailReason?: string;
  private reason?: string;
  private voiceSeconds?: number;
  private audioChunks: Buffer[] = [];
  private audioChunkCount = 0;
  private audioBytes = 0;
  private inputBytesSent = 0;
  private streamStartedAt = 0;
  private framesSent = 0;
  /** Undefined until a text prompt's opening instruction is acknowledged. */
  private captureEndFrame?: number;
  private transcript: LiveTranscriptDelta[] = [];
  private transcriptBytes = 0;
  private apiErrors: LiveApiError[] = [];
  private commands = new Map<string, { name: string; pending: boolean; cancelled?: boolean }>();
  private speechRequests = new Map<string, ReturnType<typeof setTimeout>>();
  private contextRequests = new Map<string, ReturnType<typeof setTimeout>>();
  private commandCount = 0;
  private cancelledSpeechRequests = 0;
  private readonly redact: (text: string) => string;
  private readonly inputTextBytes: number;
  private pendingSnapshotTextBytes = 0;
  private pendingSnapshotEntries = 0;
  private tokenUsage: TokenUsage = { numRequests: 1 };
  private backendCost: number | undefined = 0;
  private backendResponses: { id: string; model: string; usage: unknown }[] = [];
  private delegations: LiveDelegation[] = [];
  private pendingHandlers = 0;
  private backendTurns = new Map<string, BackendTurn>();
  private finishedResponses = new Map<string, string>();
  private backendResponseCount = 0;
  private completedToolCalls = new Set<string>();
  private receivedToolCallCount = 0;
  private receivedToolCallBytes = 0;
  private handlerController = new AbortController();

  constructor(private options: SessionOptions) {
    this.redact = createOpenAiCredentialRedactor(options.headers);
    this.inputTextBytes = options.input.reduce(
      (total, message) => total + Buffer.byteLength(message.content[0].text),
      0,
    );
  }

  /** Check coordinated sessions against the slowest peer startup before opening any sockets. */
  static validateSharedStartupBudget(sessions: readonly LiveSession[]): void {
    const startupTimeoutMs = Math.max(
      ...sessions.map((session) => session.options.websocketTimeout),
    );
    for (const session of sessions) {
      const { captureDurationMs, closeTimeoutMs, requestTimeoutMs } = session.options;
      if (startupTimeoutMs + captureDurationMs + closeTimeoutMs >= requestTimeoutMs) {
        throw new Error(
          'GPT-Live shared startup, audio capture, and close timeouts must be less than REQUEST_TIMEOUT_MS. Increase REQUEST_TIMEOUT_MS or shorten the capture window or participant timeouts.',
        );
      }
    }
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

  /** Send one externally paced frame. This does not commit or create a voice turn. */
  appendAudio(audio: Buffer): void {
    if (
      !this.options.stream ||
      !this.started ||
      this.closing ||
      this.done ||
      this.ws.readyState !== WebSocket.OPEN
    ) {
      throw new Error('GPT-Live session is not accepting streamed audio.');
    }
    const frameBytes =
      (this.options.format.rate *
        (this.options.format.type === 'audio/pcm' ? 2 : 1) *
        LIVE_FRAME_MS) /
      1000;
    if (audio.length !== frameBytes) {
      throw new Error('GPT-Live streamed input requires exactly one 20 ms audio frame.');
    }
    if (this.ws.bufferedAmount > frameBytes * 150) {
      this.fail('GPT-Live audio transport exceeded three seconds of backpressure.');
      throw new Error('GPT-Live audio transport exceeded three seconds of backpressure.');
    }
    this.send({ type: 'session.input_audio.append', audio: audio.toString('base64') });
    if (this.done) {
      throw new Error('GPT-Live audio transport stopped.');
    }
  }

  /** Append a speech instruction; commentary follows only its matching acknowledgment. */
  requestSpeech(instructions: string): string {
    if (
      !this.options.stream ||
      !this.started ||
      this.closing ||
      this.done ||
      this.ws.readyState !== WebSocket.OPEN
    ) {
      throw new Error('GPT-Live session is not ready to request speech.');
    }
    if (!instructions.trim() || Buffer.byteLength(instructions) > MAX_COMMENTARY_BYTES) {
      throw new Error('GPT-Live speech instructions must be nonempty and at most 64 KiB.');
    }
    const id = this.registerCommand('session.instructions.append');
    const timer = this.later(
      () => this.fail('GPT-Live timed out waiting for a speech instruction acknowledgment.'),
      this.options.websocketTimeout,
    );
    this.speechRequests.set(id, timer);
    this.send({
      type: 'session.instructions.append',
      event_id: id,
      delegation_id: null,
      content: instructions,
    });
    if (this.done) {
      throw new Error('GPT-Live speech transport stopped.');
    }
    return id;
  }

  /**
   * Add silent context about application-owned playback without requesting speech.
   * Acceptance does not prove that the peer heard the described audio.
   */
  appendContext(content: string): string {
    if (
      !this.options.stream ||
      !this.started ||
      this.closing ||
      this.done ||
      this.ws.readyState !== WebSocket.OPEN
    ) {
      throw new Error('GPT-Live session is not ready to accept context.');
    }
    if (!content.trim() || Buffer.byteLength(content) > MAX_STREAM_CONTEXT_BYTES) {
      throw new Error('GPT-Live streamed context must be nonempty and at most 2000 UTF-8 bytes.');
    }
    const id = this.registerCommand('session.thinking.append');
    this.contextRequests.set(
      id,
      this.later(
        () => this.fail('GPT-Live timed out waiting for a context acknowledgment.'),
        this.options.websocketTimeout,
      ),
    );
    this.send({ type: 'session.thinking.append', event_id: id, delegation_id: null, content });
    if (this.done) {
      throw new Error('GPT-Live context transport stopped.');
    }
    return id;
  }

  /** Stop accepting media and request final billable usage before closing the socket. */
  close({ cancelPendingSpeech = false }: { cancelPendingSpeech?: boolean } = {}): void {
    if (cancelPendingSpeech) {
      this.cancelSpeechRequests();
      this.cancelContextRequests();
    }
    if (this.done) {
      return;
    }
    if (!this.started) {
      this.fail('GPT-Live session stopped before startup completed.');
      return;
    }
    this.closeSession();
  }

  /** Speech requests cancelled by a safety termination are not unfinished backend work. */
  private cancelSpeechRequests(): void {
    for (const [id, timer] of this.speechRequests) {
      clearTimeout(timer);
      this.timers.delete(timer);
      const command = this.commands.get(id);
      if (command) {
        command.cancelled = true;
      }
      this.cancelledSpeechRequests++;
    }
    this.speechRequests.clear();
  }

  private cancelContextRequests(): void {
    for (const [id, timer] of this.contextRequests) {
      clearTimeout(timer);
      this.timers.delete(timer);
      const command = this.commands.get(id);
      if (command) {
        command.cancelled = true;
      }
    }
    this.contextRequests.clear();
  }

  private clearAppendDeadline(
    requests: Map<string, ReturnType<typeof setTimeout>>,
    clientEventId: string | undefined,
  ): boolean {
    const timer = clientEventId ? requests.get(clientEventId) : undefined;
    if (!timer) {
      return false;
    }
    clearTimeout(timer);
    this.timers.delete(timer);
    requests.delete(clientEventId!);
    return true;
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
      if (this.done) {
        return;
      }
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
    if (
      !this.started &&
      [
        'session.input_transcript.delta',
        'session.output_transcript.delta',
        'session.output_audio.delta',
        'session.usage.updated',
        'response.event',
      ].includes(event.type)
    ) {
      this.fail(`GPT-Live received ${event.type} before session.started.`);
      return;
    }
    switch (event.type) {
      case 'session.started':
        if (this.started || !isBoundedProtocolId(event.session?.id)) {
          this.fail('Invalid GPT-Live session startup.');
          return;
        }
        this.started = true;
        this.sessionId = event.session.id;
        if (this.options.stream) {
          this.clearStartupTimer();
          this.options.stream.onReady();
          break;
        }
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
      case 'session.instructions.appended': {
        const acknowledged = this.acknowledgeCommand(
          event.client_event_id,
          'session.instructions.append',
        );
        const speechTimer = this.speechRequests.get(event.client_event_id);
        const opening =
          event.client_event_id === OPENING_INSTRUCTION_ID && this.captureEndFrame === undefined;
        if (acknowledged && this.started && !this.closing && (opening || speechTimer)) {
          if (speechTimer) {
            clearTimeout(speechTimer);
            this.timers.delete(speechTimer);
            this.speechRequests.delete(event.client_event_id);
          } else {
            this.clearStartupTimer();
          }
          const commentaryId = this.registerCommand(
            'session.commentary.append',
            opening ? OPENING_COMMENTARY_ID : undefined,
          );
          if (speechTimer) {
            this.speechRequests.set(
              commentaryId,
              this.later(
                () =>
                  this.fail('GPT-Live timed out waiting for a speech commentary acknowledgment.'),
                this.options.websocketTimeout,
              ),
            );
          }
          this.send({
            type: 'session.commentary.append',
            event_id: commentaryId,
            delegation_id: null,
            content: 'Begin now, following the instructions provided.',
          });
          if (opening && !this.options.stream) {
            this.startResponseWindow();
          }
        }
        break;
      }
      case 'session.commentary.appended': {
        const acknowledged = this.acknowledgeCommand(
          event.client_event_id,
          'session.commentary.append',
        );
        const timer = this.speechRequests.get(event.client_event_id);
        if (acknowledged && timer) {
          clearTimeout(timer);
          this.timers.delete(timer);
          this.speechRequests.delete(event.client_event_id);
        }
        break;
      }
      case 'session.thinking.appended': {
        const acknowledged = this.acknowledgeCommand(
          event.client_event_id,
          'session.thinking.append',
        );
        const timer = this.contextRequests.get(event.client_event_id);
        if (acknowledged && timer) {
          clearTimeout(timer);
          this.timers.delete(timer);
          this.contextRequests.delete(event.client_event_id);
        }
        break;
      }
      case 'session.input_transcript.delta':
      case 'session.output_transcript.delta':
        if (this.closing) {
          return;
        }
        if (
          typeof event.delta !== 'string' ||
          !Number.isFinite(event.start_ms) ||
          !Number.isFinite(event.end_ms) ||
          event.start_ms < 0 ||
          event.end_ms < event.start_ms
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
        const fragment: LiveTranscriptDelta = {
          role: event.type === 'session.input_transcript.delta' ? 'user' : 'assistant',
          delta: event.delta,
          start_ms: event.start_ms,
          end_ms: event.end_ms,
        };
        this.transcript.push(fragment);
        this.options.stream?.onTranscript(fragment);
        break;
      case 'session.output_audio.delta':
        this.handleAudioDelta(event.delta);
        break;
      case 'session.usage.updated':
        this.readUsage(event);
        break;
      case 'session.delegation.created':
        if (!this.started) {
          this.fail('GPT-Live received delegation before session.started.');
          return;
        }
        this.handleDelegation(event);
        break;
      case 'response.event':
        this.handleBackendEvent(event);
        break;
      case 'error':
        this.handleApiError(event);
        break;
      case 'session.closed':
        if (!this.started) {
          this.fail('GPT-Live session closed before session.started.');
          return;
        }
        this.finalized = this.readUsage(event);
        this.reason = safeLabel(event.reason);
        if (this.reason === 'content') {
          this.guardrailReason = 'GPT-Live safety filter ended the session.';
        } else {
          if (this.reason === 'close_requested' && !this.closing) {
            this.setError('GPT-Live session ended without a close request.');
          }
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

  private handleAudioDelta(delta: unknown): void {
    if (this.closing) {
      return;
    }
    // Reject oversized base64 before allocating decoded audio or converting it to WAV.
    if (
      (typeof delta === 'string' &&
        this.audioBytes + Buffer.byteLength(delta, 'base64') > this.options.maxAudioBytes) ||
      this.audioChunkCount >= MAX_AUDIO_CHUNKS
    ) {
      this.fail('GPT-Live audio exceeded the capture limit.');
      return;
    }
    const bytes = typeof delta === 'string' ? decodeBase64(delta) : undefined;
    if (!bytes?.length) {
      this.fail('Invalid GPT-Live audio delta.');
      return;
    }
    this.audioBytes += bytes.length;
    this.audioChunkCount++;
    if (this.options.stream) {
      if (this.options.format.type === 'audio/pcm' && bytes.length % 2 !== 0) {
        this.fail('GPT-Live returned incomplete PCM16 samples.');
        return;
      }
      try {
        this.options.stream.onAudio(bytes);
      } catch (error) {
        this.fail(error instanceof Error ? error.message : 'GPT-Live audio consumer failed.');
      }
    } else {
      this.audioChunks.push(bytes);
    }
  }

  /** An acknowledged command is no longer pending, so session.close cannot cancel it. */
  private acknowledgeCommand(clientEventId: unknown, commandName: string): boolean {
    const command =
      typeof clientEventId === 'string' ? this.commands.get(clientEventId) : undefined;
    if (!command?.pending) {
      return false;
    }
    if (command.name !== commandName) {
      this.fail('GPT-Live acknowledgment does not match the pending command.');
      return false;
    }
    command.pending = false;
    return true;
  }

  private handleApiError(event: LiveEvent): void {
    const details = event.error && typeof event.error === 'object' ? event.error : {};
    const clientEventId = [details.client_event_id, event.client_event_id].find(
      isBoundedProtocolId,
    );
    const redactedClientEventId = clientEventId && this.redact(clientEventId);
    const code = safeLabel(details.code);
    const type = safeLabel(details.type);
    const apiError: LiveApiError = {
      code: code && this.redact(code).slice(0, 80),
      type: type && this.redact(type).slice(0, 80),
      message:
        typeof details.message === 'string'
          ? this.redact(details.message).slice(0, MAX_ERROR_MESSAGE_LENGTH)
          : undefined,
      param:
        typeof details.param === 'string' ? this.redact(details.param).slice(0, 200) : undefined,
      clientEventId: isBoundedProtocolId(redactedClientEventId) ? redactedClientEventId : undefined,
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
    const speechRequest = this.clearAppendDeadline(this.speechRequests, clientEventId);
    const contextRequest = this.clearAppendDeadline(this.contextRequests, clientEventId);
    const rejected = clientEventId ? `rejected ${command?.name ?? 'a client event'}` : undefined;
    if ([code, type].some((label) => label && GUARDRAIL_ERROR_CODES.has(label))) {
      // Safety interventions are refusals, even when they reject one of promptfoo's commands.
      if (command) {
        command.pending = false;
      }
      this.guardrailReason ??= `GPT-Live moderation ${rejected ?? 'interrupted the response'}${detail}`;
    } else if (this.closing && command?.pending) {
      // session.close cancels pending appends and queued work; those errors don't change the result.
      return;
    } else {
      if ((speechRequest || contextRequest) && command) {
        // An explicit rejection finishes this append; it is no longer pending work.
        command.pending = false;
      }
      this.setError(`GPT-Live ${rejected ?? 'API error'}${detail}`);
    }
    // Without the opening prompt, the model is never asked to speak.
    if (
      clientEventId === OPENING_INSTRUCTION_ID ||
      clientEventId === OPENING_COMMENTARY_ID ||
      speechRequest ||
      contextRequest
    ) {
      this.closeSession();
    }
  }

  private readUsage(event: LiveEvent): boolean {
    const seconds = event.usage?.seconds;
    if (
      typeof seconds === 'number' &&
      Number.isFinite(seconds) &&
      seconds >= 0 &&
      // The overall request deadline bounds session time; allow per-second billing granularity.
      seconds <= Math.ceil(this.options.requestTimeoutMs / 1000)
    ) {
      this.voiceSeconds = seconds;
      return true;
    }
    return false;
  }

  private handleDelegation(event: LiveEvent): void {
    // Pending handlers must not retain arbitrary fields from the gateway envelope.
    const delegation = event.delegation && {
      id: event.delegation.id,
      target: event.delegation.target,
      response_id: event.delegation.response_id,
    };
    if (
      !delegation ||
      !isBoundedProtocolId(delegation.id) ||
      (delegation.response_id !== undefined && !isBoundedProtocolId(delegation.response_id))
    ) {
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
    // Responses can finish before their delegation notification is delivered. Keep any active
    // continuation, but do not create pending work for an already completed response.
    if (
      delegation.target === 'responses' &&
      !this.backendTurns.has(delegation.id) &&
      [...this.finishedResponses.values()].includes(delegation.id)
    ) {
      if (
        delegation.response_id !== undefined &&
        this.finishedResponses.get(delegation.response_id) !== delegation.id
      ) {
        this.fail('Invalid GPT-Live delegation response ID.');
      }
      return;
    }
    if (this.closing) {
      this.setError(LATE_WORK_ERROR);
      return;
    }
    if (delegation.target === 'responses') {
      const turn = this.backendTurns.get(delegation.id);
      if (turn?.id && delegation.response_id !== undefined && turn.id !== delegation.response_id) {
        this.fail('Invalid GPT-Live delegation response ID.');
        return;
      }
      if (turn && this.finishedResponses.has(turn.id)) {
        this.backendTurns.delete(delegation.id);
        this.completeTools(delegation.id, turn.calls.values());
        return;
      }
      this.backendTurns.set(
        delegation.id,
        turn ?? {
          id: typeof delegation.response_id === 'string' ? delegation.response_id : '',
          calls: new Map(),
        },
      );
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
    const snapshotTextBytes = this.inputTextBytes + this.transcriptBytes;
    const snapshotEntries = this.options.input.length + this.transcript.length;
    if (
      this.pendingSnapshotTextBytes + snapshotTextBytes > MAX_PENDING_SNAPSHOT_TEXT_BYTES ||
      this.pendingSnapshotEntries + snapshotEntries > MAX_PENDING_SNAPSHOT_ENTRIES
    ) {
      this.fail(
        'GPT-Live client delegation snapshots exceeded the memory limit. Complete handlers promptly or reduce conversation history.',
      );
      return;
    }
    const request = {
      id: delegation.id,
      offsetMs: event.offset_ms,
      input: structuredClone(this.options.input),
      transcript: structuredClone(this.transcript),
    };
    this.pendingSnapshotTextBytes += snapshotTextBytes;
    this.pendingSnapshotEntries += snapshotEntries;
    this.runHandler(async () => {
      try {
        const content = await handler(request, this.handlerController.signal);
        if (typeof content !== 'string' || !content.trim()) {
          throw new Error('Invalid delegation result');
        }
        if (!this.done && !this.closing) {
          // Bound local buffering; the gateway separately enforces its 500-token append limit.
          if (Buffer.byteLength(content) > MAX_COMMENTARY_BYTES) {
            this.setError(
              'GPT-Live client commentary exceeded 64 KiB. Return a shorter delegation result.',
            );
            this.closeSession();
            return;
          }
          this.send({
            type: 'session.commentary.append',
            event_id: this.registerCommand('session.commentary.append'),
            delegation_id: delegation.id,
            content,
          });
        }
      } finally {
        this.pendingSnapshotTextBytes -= snapshotTextBytes;
        this.pendingSnapshotEntries -= snapshotEntries;
      }
    });
  }

  private handleBackendEvent(envelope: LiveEvent): void {
    const event = envelope.event;
    const delegationId = envelope.delegation_id;
    if (!event || typeof event.type !== 'string' || !isBoundedProtocolId(delegationId)) {
      this.fail('Invalid GPT-Live Responses envelope.');
      return;
    }
    if (this.options.config.delegation?.type !== 'responses') {
      this.fail('GPT-Live backend event contradicts the configured delegation mode.');
      return;
    }
    const owner = this.finishedResponses.get(event.response?.id);
    if (owner !== undefined) {
      if (owner !== delegationId) {
        this.fail('GPT-Live backend response changed delegation.');
      }
      return;
    }
    const responseLimit = 2 * resolveMaxToolIterations(this.options.config.maxToolIterations);
    if (event.type === 'response.created') {
      if (!isBoundedProtocolId(event.response?.id)) {
        this.fail('Invalid GPT-Live backend response.');
        return;
      }
      const turn = this.backendTurns.get(delegationId);
      if (turn?.id === event.response.id) {
        return;
      }
      if (turn?.id) {
        this.fail('GPT-Live backend response started before the active response completed.');
        return;
      }
      if (!turn && [...this.finishedResponses.values()].includes(delegationId)) {
        this.fail('GPT-Live backend delegation already completed; no continuation was requested.');
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
      this.backendTurns.set(delegationId, {
        id: event.response.id,
        calls: turn?.calls ?? new Map(),
      });
    } else if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
      const turn = this.backendTurns.get(delegationId);
      if (!turn || this.finishedResponses.has(turn.id)) {
        this.fail('GPT-Live function call arrived without a backend response.');
        return;
      }
      // Standard Responses item events omit this ID; check it when a gateway supplies it.
      if (event.response_id !== undefined && event.response_id !== turn.id) {
        this.fail('Invalid GPT-Live function-call response ID.');
        return;
      }
      if (!turn.calls.has(event.item.call_id)) {
        const { call_id, name, arguments: args } = event.item;
        if (
          !isBoundedProtocolId(call_id) ||
          !isBoundedProtocolId(name) ||
          typeof args !== 'string'
        ) {
          this.fail('Invalid GPT-Live backend function call.');
          return;
        }
        const bytes =
          Buffer.byteLength(call_id) + Buffer.byteLength(name) + Buffer.byteLength(args);
        if (this.receivedToolCallBytes + bytes > MAX_FUNCTION_CALL_BYTES) {
          this.fail('GPT-Live backend function-call payload limit exceeded.');
          return;
        }
        const maxToolIterations = resolveMaxToolIterations(this.options.config.maxToolIterations);
        if (this.receivedToolCallCount >= maxToolIterations) {
          this.setError(
            `GPT-Live backend function calls exceeded maxToolIterations=${maxToolIterations}. Increase maxToolIterations if the eval needs more calls.`,
          );
          this.closeSession();
          return;
        }
        this.receivedToolCallCount++;
        this.receivedToolCallBytes += bytes;
        turn.calls.set(call_id, { call_id, name, arguments: args });
      }
    } else if (
      ['response.completed', 'response.failed', 'response.incomplete'].includes(event.type)
    ) {
      const response = event.response;
      if (typeof response?.id !== 'string') {
        this.fail('Invalid GPT-Live backend response.');
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
      if (
        response.model !== undefined &&
        (!isBoundedProtocolId(response.model) || !response.model.trim())
      ) {
        this.fail('Invalid GPT-Live backend model.');
        return;
      }
      if (this.finishedResponses.size >= responseLimit) {
        this.fail('GPT-Live backend response limit exceeded.');
        return;
      }
      this.finishedResponses.set(response.id, delegationId);
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
      if (!this.delegations.some((delegation) => delegation.id === delegationId)) {
        // Keep early completed calls pending until their delegation is validated.
        this.backendTurns.set(delegationId, turn);
        return;
      }
      this.completeTools(delegationId, turn.calls.values());
    }
  }

  private completeTools(delegationId: string, calls: Iterable<ToolCall>): void {
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
        if (Buffer.byteLength(output) > MAX_FUNCTION_RESULT_BYTES) {
          this.setError('GPT-Live function result exceeded 1 MiB. Return a shorter result.');
          this.closeSession();
          return;
        }
        this.send({
          type: 'response.item.create',
          event_id: this.registerCommand('response.item.create'),
          item: { type: 'function_call_output', call_id: call.call_id, output },
        });
      }
      if (!this.done && !this.closing) {
        this.backendTurns.set(delegationId, { id: '', calls: new Map() });
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
    const rawUsage = response.usage;
    const details = rawUsage && getOpenAICompletionTokenDetails(rawUsage);
    const valid = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const usage =
      rawUsage &&
      [rawUsage.input_tokens, rawUsage.output_tokens, rawUsage.total_tokens].every(valid) &&
      (rawUsage.input_tokens_details?.cached_tokens === undefined ||
        valid(rawUsage.input_tokens_details.cached_tokens)) &&
      (!details || Object.values(details).every((value) => value === undefined || valid(value)))
        ? rawUsage
        : undefined;
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
        completionDetails: details,
      });
      const cost = calculateOpenAIUsageCost(model, this.options.config, usage, {
        serviceTier:
          response.service_tier ??
          (config?.type === 'responses' ? config.responses.service_tier : undefined),
      });
      this.backendCost =
        cost !== undefined && this.backendCost !== undefined ? this.backendCost + cost : undefined;
      if (this.backendCost !== undefined && !Number.isFinite(this.backendCost)) {
        this.setError('GPT-Live backend cost exceeded the supported numeric range.');
        this.backendCost = undefined;
      }
    } else {
      this.backendCost = undefined;
    }
  }

  private hasPendingWork(): boolean {
    return (
      Boolean(this.pendingHandlers || this.backendTurns.size) ||
      [...this.commands].some(
        ([id, command]) =>
          id !== OPENING_COMMENTARY_ID &&
          command.pending &&
          !command.cancelled &&
          command.name === 'session.commentary.append',
      )
    );
  }

  /** Stop the owner's media clock before waiting for final session usage. */
  private notifyClosing(): void {
    if (this.closingNotified) {
      return;
    }
    this.closingNotified = true;
    try {
      this.options.stream?.onClosing?.({
        error: this.error === undefined ? undefined : this.redact(this.error),
        isRefusal: Boolean(this.guardrailReason),
      });
    } catch {
      this.setError('GPT-Live media lifecycle callback failed.');
    }
  }

  private closeSession(): void {
    if (this.closing || this.done) {
      return;
    }
    this.closing = true;
    this.clearStartupTimer();
    if (this.speechRequests.size > 0) {
      this.setError('GPT-Live capture ended before speech requests were acknowledged.');
      // The close deadline now owns finalization. Preserve pending commands, but do not
      // let their earlier ACK deadlines terminate the socket before final usage arrives.
      for (const timer of this.speechRequests.values()) {
        clearTimeout(timer);
        this.timers.delete(timer);
      }
    }
    if (this.contextRequests.size > 0) {
      this.setError('GPT-Live capture ended before context requests were acknowledged.');
      for (const timer of this.contextRequests.values()) {
        clearTimeout(timer);
        this.timers.delete(timer);
      }
    }
    if (this.hasPendingWork()) {
      this.setError(PENDING_WORK_ERROR);
    }
    this.handlerController.abort();
    this.notifyClosing();
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
    const safetyEnded = this.reason === 'content' && this.finalized;
    if (safetyEnded) {
      this.cancelSpeechRequests();
      this.cancelContextRequests();
    } else if (this.speechRequests.size > 0) {
      this.setError('GPT-Live session ended before speech requests were acknowledged.');
    }
    if (this.contextRequests.size > 0) {
      this.setError('GPT-Live session ended before context requests were acknowledged.');
    }
    this.done = true;
    this.notifyClosing();
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.speechRequests.clear();
    this.contextRequests.clear();
    this.startupTimer = undefined;
    this.options.signal.removeEventListener('abort', this.onAbort);
    this.handlerController.abort();
    this.ws?.terminate();
    this.proxyAgent?.destroy();
    if (!safetyEnded && this.hasPendingWork()) {
      this.setError('GPT-Live session ended with backend work pending. Increase responseWindowMs.');
    }
    if (
      [...this.finishedResponses.values()].some(
        (id) => !this.delegations.some((delegation) => delegation.id === id),
      )
    ) {
      this.setError('GPT-Live backend response completed without a matching delegation.');
      this.backendCost = undefined;
    }
    // Transcripts are grading evidence and must preserve the model's output verbatim.
    const output = this.transcript
      .filter((part) => part.role === 'assistant')
      .map((part) => part.delta)
      .join('');
    const rawAudio = Buffer.concat(this.audioChunks);
    const pcm = this.options.format.type === 'audio/pcm';
    if (pcm && rawAudio.length % 2) {
      this.setError('GPT-Live returned incomplete PCM16 samples.');
    }
    if (
      !this.options.stream &&
      !this.guardrailReason &&
      !this.error &&
      !output &&
      !this.audioBytes
    ) {
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
    let voiceCost =
      this.voiceSeconds !== undefined && rate !== undefined
        ? (this.voiceSeconds / 60) * rate
        : undefined;
    if (voiceCost !== undefined && !Number.isFinite(voiceCost)) {
      this.setError('GPT-Live voice cost exceeded the supported numeric range.');
      voiceCost = undefined;
    }
    // Client backend costs and hosted tool fees are not reported by the Live session.
    let cost =
      this.finalized &&
      voiceCost !== undefined &&
      this.backendCost !== undefined &&
      !this.delegations.some((delegation) => delegation.target === 'client') &&
      !this.hasPendingWork()
        ? voiceCost + this.backendCost
        : undefined;
    if (cost !== undefined && !Number.isFinite(cost)) {
      this.setError('GPT-Live total cost exceeded the supported numeric range.');
      cost = undefined;
    }
    this.resolve({
      output,
      error: this.error === undefined ? undefined : this.redact(this.error),
      cached: false,
      sessionId: this.sessionId === undefined ? undefined : this.redact(this.sessionId),
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
      ...(rawAudio.length &&
        (!pcm || rawAudio.length % 2 === 0) && {
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
        ...(this.cancelledSpeechRequests > 0 && {
          cancelledSpeechRequests: this.cancelledSpeechRequests,
        }),
        closeReason: this.reason === undefined ? undefined : this.redact(this.reason),
        backendResponses: this.backendResponses.map((response) => ({
          ...response,
          id: this.redact(response.id),
          model: this.redact(response.model),
        })),
        delegations: this.delegations.map((delegation) => ({
          ...delegation,
          id: this.redact(delegation.id),
        })),
        apiErrors: this.apiErrors,
        responseWindowMs: this.options.responseWindowMs,
      },
    });
  }
}
