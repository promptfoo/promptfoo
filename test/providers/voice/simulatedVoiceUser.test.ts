import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertPcm16ToWav } from '../../../src/providers/openai/audio';
import { OpenAiTtsProvider } from '../../../src/providers/openai/tts';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { SimulatedVoiceUser } from '../../../src/providers/voice/simulatedVoiceUser';
import { createProviderRateLimitOptions } from '../../../src/scheduler/providerWrapper';
import { loadYaml } from '../../../src/util/yamlLoad';
import { mockProcessEnv } from '../../util/utils';

import type { SimulatedVoiceUserConfig } from '../../../src/providers/voice/types';
import type { ProviderResponse } from '../../../src/types/providers';

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
      static CLOSED = 3;
      readyState = 0;
      bufferedAmount = 0;
      sent: Record<string, any>[] = [];
      terminate = vi.fn(() => {
        this.readyState = 3;
        this.emit('close');
      });
      close = vi.fn(() => {
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

async function connectApplication(readyParticipants: number[] = [0, 1]) {
  await vi.advanceTimersByTimeAsync(0);
  expect(sockets).toHaveLength(1);
  const recognizer = sockets[0];
  expect(recognizer.url).toBe('wss://api.openai.com/v1/realtime?intent=transcription');
  expect(recognizer.options.headers.Authorization).toBe('Bearer target-key');
  recognizer.readyState = 1;
  recognizer.emit('open');
  emit(recognizer, {
    type: 'session.updated',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          transcription: { model: 'gpt-live-transcribe' },
          turn_detection: null,
        },
      },
    },
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(sockets).toHaveLength(3);
  const [target, caller] = sockets.slice(1);
  for (const [index, socket] of [target, caller].entries()) {
    socket.readyState = 1;
    socket.emit('open');
    if (readyParticipants.includes(index)) {
      emit(socket, { type: 'session.started', session: { id: `live_${index}` } });
    }
  }
  await vi.advanceTimersByTimeAsync(0);
  if (readyParticipants.length === 2) {
    acknowledgeOpening();
  }
  return { recognizer, target, caller };
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

/** Run the shipped offline exporter against a portable copy of an actual provider response. */
function exportVoiceEvidence(response: ProviderResponse) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'voice-refusal-evidence-'));
  try {
    const inputPath = path.join(directory, 'result.json');
    const outputPath = path.join(directory, 'evidence');
    const exportResponse = structuredClone(response);
    const blobAssets = [];
    for (const recording of [exportResponse.audio, exportResponse.metadata?.audio]) {
      if (!recording?.data) {
        continue;
      }
      const bytes = Buffer.from(recording.data, 'base64');
      const hash = createHash('sha256').update(bytes).digest('hex');
      blobAssets.push({
        hash,
        sizeBytes: bytes.length,
        mimeType: 'audio/wav',
        data: recording.data,
      });
      recording.blobRef = {
        hash,
        sizeBytes: bytes.length,
        mimeType: 'audio/wav',
        provider: 'filesystem',
      };
      delete recording.data;
    }
    const portable = { results: { results: [{ response: exportResponse }] }, blobAssets };
    writeFileSync(inputPath, JSON.stringify(portable));
    const command = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../../../examples/simulated-voice-user/export-evidence.js'),
        inputPath,
        '--out',
        outputPath,
      ],
      { encoding: 'utf8', timeout: 10000 },
    );
    const manifest = JSON.parse(readFileSync(path.join(outputPath, 'manifest.json'), 'utf8'));
    const sourcePath = path.join(outputPath, 'case-001-target-source.wav');
    return {
      command,
      manifest,
      source: existsSync(sourcePath) ? readFileSync(sourcePath) : undefined,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('SimulatedVoiceUser', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({}, { clear: true });
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    sockets.length = 0;
    loadCallback.mockReset();
    vi.spyOn(OpenAiTtsProvider.prototype, 'callApi').mockRejectedValue(
      new Error('Unexpected speech synthesis in unit test'),
    );
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

  it.each([
    null,
    [],
    { mode: 'automatic' },
    { mode: 'native', sourceQuietMs: 200 },
    { mode: 'app-barge-in', transcriptionDelay: 'high' },
    { mode: 'app-barge-in', sourceQuietMs: 0 },
    { mode: 'app-barge-in', recoveryTimeoutMs: 10001 },
    { mode: 'app-barge-in', cueAtMs: 20 },
  ])('rejects invalid application settings before opening sockets: %j', async (targetPlayback) => {
    const response = await provider({
      targetPlayback,
    } as unknown as SimulatedVoiceUserConfig).callApi('Cafe');
    expect(response.error).toBeTruthy();
    expect(sockets).toHaveLength(0);
  });

  it('keeps explicitly native playback on the original two-session path', async () => {
    const result = provider({ targetPlayback: { mode: 'native' } }).callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 1000);
    audio(caller, 1000);
    transcript(target, 'Question', 0, 'input');
    transcript(caller, 'Answer', 20, 'input');
    await vi.advanceTimersByTimeAsync(1000);
    finalize();
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.metadata?.voice.targetPlayback).toBeUndefined();
    expect(response.metadata?.audio).toBeUndefined();
    expect(sockets).toHaveLength(2);
    expect(response.tokenUsage?.numRequests).toBe(2);
  });

  it('stops application playback from recognized accepted PCM and retains separate source evidence', async () => {
    const result = provider({
      targetPlayback: { mode: 'app-barge-in', sourceQuietMs: 40, callerQuietMs: 40 },
    }).callApi('Cafe');
    const { recognizer, target, caller } = await connectApplication();
    audio(target, 1200, 24000);
    audio(caller, 3000, 4800);
    transcript(target, 'Stop talking', 200, 'input');
    transcript(caller, 'Okay', 820, 'input');
    await vi.advanceTimersByTimeAsync(280);
    emit(recognizer, {
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      content_index: 0,
      delta: 'Stop talking.',
    });
    const redirect = target.sent.find((event) => event.type === 'session.thinking.append');
    expect(redirect?.content).toContain('was not heard');
    expect(redirect?.content).not.toContain('Stop talking');
    emit(target, { type: 'session.thinking.appended', client_event_id: redirect!.event_id });
    await vi.advanceTimersByTimeAsync(320);
    audio(target, 0, 960);
    audio(target, 4000, 9600);
    await vi.advanceTimersByTimeAsync(160);
    emit(recognizer, {
      type: 'input_audio_buffer.committed',
      item_id: 'item-1',
      previous_item_id: null,
    });
    emit(recognizer, {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1',
      content_index: 0,
      transcript: 'Stop talking',
      usage: { type: 'duration', seconds: 0.7 },
    });
    await vi.advanceTimersByTimeAsync(240);
    finalize();
    const response = await result;
    expect(response.error).toBeUndefined();
    const app = response.metadata!.voice.targetPlayback;
    expect(app).toMatchObject({
      mode: 'app-barge-in',
      clock: 'media',
      metrics: { stops: 1, suppressed: false, transportRejectedSourceBytes: 0 },
      recognition: {
        status: 'completed',
        numRequests: 1,
        requestedDelay: 'minimal',
        delayAcknowledged: false,
        usageConfirmed: false,
      },
    });
    expect(app.events.find((event: any) => event.type === 'suppressed')).toMatchObject({
      atMs: 280,
      callerOnsetAtMs: 220,
    });
    expect(app.events.some((event: any) => event.type === 'resumed')).toBe(true);
    expect(app.metrics.discardedQueuedBytes).toBeGreaterThan(0);
    const m = app.metrics;
    expect(m.sourceBytes).toBe(
      m.deliveredSourceBytes +
        m.discardedQueuedBytes +
        m.discardedSelectedBytes +
        m.discardedIncomingBytes +
        m.pendingQueuedBytes +
        m.pendingSelectedBytes +
        m.transportRejectedSourceBytes +
        m.bufferingRejectedSourceBytes,
    );
    const inputFrames = target.sent
      .filter((event) => event.type === 'session.input_audio.append')
      .map((event) => event.audio);
    const recognitionFrames = recognizer.sent
      .filter((event) => event.type === 'input_audio_buffer.append')
      .map((event) => event.audio);
    expect(recognitionFrames).toEqual(inputFrames);
    expect(response.metadata?.audio).toMatchObject({
      role: 'target_source',
      clock: 'source_sample_order',
      channels: 1,
    });
    expect(Buffer.from(response.metadata!.audio.data, 'base64').length - 44).toBe(m.sourceBytes);
    expect(response.cost).toBeUndefined();
    expect(response.tokenUsage?.numRequests).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps delivered audio intact when a partial pause becomes an unrelated playback request', async () => {
    const result = provider({ targetPlayback: { mode: 'app-barge-in' } }).callApi('Cafe');
    const { recognizer, target, caller } = await connectApplication();
    audio(target, 1200, 24000);
    audio(caller, 3000, 4800);
    transcript(target, 'Please pause playback of the video', 220, 'input');
    transcript(caller, 'The announcement continues.', 820, 'input');
    await vi.advanceTimersByTimeAsync(280);
    emit(recognizer, {
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      delta: 'Please pause',
    });
    expect(target.sent.some((event) => event.type === 'session.thinking.append')).toBe(false);
    emit(recognizer, {
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'item-1',
      delta: ' playback of the video',
    });
    await vi.advanceTimersByTimeAsync(520);
    emit(recognizer, {
      type: 'input_audio_buffer.committed',
      item_id: 'item-1',
      previous_item_id: null,
    });
    emit(recognizer, {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'item-1',
      transcript: 'Please pause playback of the video',
      usage: { type: 'duration', seconds: 0.8 },
    });
    await vi.advanceTimersByTimeAsync(200);
    finalize();
    const response = await result;
    expect(response.error).toBeUndefined();
    const app = response.metadata!.voice.targetPlayback;
    expect(app.metrics).toMatchObject({
      stops: 0,
      discardedQueuedBytes: 0,
      discardedSelectedBytes: 0,
      discardedIncomingBytes: 0,
      suppressedPlaybackMs: 0,
    });
    expect(app.metrics.deliveredSourceBytes).toBeGreaterThan(0);
    expect(app.metrics.sourceBytes).toBe(
      app.metrics.deliveredSourceBytes + app.metrics.pendingQueuedBytes,
    );
    expect(app.redirects).toEqual([]);
    expect(app.recognition.turns[0].decision).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['before media', 'during media'] as const)(
    'exports retained application source after target refusal %s on the correct clock',
    async (phase) => {
      const result = provider({ targetPlayback: { mode: 'app-barge-in' } }).callApi('Cafe');
      const beforeMedia = phase === 'before media';
      const { target, caller } = await connectApplication(beforeMedia ? [0] : [0, 1]);
      audio(target, 1000, 24000);
      transcript(target, 'I cannot help with that.', 0);
      await vi.advanceTimersByTimeAsync(beforeMedia ? 20 : 100);
      emit(target, { type: 'session.closed', reason: 'content', usage: { seconds: 0.1 } });
      await vi.advanceTimersByTimeAsync(0);
      if (beforeMedia) {
        // A valid target refusal lets the caller finish startup and report final usage.
        await vi.advanceTimersByTimeAsync(20);
        emit(caller, { type: 'session.started', session: { id: 'late-caller' } });
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(caller.sent).toContainEqual({ type: 'session.close' });
      emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 0 } });
      const response = await result;

      expect(response.error).toBeUndefined();
      expect(response.isRefusal).toBe(true);
      expect(response.metadata?.voice.stopReason).toBe('safety');
      expect(response.metadata?.voice.participants.caller.finalUsageConfirmed).toBe(true);
      const playback = response.metadata!.voice.targetPlayback;
      expect(playback.metrics.sourceBytes).toBe(48000);
      expect(playback.metrics.stops).toBe(0);
      if (beforeMedia) {
        expect(response.audio).toBeUndefined();
        expect(response.metadata?.voice.durationMs).toBe(0);
        expect(playback.metrics.deliveredSourceBytes).toBe(0);
        expect(playback.metrics.pendingQueuedBytes).toBe(48000);
        for (const socket of [target, caller]) {
          expect(socket.sent.some((event) => event.type === 'session.input_audio.append')).toBe(
            false,
          );
          expect(socket.sent.some((event) => event.type === 'session.instructions.append')).toBe(
            false,
          );
        }
      } else {
        expect(response.audio?.data).toBeTruthy();
        expect(playback.metrics.deliveredSourceBytes).toBeGreaterThan(0);
      }
      expect(vi.getTimerCount()).toBe(0);

      const { command, manifest, source } = exportVoiceEvidence(response);
      // No heard recording is an explicit partial-evidence error, not a fabricated success.
      expect(command.status, command.stderr).toBe(beforeMedia ? 1 : 0);
      expect(manifest.errors).toBe(beforeMedia ? 1 : 0);
      expect(manifest.rows[0].recordings).toHaveLength(beforeMedia ? 0 : 3);
      expect(manifest.rows[0].sourceRecordings).toHaveLength(1);
      expect(source).toEqual(Buffer.from(response.metadata!.audio.data, 'base64'));
      expect(playback.clock).toBe(beforeMedia ? 'provider' : 'media');
      expect(manifest.rows[0].metrics.targetPlayback.clock).toBe(playback.clock);
      if (beforeMedia) {
        expect(playback.events).toContainEqual(
          expect.objectContaining({ type: 'closed', atMs: 40 }),
        );
        expect(manifest.rows[0].metrics.targetPlayback.stops).toBeNull();
      }
    },
  );

  it.each(['opening speech send', 'first audio append'] as const)(
    'keeps source evidence on the provider clock when %s fails before capture',
    async (failure) => {
      const result = provider({ targetPlayback: { mode: 'app-barge-in' } }).callApi('Cafe');
      const { target, caller } = await connectApplication([0]);
      audio(target, 1000, 24000);
      await vi.advanceTimersByTimeAsync(40);
      if (failure === 'opening speech send') {
        const send = caller.send.bind(caller);
        vi.spyOn(caller, 'send').mockImplementation((value) => {
          if (JSON.parse(value).type === 'session.instructions.append') {
            throw new Error('Opening speech transport failed');
          }
          send(value);
        });
      } else {
        target.bufferedAmount = 144001;
      }
      emit(caller, { type: 'session.started', session: { id: 'late-caller' } });
      await vi.advanceTimersByTimeAsync(0);
      finalize();
      const response = await result;
      expect(response.error).toBeTruthy();
      expect(response.audio).toBeUndefined();
      expect(response.metadata?.voice.durationMs).toBe(0);
      expect(response.metadata?.voice.targetPlayback.clock).toBe('provider');
      expect(response.metadata?.voice.targetPlayback.events).toContainEqual(
        expect.objectContaining({ type: 'closed', atMs: 40 }),
      );
      const { command, manifest, source } = exportVoiceEvidence(response);
      expect(command.status, command.stderr).toBe(1);
      expect(manifest.rows[0].recordings).toHaveLength(0);
      expect(manifest.rows[0].sourceRecordings).toHaveLength(1);
      expect(manifest.rows[0].metrics.targetPlayback.stops).toBeNull();
      expect(source).toEqual(Buffer.from(response.metadata!.audio.data, 'base64'));
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('fails explicit application mode before starting participants if recognition setup fails', async () => {
    const result = provider({ targetPlayback: { mode: 'app-barge-in' } }).callApi('Cafe');
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(1);
    sockets[0].readyState = 1;
    sockets[0].emit('open');
    emit(sockets[0], { type: 'error', error: { message: 'invalid target-key' } });
    const response = await result;
    expect(response.error).toContain('[REDACTED]');
    expect(response.error).not.toContain('target-key');
    expect(response.metadata?.voice.targetPlayback.recognition).toMatchObject({
      status: 'failed',
      numRequests: 1,
    });
    expect(response.tokenUsage).toMatchObject({ numRequests: 1, total: 0 });
    expect(response.metadata?.voice.targetPlayback.clock).toBe('provider');
    expect(sockets).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['native', 'app-barge-in'] as const)(
    'normalizes a numeric YAML target API key before %s transport error redaction',
    async (mode) => {
      const yamlConfig = loadYaml('target:\n  apiKey: 12345678') as SimulatedVoiceUserConfig;
      expect(typeof yamlConfig.target?.apiKey).toBe('number');
      const result = provider({
        target: { ...participant('target-key'), ...yamlConfig.target },
        targetPlayback: { mode },
      }).callApi('Cafe');
      let earlyError: string | undefined;
      void result.then((response) => {
        earlyError = response.error;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(sockets, earlyError).toHaveLength(mode === 'native' ? 2 : 1);
      const socket = sockets[0];
      expect(socket.options.headers.Authorization).toBe('Bearer 12345678');
      socket.readyState = 1;
      socket.emit('open');
      emit(socket, {
        type: 'error',
        error: { message: 'Rejected 12345678. Keep diagnostic marker.' },
      });
      await vi.advanceTimersByTimeAsync(0);
      const response = await result;
      expect(response.error).toContain('Rejected [REDACTED]. Keep diagnostic marker.');
      expect(JSON.stringify(response)).not.toContain('12345678');
      expect(response.metadata?.voice.stopReason).toBe('error');
      expect(response.tokenUsage?.numRequests).toBe(mode === 'native' ? 2 : 1);
      expect(sockets.every((entry) => entry.terminate.mock.calls.length === 1)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('redacts both a numeric YAML target key and an overriding app Authorization credential', async () => {
    const yamlConfig = loadYaml(
      'target:\n  apiKey: 12345678\n  headers:\n    Authorization: Bearer gateway-private-key',
    ) as SimulatedVoiceUserConfig;
    const result = provider({
      target: { ...participant('target-key'), ...yamlConfig.target },
      targetPlayback: { mode: 'app-barge-in' },
    }).callApi('Cafe');
    let earlyError: string | undefined;
    void result.then((response) => {
      earlyError = response.error;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets, earlyError).toHaveLength(1);
    const recognizer = sockets[0];
    expect(recognizer.options.headers.Authorization).toBe('Bearer gateway-private-key');
    recognizer.readyState = 1;
    recognizer.emit('open');
    emit(recognizer, {
      type: 'error',
      error: { message: 'Rejected 12345678 and gateway-private-key. Keep diagnostic marker.' },
    });
    const response = await result;
    expect(response.error).toBe(
      'Live transcription API failed: Rejected [REDACTED] and [REDACTED]. Keep diagnostic marker.',
    );
    expect(JSON.stringify(response)).not.toContain('12345678');
    expect(JSON.stringify(response)).not.toContain('gateway-private-key');
    expect(recognizer.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { pending: 'both participants', ready: [] },
    { pending: 'the caller', ready: [0] },
    { pending: 'the target', ready: [1] },
  ])(
    'closes $pending promptly if recognition fails after its startup acknowledgment',
    async ({ ready }) => {
      const result = provider({ targetPlayback: { mode: 'app-barge-in' } }).callApi('Cafe');
      const settled = vi.fn();
      void result.then(settled);
      const { recognizer, target, caller } = await connectApplication(ready);
      emit(recognizer, {
        type: 'error',
        error: { message: 'Recognition failed after startup acknowledgment' },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(recognizer.terminate).toHaveBeenCalledOnce();
      for (const [index, socket] of [target, caller].entries()) {
        if (ready.includes(index)) {
          expect(socket.sent).toContainEqual({ type: 'session.close' });
          emit(socket, {
            type: 'session.closed',
            reason: 'close_requested',
            usage: { seconds: 0 },
          });
        } else {
          expect(socket.terminate).toHaveBeenCalledOnce();
        }
        expect(socket.sent.some((event) => event.type === 'session.instructions.append')).toBe(
          false,
        );
        expect(socket.sent.some((event) => event.type === 'session.input_audio.append')).toBe(
          false,
        );
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toHaveBeenCalledOnce();
      const response = await result;
      expect(response.error).toBe(
        'Live transcription API failed: Recognition failed after startup acknowledgment',
      );
      expect(response.metadata?.voice.stopReason).toBe('error');
      expect(response.metadata?.voice.targetPlayback).toMatchObject({
        clock: 'provider',
        recognition: { status: 'failed', numRequests: 1, sentAudioBytes: 0 },
      });
      expect(response.tokenUsage).toMatchObject({
        numRequests: 3,
      });
      expect(sockets.every((socket) => socket.terminate.mock.calls.length === 1)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('preserves an active-media recognition error while closing both live participants', async () => {
    const result = provider({ targetPlayback: { mode: 'app-barge-in' } }).callApi('Cafe');
    const { recognizer, target, caller } = await connectApplication();
    await vi.advanceTimersByTimeAsync(40);
    emit(recognizer, { type: 'error', error: { message: 'Recognition failed during media' } });
    await vi.advanceTimersByTimeAsync(0);
    for (const socket of [target, caller]) {
      expect(socket.sent).toContainEqual({ type: 'session.close' });
    }
    finalize();
    const response = await result;
    expect(response.error).toBe('Live transcription API failed: Recognition failed during media');
    expect(response.metadata?.voice.stopReason).toBe('error');
    expect(response.metadata?.voice.targetPlayback).toMatchObject({
      clock: 'media',
      recognition: { status: 'failed' },
    });
    expect(sockets.every((socket) => socket.terminate.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the caller abort reason after recognition is ready while a live peer starts', async () => {
    const abort = new AbortController();
    const reason = new Error('Caller cancelled while peer was starting');
    const result = provider({ targetPlayback: { mode: 'app-barge-in' } }).callApi(
      'Cafe',
      undefined,
      { abortSignal: abort.signal },
    );
    const rejected = expect(result).rejects.toBe(reason);
    await connectApplication([0]);
    abort.abort(reason);
    await rejected;
    expect(sockets.every((socket) => socket.terminate.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors disabled recording for both heard and application source audio', async () => {
    const result = provider({
      recordConversation: false,
      targetPlayback: { mode: 'app-barge-in' },
    }).callApi('Cafe');
    const { recognizer, target, caller } = await connectApplication();
    audio(target, 1200);
    audio(caller, 3000);
    transcript(target, 'Hello', 220, 'input');
    transcript(caller, 'Hi', 220, 'input');
    await vi.advanceTimersByTimeAsync(1000);
    emit(recognizer, {
      type: 'input_audio_buffer.committed',
      item_id: 'greeting',
      previous_item_id: null,
    });
    emit(recognizer, {
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'greeting',
      transcript: 'Hello',
      usage: { type: 'duration', seconds: 1 },
    });
    finalize();
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.audio).toBeUndefined();
    expect(response.metadata?.audio).toBeUndefined();
    expect(response.metadata?.voice.targetPlayback.metrics.sourceBytes).toBe(960);
    expect(response.metadata?.voice.targetPlayback.metrics.stops).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels recognizer setup without starting either participant and preserves the abort reason', async () => {
    const abort = new AbortController();
    const reason = new Error('Caller cancelled application test');
    const result = provider({ targetPlayback: { mode: 'app-barge-in' } }).callApi(
      'Cafe',
      undefined,
      { abortSignal: abort.signal },
    );
    const rejection = expect(result).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(1);
    abort.abort(reason);
    await rejection;
    expect(sockets[0].terminate).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bridges both directions concurrently and records aligned stereo with listener event order', async () => {
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
    await vi.advanceTimersByTimeAsync(220);
    const targetInput = target.sent.filter((e) => e.type === 'session.input_audio.append')[11];
    const callerInput = caller.sent.filter((e) => e.type === 'session.input_audio.append')[11];
    expect(Buffer.from(targetInput.audio, 'base64').readInt16LE()).toBe(-2000);
    expect(Buffer.from(callerInput.audio, 'base64').readInt16LE()).toBe(1000);
    await vi.advanceTimersByTimeAsync(780);
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
      gradingTranscriptOrder: 'listener_event_arrival',
      participants: {
        target: { voiceSeconds: 1, finalUsageConfirmed: true, heard: 'When do you close?Thanks.' },
        caller: { voiceSeconds: 1, heard: 'At four.' },
      },
    });
    expect(response.cost).toBeCloseTo((2 * 0.05) / 60);
    const wav = Buffer.from(response.audio!.data!, 'base64');
    expect(wav.readUInt16LE(22)).toBe(2);
    expect(wav.readInt16LE(44 + 11 * 1920)).toBe(1000);
    expect(wav.readInt16LE(44 + 11 * 1920 + 2)).toBe(-2000);
    expect(response.metadata?.voice.participants.caller.playout.startupBufferingMs).toBe(200);
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

  it.each([false, true])(
    'preserves listener text with non-monotonic timestamps (caller arrives first: %s)',
    async (callerFirst) => {
      const result = provider().callApi('Cafe');
      const [target, caller] = await connect();
      acknowledgeOpening();
      const hearQuestion = () => {
        transcript(target, 'Are you ', 100, 'input');
        transcript(target, 'open?', 90, 'input');
      };
      const hearAnswer = () => {
        transcript(caller, 'We are ', 200, 'input');
        transcript(caller, 'closed.', 180, 'input');
      };
      for (const hear of callerFirst ? [hearAnswer, hearQuestion] : [hearQuestion, hearAnswer]) {
        hear();
      }
      audio(target, 100);
      audio(caller, 200);
      await vi.advanceTimersByTimeAsync(1000);
      finalize();
      const response = await result;
      expect(response.error).toBeUndefined();
      const messages = [
        { role: 'user', content: 'Are you open?' },
        { role: 'assistant', content: 'We are closed.' },
      ];
      if (callerFirst) {
        messages.reverse();
      }
      expect(response.metadata?.messages).toEqual(messages);
      expect(response.output).toBe(
        callerFirst
          ? 'Assistant: We are closed.\n---\nUser: Are you open?'
          : 'User: Are you open?\n---\nAssistant: We are closed.',
      );
      expect(response.audio?.transcript).toBe(response.output);
      expect(response.metadata?.voice.participants.target.heard).toBe('Are you open?');
      expect(response.metadata?.voice.participants.caller.heard).toBe('We are closed.');
    },
  );

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

  it.each([{}, { audio: 'untrusted internal field', clipSha256: 'untrusted' }])(
    'sends advisory interventions without importing private playback fields: %j',
    async (extra) => {
      const p = provider({
        callerInterventions: [{ ...extra, atMs: 55, instructions: 'Ask about {{topic}} now.' }],
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
      expect(
        caller.sent.filter((event) => event.type === 'session.commentary.append'),
      ).toHaveLength(1);
      emit(caller, { type: 'session.instructions.appended', client_event_id: 'unrelated' });
      expect(
        caller.sent.filter((event) => event.type === 'session.commentary.append'),
      ).toHaveLength(1);
      acknowledgeSpeech(caller, instruction.event_id);
      expect(
        caller.sent.filter((event) => event.type === 'session.commentary.append'),
      ).toHaveLength(2);
      expect(
        target.sent.filter((event) => event.type === 'session.input_audio.append'),
      ).toHaveLength(3);
      expect(
        caller.sent.filter((event) => event.type === 'session.input_audio.append'),
      ).toHaveLength(3);
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
            socket.sent.filter((event) => event.type === 'session.input_audio.append').length ===
            50,
        ),
      ).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(
    (['text', 'instructions'] as const).flatMap((field) =>
      [
        { kind: 'dense ASCII', template: Array(600).fill('!').join(' '), vars: { utterance: '' } },
        { kind: 'UTF-8', template: 'é'.repeat(251), vars: { utterance: '' } },
        {
          kind: 'expanded template',
          template: '{{utterance}}',
          vars: { utterance: 'x'.repeat(501) },
        },
      ].map((testCase) => ({ field, ...testCase })),
    ),
  )(
    'rejects oversized rendered $field ($kind) before preparation or connection',
    async ({ field, template, vars }) => {
      loadCallback.mockResolvedValue(async () => 'Unused backend result');
      const response = await provider({
        target: { ...participant('target-key'), delegationHandler: 'file://unused.js' },
        callerInterventions: [
          { atMs: 10, text: 'A valid earlier intervention.' },
          { atMs: 200, [field]: template },
        ],
      }).callApi('Cafe', { prompt: { raw: 'Cafe', label: 'Cafe' }, vars });
      expect(response.error).toContain(
        'Rendered caller intervention text and instructions must contain 1–500 UTF-8 bytes',
      );
      expect(OpenAiTtsProvider.prototype.callApi).not.toHaveBeenCalled();
      expect(loadCallback).not.toHaveBeenCalled();
      expect(sockets).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['text', 'instructions'] as const)(
    'accepts a 2000-byte raw %s template that renders within the streaming budget',
    async (field) => {
      const rendered = 'Decaf please.';
      const template = `{#${'x'.repeat(1983)}#}${rendered}`;
      vi.mocked(OpenAiTtsProvider.prototype.callApi).mockResolvedValue({
        audio: { data: convertPcm16ToWav(Buffer.alloc(960, 10)).toString('base64'), format: 'wav' },
      });
      const result = provider({
        callerInterventions: [{ atMs: 20, [field]: template }],
      }).callApi('Cafe');
      const [target, caller] = await connect();
      acknowledgeOpening();
      audio(target, 100);
      audio(caller, 200);
      transcript(target, rendered, 20, 'input');
      transcript(caller, 'Of course.', 40, 'input');
      await vi.advanceTimersByTimeAsync(20);
      const type = field === 'text' ? 'session.thinking.append' : 'session.instructions.append';
      expect(caller.sent.filter((event) => event.type === type).at(-1)?.content).toBe(rendered);
      if (field === 'text') {
        expect(OpenAiTtsProvider.prototype.callApi).toHaveBeenCalledWith(
          rendered,
          expect.anything(),
          expect.anything(),
        );
        for (const event of caller.sent.filter((event) => event.type === type)) {
          emit(caller, { type: 'session.thinking.appended', client_event_id: event.event_id });
        }
      } else {
        expect(OpenAiTtsProvider.prototype.callApi).not.toHaveBeenCalled();
        acknowledgeSpeech(caller);
      }
      await vi.advanceTimersByTimeAsync(980);
      finalize();
      expect((await result).error).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('accepts 500-byte rendered text and instructions independently', async () => {
    const text = '🙂'.repeat(125);
    const instructions = 'é'.repeat(250);
    vi.mocked(OpenAiTtsProvider.prototype.callApi).mockResolvedValue({
      audio: { data: convertPcm16ToWav(Buffer.alloc(960, 10)).toString('base64'), format: 'wav' },
    });
    const result = provider({
      callerInterventions: [{ atMs: 20, text: '{{utterance}}', instructions: '{{steering}}' }],
    }).callApi('Cafe', {
      prompt: { raw: 'Cafe', label: 'Cafe' },
      vars: { utterance: text, steering: instructions },
    });
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    transcript(target, 'A question', 20, 'input');
    transcript(caller, 'An answer', 40, 'input');
    await vi.advanceTimersByTimeAsync(20);
    const contexts = caller.sent.filter((event) => event.type === 'session.thinking.append');
    expect(contexts.slice(1).map((event) => event.content)).toEqual([text, instructions]);
    expect(vi.mocked(OpenAiTtsProvider.prototype.callApi).mock.calls[0][0]).toBe(text);
    for (const event of contexts) {
      emit(caller, { type: 'session.thinking.appended', client_event_id: event.event_id });
    }
    await vi.advanceTimersByTimeAsync(980);
    finalize();
    expect((await result).error).toBeUndefined();
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

  it('prepares exact speech before connecting and plays it on the shared clock without waiting for the caller model', async () => {
    const clip = Buffer.alloc(55 * 48);
    for (let offset = 0; offset < clip.length; offset += 2) {
      clip.writeInt16LE(3000, offset);
    }
    vi.mocked(OpenAiTtsProvider.prototype.callApi).mockImplementation(async (text) => {
      expect(text).toBe('What time is decaf served?');
      expect(sockets).toHaveLength(0);
      return {
        audio: { data: convertPcm16ToWav(clip).toString('base64'), format: 'wav' },
        cost: 0.01,
      };
    });
    const result = provider({
      callerInterventions: [{ atMs: 55, text: 'What time is {{topic}} served?' }],
    }).callApi('Cafe', {
      prompt: { raw: 'Cafe', label: 'Cafe' },
      vars: { topic: 'decaf' },
    });
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 1000, 24000);
    audio(caller, 2000, 4800);
    transcript(target, 'Original question', 0, 'input');
    transcript(caller, 'A real answer', 0, 'input');
    await vi.advanceTimersByTimeAsync(60);
    const contexts = caller.sent.filter((event) => event.type === 'session.thinking.append');
    expect(contexts).toHaveLength(2);
    for (const context of contexts) {
      emit(caller, { type: 'session.thinking.appended', client_event_id: context.event_id });
    }
    expect(
      caller.sent.filter((event) => event.type === 'session.instructions.append'),
    ).toHaveLength(1);
    audio(caller, 0, 4800); // Real source silence, not a gap in received packets.
    await vi.advanceTimersByTimeAsync(940);
    finalize();
    const response = await result;
    expect(response.error).toBeUndefined();
    expect(response.metadata?.voice.interventions[0]).toMatchObject({
      mode: 'audio',
      scheduledAtMs: 55,
      sentAtMs: 60,
      firstFrameAtMs: 60,
      firstFrameSentAtMs: 60,
      completedAtMs: 115,
      clipDurationMs: 55,
      deliveredAudioBytes: clip.length,
      callerResumedAtMs: 100,
    });
    const targetFrames = target.sent.filter((event) => event.type === 'session.input_audio.append');
    const injected = Buffer.concat(
      targetFrames.slice(3, 6).map((event) => Buffer.from(event.audio, 'base64')),
    );
    expect(injected.subarray(0, clip.length)).toEqual(clip);
    expect(injected.subarray(clip.length).every((byte) => byte === 0)).toBe(true);
    const callerFrames = caller.sent.filter((event) => event.type === 'session.input_audio.append');
    expect(
      callerFrames
        .slice(3, 6)
        .every((event) => Buffer.from(event.audio, 'base64').readInt16LE() === 1000),
    ).toBe(true);
    expect(response.output).not.toContain('decaf'); // No manufactured listener evidence.
    expect(response.cost).toBeCloseTo(0.01 + (2 * 0.05) / 60);
    expect(response.tokenUsage?.numRequests).toBe(3);
  });

  it.each([
    { atMs: 980, clipMs: 20, dispatched: 0 },
    { atMs: 900, clipMs: 100, dispatched: 1 },
  ])(
    'reports undelivered scheduled speech after a late final tick: %j',
    async ({ atMs, clipMs, dispatched }) => {
      vi.mocked(OpenAiTtsProvider.prototype.callApi).mockResolvedValue({
        audio: {
          data: convertPcm16ToWav(Buffer.alloc(clipMs * 48, 10)).toString('base64'),
          format: 'wav',
        },
      });
      const result = provider({
        callerInterventions: [{ atMs, text: 'Actually, decaf please.' }],
      }).callApi('Cafe');
      const [target, caller] = await connect();
      acknowledgeOpening();
      audio(target, 1000, 24000);
      audio(caller, 2000, 24000);
      transcript(target, 'Original question', 0, 'input');
      transcript(caller, 'A real answer', 0, 'input');
      await vi.advanceTimersByTimeAsync(960);
      for (const event of caller.sent.filter((entry) => entry.type === 'session.thinking.append')) {
        emit(caller, { type: 'session.thinking.appended', client_event_id: event.event_id });
      }
      // The callback due at 980 ms runs at 1000 ms without exceeding the 250 ms lag limit.
      vi.setSystemTime(Date.now() + 20);
      await vi.advanceTimersByTimeAsync(20);
      finalize();
      const response = await result;
      expect(response.error).toContain('Scheduled caller speech');
      expect(response.metadata?.voice.stopReason).toBe('error');
      expect(response.metadata?.voice.interventions).toHaveLength(dispatched);
      expect(response.metadata?.voice.durationMs).toBe(980);
      expect(response.metadata?.voice.maximumClockLagMs).toBe(20);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['remote_hangup', 'content'])(
    'accounts for undispatched speech on target %s',
    async (reason) => {
      vi.mocked(OpenAiTtsProvider.prototype.callApi).mockResolvedValue({
        audio: { data: convertPcm16ToWav(Buffer.alloc(960, 10)).toString('base64'), format: 'wav' },
      });
      const result = provider({
        callerInterventions: [{ atMs: 800, text: 'Actually, decaf please.' }],
      }).callApi('Cafe');
      const [target, caller] = await connect();
      acknowledgeOpening();
      audio(target, 1000, 24000);
      audio(caller, 2000, 24000);
      transcript(target, 'Original question', 0, 'input');
      transcript(caller, 'A real answer', 0, 'input');
      await vi.advanceTimersByTimeAsync(200);
      emit(target, { type: 'session.closed', reason, usage: { seconds: 1 } });
      await vi.advanceTimersByTimeAsync(0);
      emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
      const response = await result;
      expect(response.metadata?.voice.interventions).toEqual([]);
      if (reason === 'content') {
        expect(response.error).toBeUndefined();
        expect(response.isRefusal).toBe(true);
        expect(response.metadata?.voice.stopReason).toBe('safety');
      } else {
        expect(response.error).toContain('Scheduled caller speech');
        expect(response.metadata?.voice.stopReason).toBe('error');
        expect(response.metadata?.voice.participants.target.deliveredAudioBytes).toBeGreaterThan(0);
        expect(response.metadata?.voice.participants.caller.deliveredAudioBytes).toBeGreaterThan(0);
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not open Live sockets when speech preparation fails and preserves known preparation cost', async () => {
    vi.mocked(OpenAiTtsProvider.prototype.callApi).mockResolvedValue({
      error: 'Synthesis rejected',
      cost: 0.01,
    });
    const response = await provider({
      callerInterventions: [{ atMs: 100, text: 'Hello' }],
    }).callApi('Cafe');
    expect(sockets).toHaveLength(0);
    expect(response.error).toBe('Synthesis rejected');
    expect(response.cost).toBeUndefined();
    expect(response.metadata?.voice.interventionPreparation).toMatchObject({
      requests: 1,
      costKnown: true,
      knownCost: 0.01,
    });
    expect(response.tokenUsage?.numRequests).toBe(1);
  });

  it('preserves an explicit preparation retry veto without exposing unrelated metadata', async () => {
    vi.mocked(OpenAiTtsProvider.prototype.callApi).mockResolvedValue({
      error: 'Rate limit exceeded',
      metadata: {
        rateLimitRetryable: false,
        diagnostic: 'caller-key',
        http: {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '120', 'x-api-key': 'caller-key' },
          requestHeaders: { Authorization: 'Bearer caller-key' },
        },
      },
    });
    const response = await provider({
      callerInterventions: [{ atMs: 100, text: 'Hello' }],
    }).callApi('Cafe');
    const scheduler = createProviderRateLimitOptions();

    expect(response.metadata?.rateLimitRetryable).toBe(false);
    expect(scheduler.isRateLimited?.(response, undefined)).toBe(false);
    expect(scheduler.getHeaders?.(response)).toBeUndefined();
    expect(scheduler.getRetryAfter?.(response, undefined)).toBeUndefined();
    expect(JSON.stringify(response)).not.toContain('caller-key');
    expect(response.metadata?.diagnostic).toBeUndefined();
    expect(sockets).toHaveLength(0);
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
      if (mode === 'rejected') {
        for (const participant of ['target', 'caller']) {
          expect(response.metadata?.voice.participants[participant]).toMatchObject({
            finalUsageConfirmed: true,
            voiceSeconds: 1,
            backendCost: 0,
          });
        }
        expect(response.cost).toBeCloseTo((2 * 0.05) / 60, 9);
      } else {
        expect(response.metadata?.voice.participants.caller.finalUsageConfirmed).toBe(false);
        expect(response.cost).toBeUndefined();
      }
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
    const result = provider({ maxBufferedAudioMs: 20 }).callApi('Cafe');
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
    'retains confirmed cost when target safety closure cancels a speech %s',
    async (phase) => {
      const result = provider({ targetSpeaksFirst: true }).callApi('Cafe');
      const [target, caller] = await connect();
      if (phase === 'commentary') {
        const opening = target.sent.find((event) => event.type === 'session.instructions.append')!;
        emit(target, {
          type: 'session.instructions.appended',
          client_event_id: opening.event_id,
        });
        expect(target.sent.at(-1)?.type).toBe('session.commentary.append');
      }
      emit(target, { type: 'session.closed', reason: 'content', usage: { seconds: 1 } });
      await vi.advanceTimersByTimeAsync(0);
      expect(caller.sent.at(-1)?.type).toBe('session.close');
      emit(caller, { type: 'session.closed', reason: 'close_requested', usage: { seconds: 1 } });
      const response = await result;
      expect(response.error).toBeUndefined();
      expect(response.isRefusal).toBe(true);
      expect(response.metadata?.voice.stopReason).toBe('safety');
      expect(response.metadata?.voice.participants.target).toMatchObject({
        finalUsageConfirmed: true,
        cancelledSpeechRequests: 1,
      });
      expect(response.metadata?.voice.participants.caller.finalUsageConfirmed).toBe(true);
      expect(response.cost).toBeCloseTo((2 * 0.05) / 60);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['instruction', 'commentary'])(
    'waits for final usage when a pending speech %s deadline falls inside the close window',
    async (phase) => {
      const result = provider({
        callerInterventions: [{ atMs: 850, instructions: 'Ask a follow-up.' }],
      }).callApi('Cafe');
      const [target, caller] = await connect();
      acknowledgeOpening();
      audio(target, 100);
      audio(caller, 200);
      transcript(target, 'Question', 0, 'input');
      transcript(caller, 'Answer', 20, 'input');
      await vi.advanceTimersByTimeAsync(850);
      if (phase === 'commentary') {
        const requests = caller.sent.filter(
          (event) => event.type === 'session.instructions.append',
        );
        emit(caller, {
          type: 'session.instructions.appended',
          client_event_id: requests[requests.length - 1].event_id,
        });
      }
      await vi.advanceTimersByTimeAsync(150);
      expect(sockets.every((socket) => socket.sent.at(-1)?.type === 'session.close')).toBe(true);
      // The speech ACK deadline was 1050ms; final usage is allowed until 1100ms.
      await vi.advanceTimersByTimeAsync(90);
      expect(caller.terminate).not.toHaveBeenCalled();
      finalize();
      const response = await result;
      expect(response.error).toBe(
        'GPT-Live capture ended before speech requests were acknowledged.',
      );
      expect(response.metadata?.voice.stopReason).toBe('error');
      for (const participant of ['target', 'caller']) {
        expect(response.metadata?.voice.participants[participant].finalUsageConfirmed).toBe(true);
        expect(response.metadata?.voice.participants[participant].voiceSeconds).toBe(1);
      }
      expect(response.metadata?.voice.participants.caller.cancelledSpeechRequests).toBeUndefined();
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

  it.each(
    ['target', 'caller'].flatMap((side) =>
      ['openai:live:gpt-live-1', [], null, true, 42].map((value) => ({ side, value })),
    ),
  )(
    'rejects a non-object $side before using ambient credentials: $value',
    async ({ side, value }) => {
      const restoreAmbient = mockProcessEnv({ OPENAI_API_KEY: 'ambient-fixture-key' });
      try {
        const result = provider({ [side]: value } as SimulatedVoiceUserConfig).callApi('Cafe');
        await vi.runAllTimersAsync();
        const response = await result;
        expect(response.error).toBe(`${side} must be a non-array object when provided.`);
        expect(sockets).toHaveLength(0);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        restoreAmbient();
      }
    },
  );

  it.each([undefined, {}])('accepts omitted or empty participant options: %j', async (options) => {
    const restoreAmbient = mockProcessEnv({ OPENAI_API_KEY: 'ambient-fixture-key' });
    try {
      const result = provider({ target: options, caller: options }).callApi('Cafe');
      const [target, caller] = await connect();
      acknowledgeOpening();
      audio(target, 100);
      audio(caller, 200);
      transcript(target, 'Question', 0, 'input');
      transcript(caller, 'Answer', 20, 'input');
      await vi.advanceTimersByTimeAsync(1000);
      finalize();
      expect((await result).error).toBeUndefined();
      expect(
        sockets.every(
          (socket) => socket.options.headers.Authorization === 'Bearer ambient-fixture-key',
        ),
      ).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      restoreAmbient();
    }
  });

  it.each([false, true])(
    'rejects shared startup budgets that exceed either session deadline (swapped: %s)',
    async (swapped) => {
      const early = { ...participant('early-key'), websocketTimeout: 1000, closeTimeoutMs: 200000 };
      const slow = { ...participant('slow-key'), websocketTimeout: 100000, closeTimeoutMs: 15000 };
      const result = provider({
        durationMs: 60000,
        timeoutMs: 400000,
        target: swapped ? slow : early,
        caller: swapped ? early : slow,
      }).callApi('Cafe');
      await vi.runAllTimersAsync();
      const response = await result;
      expect(response.error).toContain('shared startup');
      expect(response.error).toContain('REQUEST_TIMEOUT_MS');
      expect(sockets).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('uses frame-rounded capture duration in the shared startup budget', async () => {
    const result = provider({
      durationMs: 1001,
      timeoutMs: 400000,
      target: { ...participant('target-key'), websocketTimeout: 1000, closeTimeoutMs: 198990 },
      caller: { ...participant('caller-key'), websocketTimeout: 100000 },
    }).callApi('Cafe');
    await vi.runAllTimersAsync();
    const response = await result;
    // Raw duration would fit at 299991ms, but 1020ms of PCM requires 300010ms.
    expect(response.error).toContain('shared startup');
    expect(sockets).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 1])(
    'preserves the full capture when participant %i emits audio during peer startup',
    async (earlyIndex) => {
      const result = provider({
        target: { ...participant('target-key'), websocketTimeout: 1000 },
        caller: { ...participant('caller-key'), websocketTimeout: 1000 },
      }).callApi('Cafe');
      await vi.advanceTimersByTimeAsync(0);
      expect(sockets).toHaveLength(2);
      for (const socket of sockets) {
        socket.readyState = 1;
        socket.emit('open');
      }
      const early = sockets[earlyIndex];
      const late = sockets[1 - earlyIndex];
      emit(early, { type: 'session.started', session: { id: 'early' } });
      for (let index = 0; index < 3; index++) {
        audio(early, 1000, 2400);
        await vi.advanceTimersByTimeAsync(100);
      }
      emit(late, { type: 'session.started', session: { id: 'late' } });
      await vi.advanceTimersByTimeAsync(0);
      acknowledgeOpening();
      transcript(sockets[0], 'Question', 0, 'input');
      transcript(sockets[1], 'Answer', 0, 'input');
      for (let index = 0; index < 10; index++) {
        audio(early, 1000, 2400);
        audio(late, 2000, 2400);
        await vi.advanceTimersByTimeAsync(100);
      }
      finalize();
      const response = await result;
      expect(response.error).toBeUndefined();
      expect(response.metadata?.voice.durationMs).toBe(1000);
      expect(response.metadata?.voice.stopReason).toBe('duration_limit');
      for (const socket of sockets) {
        expect(
          socket.sent.filter((event) => event.type === 'session.input_audio.append'),
        ).toHaveLength(50);
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('accepts asymmetric participant timeouts that fit the shared startup budget', async () => {
    const result = provider({
      timeoutMs: 400000,
      target: { ...participant('target-key'), websocketTimeout: 1000, closeTimeoutMs: 200000 },
      caller: { ...participant('caller-key'), websocketTimeout: 90000, closeTimeoutMs: 15000 },
    }).callApi('Cafe');
    const [target, caller] = await connect();
    acknowledgeOpening();
    audio(target, 100);
    audio(caller, 200);
    transcript(target, 'Question', 0, 'input');
    transcript(caller, 'Answer', 20, 'input');
    await vi.advanceTimersByTimeAsync(1000);
    finalize();
    expect((await result).error).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
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
