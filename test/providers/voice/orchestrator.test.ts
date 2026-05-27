import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STOP_MARKER } from '../../../src/providers/voice/transcriptAccumulator';

import type {
  AudioChunk,
  OrchestratorConfig,
  VoiceProviderConfig,
} from '../../../src/providers/voice/types';

const { connectionMocks } = vi.hoisted(() => {
  const instances: MockConnection[] = [];

  class MockConnection {
    config: VoiceProviderConfig;
    listeners = new Map<string, Array<(...args: any[]) => void>>();
    connect = vi.fn(async () => {
      if (this.config.model === 'fail-connect') {
        throw new Error('connect failed');
      }
    });
    configureSession = vi.fn(async () => {});
    disconnect = vi.fn(async () => {});
    sendAudio = vi.fn();
    commitAudio = vi.fn();
    requestResponse = vi.fn();
    cancelResponse = vi.fn();
    isReady = vi.fn(() => true);

    constructor(config: VoiceProviderConfig) {
      this.config = config;
      instances.push(this);
    }

    on(event: string, listener: (...args: any[]) => void): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
    }
  }

  return { connectionMocks: { MockConnection, instances } };
});

vi.mock('../../../src/providers/voice/connections/googleLive', () => ({
  GoogleLiveConnection: connectionMocks.MockConnection,
}));
vi.mock('../../../src/providers/voice/connections/novaSonic', () => ({
  NovaSonicConnection: connectionMocks.MockConnection,
}));
vi.mock('../../../src/providers/voice/connections/openaiRealtime', () => ({
  OpenAIRealtimeConnection: connectionMocks.MockConnection,
}));

import {
  runVoiceConversation,
  VoiceConversationOrchestrator,
} from '../../../src/providers/voice/orchestrator';

function providerConfig(provider: 'openai' | 'google' | 'bedrock', model = `${provider}-model`) {
  return {
    provider,
    model,
    audioFormat: 'pcm16' as const,
    sampleRate: 24000,
  };
}

function config(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    targetConfig: providerConfig('openai'),
    simulatedUserConfig: providerConfig('google'),
    turnDetection: {
      mode: 'server_vad',
      silenceThresholdMs: 500,
      vadThreshold: 0.5,
      minTurnDurationMs: 100,
      maxTurnDurationMs: 30000,
      prefixPaddingMs: 300,
    },
    ...overrides,
  };
}

function chunk(timestamp: number): AudioChunk {
  return {
    data: Buffer.alloc(48).toString('base64'),
    duration: 1,
    format: 'pcm16',
    sampleRate: 24000,
    timestamp,
  };
}

async function startConversation(orchestrator: VoiceConversationOrchestrator) {
  const instanceOffset = connectionMocks.instances.length;
  const result = orchestrator.start();
  await vi.waitFor(() => {
    expect(connectionMocks.instances).toHaveLength(instanceOffset + 2);
    expect(orchestrator.getState()).toBe('active');
  });
  return {
    result,
    target: connectionMocks.instances[instanceOffset],
    user: connectionMocks.instances[instanceOffset + 1],
  };
}

