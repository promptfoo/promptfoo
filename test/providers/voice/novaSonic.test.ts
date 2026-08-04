import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioChunk, VoiceProviderConfig } from '../../../src/providers/voice/types';

const { bedrockMocks } = vi.hoisted(() => {
  const state = {
    clientConfigs: [] as unknown[],
    constructError: undefined as Error | undefined,
    responseEvents: [] as Array<{ event?: Record<string, unknown> }>,
    streams: [] as AsyncIterable<{ chunk: { bytes: Uint8Array } }>[],
  };

  class MockBidirectionalCommand {
    input: { body: AsyncIterable<{ chunk: { bytes: Uint8Array } }> };

    constructor(input: { body: AsyncIterable<{ chunk: { bytes: Uint8Array } }> }) {
      this.input = input;
    }
  }

  const send = vi.fn(async (command: MockBidirectionalCommand) => {
    state.streams.push(command.input.body);
    const iterator = command.input.body[Symbol.asyncIterator]();
    await iterator.next();

    return {
      body: (async function* () {
        for (const event of state.responseEvents) {
          yield {
            chunk: {
              bytes: new TextEncoder().encode(JSON.stringify(event)),
            },
          };
        }
      })(),
    };
  });
  const destroy = vi.fn();

  class MockBedrockClient {
    send = send;
    destroy = destroy;

    constructor(config: unknown) {
      if (state.constructError) {
        throw state.constructError;
      }
      state.clientConfigs.push(config);
    }
  }

  return { bedrockMocks: { MockBedrockClient, MockBidirectionalCommand, destroy, send, state } };
});

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: bedrockMocks.MockBedrockClient,
  InvokeModelWithBidirectionalStreamCommand: bedrockMocks.MockBidirectionalCommand,
}));
vi.mock('@smithy/node-http-handler', () => ({
  NodeHttp2Handler: class MockNodeHttp2Handler {},
}));

import { NovaSonicConnection } from '../../../src/providers/voice/connections/novaSonic';

type NovaInternals = {
  accumulatedTranscript: string;
  bedrockClient: { destroy: typeof bedrockMocks.destroy; send: typeof bedrockMocks.send } | null;
  createAsyncIterable: () => AsyncIterable<{ chunk: { bytes: Uint8Array } }>;
  getRegion: () => string;
  handleNovaEvent: (data: { event?: Record<string, unknown> }) => void;
  hasReceivedAudio: boolean;
  mapVoice: (voice?: string) => string;
  processResponses: () => Promise<void>;
  responsePromise: Promise<unknown> | null;
  sendEvent: (event: { event: Record<string, unknown> }) => void;
  session: any;
  setConnectionTimeout: (ms: number) => void;
  state: string;
};

const config: VoiceProviderConfig = {
  provider: 'bedrock',
  voice: 'echo',
  instructions: 'Answer in one sentence.',
  audioFormat: 'pcm16',
  sampleRate: 24000,
};

function internals(connection: NovaSonicConnection): NovaInternals {
  return connection as unknown as NovaInternals;
}

function audioChunk(): AudioChunk {
  return {
    data: Buffer.from([0, 0, 1, 0, 2, 0, 3, 0]).toString('base64'),
    duration: 1,
    format: 'pcm16',
    sampleRate: 24000,
    timestamp: 0,
  };
}

async function configure(connection: NovaSonicConnection) {
  await connection.connect();
  await connection.configureSession();
  return internals(connection);
}

