import type { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { SimulatedVoiceUser } from '../../../src/providers/voice/simulatedVoiceUser';
import { mockProcessEnv } from '../../util/utils';

import type { SimulatedVoiceUserConfig } from '../../../src/providers/voice/types';

interface Socket extends EventEmitter {
  readyState: number;
  bufferedAmount: number;
  url: string;
  options: { headers: Record<string, string> };
  sent: Record<string, any>[];
  send(value: string): void;
  terminate: ReturnType<typeof vi.fn>;
}
const { sockets, loadCallback } = vi.hoisted(() => ({
  sockets: [] as Socket[],
  loadCallback: vi.fn(),
}));
vi.mock('../../../src/util/functions/loadFunction', () => ({
  loadCallbackFromFileUrl: loadCallback,
}));
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    default: class extends EventEmitter {
      static OPEN = 1;
      readyState = 0;
      bufferedAmount = 0;
      sent: Record<string, any>[] = [];
      terminate = vi.fn(() => {
        this.readyState = 3;
        this.emit('close');
      });
      constructor(
        public url: string,
        public options: Socket['options'],
      ) {
        super();
        sockets.push(this);
      }
      send(value: string) {
        this.sent.push(JSON.parse(value));
      }
    },
  };
});
const emit = (socket: Socket, event: object) =>
  socket.emit('message', Buffer.from(JSON.stringify(event)));
const participant = (apiKey: string) => ({ apiKey, websocketTimeout: 200, closeTimeoutMs: 100 });
const provider = (config: SimulatedVoiceUserConfig = {}) =>
  new SimulatedVoiceUser({
    config: {
      instructions: 'Ask the cafe when it closes.',
      durationMs: 1000,
      timeoutMs: 3000,
      target: participant('target-key'),
      caller: participant('caller-key'),
      ...config,
    },
  });
async function connect() {
  await vi.advanceTimersByTimeAsync(0);
  expect(sockets).toHaveLength(2);
  for (const [index, socket] of sockets.entries()) {
    socket.readyState = 1;
    socket.emit('open');
    emit(socket, { type: 'session.started', session: { id: `live_${index}` } });
  }
  await vi.advanceTimersByTimeAsync(0);
  return sockets;
}
function transcript(socket: Socket, delta: string, start_ms: number, role = 'output') {
  emit(socket, {
    type: `session.${role}_transcript.delta`,
    delta,
    start_ms,
    end_ms: start_ms + 20,
  });
}
function audio(socket: Socket, value: number, samples = 480) {
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < buffer.length; i += 2) {
    buffer.writeInt16LE(value, i);
  }
  emit(socket, { type: 'session.output_audio.delta', delta: buffer.toString('base64') });
}
function finalize(seconds = 1) {
  for (const socket of sockets) {
    emit(socket, { type: 'session.closed', reason: 'close_requested', usage: { seconds } });
  }
}
function acknowledgeSpeech(socket: Socket, id?: string) {
  const instructionId =
    id ??
    socket.sent
      .slice()
      .reverse()
      .find((event) => event.type === 'session.instructions.append')!.event_id;
  emit(socket, { type: 'session.instructions.appended', client_event_id: instructionId });
  const commentary = socket.sent
    .slice()
    .reverse()
    .find((event) => event.type === 'session.commentary.append');
  if (commentary) {
    emit(socket, { type: 'session.commentary.appended', client_event_id: commentary.event_id });
  }
}
function acknowledgeOpening() {
  const socket = sockets.find((s) => s.sent.some((e) => e.type === 'session.instructions.append'))!;
  acknowledgeSpeech(socket);
}