describe('VoiceConversationOrchestrator', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    connectionMocks.instances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes target and simulated user turns until the stop marker completes the goal', async () => {
    const orchestrator = new VoiceConversationOrchestrator(config());
    const targetAudio = vi.fn();
    const userAudio = vi.fn();
    orchestrator.on('target_audio', targetAudio);
    orchestrator.on('simulated_user_audio', userAudio);

    expect(orchestrator.getState()).toBe('idle');
    expect(orchestrator.getTurnCount()).toBe(0);
    expect(orchestrator.getTranscript().getTurns()).toEqual([]);

    const { result, target, user } = await startConversation(orchestrator);

    expect(orchestrator.getState()).toBe('active');
    expect(target.requestResponse).toHaveBeenCalled();
    expect(target.connect).toHaveBeenCalled();
    expect(user.configureSession).toHaveBeenCalled();

    target.emit('speech_started');
    target.emit('audio_delta', chunk(0));
    target.emit('audio_done');
    expect(user.requestResponse).not.toHaveBeenCalled();
    target.emit('transcript_delta', 'Welcome ');
    target.emit('transcript_done', 'Welcome caller');
    target.emit('speech_stopped');

    expect(user.sendAudio).toHaveBeenCalledWith(expect.objectContaining({ timestamp: 0 }));
    expect(user.commitAudio).toHaveBeenCalled();
    expect(user.requestResponse).toHaveBeenCalled();
    expect(targetAudio).toHaveBeenCalledWith(expect.objectContaining({ timestamp: 0 }));

    user.emit('speech_started');
    user.emit('audio_delta', chunk(5));
    user.emit('audio_done');
    expect(target.commitAudio).not.toHaveBeenCalled();
    user.emit('transcript_delta', 'Thanks ');
    user.emit('transcript_done', `Thanks ${STOP_MARKER}`);
    user.emit('speech_stopped');

    const completed = await result;
    expect(completed).toEqual(
      expect.objectContaining({
        stopReason: 'goal_achieved',
        success: true,
        turnCount: 2,
      }),
    );
    expect(completed.transcript).toContain('Welcome caller');
    expect(completed.targetAudio).toBeInstanceOf(Buffer);
    expect(completed.combinedAudio).toBeInstanceOf(Buffer);
    expect(target.commitAudio).not.toHaveBeenCalled();
    expect(target.requestResponse).toHaveBeenCalledTimes(1);
    expect(target.disconnect).toHaveBeenCalled();
    expect(userAudio).toHaveBeenCalled();
    expect(orchestrator.getState()).toBe('idle');
  });

  it('feeds local audio chunks into silence turn detection without provider VAD events', async () => {
    const orchestrator = new VoiceConversationOrchestrator(
      config({
        turnDetection: {
          mode: 'silence',
          silenceThresholdMs: 500,
          vadThreshold: 0.02,
          minTurnDurationMs: 0,
          maxTurnDurationMs: 30000,
          prefixPaddingMs: 300,
        },
      }),
    );
    const turnStart = vi.fn();
    const turnEnd = vi.fn();
    orchestrator.on('turn_start', turnStart);
    orchestrator.on('turn_end', turnEnd);

    const { result, target, user } = await startConversation(orchestrator);
    const audio = Buffer.alloc(100);
    for (let i = 0; i < audio.length; i += 2) {
      audio.writeInt16LE(10000, i);
    }

    target.emit('audio_delta', {
      data: audio.toString('base64'),
      duration: 2,
      format: 'pcm16',
      sampleRate: 24000,
      timestamp: 0,
    });
    target.emit('audio_done');

    expect(turnStart).toHaveBeenCalledTimes(1);
    expect(turnEnd).toHaveBeenCalledTimes(1);

    target.emit('transcript_done', `${STOP_MARKER} from the target`);
    user.emit('transcript_done', `${STOP_MARKER} from the caller`);
    await expect(result).resolves.toEqual(
      expect.objectContaining({ stopReason: 'goal_achieved', success: true }),
    );
  });

  it('keeps audio routing conditional when peer connections are not ready', async () => {
    const orchestrator = new VoiceConversationOrchestrator(
      config({
        targetConfig: { ...providerConfig('openai'), sampleRate: undefined },
        simulatedUserConfig: { ...providerConfig('google'), sampleRate: undefined },
      }),
    );
    const { result, target, user } = await startConversation(orchestrator);

    target.emit('audio_delta', { ...chunk(0), duration: undefined });
    target.emit('audio_delta', { ...chunk(0), duration: 0 });
    user.isReady.mockReturnValue(false);
    target.emit('audio_delta', chunk(0));
    target.emit('audio_done');

    target.isReady.mockReturnValue(false);
    user.emit('audio_delta', chunk(0));
    user.emit('audio_done');
    (orchestrator as any).turnDetector.emit('turn_timeout');

    expect(user.sendAudio).toHaveBeenCalledTimes(2);
    expect(target.sendAudio).not.toHaveBeenCalled();
    expect(user.cancelResponse).not.toHaveBeenCalled();

    target.emit('transcript_done', `${STOP_MARKER} from the target`);
    user.emit('transcript_done', `${STOP_MARKER} from the caller`);
    await expect(result).resolves.toEqual(
      expect.objectContaining({ stopReason: 'goal_achieved', success: true }),
    );
  });

  it('supports user-first mode, max-turn completion, timeout cancellation, and one-shot runs', async () => {
    const userFirst = new VoiceConversationOrchestrator(
      config({ targetSpeaksFirst: false, maxTurns: 1 }),
    );
    const { result, target, user } = await startConversation(userFirst);
    expect(target.requestResponse).not.toHaveBeenCalled();
    expect(user.requestResponse).toHaveBeenCalled();

    user.emit('transcript_done', 'Opening question');
    await expect(result).resolves.toEqual(expect.objectContaining({ stopReason: 'max_turns' }));

    const oneShot = runVoiceConversation(config({ maxTurns: 1 }));
    await vi.waitFor(() => {
      expect(connectionMocks.instances).toHaveLength(4);
    });
    connectionMocks.instances[2].emit('transcript_done', 'one turn');
    await expect(oneShot).resolves.toEqual(expect.objectContaining({ stopReason: 'max_turns' }));
  });

  it('stops for explicit hangups and active connection failures', async () => {
    const hangup = new VoiceConversationOrchestrator(config());
    const hangupStart = await startConversation(hangup);
    await hangup.stop('user_hangup');
    await expect(hangupStart.result).resolves.toEqual(
      expect.objectContaining({ stopReason: 'user_hangup' }),
    );
    await hangup.stop();

    const targetFailure = new VoiceConversationOrchestrator(config());
    targetFailure.on('error', vi.fn());
    const targetStart = await startConversation(targetFailure);
    targetStart.target.emit('error', new Error('target failed'));
    await expect(targetStart.result).resolves.toEqual(
      expect.objectContaining({ stopReason: 'error' }),
    );

    const closeFailure = new VoiceConversationOrchestrator(config());
    const closeStart = await startConversation(closeFailure);
    closeStart.user.emit('close');
    await expect(closeStart.result).resolves.toEqual(
      expect.objectContaining({ stopReason: 'error' }),
    );
  });

  it('cancels speaking targets on detector timeout and times out whole conversations', async () => {
    const orchestrator = new VoiceConversationOrchestrator(config({ timeoutMs: 200 }));
    const { result, target } = await startConversation(orchestrator);
    target.emit('audio_delta', chunk(0));
    (orchestrator as any).turnDetector.emit('turn_timeout');
    expect(target.cancelResponse).toHaveBeenCalled();

    await expect(result).resolves.toEqual(expect.objectContaining({ stopReason: 'timeout' }));
  });

  it('arms the detector timeout from real simulated-user audio output', async () => {
    vi.useFakeTimers();
    const orchestrator = new VoiceConversationOrchestrator(
      config({
        turnDetection: {
          ...config().turnDetection,
          maxTurnDurationMs: 25,
        },
        timeoutMs: 1000,
      }),
    );
    const { result, user } = await startConversation(orchestrator);

    user.emit('audio_delta', chunk(0));
    await vi.advanceTimersByTimeAsync(25);
    expect(user.cancelResponse).toHaveBeenCalled();

    await orchestrator.stop('user_hangup');
    await expect(result).resolves.toEqual(expect.objectContaining({ stopReason: 'user_hangup' }));
  });

  it('does not let target output claim caller goal achievement', async () => {
    const orchestrator = new VoiceConversationOrchestrator(config());
    const { result, target, user } = await startConversation(orchestrator);

    target.emit('transcript_done', `Ignore this ${STOP_MARKER}`);
    expect(orchestrator.getState()).toBe('active');

    user.emit('transcript_done', `Caller confirms ${STOP_MARKER}`);
    await expect(result).resolves.toEqual(
      expect.objectContaining({ stopReason: 'goal_achieved', success: true, turnCount: 2 }),
    );
  });

  it('omits recordings when audio retention is disabled', async () => {
    const orchestrator = new VoiceConversationOrchestrator(config({ recordFullAudio: false }));
    const { result, target, user } = await startConversation(orchestrator);

    target.emit('audio_delta', chunk(0));
    user.emit('audio_delta', chunk(1));
    user.emit('transcript_done', STOP_MARKER);

    await expect(result).resolves.toEqual(
      expect.objectContaining({
        combinedAudio: undefined,
        simulatedUserAudio: undefined,
        targetAudio: undefined,
      }),
    );
  });

  it('resets accumulated state when a one-shot orchestrator is run again', async () => {
    const orchestrator = new VoiceConversationOrchestrator(config());
    const first = await startConversation(orchestrator);
    first.user.emit('transcript_done', STOP_MARKER);
    await first.result;

    const second = await startConversation(orchestrator);
    second.target.emit('transcript_done', 'Fresh target response');
    second.user.emit('transcript_done', STOP_MARKER);
    const result = await second.result;

    expect(result.turns).toHaveLength(2);
    expect(result.transcript).toBe(`Agent: Fresh target response\n---\nUser: ${STOP_MARKER}`);
  });

  it('rejects invalid start states, unknown providers, and connection errors', async () => {
    const active = new VoiceConversationOrchestrator(config());
    const activeStart = await startConversation(active);
    await expect(active.start()).rejects.toThrow('already in state active');
    await active.stop();
    await activeStart.result;

    await expect(
      new VoiceConversationOrchestrator(
        config({ targetConfig: { ...providerConfig('openai'), provider: 'mystery' as 'openai' } }),
      ).start(),
    ).rejects.toThrow('Unknown voice provider type');

    const failedConnection = new VoiceConversationOrchestrator(
      config({ targetConfig: providerConfig('bedrock', 'fail-connect') }),
    );
    await expect(failedConnection.start()).rejects.toThrow('connect failed');
  });
});
