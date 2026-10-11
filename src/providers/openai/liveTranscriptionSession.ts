import { ProxyAgent } from 'proxy-agent';
import { getProxyForUrl } from 'proxy-from-env';
import WebSocket from 'ws';
import { detectExplicitStop } from '../voice/explicitStopDetector';

const MODEL = 'gpt-live-transcribe';
const FRAME_BYTES = 960;
const FRAME_MS = 20;
const END_SILENCE_MS = 300;
const MAX_TURNS = 256;
const MAX_EVENTS = 20_000;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_SOCKET_BACKLOG = 128 * 1024;

export interface CallerSpeechTurn {
  turnId: string;
  callerOnsetAtMs: number;
  phase: 'started' | 'ended';
  endedAtMs?: number;
}

export interface ExplicitStopDecision {
  turnId: string;
  callerOnsetAtMs: number;
  decisionAtMs: number;
  recognizedText: string;
  trigger: 'explicit-command' | 'interruption-question';
}

interface TranscriptionOptions {
  url: string;
  headers: Record<string, string>;
  redact: (value: string) => string;
  signal: AbortSignal;
  delay?: 'minimal' | 'low';
  websocketTimeoutMs?: number;
  finalizeTimeoutMs?: number;
  onCallerTurn: (event: CallerSpeechTurn) => void;
  onStopDecision: (event: ExplicitStopDecision) => void;
  onError?: (error: string) => void;
}

interface Turn {
  turnId: string;
  callerOnsetAtMs: number;
  lastActiveAtMs: number;
  endedAtMs?: number;
  itemId?: string;
  committed: boolean;
  committedAudioMs?: number;
  completed: boolean;
  partial: string;
  final?: string;
  decision?: ExplicitStopDecision;
  usageSeconds?: number;
}

interface TranscriptEvent {
  type: 'delta' | 'completed';
  itemId: string;
  text: string;
  receivedAtMs: number;
  usageSeconds?: number;
}

export interface LiveTranscriptionSummary {
  model: string;
  /** Attempted WebSocket connections, not billing receipts or audio/token usage. */
  numRequests: 0 | 1;
  requestedDelay: 'minimal' | 'low';
  /** The API may accept delay without including it in session.updated. */
  delayAcknowledged: boolean;
  echoedDelay?: 'minimal' | 'low';
  status: 'completed' | 'failed';
  error?: string;
  sentAudioBytes: number;
  sentAudioMs: number;
  /** Trailing audio not committed to an ASR item; its final billing is unconfirmed. */
  uncommittedAudioMs: number;
  usageSeconds: number;
  usageConfirmed: boolean;
  /** Published duration pricing; estimated when final API duration usage is missing. */
  estimatedCost: number;
  costEstimated: boolean;
  turns: Turn[];
  transcripts: TranscriptEvent[];
}

function protocolId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 256;
}

/**
 * Independently recognizes only the PCM accepted by the target transport. Local
 * RMS activity establishes causal turn IDs, not interruption intent. The English
 * text policy may stop playback; no evaluator timing/text is accepted here.
 *
 * Early deltas can bind to the sole open turn only after all prior commit ACKs
 * are resolved. Commit FIFO and previous_item_id checks prevent late recognition
 * of an older turn from controlling a newer one. Ambiguous events are buffered.
 */
export class LiveTranscriptionSession {
  private socket?: WebSocket;
  private proxyAgent?: ProxyAgent;
  private phase: 'new' | 'starting' | 'ready' | 'finishing' | 'closed' = 'new';
  private connectionAttempted = false;
  private error?: string;
  private echoedDelay?: 'minimal' | 'low';
  private startupTimer?: ReturnType<typeof setTimeout>;
  private finishTimer?: ReturnType<typeof setTimeout>;
  private startResolve?: () => void;
  private startReject?: (error: Error) => void;
  private finishResolve?: (result: LiveTranscriptionSummary) => void;
  private finishPromise?: Promise<LiveTranscriptionSummary>;
  private readonly turns: Turn[] = [];
  private readonly items = new Map<string, Turn>();
  private readonly pendingCommits: Turn[] = [];
  private readonly unbound = new Map<string, TranscriptEvent[]>();
  private readonly transcripts: TranscriptEvent[] = [];
  private readonly eventIds = new Set<string>();
  private currentTurn?: Turn;
  private lastCommittedItem?: string;
  private audioClockOffset?: number;
  private lastMediaMs = -FRAME_MS;
  private lastObservedMs = -1;
  private sentAudioBytes = 0;
  private uncommittedAudioBytes = 0;
  private eventCount = 0;
  private textBytes = 0;

