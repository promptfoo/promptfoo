import type { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveTranscriptionSession } from '../../../src/providers/openai/liveTranscriptionSession';

interface Socket extends EventEmitter {
  readyState: number;
  bufferedAmount: number;
  url: string;
  options: Record<string, unknown>;
  sent: Record<string, any>[];
  close: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}
const { sockets } = vi.hoisted(() => ({ sockets: [] as Socket[] }));
vi.mock('proxy-from-env', () => ({ getProxyForUrl: () => '' }));
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    default: class extends EventEmitter {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = 0;
      bufferedAmount = 0;
      sent: Record<string, any>[] = [];
      close = vi.fn(() => {
        this.readyState = 3;
        this.emit('close');
      });
      terminate = vi.fn(() => {
        this.readyState = 3;
        this.emit('close');
      });
      constructor(
        public url: string,
        public options: Record<string, unknown>,
      ) {
        super();
        sockets.push(this);
      }
      send(value: string, callback?: (error?: Error) => void) {
        this.sent.push(JSON.parse(value));
        callback?.();
      }
    },
  };
});

const emit = (socket: Socket, event: object) =>
  socket.emit('message', Buffer.from(JSON.stringify(event)));
function pcm(active = true) {
  const buffer = Buffer.alloc(960);
  if (active) {
    for (let index = 0; index < buffer.length; index += 2) {
      buffer.writeInt16LE(2000, index);
    }
  }
  return buffer;
}
function setup() {
  const onCallerTurn = vi.fn();
  const onStopDecision = vi.fn();
  const onError = vi.fn();
  const controller = new AbortController();
  const session = new LiveTranscriptionSession({
    url: 'wss://api.openai.com/v1/realtime?intent=transcription',
    headers: { Authorization: 'Bearer fixture-key' },
    redact: (text) => text.replaceAll('fixture-key', '[REDACTED]'),
    signal: controller.signal,
    websocketTimeoutMs: 100,
    finalizeTimeoutMs: 100,
    onCallerTurn,
    onStopDecision,
    onError,
  });
  let mediaMs = 0;
  return {
    session,
    controller,
    onCallerTurn,
    onStopDecision,
    onError,
    async start() {
      const promise = session.start();
      const socket = sockets.at(-1)!;
      socket.readyState = 1;
      socket.emit('open');
      emit(socket, { type: 'session.updated', session: socket.sent[0].session });
      await promise;
      return socket;
    },
    frames(count: number, active = true) {
      for (let i = 0; i < count; i++) {
        session.appendAcceptedCaller(pcm(active), mediaMs, mediaMs);
        mediaMs += 20;
      }
    },
  };
}
function delta(socket: Socket, itemId: string, text: string, eventId?: string) {
  emit(socket, {
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: itemId,
    delta: text,
    ...(eventId ? { event_id: eventId } : {}),
  });
}
function commit(socket: Socket, itemId: string, previousItemId: string | null = null) {
  emit(socket, {
    type: 'input_audio_buffer.committed',
    item_id: itemId,
    previous_item_id: previousItemId,
  });
}
function complete(socket: Socket, itemId: string, text: string, seconds = 0.4) {
  emit(socket, {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: itemId,
    transcript: text,
    usage: { type: 'duration', seconds },
  });
}

