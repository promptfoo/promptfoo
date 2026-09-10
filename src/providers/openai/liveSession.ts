import { ProxyAgent } from 'proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import WebSocket from 'ws';
import { accumulateTokenUsage } from '../../util/tokenUsageUtils';
import { convertG711ToPcm16, convertPcm16ToWav } from './audio';
import { calculateOpenAIUsageCost } from './billing';
import { getOpenAICompletionTokenDetails } from './util';
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
  calls: ToolCall[];
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

export class LiveSession {
  private ws!: WebSocket;
  private proxyAgent?: ProxyAgent;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private resolve!: (response: ProviderResponse) => void;
  private done = false;
  private started = false;
  private openingPrompted = false;
  private closing = false;
  private finalized = false;
  private sessionId?: string;
  private error?: string;
  private reason?: string;
  private voiceSeconds?: number;
  private audioChunks: Buffer[] = [];
  private audioBytes = 0;
  private inputBytesSent = 0;
  private transcript: LiveTranscriptDelta[] = [];
  private tokenUsage: TokenUsage = { numRequests: 1 };
  private backendCost: number | undefined = 0;
  private backendResponses: { id: string; model: string; usage: unknown }[] = [];
  private delegations = new Set<string>();
  private clientDelegationOccurred = false;
  private pendingHandlers = 0;
  private backendTurns = new Map<string, BackendTurn>();
  private finishedResponses = new Set<string>();
  private completedToolCalls = new Set<string>();
  private handlerController = new AbortController();

