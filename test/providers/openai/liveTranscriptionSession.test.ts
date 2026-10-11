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
function setup(clockOptions: { getElapsedMs?: () => number } = {}) {
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
    ...clockOptions,
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

  it('counts no request when never started or aborted before startup', async () => {
    const unstarted = setup();
    expect((await unstarted.session.finish()).numRequests).toBe(0);
    const aborted = setup();
    aborted.controller.abort();
    await expect(aborted.session.start()).rejects.toThrow('aborted before startup');
    expect((await aborted.session.finish()).numRequests).toBe(0);
    expect(sockets).toHaveLength(0);
  });

  it('counts a ready connection once across repeated finish and rejected restart', async () => {
    const fixture = setup();
    await fixture.start();
    const summary = await fixture.session.finish();
    expect(summary).toMatchObject({ numRequests: 1, sentAudioMs: 0, usageSeconds: 0 });
    await expect(fixture.session.start()).rejects.toThrow('only start once');
    expect((await fixture.session.finish()).numRequests).toBe(1);
    expect(sockets).toHaveLength(1);
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

  it.each([
    { prefix: 'Please pause', continuation: ' playback of the video' },
    { prefix: 'hold on', continuation: 'to it' },
    { prefix: 'Wait a second', continuation: 'ary concern' },
    { prefix: 'Wait, a second', continuation: 'ary concern' },
    { prefix: 'Stop.', continuation: '.. by the office tomorrow.' },
  ])(
    'never dispatches a stop for streamed $prefix + $continuation',
    async ({ prefix, continuation }) => {
      const fixture = setup();
      const socket = await fixture.start();
      fixture.frames(5);
      delta(socket, 'item-1', prefix);
      expect(fixture.onStopDecision).not.toHaveBeenCalled();
      delta(socket, 'item-1', continuation);
      expect(fixture.onStopDecision).not.toHaveBeenCalled();
      fixture.frames(15, false);
      commit(socket, 'item-1');
      complete(socket, 'item-1', prefix + continuation);
      const summary = await fixture.session.finish();
      expect(summary.status).toBe('completed');
      expect(summary.turns[0].decision).toBeUndefined();
      expect(summary.turns[0].final).toBe(prefix + continuation);
      expect(fixture.onStopDecision).not.toHaveBeenCalled();
      expect(fixture.onError).not.toHaveBeenCalled();
    },
  );

  it.each([
    'Pause',
    'Please pause',
    'Stop',
    'Stop.',
    'Hold on',
    'Hold on ',
    'Please hold on ',
    'Hold on please',
    'Wait a second',
    'Wait, a second',
    'Pause for a moment',
  ])('dispatches a genuine completed command exactly once: %s', async (text) => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', text);
    expect(fixture.onStopDecision).not.toHaveBeenCalled();
    fixture.frames(15, false);
    commit(socket, 'item-1');
    complete(socket, 'item-1', text);
    expect(fixture.onStopDecision).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        recognizedText: text,
        trigger: 'explicit-command',
      }),
    );
    expect((await fixture.session.finish()).status).toBe('completed');
    expect(fixture.onStopDecision).toHaveBeenCalledOnce();
  });

  it.each([
    { prefix: 'Please pause', continuation: '. ' },
    { prefix: 'Pause', continuation: '!' },
    { prefix: 'Pause', continuation: ',' },
    { prefix: 'Pause', continuation: '?' },
    { prefix: 'Pause for a moment', continuation: ' ' },
    { prefix: 'Wait a second', continuation: ',' },
    { prefix: 'Hold on', continuation: ', I need to correct that.' },
    { prefix: 'Hold on.', continuation: ' I have a question.' },
    { prefix: 'Hold on ', continuation: 'please, I need to ask something.' },
    { prefix: 'Stop.', continuation: ' I’m changing the booking' },
    { prefix: 'Stop.', continuation: " I'm changing the booking" },
  ])(
    'dispatches after an observed delimiter in $prefix + $continuation',
    async ({ prefix, continuation }) => {
      const fixture = setup();
      const socket = await fixture.start();
      fixture.frames(5);
      delta(socket, 'item-1', prefix);
      expect(fixture.onStopDecision).not.toHaveBeenCalled();
      delta(socket, 'item-1', continuation);
      expect(fixture.onStopDecision).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          recognizedText: prefix + continuation,
          trigger: 'explicit-command',
        }),
      );
      fixture.frames(15, false);
      commit(socket, 'item-1');
      complete(socket, 'item-1', (prefix + continuation).trim());
      expect((await fixture.session.finish()).status).toBe('completed');
      expect(fixture.onStopDecision).toHaveBeenCalledOnce();
    },
  );

  it.each(['hold onto it', 'Hold on to my reservation', 'Please hold on to my reservation'])(
    'does not dispatch at any streamed prefix of a retention request: %s',
    async (text) => {
      const fixture = setup();
      const socket = await fixture.start();
      fixture.frames(5);
      for (const character of text) {
        delta(socket, 'item-1', character);
        expect(fixture.onStopDecision).not.toHaveBeenCalled();
      }
      fixture.frames(15, false);
      commit(socket, 'item-1');
      complete(socket, 'item-1', text);
      const summary = await fixture.session.finish();
      expect(summary.status).toBe('completed');
      expect(summary.turns[0].final).toBe(text);
      expect(summary.turns[0].decision).toBeUndefined();
      expect(fixture.onStopDecision).not.toHaveBeenCalled();
      expect(fixture.onError).not.toHaveBeenCalled();
    },
  );

  it.each([
    { lagMs: 150, ageMs: 1950, expectedDecisions: 1 },
    { lagMs: 240, ageMs: 1950, expectedDecisions: 1 },
    { lagMs: 150, ageMs: 2001, expectedDecisions: 0 },
  ])(
    'uses actual caller acceptance for the freshness fence: $lagMs ms lag, $ageMs ms age',
    async ({ lagMs, ageMs, expectedDecisions }) => {
      const fixture = setup();
      const socket = await fixture.start();
      const clock = vi.spyOn(performance, 'now');
      clock.mockReturnValue(1000 + lagMs);
      fixture.session.appendAcceptedCaller(pcm(), 0, lagMs);
      for (let mediaMs = 20; mediaMs <= 300; mediaMs += 20) {
        clock.mockReturnValue(1000 + lagMs + mediaMs);
        fixture.session.appendAcceptedCaller(pcm(false), mediaMs, lagMs + mediaMs);
      }
      commit(socket, 'item-1');
      clock.mockReturnValue(1000 + lagMs + ageMs);
      complete(socket, 'item-1', 'Stop.');
      expect(fixture.onStopDecision).toHaveBeenCalledTimes(expectedDecisions);
      const summary = await fixture.session.finish();
      expect(summary.status).toBe('completed');
      expect(summary.turns[0]).toMatchObject({
        callerOnsetAtMs: 0,
        lastActiveAtMs: 20,
        endedAtMs: 20,
      });
      expect(summary.sentAudioMs).toBe(320);
      expect(fixture.onError).not.toHaveBeenCalled();
    },
  );

  it('uses the explicit media epoch when first-append processing is delayed', async () => {
    let nowMs = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    const fixture = setup({ getElapsedMs: () => nowMs - 1000 });
    const socket = await fixture.start();
    // Target accepted the frame at150ms; a150ms processing stall follows before ASRappend.
    nowMs = 1300;
    fixture.session.appendAcceptedCaller(pcm(), 0, 150);
    nowMs = 1400;
    delta(socket, 'item-1', 'Stop!');
    expect(fixture.onStopDecision).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ callerOnsetAtMs: 0, decisionAtMs: 400 }),
    );
    for (let mediaMs = 20; mediaMs <= 300; mediaMs += 20) {
      nowMs = 1400 + mediaMs;
      fixture.session.appendAcceptedCaller(pcm(false), mediaMs, nowMs - 1000);
    }
    commit(socket, 'item-1');
    complete(socket, 'item-1', 'Stop!');
    const summary = await fixture.session.finish();
    expect(summary.status).toBe('completed');
    expect(summary.transcripts[0].receivedAtMs).toBe(400);
    expect(summary.turns[0]).toMatchObject({
      callerOnsetAtMs: 0,
      lastActiveAtMs: 20,
      endedAtMs: 20,
    });
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
    delta(socket, 'item-1', 'Stop talking.');
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
    delta(socket, 'item-1', 'talking.');
    expect(fixture.onStopDecision.mock.calls[0][0].recognizedText).toBe('stop talking.');
    fixture.session.abort();
  });

  it('records disagreement when a final transcript revises an already-used partial', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'item-1', 'Stop talking.');
    fixture.frames(15, false);
    commit(socket, 'item-1');
    complete(socket, 'item-1', 'Do not stop talking');
    const summary = await fixture.session.finish();
    expect(summary.turns[0].decision?.recognizedText).toBe('Stop talking.');
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
    expect(await fixture.session.finish()).toMatchObject({
      numRequests: 1,
      sentAudioMs: 0,
      usageSeconds: 0,
      usageConfirmed: false,
    });
  });

  it.each(['completed', 'failed'] as const)(
    'redacts credential-bearing item IDs in %s recognition evidence',
    async (status) => {
      const fixture = setup();
      const socket = await fixture.start();
      fixture.frames(5);
      delta(socket, 'gateway-fixture-key-item', 'Hello.', 'gateway-fixture-key-event');
      if (status === 'completed') {
        fixture.frames(15, false);
        commit(socket, 'gateway-fixture-key-item');
        complete(socket, 'gateway-fixture-key-item', 'Hello.');
      } else {
        emit(socket, { type: 'error', error: { message: 'Gateway failed: fixture-key' } });
      }
      const summary = await fixture.session.finish();
      expect(summary.status).toBe(status);
      expect(summary.turns[0].itemId).toBe('gateway-[REDACTED]-item');
      expect(summary.transcripts.every((event) => event.itemId === 'gateway-[REDACTED]-item')).toBe(
        true,
      );
      expect(JSON.stringify(summary)).not.toContain('fixture-key');
      expect(summary.turns[0].partial).toBe('Hello.');
    },
  );

  it('keeps raw item and event IDs distinct when redaction would make their exported values equal', async () => {
    const fixture = setup();
    const socket = await fixture.start();
    fixture.frames(5);
    delta(socket, 'fixture-key', 'Hello.', 'fixture-key');
    fixture.frames(15, false);
    commit(socket, 'fixture-key');
    fixture.frames(5);
    // These raw IDs deliberately collide only after redaction. Redacting them
    // on receipt would lose the second event or bind its text to the first turn.
    delta(socket, '[REDACTED]', 'Stop talking.', '[REDACTED]');
    complete(socket, 'fixture-key', 'Hello.');
    fixture.frames(15, false);
    commit(socket, '[REDACTED]', 'fixture-key');
    complete(socket, '[REDACTED]', 'Stop talking.');
    const summary = await fixture.session.finish();
    expect(summary.status).toBe('completed');
    expect(summary.usageConfirmed).toBe(true);
    expect(summary.usageSeconds).toBe(0.8);
    expect(
      summary.turns.map((turn) => ({
        turnId: turn.turnId,
        itemId: turn.itemId,
        final: turn.final,
      })),
    ).toEqual([
      { turnId: 'caller-1', itemId: '[REDACTED]', final: 'Hello.' },
      { turnId: 'caller-2', itemId: '[REDACTED]', final: 'Stop talking.' },
    ]);
    expect(summary.transcripts).toHaveLength(4);
    expect(summary.transcripts.every((event) => event.itemId === '[REDACTED]')).toBe(true);
    expect(fixture.onStopDecision).toHaveBeenCalledOnce();
    expect(fixture.onStopDecision.mock.calls[0][0]).toMatchObject({
      turnId: 'caller-2',
      recognizedText: 'Stop talking.',
    });
    expect(JSON.stringify(summary)).not.toContain('fixture-key');
    expect(fixture.onError).not.toHaveBeenCalled();
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
    delta(socket, 'item-1', 'stop talking.');
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
    delta(socket, 'unexpected', 'stop talking.');
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