describe('NovaSonicConnection', () => {
  beforeEach(() => {
    bedrockMocks.send.mockClear();
    bedrockMocks.destroy.mockClear();
    bedrockMocks.state.clientConfigs.length = 0;
    bedrockMocks.state.constructError = undefined;
    bedrockMocks.state.responseEvents = [];
    bedrockMocks.state.streams.length = 0;
    vi.stubEnv('AWS_REGION', 'test-region');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('connects, configures a session, and exposes mapped configuration state', async () => {
    bedrockMocks.state.responseEvents = [
      { event: { completionStart: {} } },
      {
        event: {
          contentStart: {
            contentId: 'assistant-final',
            type: 'TEXT',
            role: 'ASSISTANT',
            additionalModelFields: JSON.stringify({ generationStage: 'FINAL' }),
          },
        },
      },
      { event: { textOutput: { contentId: 'assistant-final', content: 'hello' } } },
      { event: { completionEnd: { stopReason: 'END_TURN' } } },
    ];
    const transcript = vi.fn();
    const configured = vi.fn();
    const connection = new NovaSonicConnection(config);
    connection.on('transcript_done', transcript);
    connection.on('session_configured', configured);

    const nova = await configure(connection);

    expect(connection.isReady()).toBe(true);
    expect(connection.isConnected()).toBe(true);
    expect(connection.getState()).toBe('ready');
    expect(connection.getSessionId()).toEqual(expect.any(String));
    expect(connection.getConfig()).toEqual(config);
    expect(bedrockMocks.state.clientConfigs[0]).toEqual(
      expect.objectContaining({ region: 'test-region' }),
    );
    expect(configured).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(transcript).toHaveBeenCalledWith('hello');
    });
    expect(nova.mapVoice()).toBe('tiffany');
    expect(nova.mapVoice('AMY')).toBe('amy');
    expect(nova.mapVoice('alloy')).toBe('tiffany');
    expect(nova.mapVoice('unknown')).toBe('tiffany');
    expect(nova.getRegion()).toBe('test-region');
  });

  it('rejects setup failures and unsupported session transitions', async () => {
    await expect(new NovaSonicConnection(config).configureSession()).rejects.toThrow(
      'not connected',
    );

    bedrockMocks.state.constructError = new Error('client failed');
    const failure = new NovaSonicConnection(config);
    await expect(failure.connect()).rejects.toThrow(
      'Failed to connect to Nova Sonic: client failed',
    );
    expect(failure.getState()).toBe('error');
  });

  it('queues audio, VAD silence, response requests, and disconnect events', async () => {
    vi.useFakeTimers();
    const connection = new NovaSonicConnection(config);
    const closed = vi.fn();
    connection.on('close', closed);
    const nova = await configure(connection);

    const initialQueueLength = nova.session.queue.length;
    connection.sendAudio(audioChunk());
    expect(nova.hasReceivedAudio).toBe(true);
    expect(nova.session.queue.length).toBeGreaterThan(initialQueueLength);

    const commit = connection.commitAudio();
    await vi.advanceTimersByTimeAsync(600);
    await commit;
    expect(nova.session.queue.length).toBeGreaterThan(initialQueueLength + 40);

    const queueLengthAfterCommit = nova.session.queue.length;
    connection.requestResponse();
    expect(nova.session.queue.length).toBe(queueLengthAfterCommit);

    nova.session.audioContentActive = false;
    await connection.commitAudio();
    nova.session.audioContentActive = false;
    connection.sendAudio(audioChunk());
    expect(nova.session.audioContentActive).toBe(true);
    expect(() => connection.sendAudio({ ...audioChunk(), format: 'g711_ulaw' })).toThrow(
      'supports only PCM16',
    );

    const session = nova.session;
    connection.disconnect();
    const closingEventTypes = session.queue.map(
      (event: { event: Record<string, unknown> }) => Object.keys(event.event)[0],
    );
    expect(closingEventTypes.slice(-3)).toEqual(['contentEnd', 'promptEnd', 'sessionEnd']);
    expect(closingEventTypes).toContain('promptEnd');
    expect(closingEventTypes).toContain('sessionEnd');
    expect(session.audioContentActive).toBe(false);
    expect(session.promptEnded).toBe(true);
    expect(connection.isConnected()).toBe(false);
    expect(connection.getSessionId()).toBeNull();
    expect(closed).toHaveBeenCalled();
    expect(bedrockMocks.destroy).toHaveBeenCalled();
  });

  it('handles not-ready operations, response events, stream errors, and region fallbacks', async () => {
    const connection = new NovaSonicConnection({ ...config, voice: undefined });
    const nova = internals(connection);
    const deltas = vi.fn();
    const input = vi.fn();
    const audio = vi.fn();
    const done = vi.fn();
    const stopped = vi.fn();
    const errors = vi.fn();
    connection.on('transcript_delta', deltas);
    connection.on('input_transcript', input);
    connection.on('audio_delta', audio);
    connection.on('audio_done', done);
    connection.on('speech_stopped', stopped);
    connection.on('error', errors);

    connection.sendAudio(audioChunk());
    await connection.commitAudio();
    connection.requestResponse();

    nova.handleNovaEvent({});
    nova.handleNovaEvent({ event: { completionStart: {} } });
    nova.handleNovaEvent({
      event: {
        contentStart: {
          contentId: 'assistant-final',
          type: 'TEXT',
          role: 'ASSISTANT',
          additionalModelFields: JSON.stringify({ generationStage: 'FINAL' }),
        },
      },
    });
    nova.handleNovaEvent({
      event: { textOutput: { role: 'ASSISTANT', content: ' compatible' } },
    });
    nova.handleNovaEvent({
      event: {
        contentStart: {
          contentId: 'caller-input',
          type: 'TEXT',
          role: 'USER',
        },
      },
    });
    nova.handleNovaEvent({
      event: { textOutput: { contentId: 'assistant-final', content: 'assistant' } },
    });
    nova.handleNovaEvent({
      event: { textOutput: { contentId: 'caller-input', content: 'caller' } },
    });
    nova.handleNovaEvent({
      event: { audioOutput: { content: Buffer.from([0, 0, 1, 0]).toString('base64') } },
    });
    nova.handleNovaEvent({ event: { contentEnd: { stopReason: 'END_TURN' } } });
    expect(done).not.toHaveBeenCalled();
    nova.handleNovaEvent({ event: { completionEnd: { stopReason: 'END_TURN' } } });
    nova.handleNovaEvent({ event: { completionEnd: { stopReason: 'END_TURN' } } });
    nova.handleNovaEvent({ event: { other: {} } });

    expect(deltas).toHaveBeenCalledWith('assistant');
    expect(deltas).toHaveBeenCalledWith(' compatible');
    expect(input).toHaveBeenCalledWith('caller');
    expect(audio).toHaveBeenCalledWith(expect.objectContaining({ sampleRate: 24000 }));
    expect(done).toHaveBeenCalledTimes(1);
    expect(stopped).toHaveBeenCalled();

    nova.responsePromise = Promise.reject(new Error('stream failed'));
    await nova.processResponses();
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'stream failed' }));

    vi.unstubAllEnvs();
    vi.stubEnv('AWS_DEFAULT_REGION', 'default-region');
    expect(nova.getRegion()).toBe('default-region');
    vi.unstubAllEnvs();
    expect(nova.getRegion()).toBe('us-east-1');
  });

  it('streams queued events, keepalive audio, inactive sends, and connection timeouts', async () => {
    vi.useFakeTimers();
    const connection = new NovaSonicConnection({
      ...config,
      region: 'explicit-region',
    } as VoiceProviderConfig);
    const nova = internals(connection);
    nova.state = 'ready';
    nova.session = {
      queue: [{ event: { sessionStart: {} } }],
      queueSignal: new Subject<void>(),
      closeSignal: new Subject<void>(),
      isActive: true,
      audioContentId: 'audio',
      promptName: 'prompt',
      audioContentActive: true,
      iteratorStarted: false,
      promptEnded: true,
    };

    const iterator = nova.createAsyncIterable()[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(new TextDecoder().decode(first.value?.chunk.bytes)).toContain('sessionStart');

    const keepalive = iterator.next();
    await vi.advanceTimersByTimeAsync(151);
    const second = await keepalive;
    expect(new TextDecoder().decode(second.value?.chunk.bytes)).toContain('audioInput');

    nova.session.queue.push({ event: { promptEnd: {} } }, { event: { sessionEnd: {} } });
    nova.session.isActive = false;
    nova.session.queueSignal.next();
    const promptEnd = await iterator.next();
    const sessionEnd = await iterator.next();
    expect(new TextDecoder().decode(promptEnd.value?.chunk.bytes)).toContain('promptEnd');
    expect(new TextDecoder().decode(sessionEnd.value?.chunk.bytes)).toContain('sessionEnd');
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });

    const timeout = new NovaSonicConnection(config);
    const timeoutErrors = vi.fn();
    timeout.on('error', timeoutErrors);
    internals(timeout).state = 'connecting';
    internals(timeout).setConnectionTimeout(5);
    await vi.advanceTimersByTimeAsync(5);
    expect(timeoutErrors).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Connection timeout' }),
    );
  });
});