  constructor(private options: SessionOptions) {}

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
      const startupTimer = this.later(
        () => this.fail('GPT-Live timed out waiting for session.started.'),
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
          if (event.type === 'session.started') {
            clearTimeout(startupTimer);
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
        response.resume();
        this.fail(`GPT-Live WebSocket handshake failed (HTTP ${response.statusCode}).`);
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

  private streamAudio(): void {
    const bytesPerSecond =
      this.options.format.rate * (this.options.format.type === 'audio/pcm' ? 2 : 1);
    const frameSize = (bytesPerSecond * LIVE_FRAME_MS) / 1000;
    const totalFrames = Math.ceil(
      ((this.options.audio.length / bytesPerSecond) * 1000 + this.options.responseWindowMs) /
        LIVE_FRAME_MS,
    );
    const silence =
      this.options.format.type === 'audio/pcmu'
        ? 0xff
        : this.options.format.type === 'audio/pcma'
          ? 0xd5
          : 0;
    let frame = 0;
    const startedAt = performance.now();
    const sendFrame = () => {
      if (this.done || this.closing) {
        return;
      }
      if (frame >= totalFrames) {
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
      frame++;
      this.later(sendFrame, Math.max(0, startedAt + frame * LIVE_FRAME_MS - performance.now()));
    };
    sendFrame();
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
        if (!this.options.audio.length) {
          this.send({
            type: 'session.instructions.append',
            event_id: 'promptfoo_start',
            delegation_id: null,
            content:
              "Immediately answer the user's last message out loud, without waiting for the caller to speak, then pause and listen.",
          });
        }
        this.streamAudio();
        break;
      case 'session.instructions.appended':
        if (
          event.client_event_id === 'promptfoo_start' &&
          !this.options.audio.length &&
          !this.closing &&
          !this.openingPrompted
        ) {
          this.openingPrompted = true;
          this.send({
            type: 'session.commentary.append',
            delegation_id: null,
            content: 'Begin now, following the instructions provided.',
          });
        }
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
        this.transcript.push({
          role: event.type === 'session.input_transcript.delta' ? 'user' : 'assistant',
          delta: event.delta,
          start_ms: event.start_ms,
          end_ms: event.end_ms,
        });
        break;
      case 'session.output_audio.delta': {
        if (typeof event.delta !== 'string') {
          this.fail('Invalid GPT-Live audio delta.');
          return;
        }
        const bytes = Buffer.from(event.delta, 'base64');
        this.audioBytes += bytes.length;
        if (this.audioBytes > 32 * 1024 * 1024) {
          this.fail('GPT-Live audio exceeded the capture limit.');
          return;
        }
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
      case 'error': {
        const code =
          typeof event.error?.code === 'string' && /^[\w-]{1,80}$/.test(event.error.code)
            ? ` (${event.error.code})`
            : '';
        this.error = `GPT-Live API error${code}.`;
        if (this.started) {
          this.closeSession();
        } else {
          this.finish();
        }
        break;
      }
      case 'session.closed':
        this.finalized = this.readUsage(event);
        this.reason = event.reason;
        if (event.reason !== 'close_requested' && event.reason !== 'remote_hangup') {
          this.error ??= `GPT-Live session ended: ${event.reason ?? 'unknown reason'}.`;
        }
        if (this.inputBytesSent < this.options.audio.length) {
          this.error ??= 'GPT-Live session ended before input audio replay completed.';
        }
        this.finish();
        break;
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
    if (this.closing || this.delegations.has(delegation.id)) {
      return;
    }
    this.delegations.add(delegation.id);
    if (delegation.target === 'responses') {
      this.backendTurns.set(delegation.id, { id: delegation.response_id ?? '', calls: [] });
      return;
    }
    if (delegation.target !== 'client') {
      this.fail('Invalid GPT-Live delegation target.');
      return;
    }
    this.clientDelegationOccurred = true;
    this.backendCost = undefined;
    const handler = this.options.delegationHandler;
    if (!handler) {
      this.error =
        'GPT-Live requested client delegation, but no delegationHandler is configured. Configure a handler or Responses delegation.';
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
        this.send({ type: 'session.commentary.append', delegation_id: delegation.id, content });
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
    if (event.type === 'response.created') {
      if (typeof event.response?.id !== 'string') {
        this.fail('Invalid GPT-Live backend response.');
        return;
      }
      this.backendTurns.set(delegationId, { id: event.response.id, calls: [] });
    } else if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
      const turn = this.backendTurns.get(delegationId);
      if (!turn) {
        this.fail('GPT-Live function call arrived without a backend response.');
        return;
      }
      if (!turn.calls.some((call) => call.call_id === event.item.call_id)) {
        turn.calls.push(event.item);
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
      this.finishedResponses.add(response.id);
      this.recordBackendUsage(response);
      const turn = this.backendTurns.get(delegationId);
      if (turn?.id && turn.id !== response.id) {
        this.fail('GPT-Live backend response ID changed unexpectedly.');
        return;
      }
      this.backendTurns.delete(delegationId);
      if (event.type !== 'response.completed') {
        this.error ??= `GPT-Live backend ${event.type}.`;
        this.closeSession();
        return;
      }
      if (turn?.calls.length && !this.closing) {
        this.backendTurns.set(delegationId, { id: '', calls: [] });
        this.completeTools(turn.calls);
      }
    }
  }

  private completeTools(calls: ToolCall[]): void {
    const handler = this.options.functionCallHandler;
    if (!handler) {
      this.error =
        'GPT-Live backend requested function calls, but no functionCallHandler is configured.';
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
          item: { type: 'function_call_output', call_id: call.call_id, output },
        });
      }
      if (!this.done && !this.closing) {
        this.send({ type: 'response.create' });
      }
    });
  }

  private runHandler(callback: () => Promise<void>): void {
    this.pendingHandlers++;
    void callback()
      .catch(() => {
        if (!this.done && !this.closing) {
          this.error = 'GPT-Live backend handler failed.';
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
    this.backendResponses.push({ id: response.id, model, usage: response.usage });
    accumulateTokenUsage(this.tokenUsage, { numRequests: 1 });
    if (response.usage) {
      const usage = response.usage;
      accumulateTokenUsage(this.tokenUsage, {
        total: usage.total_tokens,
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
        cached: usage.input_tokens_details?.cached_tokens,
        completionDetails: getOpenAICompletionTokenDetails(usage),
      });
      const cost = calculateOpenAIUsageCost(model, {}, usage, {
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
    if (this.pendingHandlers || this.backendTurns.size) {
      this.error ??=
        'GPT-Live capture window ended with backend work pending. Increase responseWindowMs.';
    }
    this.handlerController.abort();
    this.send({ type: 'session.close' });
    this.later(
      () => this.fail('GPT-Live timed out waiting for session.closed; final usage is unconfirmed.'),
      this.options.closeTimeoutMs,
    );
  }

  private fail(error: string): void {
    this.error ??= error;
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
    this.options.signal.removeEventListener('abort', this.onAbort);
    this.handlerController.abort();
    this.ws.terminate();
    this.proxyAgent?.destroy();
    if (this.pendingHandlers || this.backendTurns.size) {
      this.error ??= 'GPT-Live session ended with backend work pending. Increase responseWindowMs.';
    }
    const output = this.transcript
      .filter((part) => part.role === 'assistant')
      .map((part) => part.delta)
      .join('');
    const rawAudio = Buffer.concat(this.audioChunks);
    const pcm = this.options.format.type === 'audio/pcm';
    if (pcm && rawAudio.length % 2) {
      this.error ??= 'GPT-Live returned incomplete PCM16 samples.';
    }
    if (!this.error && !output && !rawAudio.length) {
      this.error =
        'GPT-Live returned no transcript or audio. Increase responseWindowMs or check the prompt and input audio.';
    }
    if (!this.finalized) {
      this.error ??= 'GPT-Live final session usage is unconfirmed.';
    }
    const rate =
      this.options.config.costPerMinute ?? (this.options.model === 'gpt-live-1' ? 0.05 : undefined);
    const voiceCost =
      this.voiceSeconds !== undefined && rate !== undefined
        ? (this.voiceSeconds * rate) / 60
        : undefined;
    // Client backend costs and hosted tool fees are not reported by the Live session.
    const cost =
      this.finalized &&
      voiceCost !== undefined &&
      this.backendCost !== undefined &&
      !this.clientDelegationOccurred &&
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
      ...(this.reason === 'content' && { isRefusal: true }),
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
        responseWindowMs: this.options.responseWindowMs,
      },
    });
  }
}