describe('independent Live transcription', () => {
  beforeEach(() => {
    sockets.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('configures independent minimal-delay ASR without hints and waits for acknowledgment', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    expect(socket.url).toContain('intent=transcription');
    expect(socket.options.followRedirects).toBe(false);
    expect(socket.sent[0]).toEqual({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: { model: 'gpt-live-transcribe', delay: 'minimal' },
            turn_detection: null,
          },
        },
      },
    });
    fixture.session.abort();
  });

  it('makes a causal early decision from split deltas and preserves all accepted PCM', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'Please stop ');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
    delta(socket, 'item-1', 'talking.');
    expect(fixture.onStopDecision).toHaveBeenCalledOnce();
    expect(fixture.onStopDecision.mock.calls[0][0]).toMatchObject({
      turnId: 'caller-1',
      callerOnsetAtMs: 0,
      recognizedText: 'Please stop talking.',
      trigger: 'explicit-command',
    });
    expect(fixture.onCallerTurn.mock.calls[0][0]).toEqual({
      turnId: 'caller-1',
      callerOnsetAtMs: 0,
      phase: 'started',
    });
    const sent = socket.sent.filter((event) => event.type === 'input_audio_buffer.append');
    expect(Buffer.concat(sent.map((event) => Buffer.from(event.audio, 'base64')))).toEqual(
      Buffer.concat(Array.from({ length: 5 }, () => pcm())),
    );
    fixture.frames(15, false);
    commit(socket, 'item-1');
    complete(socket, 'item-1', 'Please stop talking.');
    const summary = await fixture.session.finish();
    expect(summary.status).toBe('completed');
    expect(summary.usageConfirmed).toBe(true);
    expect(summary.sentAudioMs).toBe(400);
    expect(summary.usageSeconds).toBe(0.4);
    expect(summary.turns[0].final).toBe('Please stop talking.');
    expect(fixture.onStopDecision).toHaveBeenCalledOnce();
  });

  it('commits after 300ms silence and permits a completed bare stop only for the latest turn', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'Stop');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
    fixture.frames(14, false);
    expect(socket.sent.some((event) => event.type === 'input_audio_buffer.commit')).toBe(false);
    fixture.frames(1, false);
    commit(socket, 'item-1');
    complete(socket, 'item-1', 'Stop!');
    expect(fixture.onCallerTurn.mock.calls[1][0]).toEqual({
      turnId: 'caller-1',
      callerOnsetAtMs: 0,
      phase: 'ended',
      endedAtMs: 100,
    });
    expect(fixture.onStopDecision).toHaveBeenCalledOnce();
    await fixture.session.finish();
  });

  it('does not stop acknowledgments or ordinary unrelated speech', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'Mm hmm, yes, go on.');
    fixture.frames(15, false);
    commit(socket, 'item-1');
    complete(socket, 'item-1', 'Mm hmm, yes, go on.');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
    await fixture.session.finish();
  });

  it('buffers unknown deltas while a prior commit acknowledgment is unresolved', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    fixture.frames(15, false);
    fixture.frames(5);
    delta(socket, 'item-1', 'Stop talking');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
    commit(socket, 'item-1');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
    delta(socket, 'item-2', 'Sorry, when do you close?');
    expect(fixture.onStopDecision.mock.calls[0][0].turnId).toBe('caller-2');
    fixture.frames(15, false);
    commit(socket, 'item-2', 'item-1');
    complete(socket, 'item-2', 'Sorry, when do you close?');
    complete(socket, 'item-1', 'Stop talking');
    expect((await fixture.session.finish()).status).toBe('completed');
    expect(fixture.onStopDecision).toHaveBeenCalledOnce();
  });

  it('retains late final corrections without applying them to a new caller turn', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'Hello');
    fixture.frames(15, false);
    commit(socket, 'item-1');
    fixture.frames(5);
    complete(socket, 'item-1', 'Stop!');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
    fixture.frames(15, false);
    commit(socket, 'item-2', 'item-1');
    complete(socket, 'item-2', 'Okay');
    expect((await fixture.session.finish()).turns[0].final).toBe('Stop!');
  });

  it('fails instead of assigning reordered commit acknowledgments to the current turn', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'Hello');
    fixture.frames(15, false);
    fixture.frames(5);
    fixture.frames(15, false);
    commit(socket, 'item-2', 'item-1');
    expect((await fixture.session.finish()).error).toContain('item chain');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
  });

  it('rejects a commit ID that contradicts a safely bound early delta', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'early', 'Hello');
    fixture.frames(15, false);
    commit(socket, 'different');
    expect((await fixture.session.finish()).error).toContain('conflicting caller turns');
  });

  it('deduplicates event IDs without double-appending transcript fragments', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'stop ', 'same');
    delta(socket, 'item-1', 'stop ', 'same');
    delta(socket, 'item-1', 'talking');
    expect(fixture.onStopDecision.mock.calls[0][0].recognizedText).toBe('stop talking');
    fixture.session.abort();
  });

  it('records disagreement when a final transcript revises an already-used partial', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'Stop talking');
    fixture.frames(15, false);
    commit(socket, 'item-1');
    complete(socket, 'item-1', 'Do not stop talking');
    const summary = await fixture.session.finish();
    expect(summary.turns[0].decision?.recognizedText).toBe('Stop talking');
    expect(summary.turns[0].final).toBe('Do not stop talking');
  });

  it('does not invent duration usage for uncommitted trailing silence', async () => {
    const fixture = setup();
    await fixture.start();
    fixture.frames(10, false);
    const summary = await fixture.session.finish();
    expect(summary.uncommittedAudioMs).toBe(200);
    expect(summary.usageConfirmed).toBe(false);
    expect(summary.estimatedCost).toBeCloseTo((0.2 / 60) * 0.017);
  });

  it('preserves rounded API duration charges when estimating uncommitted trailing silence', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    fixture.frames(15, false);
    commit(socket, 'item-1');
    complete(socket, 'item-1', 'Hello', 1);
    fixture.frames(50, false);
    const summary = await fixture.session.finish();
    expect(summary.sentAudioMs).toBe(1400);
    expect(summary.usageSeconds).toBe(1);
    expect(summary.uncommittedAudioMs).toBe(1000);
    expect(summary.usageConfirmed).toBe(false);
    expect(summary.estimatedCost).toBeCloseTo((2 / 60) * 0.017, 10);
  });

  it('fails final draining on timeout without silently falling back to native mode', async () => {
    const fixture = setup();
    await fixture.start();
    fixture.frames(5);
    const finishing = fixture.session.finish();
    await vi.advanceTimersByTimeAsync(100);
    expect((await finishing).error).toContain('timed out draining');
    expect(fixture.onError).toHaveBeenCalledOnce();
  });

  it('rejects an unconfirmed startup and cleans the socket', async () => {
    const fixture = setup();
    const started = fixture.session.start();
    const rejection = expect(started).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(sockets[0].terminate).toHaveBeenCalledOnce();
  });

  it('redacts API errors and malformed payloads', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    emit(socket, { type: 'error', error: { message: 'Bad fixture-key' } });
    const summary = await fixture.session.finish();
    expect(summary.error).toContain('[REDACTED]');
    expect(JSON.stringify(summary)).not.toContain('fixture-key');
  });

  it('does not echo invalid JSON or close reasons', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    socket.emit('message', Buffer.from('fixture-key invalid JSON'));
    expect((await fixture.session.finish()).error).toBe(
      'Live transcription received invalid JSON.',
    );
  });

  it('aborts startup and active recognition with no later callbacks', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    fixture.controller.abort();
    delta(socket, 'item-1', 'stop talking');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
    expect((await fixture.session.finish()).error).toContain('aborted');
    expect(socket.terminate).toHaveBeenCalledOnce();
  });

  it('fails excessive socket backpressure before retaining more audio', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    socket.bufferedAmount = 131073;
    expect(() => fixture.frames(1)).toThrow('backlog');
    expect((await fixture.session.finish()).sentAudioBytes).toBe(0);
  });

  it('rejects discontinuous or malformed PCM frames', async () => {
    const fixture = setup();
    await fixture.start();
    expect(() => fixture.session.appendAcceptedCaller(Buffer.alloc(959), 0, 0)).toThrow('ordered');
    expect((await fixture.session.finish()).status).toBe('failed');
  });

  it('rejects silent-buffer recognition instead of attributing it to a future turn', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5, false);
    delta(socket, 'unexpected', 'stop talking');
    expect((await fixture.session.finish()).error).toContain('without caller speech');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
  });

  it('expires a final bare stop even when no new caller turn has begun', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'Stop');
    fixture.frames(15, false);
    commit(socket, 'item-1');
    await vi.advanceTimersByTimeAsync(2_101);
    complete(socket, 'item-1', 'Stop!');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
    expect((await fixture.session.finish()).status).toBe('completed');
  });

  it('never makes a playback decision after capture finishes', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    const first = fixture.session.finish();
    expect(fixture.session.finish()).toBe(first);
    commit(socket, 'item-1');
    complete(socket, 'item-1', 'Stop!');
    expect((await first).status).toBe('completed');
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
  });

  it('fails an unsupported resolved session instead of treating it as the requested treatment', async () => {
    const fixture = setup();
    const started = fixture.session.start();
    const rejection = expect(started).rejects.toThrow('requested configuration');
    const socket = sockets.at(-1)!;
    socket.readyState = 1;
    socket.emit('open');
    const session = structuredClone(socket.sent[0].session);
    session.audio.input.transcription.delay = 'high';
    emit(socket, { type: 'session.updated', session });
    await rejection;
    expect((await fixture.session.finish()).status).toBe('failed');
  });

  it('accepts the observed API acknowledgment with omitted delay without claiming it was echoed', async () => {
    const fixture = setup();
    const started = fixture.session.start();
    const socket = sockets.at(-1)!;
    socket.readyState = 1;
    socket.emit('open');
    // Shape retained from the real preflight; identifiers are fixture values.
    emit(socket, {
      type: 'session.updated',
      event_id: 'event_fixture',
      session: {
        type: 'transcription',
        object: 'realtime.transcription_session',
        id: 'sess_fixture',
        expires_at: 1791701865,
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: {
              model: 'gpt-live-transcribe',
              language: null,
              languages: null,
              prompt: null,
            },
            noise_reduction: null,
            turn_detection: null,
          },
        },
        include: null,
      },
    });
    await started;
    const summary = await fixture.session.finish();
    expect(summary.status).toBe('completed');
    expect(summary.requestedDelay).toBe('minimal');
    expect(summary.delayAcknowledged).toBe(false);
    expect(summary.echoedDelay).toBeUndefined();
  });

  it('does not pad a too-short final utterance with invented caller audio', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(1);
    const summary = await fixture.session.finish();
    expect(summary.error).toContain('less than 100 ms');
    expect(summary.sentAudioMs).toBe(20);
    expect(socket.sent.filter((event) => event.type === 'input_audio_buffer.append')).toHaveLength(
      1,
    );
  });

  it('bounds recognized text and terminates on unexpected close', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'x'.repeat(1024 * 1024 + 1));
    expect((await fixture.session.finish()).error).toContain('transcript byte limit');
    const second = setup();
    const secondSocket = await second.start();
    secondSocket.emit('close');
    expect((await second.session.finish()).error).toContain('closed before final');
  });

  it('does not infer receipt duration from missing or invalid usage', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    fixture.frames(15, false);
    commit(socket, 'item-1');
    emit(socket, {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1',
      transcript: 'Hello',
      usage: { type: 'duration', seconds: -1 },
    });
    const summary = await fixture.session.finish();
    expect(summary.usageConfirmed).toBe(false);
    expect(summary.costEstimated).toBe(true);
    expect(summary.usageSeconds).toBe(0);
  });

  it('closes when a caller callback throws rather than leaking recognition resources', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.onCallerTurn.mockImplementation(() => {
      throw new Error('fixture callback failure');
    });
    expect(() => fixture.frames(1)).toThrow('callback failure');
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect((await fixture.session.finish()).status).toBe('failed');
  });
});