describe('SimulatedVoiceUser', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({}, { clear: true });
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    sockets.length = 0;
    loadCallback.mockReset();
  });
  afterEach(() => {
    restoreEnv();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps a canonical identity and a separately configurable label', () => {
    const p = new SimulatedVoiceUser({ id: 'custom', label: 'Cafe' });
    expect(p.id()).toBe('promptfoo:simulated-voice-user');
    expect(p.label).toBe('Cafe');
  });

  it('bridges both directions concurrently and records aligned stereo with chronological transcripts', async () => {
    const result = provider().callApi('Saturday closing time is four.');
    const [target, caller] = await connect();
    expect(target.options.headers.Authorization).toBe('Bearer target-key');
    expect(caller.options.headers.Authorization).toBe('Bearer caller-key');
    expect(target.sent[0]).toMatchObject({
      type: 'session.start',
      session: { instructions: 'Saturday closing time is four.', input: [] },
    });
    expect(caller.sent[0].session.instructions).toContain('Ask the cafe');
    expect(caller.sent.some((e) => e.type === 'session.commentary.append')).toBe(false);
    acknowledgeOpening();
    transcript(caller, 'When do you close?', 20);
    transcript(target, 'At four.', 60);
    transcript(caller, 'Thanks.', 100);
    transcript(target, 'When do you close?', 20, 'input');
    transcript(caller, 'At four.', 60, 'input');
    transcript(target, 'Thanks.', 100, 'input');
    // Both output streams are present during the same input clock tick.
    audio(target, 1000);
    audio(caller, -2000);
    await vi.advanceTimersByTimeAsync(20);
    const targetInput = target.sent.filter((e) => e.type === 'session.input_audio.append')[1];
    const callerInput = caller.sent.filter((e) => e.type === 'session.input_audio.append')[1];
    expect(Buffer.from(targetInput.audio, 'base64').readInt16LE()).toBe(-2000);
    expect(Buffer.from(callerInput.audio, 'base64').readInt16LE()).toBe(1000);
    await vi.advanceTimersByTimeAsync(980);
    expect(sockets.every((s) => s.sent.at(-1)?.type === 'session.close')).toBe(true);
    finalize();
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.output).toBe(
      'User: When do you close?\n---\nAssistant: At four.\n---\nUser: Thanks.',
    );
    expect(response.metadata?.messages).toHaveLength(3);
    expect(response.metadata?.voice).toMatchObject({
      stopReason: 'duration_limit',
      durationMs: 1000,
      audioChannels: ['target', 'caller'],
      participants: {
        target: { voiceSeconds: 1, finalUsageConfirmed: true, heard: 'When do you close?Thanks.' },
        caller: { voiceSeconds: 1, heard: 'At four.' },
      },
    });
    expect(response.cost).toBeCloseTo((2 * 0.05) / 60);
    const wav = Buffer.from(response.audio!.data!, 'base64');
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readInt16LE(44 + 1920)).toBe(1000);
    expect(wav.readInt16LE(44 + 1922)).toBe(-2000);
    expect(wav.length).toBe(44 + 24000 * 2 * 2);
    expect(sockets.every((s) => s.terminate.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves silence on both clocks and does not impose alternating turns', async () => {
    const result = provider({ recordConversation: false, targetSpeaksFirst: true }).callApi('Cafe');
    const [target, caller] = await connect();
    expect(target.sent.some((e) => e.type === 'session.instructions.append')).toBe(true);
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    transcript(target, 'Question', 20, 'input');
    transcript(caller, 'Answer', 40, 'input');
    await vi.advanceTimersByTimeAsync(1000);
    finalize();
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.audio).toBeUndefined();
    expect(target.sent.filter((e) => e.type === 'session.input_audio.append')).toHaveLength(50);
    expect(caller.sent.filter((e) => e.type === 'session.input_audio.append')).toHaveLength(50);
    expect(
      target.sent.some((e) => ['response.create', 'input_audio_buffer.commit'].includes(e.type)),
    ).toBe(false);
    expect(
      Buffer.from(
        target.sent.filter((e) => e.type === 'session.input_audio.append')[2].audio,
        'base64',
      ).every((byte) => byte === 0),
    ).toBe(true);
  });

  it('does not substitute generated text for missing listener transcripts', async () => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    transcript(target, 'An unconfirmed answer', 20);
    transcript(caller, 'An unconfirmed question', 0);
    await vi.advanceTimersByTimeAsync(1000);
    finalize();
    const response = await result;
    expect(response.error).toMatch(/listener transcript/);
    expect(response.output).toBe('');
    expect(response.metadata?.voice.participants.target.spoken).toBe('An unconfirmed answer');
  });

  it('sends timed caller interventions while both media streams remain active and matches acknowledgments', async () => {
    const p = provider({
      callerInterventions: [{ atMs: 55, instructions: 'Ask about {{topic}} now.' }],
    });
    const result = p.callApi('Cafe', {
      prompt: { raw: 'Cafe', label: 'Cafe' },
      vars: { topic: 'decaf' },
    });
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100, 4800);
    audio(caller, 200, 4800);
    transcript(target, 'Question', 0, 'input');
    transcript(caller, 'Answer', 20, 'input');
    await vi.advanceTimersByTimeAsync(54);
    expect(
      caller.sent.filter((event) => event.type === 'session.instructions.append'),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const instruction = caller.sent
      .slice()
      .reverse()
      .find((event) => event.type === 'session.instructions.append')!;
    expect(instruction.content).toBe('Ask about decaf now.');
    expect(caller.sent.filter((event) => event.type === 'session.commentary.append')).toHaveLength(
      1,
    );
    emit(caller, { type: 'session.instructions.appended', client_event_id: 'unrelated' });
    expect(caller.sent.filter((event) => event.type === 'session.commentary.append')).toHaveLength(
      1,
    );
    acknowledgeSpeech(caller, instruction.event_id);
    expect(caller.sent.filter((event) => event.type === 'session.commentary.append')).toHaveLength(
      2,
    );
    expect(target.sent.filter((event) => event.type === 'session.input_audio.append')).toHaveLength(
      3,
    );
    expect(caller.sent.filter((event) => event.type === 'session.input_audio.append')).toHaveLength(
      3,
    );
    await vi.advanceTimersByTimeAsync(945);
    finalize();
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.metadata?.voice.interventions).toEqual([
      {
        scheduledAtMs: 55,
        sentAtMs: 55,
        instructions: 'Ask about decaf now.',
        eventId: instruction.event_id,
      },
    ]);
    expect(
      sockets.every(
        (socket) =>
          socket.sent.filter((event) => event.type === 'session.input_audio.append').length === 50,
      ),
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not send scheduled interventions after cancellation', async () => {
    const controller = new AbortController();
    const result = provider({
      callerInterventions: [{ atMs: 500, instructions: 'Interrupt now.' }],
    }).callApi('Cafe', undefined, { abortSignal: controller.signal });
    const rejection = expect(result).rejects.toThrow('cancelled');
    await connect();
    acknowledgeOpening();
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(new Error('cancelled'));
    await rejection;
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      sockets[1].sent.filter((event) => event.type === 'session.instructions.append'),
    ).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a rejected intervention and stops both sessions', async () => {
    const result = provider({
      callerInterventions: [{ atMs: 40, instructions: 'Interrupt now.' }],
    }).callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    await vi.advanceTimersByTimeAsync(40);
    const instruction = caller.sent
      .slice()
      .reverse()
      .find((event) => event.type === 'session.instructions.append')!;
    emit(caller, {
      type: 'error',
      error: {
        code: 'invalid_request_error',
        message: 'Instruction rejected for caller-key',
        client_event_id: instruction.event_id,
      },
    });
    expect(caller.sent.at(-1)?.type).toBe('session.close');
    emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
    await vi.advanceTimersByTimeAsync(0);
    emit(target, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
    const response = await result;
    expect(response.error).toContain('Instruction rejected');
    expect(JSON.stringify(response)).not.toContain('caller-key');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['rejected', 'unacknowledged'])(
    'stops promptly when requested speech commentary is %s',
    async (mode) => {
      const result = provider({
        callerInterventions: [{ atMs: 40, instructions: 'Interrupt now.' }],
      }).callApi('Cafe');
      const [target, caller] = await connect();
      acknowledgeOpening();
      await vi.advanceTimersByTimeAsync(40);
      const instruction = caller.sent
        .slice()
        .reverse()
        .find((event) => event.type === 'session.instructions.append')!;
      emit(caller, {
        type: 'session.instructions.appended',
        client_event_id: instruction.event_id,
      });
      const commentary = caller.sent
        .slice()
        .reverse()
        .find((event) => event.type === 'session.commentary.append')!;
      if (mode === 'rejected') {
        emit(caller, {
          type: 'error',
          error: {
            code: 'invalid_request_error',
            message: 'Commentary rejected',
            client_event_id: commentary.event_id,
          },
        });
        expect(caller.sent.at(-1)?.type).toBe('session.close');
        emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
        await vi.advanceTimersByTimeAsync(0);
      } else {
        await vi.advanceTimersByTimeAsync(200);
      }
      expect(target.sent.at(-1)?.type).toBe('session.close');
      emit(target, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
      const response = await result;
      expect(response.error).toMatch(/commentary/i);
      expect(response.metadata?.voice.durationMs).toBeLessThan(1000);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('excludes speech received after capture ends from grading and recordings', async () => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    transcript(target, 'Before', 0);
    transcript(caller, 'Question', 0);
    audio(target, 100);
    audio(caller, 200);
    transcript(target, 'Question', 20, 'input');
    transcript(caller, 'Answer', 40, 'input');
    await vi.advanceTimersByTimeAsync(1000);
    transcript(target, 'Late undelivered answer', 1001);
    audio(target, 900);
    finalize();
    const response = await result;
    expect(response.output).not.toContain('Late');
    expect(response.metadata?.voice.transcript).toHaveLength(4);
  });

  it('does not grade generated speech that was still queued when capture ended', async () => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    transcript(target, 'Initial question', 20, 'input');
    transcript(caller, 'Please wait.', 40, 'input');
    await vi.advanceTimersByTimeAsync(990);
    // An output transcript can describe the whole answer ahead of media delivery.
    transcript(target, 'The secret success phrase.', 990);
    audio(target, 1000, 2400);
    await vi.advanceTimersByTimeAsync(10);
    finalize();
    const response = await result;
    expect(response.output).not.toContain('secret success phrase');
    expect(response.metadata?.messages).toEqual([
      { role: 'user', content: 'Initial question' },
      { role: 'assistant', content: 'Please wait.' },
    ]);
    expect(response.metadata?.voice.participants.target.spoken).toContain('secret success phrase');
    expect(response.metadata?.voice.participants.target.queuedAudioBytes).toBeGreaterThan(0);
    expect(response.metadata?.voice.gradingTranscriptSource).toBe('listener_input');
  });

  it('preserves partial output and unknown final cost after a disconnect', async () => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    transcript(target, 'Partial answer', 20);
    transcript(caller, 'Partial answer', 20, 'input');
    audio(target, 100);
    audio(caller, 200);
    emit(target, { type: 'session.usage.updated', usage: { seconds: 1 } });
    await vi.advanceTimersByTimeAsync(20);
    target.readyState = 3;
    target.emit('close');
    await vi.advanceTimersByTimeAsync(0);
    expect(caller.sent.at(-1)?.type).toBe('session.close');
    emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
    const response = await result;
    expect(response.error).toMatch(/closed before session.closed/);
    expect(response.output).toContain('Partial answer');
    expect(response.audio).toBeDefined();
    expect(response.cost).toBeUndefined();
    expect(response.metadata?.voice.participants.target).toMatchObject({
      observedVoiceSeconds: 1,
      finalUsageConfirmed: false,
    });
    expect(response.metadata?.voice.participants.target.voiceSeconds).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps caller safety interventions separate from target guardrails', async () => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    transcript(target, 'Answer', 20);
    transcript(caller, 'I cannot continue.', 40);
    await vi.advanceTimersByTimeAsync(20);
    emit(caller, { type: 'session.closed', reason: 'content', usage: { seconds: 1 } });
    await vi.advanceTimersByTimeAsync(0);
    emit(target, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
    const response = await result;
    expect(response.error).toContain('simulated caller');
    expect(response.isRefusal).toBeUndefined();
    expect(response.guardrails).toBeUndefined();
    expect(response.metadata?.voice.participants.caller.isRefusal).toBe(true);
  });

  it('retains a target safety refusal without calling it a caller failure', async () => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(caller, 200);
    transcript(caller, 'Question', 20);
    await vi.advanceTimersByTimeAsync(20);
    emit(target, { type: 'session.closed', reason: 'content', usage: { seconds: 1 } });
    await vi.advanceTimersByTimeAsync(0);
    emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.isRefusal).toBe(true);
    expect(response.guardrails?.flagged).toBe(true);
    expect(response.metadata?.voice.stopReason).toBe('safety');
  });

  it.each([0, 1])('counts only accepted audio when peer %i rejects a frame', async (failedPeer) => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    sockets[failedPeer].bufferedAmount = 144001;
    await vi.advanceTimersByTimeAsync(20);
    emit(sockets[1 - failedPeer], {
      type: 'session.closed',
      reason: 'close_requested',
      usage: { seconds: 1 },
    });
    const response = await result;
    expect(response.error).toContain('backpressure');
    expect(response.metadata?.voice.participants.target.deliveredAudioBytes).toBe(0);
    expect(response.metadata?.voice.participants.caller.deliveredAudioBytes).toBe(
      failedPeer === 0 ? 0 : 960,
    );
    expect(response.metadata?.voice.durationMs).toBe(failedPeer === 0 ? 20 : 40);
    const wav = Buffer.from(response.audio!.data!, 'base64');
    expect(wav.length).toBe(44 + 1920 * (failedPeer === 0 ? 1 : 2));
    if (failedPeer === 1) {
      expect(wav.readInt16LE(44 + 1920)).toBe(0);
      expect(wav.readInt16LE(44 + 1922)).toBe(200);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['content', 'opening_moderation'])(
    'grades a target %s refusal while the caller remains silent',
    async (mode) => {
      const result = provider({ targetSpeaksFirst: true }).callApi('Cafe');
      const [target, caller] = await connect();
      if (mode === 'content') {
        emit(target, { type: 'session.closed', reason: 'content', usage: { seconds: 1 } });
      } else {
        const opening = target.sent.find((event) => event.type === 'session.instructions.append')!;
        emit(target, {
          type: 'error',
          error: {
            code: 'moderation_blocked',
            message: 'Safety intervention',
            client_event_id: opening.event_id,
          },
        });
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(caller.sent.at(-1)?.type).toBe('session.close');
      if (mode === 'opening_moderation') {
        // Leave a gap where the old media pump attempted writes to the closing session.
        await vi.advanceTimersByTimeAsync(40);
        emit(target, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
      }
      emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
      const response = await result;
      expect(response.error).toBeUndefined();
      expect(response.isRefusal).toBe(true);
      expect(response.guardrails?.flagged).toBe(true);
      expect(response.metadata?.voice.stopReason).toBe('safety');
      expect(response.metadata?.voice.participants.caller.error).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['instruction', 'commentary'])(
    'rejects a remote hangup with an unacknowledged speech %s',
    async (phase) => {
      const result = provider({
        callerInterventions: [{ atMs: 40, instructions: 'Ask a follow-up.' }],
      }).callApi('Cafe');
      const [target, caller] = await connect();
      acknowledgeOpening();
      audio(target, 100);
      audio(caller, 200);
      transcript(target, 'Question', 0, 'input');
      transcript(caller, 'Answer', 20, 'input');
      await vi.advanceTimersByTimeAsync(40);
      if (phase === 'commentary') {
        const requests = caller.sent.filter(
          (event) => event.type === 'session.instructions.append',
        );
        emit(caller, {
          type: 'session.instructions.appended',
          client_event_id: requests[requests.length - 1].event_id,
        });
      }
      emit(caller, { type: 'session.closed', reason: 'remote_hangup', usage: { seconds: 1 } });
      await vi.advanceTimersByTimeAsync(0);
      expect(target.sent.at(-1)?.type).toBe('session.close');
      emit(target, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
      const response = await result;
      expect(response.error).toMatch(/speech requests.*acknowledged/);
      expect(response.metadata?.voice.stopReason).toBe('error');
      expect(response.metadata?.voice.participants.caller.finalUsageConfirmed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not count audio as accepted when the socket is closing before its close event', async () => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    target.readyState = 2;
    await vi.advanceTimersByTimeAsync(20);
    target.emit('close');
    emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
    const response = await result;
    expect(response.error).toBeDefined();
    expect(response.metadata?.voice.participants.target.deliveredAudioBytes).toBe(0);
    expect(response.metadata?.voice.participants.caller.deliveredAudioBytes).toBe(0);
    expect(response.metadata?.voice.durationMs).toBe(20);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the peer before final usage arrives and preserves the actionable delegation failure', async () => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    transcript(target, 'Question', 0, 'input');
    transcript(caller, 'Partial answer', 20, 'input');
    await vi.advanceTimersByTimeAsync(20);
    emit(target, {
      type: 'session.delegation.created',
      offset_ms: 20,
      delegation: { id: 'requires_backend', target: 'client' },
    });
    expect(target.sent.at(-1)?.type).toBe('session.close');
    await vi.advanceTimersByTimeAsync(0);
    expect(caller.sent.at(-1)?.type).toBe('session.close');
    const frameCounts = sockets.map(
      (socket) => socket.sent.filter((event) => event.type === 'session.input_audio.append').length,
    );
    await vi.advanceTimersByTimeAsync(40);
    expect(
      sockets.map(
        (socket) =>
          socket.sent.filter((event) => event.type === 'session.input_audio.append').length,
      ),
    ).toEqual(frameCounts);
    finalize();
    const response = await result;
    expect(response.error).toContain('no delegationHandler is configured');
    expect(response.error).not.toContain('not accepting streamed audio');
    expect(response.metadata?.voice.participants.target.finalUsageConfirmed).toBe(true);
    expect(response.metadata?.voice.participants.caller.finalUsageConfirmed).toBe(true);
    expect(response.output).toContain('Partial answer');
    expect(response.audio).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds the queue and stops both sessions on overflow', async () => {
    const result = provider({ maxBufferedAudioMs: 20 }).callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100, 481);
    await vi.advanceTimersByTimeAsync(0);
    emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
    const response = await result;
    expect(response.error).toBeDefined();
    expect(response.metadata?.voice.stopReason).toBe('error');
    expect(target.terminate).toHaveBeenCalled();
    expect(caller.terminate).toHaveBeenCalled();
  });

  it('closes the still-starting peer promptly when an already-ready participant disconnects', async () => {
    const result = provider().callApi('Cafe');
    await vi.advanceTimersByTimeAsync(0);
    const [target, caller] = sockets;
    for (const socket of sockets) {
      socket.readyState = 1;
      socket.emit('open');
    }
    emit(target, { type: 'session.started', session: { id: 'ready_target' } });
    target.readyState = 3;
    target.emit('close');
    await vi.advanceTimersByTimeAsync(0);
    const response = await result;
    expect(response.error).toContain('connection closed before session.closed');
    expect(response.error).not.toContain('timed out');
    expect(caller.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels both connections during startup and propagates the caller reason', async () => {
    const controller = new AbortController();
    const reason = new Error('User cancelled');
    const result = provider().callApi('Cafe', undefined, { abortSignal: controller.signal });
    const rejected = expect(result).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(reason);
    await rejected;
    expect(sockets).toHaveLength(2);
    expect(sockets.every((s) => s.terminate.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('includes slow callback loading in the overall deadline without opening sockets later', async () => {
    let loaded!: (value: () => Promise<string>) => void;
    loadCallback.mockReturnValue(
      new Promise((resolve) => {
        loaded = resolve;
      }),
    );
    const result = provider({
      timeoutMs: 1001,
      target: { ...participant('target-key'), delegationHandler: 'file://slow.js' },
    }).callApi('Cafe');
    await vi.advanceTimersByTimeAsync(1001);
    const response = await result;
    expect(response.error).toMatch(/timeoutMs/);
    expect(sockets).toHaveLength(0);
    loaded(async () => 'later');
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(0);
  });

  it('marks unconfirmed finalization as an error and preserves the recording', async () => {
    const result = provider().callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    await vi.advanceTimersByTimeAsync(1100);
    const response = await result;
    expect(response.error).toMatch(/session.closed/);
    expect(response.audio).toBeDefined();
    expect(response.cost).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases active connections on provider cleanup', async () => {
    const p = provider();
    const result = p.callApi('Cafe');
    await connect();
    p.cleanup();
    const response = await result;
    expect(response.error).toMatch(/stopped/);
    expect(sockets.every((s) => s.terminate.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    providerRegistry.unregister(p);
  });

  it.each([
    {
      callerInterventions: Array.from({ length: 11 }, (_, atMs) => ({ atMs, instructions: 'Hi' })),
    },
    { callerInterventions: [{ atMs: -1, instructions: 'Hi' }] },
    { callerInterventions: [{ atMs: 1000, instructions: 'Hi' }] },
    { callerInterventions: [{ atMs: 1.5, instructions: 'Hi' }] },
    { callerInterventions: [{ atMs: 10, instructions: '' }] },
    { callerInterventions: [{ atMs: 10, instructions: '🙂'.repeat(501) }] },
    { callerInterventions: [{ atMs: 10, instructions: '{{missing}}' }] },
    { durationMs: 999 },
    { durationMs: NaN },
    { durationMs: 300001 },
    { timeoutMs: 1000 },
    { maxBufferedAudioMs: 19 },
    { maxBufferedAudioMs: 10001 },
    { target: { audio: { format: { type: 'audio/pcm', rate: 16000 } } } },
    { instructions: '' },
    { target: { model: 'gpt-realtime-1.5', apiKey: 'fixture' } },
    { maxTurns: 2 },
    { targetSpeaksFirst: 'false' },
  ])('rejects invalid configuration before connecting: %j', async (config) => {
    const response = await provider(config as SimulatedVoiceUserConfig).callApi('Cafe');
    expect(response.error).toBeDefined();
    expect(sockets).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