  constructor(private readonly options: TranscriptionOptions) {}

  start(): Promise<void> {
    if (this.phase !== 'new') {
      return Promise.reject(new Error('Live transcription session can only start once.'));
    }
    this.phase = 'starting';
    return new Promise<void>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;
      if (this.options.signal.aborted) {
        this.fail('Live transcription aborted before startup.');
        return;
      }
      this.options.signal.addEventListener('abort', this.onAbort, { once: true });
      try {
        const proxyUrl = getProxyForUrl(this.options.url.replace(/^ws/, 'http'));
        if (proxyUrl) {
          this.proxyAgent = new ProxyAgent({ getProxyForUrl: () => proxyUrl });
        }
        // Count once at the connection invocation, including startup failures.
        // Pre-aborted or never-started sessions must not add a request.
        this.connectionAttempted = true;
        this.socket = new WebSocket(this.options.url, {
          headers: this.options.headers,
          agent: this.proxyAgent,
          followRedirects: false,
          handshakeTimeout: this.options.websocketTimeoutMs ?? 10_000,
          maxPayload: 1024 * 1024,
        });
        this.startupTimer = setTimeout(
          () => this.fail('Live transcription timed out waiting for session.updated.'),
          this.options.websocketTimeoutMs ?? 10_000,
        );
        this.socket.on('open', () => {
          try {
            this.send({
              type: 'session.update',
              session: {
                type: 'transcription',
                audio: {
                  input: {
                    format: { type: 'audio/pcm', rate: 24000 },
                    transcription: { model: MODEL, delay: this.options.delay ?? 'minimal' },
                    turn_detection: null,
                  },
                },
              },
            });
          } catch (error) {
            this.fail(error instanceof Error ? error.message : 'Transcription startup failed.');
          }
        });
        this.socket.on('message', (raw) => {
          if (this.phase === 'closed') {
            return;
          }
          try {
            let event: unknown;
            try {
              event = JSON.parse(raw.toString());
            } catch {
              throw new Error('Live transcription received invalid JSON.');
            }
            if (!event || typeof event !== 'object' || Array.isArray(event)) {
              throw new Error('Live transcription received an invalid event.');
            }
            this.handleEvent(event as Record<string, unknown>);
          } catch (error) {
            this.fail(error instanceof Error ? error.message : 'Transcription event failed.');
          }
        });
        this.socket.on('error', (error) =>
          this.fail(`Live transcription connection failed: ${error.message}`),
        );
        this.socket.on('unexpected-response', (_request, response) => {
          response.destroy();
          this.fail(`Live transcription handshake failed (HTTP ${response.statusCode}).`);
        });
        this.socket.on('close', () => {
          if (this.phase === 'closed') {
            return;
          }
          if (this.phase === 'finishing' && this.drained()) {
            this.close();
          } else {
            this.fail('Live transcription socket closed before final transcripts were confirmed.');
          }
        });
      } catch (error) {
        this.fail(error instanceof Error ? error.message : 'Live transcription startup failed.');
      }
    });
  }

  /** Called synchronously after the target accepted this exact 20 ms PCM frame. */
  appendAcceptedCaller(frame: Buffer, mediaMs: number, observedAtMs: number): void {
    if (this.phase !== 'ready') {
      throw new Error(this.error ?? 'Live transcription is not ready for caller audio.');
    }
    if (
      frame.length !== FRAME_BYTES ||
      mediaMs !== this.lastMediaMs + FRAME_MS ||
      !Number.isFinite(observedAtMs) ||
      observedAtMs < this.lastObservedMs ||
      this.sentAudioBytes >= 300_000 * 48
    ) {
      this.fail('Live transcription requires ordered 20 ms PCM frames within the 5 minute limit.');
      throw new Error(this.error);
    }
    this.audioClockOffset ??= performance.now() - observedAtMs;
    this.lastMediaMs = mediaMs;
    this.lastObservedMs = observedAtMs;
    let energy = 0;
    for (let offset = 0; offset < frame.length; offset += 2) {
      energy += (frame.readInt16LE(offset) / 32768) ** 2;
    }
    const active = energy / (frame.length / 2) >= 0.0001; // -40 dBFS RMS.
    try {
      this.observeCallerActivity(active, mediaMs);
      this.send({ type: 'input_audio_buffer.append', audio: frame.toString('base64') });
      this.sentAudioBytes += frame.length;
      this.uncommittedAudioBytes += frame.length;
      if (
        this.currentTurn &&
        mediaMs + FRAME_MS - this.currentTurn.lastActiveAtMs >= END_SILENCE_MS
      ) {
        this.commitTurn();
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Live transcription append failed.');
      throw new Error(this.error);
    }
  }

  private observeCallerActivity(active: boolean, mediaMs: number): void {
    if (active && !this.currentTurn) {
      if (this.turns.length >= MAX_TURNS) {
        this.fail('Live transcription exceeded its caller turn limit.');
        throw new Error(this.error);
      }
      this.currentTurn = {
        turnId: `caller-${this.turns.length + 1}`,
        callerOnsetAtMs: mediaMs,
        lastActiveAtMs: mediaMs + FRAME_MS,
        committed: false,
        completed: false,
        partial: '',
      };
      this.turns.push(this.currentTurn);
      this.options.onCallerTurn({
        turnId: this.currentTurn.turnId,
        callerOnsetAtMs: mediaMs,
        phase: 'started',
      });
      this.bindUnambiguous();
    }
    if (active && this.currentTurn) {
      this.currentTurn.lastActiveAtMs = mediaMs + FRAME_MS;
    }
  }

  /** Commit pending speech and wait a bounded interval for its final transcript and socket close. */
  finish(): Promise<LiveTranscriptionSummary> {
    if (this.finishPromise) {
      return this.finishPromise;
    }
    if (this.phase === 'closed') {
      return Promise.resolve(this.summary());
    }
    this.finishPromise = new Promise((resolve) => {
      this.finishResolve = resolve;
    });
    if (this.phase !== 'ready') {
      this.fail('Live transcription finished before it became ready.');
      return this.finishPromise;
    }
    this.phase = 'finishing';
    this.finishTimer = setTimeout(
      () =>
        this.fail('Live transcription timed out draining final transcripts or closing its socket.'),
      this.options.finalizeTimeoutMs ?? 5_000,
    );
    try {
      if (this.currentTurn) {
        this.commitTurn();
      }
      this.maybeFinish();
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Live transcription finish failed.');
    }
    return this.finishPromise;
  }

  abort(): void {
    this.fail('Live transcription aborted.');
  }

  private readonly onAbort = () => this.abort();

  private send(event: Record<string, unknown>): void {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > MAX_SOCKET_BACKLOG
    ) {
      throw new Error(
        'Live transcription socket is unavailable or its audio backlog exceeded the limit.',
      );
    }
    this.socket.send(JSON.stringify(event), (error) => {
      if (error) {
        this.fail(`Live transcription send failed: ${error.message}`);
      }
    });
  }

  private commitTurn(): void {
    if (this.uncommittedAudioBytes < 4_800) {
      throw new Error(
        'Live transcription cannot commit less than 100 ms of accepted caller audio.',
      );
    }
    const turn = this.currentTurn!;
    turn.endedAtMs = turn.lastActiveAtMs;
    turn.committed = true;
    this.pendingCommits.push(turn);
    this.currentTurn = undefined;
    this.options.onCallerTurn({
      turnId: turn.turnId,
      callerOnsetAtMs: turn.callerOnsetAtMs,
      phase: 'ended',
      endedAtMs: turn.endedAtMs,
    });
    this.send({ type: 'input_audio_buffer.commit' });
    turn.committedAudioMs = this.uncommittedAudioBytes / 48;
    this.uncommittedAudioBytes = 0;
  }

  private handleEvent(event: Record<string, unknown>): void {
    if (++this.eventCount > MAX_EVENTS || typeof event.type !== 'string') {
      throw new Error('Live transcription event limit or schema violation.');
    }
    if (event.event_id !== undefined) {
      if (!protocolId(event.event_id)) {
        throw new Error('Live transcription received an invalid event ID.');
      }
      if (this.eventIds.has(event.event_id)) {
        return;
      }
      this.eventIds.add(event.event_id);
    }
    if (
      event.type === 'error' ||
      event.type === 'conversation.item.input_audio_transcription.failed'
    ) {
      const detail =
        event.error && typeof event.error === 'object'
          ? (event.error as Record<string, unknown>).message
          : undefined;
      throw new Error(
        `Live transcription API failed${typeof detail === 'string' ? `: ${detail}` : '.'}`,
      );
    }
    if (event.type === 'session.updated') {
      this.acknowledgeSession(event.session);
      return;
    }
    if (event.type === 'input_audio_buffer.committed') {
      if (
        !protocolId(event.item_id) ||
        !this.pendingCommits.length ||
        (event.previous_item_id ?? null) !== (this.lastCommittedItem ?? null)
      ) {
        throw new Error('Live transcription commit acknowledgment broke the input item chain.');
      }
      const turn = this.pendingCommits.shift()!;
      this.bind(event.item_id, turn);
      this.lastCommittedItem = event.item_id;
      this.bindUnambiguous();
      this.maybeFinish();
      return;
    }
    if (
      event.type === 'conversation.item.input_audio_transcription.delta' ||
      event.type === 'conversation.item.input_audio_transcription.completed'
    ) {
      this.handleTranscript(event, event.type.endsWith('.completed'));
    }
  }

  private acknowledgeSession(value: unknown): void {
    const session = value as
      | {
          type?: string;
          audio?: {
            input?: {
              format?: { type?: string; rate?: number };
              transcription?: { model?: string; delay?: string };
              turn_detection?: unknown;
            };
          };
        }
      | undefined;
    if (
      this.phase !== 'starting' ||
      session?.type !== 'transcription' ||
      session.audio?.input?.transcription?.model !== MODEL ||
      (session.audio.input.transcription.delay !== undefined &&
        session.audio.input.transcription.delay !== (this.options.delay ?? 'minimal')) ||
      session.audio.input.format?.type !== 'audio/pcm' ||
      session.audio.input.format.rate !== 24000 ||
      session.audio.input.turn_detection != null
    ) {
      throw new Error(
        'Live transcription session did not acknowledge the requested configuration.',
      );
    }
    this.echoedDelay = session.audio.input.transcription.delay as 'minimal' | 'low' | undefined;
    clearTimeout(this.startupTimer);
    this.phase = 'ready';
    this.startResolve?.();
    this.startResolve = undefined;
    this.startReject = undefined;
  }

  private handleTranscript(event: Record<string, unknown>, completed: boolean): void {
    const text = completed ? event.transcript : event.delta;
    if (
      !protocolId(event.item_id) ||
      typeof text !== 'string' ||
      (event.content_index !== undefined && event.content_index !== 0)
    ) {
      throw new Error('Live transcription received an invalid transcript event.');
    }
    this.textBytes += Buffer.byteLength(text);
    if (this.textBytes > MAX_TEXT_BYTES) {
      throw new Error('Live transcription exceeded its transcript byte limit.');
    }
    const usage = event.usage as { type?: string; seconds?: unknown } | undefined;
    const transcript: TranscriptEvent = {
      type: completed ? 'completed' : 'delta',
      itemId: event.item_id,
      text,
      receivedAtMs:
        this.audioClockOffset === undefined ? 0 : performance.now() - this.audioClockOffset,
      ...(completed &&
      usage?.type === 'duration' &&
      typeof usage.seconds === 'number' &&
      Number.isFinite(usage.seconds) &&
      usage.seconds >= 0
        ? { usageSeconds: usage.seconds }
        : {}),
    };
    this.transcripts.push(transcript);
    const turn = this.items.get(event.item_id);
    if (turn) {
      this.applyTranscript(turn, transcript);
    } else {
      if (!this.currentTurn && !this.pendingCommits.length) {
        throw new Error('Live transcription received an unknown item without caller speech.');
      }
      const pending = this.unbound.get(event.item_id) ?? [];
      pending.push(transcript);
      this.unbound.set(event.item_id, pending);
      this.bindUnambiguous();
    }
    this.maybeFinish();
  }

  private bind(itemId: string, turn: Turn): void {
    if (
      (turn.itemId && turn.itemId !== itemId) ||
      (this.items.has(itemId) && this.items.get(itemId) !== turn)
    ) {
      throw new Error('Live transcription item was associated with conflicting caller turns.');
    }
    turn.itemId = itemId;
    this.items.set(itemId, turn);
    const pending = this.unbound.get(itemId) ?? [];
    this.unbound.delete(itemId);
    for (const transcript of pending) {
      this.applyTranscript(turn, transcript);
    }
  }

  private bindUnambiguous(): void {
    if (this.pendingCommits.length || !this.currentTurn || this.currentTurn.itemId) {
      return;
    }
    if (this.unbound.size > 1) {
      throw new Error(
        'Live transcription received multiple unknown items for one open caller turn.',
      );
    }
    const itemId = this.unbound.keys().next().value;
    if (itemId) {
      this.bind(itemId, this.currentTurn);
    }
  }

  private applyTranscript(turn: Turn, transcript: TranscriptEvent): void {
    if (turn.completed) {
      throw new Error('Live transcription received text after a final transcript.');
    }
    if (transcript.type === 'completed') {
      if (!turn.committed) {
        throw new Error('Live transcription finalized an uncommitted caller turn.');
      }
      turn.completed = true;
      turn.final = transcript.text;
      turn.usageSeconds = transcript.usageSeconds;
    } else {
      turn.partial += transcript.text;
    }
    const text = transcript.type === 'completed' ? transcript.text : turn.partial;
    const trigger = detectExplicitStop(text, transcript.type === 'completed');
    const decisionAtMs =
      this.audioClockOffset === undefined ? 0 : performance.now() - this.audioClockOffset;
    if (
      trigger &&
      !turn.decision &&
      this.phase === 'ready' &&
      turn === this.turns[this.turns.length - 1] &&
      decisionAtMs - turn.lastActiveAtMs <= 2_000
    ) {
      turn.decision = {
        turnId: turn.turnId,
        callerOnsetAtMs: turn.callerOnsetAtMs,
        decisionAtMs,
        recognizedText: text,
        trigger,
      };
      this.options.onStopDecision(turn.decision);
    }
  }

  private drained(): boolean {
    return (
      this.pendingCommits.length === 0 &&
      this.unbound.size === 0 &&
      this.turns.every((turn) => turn.completed)
    );
  }

  private maybeFinish(): void {
    if (this.phase === 'finishing' && this.drained()) {
      this.socket?.close(1000, 'OK');
    }
  }

  private fail(message: string): void {
    if (this.phase === 'closed') {
      return;
    }
    this.error = this.options.redact(message).slice(0, 1000);
    this.startReject?.(new Error(this.error));
    this.startResolve = undefined;
    this.startReject = undefined;
    this.close();
    this.options.onError?.(this.error);
  }

  private close(): void {
    this.phase = 'closed';
    clearTimeout(this.startupTimer);
    clearTimeout(this.finishTimer);
    this.options.signal.removeEventListener('abort', this.onAbort);
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.terminate();
    }
    this.proxyAgent?.destroy();
    this.finishResolve?.(this.summary());
  }

  private summary(): LiveTranscriptionSummary {
    const usageConfirmed =
      !this.error &&
      this.drained() &&
      this.uncommittedAudioBytes === 0 &&
      this.turns.every((turn) => turn.usageSeconds !== undefined);
    const usageSeconds = this.turns.reduce((sum, turn) => sum + (turn.usageSeconds ?? 0), 0);
    // Duration receipts can round each committed item upward. Preserve that known
    // charge and estimate only audio with no receipt, including trailing silence.
    const unconfirmedSeconds =
      this.uncommittedAudioBytes / 48000 +
      this.turns.reduce(
        (sum, turn) =>
          sum + (turn.usageSeconds === undefined ? (turn.committedAudioMs ?? 0) / 1000 : 0),
        0,
      );
    return {
      model: MODEL,
      numRequests: this.connectionAttempted ? 1 : 0,
      requestedDelay: this.options.delay ?? 'minimal',
      delayAcknowledged: this.echoedDelay !== undefined,
      ...(this.echoedDelay === undefined ? {} : { echoedDelay: this.echoedDelay }),
      status: this.error ? 'failed' : 'completed',
      ...(this.error ? { error: this.error } : {}),
      sentAudioBytes: this.sentAudioBytes,
      sentAudioMs: this.sentAudioBytes / 48,
      uncommittedAudioMs: this.uncommittedAudioBytes / 48,
      usageSeconds,
      usageConfirmed,
      estimatedCost: ((usageSeconds + unconfirmedSeconds) / 60) * 0.017,
      costEstimated: !usageConfirmed,
      turns: this.turns.map((turn) => ({ ...turn })),
      transcripts: this.transcripts.map((event) => ({ ...event })),
    };
  }
}
