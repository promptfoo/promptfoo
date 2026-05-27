import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';

const { providerMocks } = vi.hoisted(() => {
  class MockOrchestrator {
    static instances: MockOrchestrator[] = [];
    config: unknown;
    listeners = new Map<string, Array<(...args: any[]) => void>>();
    start = vi.fn(() => providerMocks.start(this));
    stop = vi.fn(async () => {});

    constructor(config: unknown) {
      this.config = config;
      MockOrchestrator.instances.push(this);
    }

    on(event: string, listener: (...args: any[]) => void): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }

    emit(event: string, value: unknown): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(value);
      }
    }
  }

  return {
    providerMocks: {
      cloud: {
        getApiHost: vi.fn(() => 'https://cloud.example.test'),
        getApiKey: vi.fn<() => string | undefined>(() => 'cloud-key'),
        isEnabled: vi.fn(() => false),
      },
      fetchWithProxy: vi.fn(),
      MockOrchestrator,
      start: vi.fn(),
    },
  };
});

vi.mock('../../../src/globalConfig/cloud', () => ({
  CLOUD_API_HOST: 'https://api.promptfoo.app',
  cloudConfig: providerMocks.cloud,
}));
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: providerMocks.fetchWithProxy,
}));
vi.mock('../../../src/providers/voice/orchestrator', () => ({
  VoiceConversationOrchestrator: providerMocks.MockOrchestrator,
}));

import { SimulatedVoiceUser } from '../../../src/providers/voice/simulatedVoiceUser';

import type {
  SimulatedVoiceUserConfig,
  VoiceProviderConfig,
} from '../../../src/providers/voice/types';

type VoiceConfigBuilder = {
  buildTurnDetectionConfig: () => {
    silenceThresholdMs: number;
    vadThreshold: number;
    minTurnDurationMs: number;
    maxTurnDurationMs: number;
    prefixPaddingMs: number;
  };
  buildTargetConfig: (instructions: string) => VoiceProviderConfig;
  buildSimulatedUserConfig: (instructions: string) => VoiceProviderConfig;
};

function createConfigBuilder(config: SimulatedVoiceUserConfig): VoiceConfigBuilder {
  return new SimulatedVoiceUser({ config }) as unknown as VoiceConfigBuilder;
}

describe('SimulatedVoiceUser', () => {
  beforeEach(() => {
    providerMocks.MockOrchestrator.instances.length = 0;
    providerMocks.start.mockReset();
    providerMocks.fetchWithProxy.mockReset();
    providerMocks.cloud.isEnabled.mockReturnValue(false);
    providerMocks.cloud.getApiHost.mockReturnValue('https://cloud.example.test');
    providerMocks.cloud.getApiKey.mockReturnValue('cloud-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses provider identity defaults and overrides', () => {
    expect(new SimulatedVoiceUser({}).id()).toBe('simulated-voice-user');
    expect(new SimulatedVoiceUser({ label: 'labelled' }).toString()).toBe(
      '[SimulatedVoiceUser labelled]',
    );
    expect(new SimulatedVoiceUser({ id: 'voice-id' }).id()).toBe('voice-id');
  });

  it('lets selected connections resolve their provider-specific API key env vars', () => {
    vi.stubEnv('OPENAI_API_KEY', 'openai-env-key');
    vi.stubEnv('GOOGLE_API_KEY', 'google-env-key');
    const builder = createConfigBuilder({
      targetProvider: 'google',
      simulatedUserProvider: 'google',
    });

    const targetConfig = builder.buildTargetConfig('agent instructions');
    const simulatedUserConfig = builder.buildSimulatedUserConfig('caller goal');

    expect(targetConfig.apiKey).toBeUndefined();
    expect(simulatedUserConfig.apiKey).toBeUndefined();
    expect(targetConfig.voice).toBeUndefined();
    expect(simulatedUserConfig.voice).toBeUndefined();
    expect(targetConfig.turnDetection).toBeUndefined();
    expect(simulatedUserConfig.turnDetection).toBeUndefined();
  });

  it('passes explicit target and simulated user API keys through to connections', () => {
    const builder = createConfigBuilder({
      targetApiKey: 'target-key',
      simulatedUserApiKey: 'caller-key',
    });

    expect(builder.buildTargetConfig('agent instructions').apiKey).toBe('target-key');
    expect(builder.buildSimulatedUserConfig('caller goal').apiKey).toBe('caller-key');
  });

  it('preserves zero-valued turn detection settings', () => {
    const builder = createConfigBuilder({
      silenceThresholdMs: 0,
      vadThreshold: 0,
      minTurnDurationMs: 0,
      maxTurnDurationMs: 0,
      prefixPaddingMs: 0,
    });

    expect(builder.buildTurnDetectionConfig()).toEqual(
      expect.objectContaining({
        silenceThresholdMs: 0,
        vadThreshold: 0,
        minTurnDurationMs: 0,
        maxTurnDurationMs: 0,
        prefixPaddingMs: 0,
      }),
    );
  });

  it('uses an audible local VAD threshold by default', () => {
    expect(createConfigBuilder({}).buildTurnDetectionConfig().vadThreshold).toBe(0.02);
  });

  it('runs local orchestrated conversations and formats stereo audio output', async () => {
    const debug = vi.spyOn(logger, 'debug');
    const callerGoal = 'private account 0000111122223333 for {{ name }}';
    providerMocks.start.mockImplementation((orchestrator) => {
      orchestrator.emit('state_change', 'active');
      orchestrator.emit('turn_complete', { speaker: 'agent', text: 'sensitive transcript 5555' });
      orchestrator.emit('error', new Error('logged only'));
      return {
        combinedAudio: Buffer.from('stereo'),
        duration: 45,
        metadata: {
          simulatedUserProvider: 'google',
          targetProvider: 'openai',
        },
        simulatedUserAudio: Buffer.from('user'),
        stopReason: 'goal_achieved',
        success: true,
        targetAudio: Buffer.from('target'),
        transcript: 'Assistant: Hello',
        turnCount: 2,
        turns: [
          { speaker: 'agent', text: 'Hello' },
          { speaker: 'user', text: 'Thanks' },
        ],
      };
    });

    const provider = new SimulatedVoiceUser({
      config: {
        instructions: callerGoal,
        simulatedUserProvider: 'google',
        targetModel: 'gpt-realtime',
        targetProvider: 'openai',
      },
    });
    const result = await provider.callApi('Target prompt', {
      prompt: { raw: 'Target prompt', display: 'Target prompt', label: 'target' },
      vars: { name: 'Ari' },
    });

    expect(providerMocks.MockOrchestrator.instances[0].config).toEqual(
      expect.objectContaining({
        simulatedUserConfig: expect.objectContaining({
          instructions: expect.stringContaining('private account 0000111122223333 for Ari'),
          provider: 'google',
        }),
        targetConfig: expect.objectContaining({
          instructions: 'Target prompt',
          model: 'gpt-realtime',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        audio: { data: Buffer.from('stereo').toString('base64'), format: 'wav' },
        metadata: expect.objectContaining({
          success: true,
          audioTracks: {
            combined: 'stereo (left=agent, right=user)',
            targetOnly: 'mono (agent only)',
            userOnly: 'mono (user only)',
          },
        }),
        output: 'Assistant: Hello\n---\nUser: Thanks',
      }),
    );
    expect(JSON.stringify(debug.mock.calls)).not.toContain('0000111122223333');
    expect(JSON.stringify(debug.mock.calls)).not.toContain('sensitive transcript 5555');
  });

  it('rejects compressed local audio when a non-OpenAI endpoint is selected', async () => {
    await expect(
      new SimulatedVoiceUser({
        config: {
          audioFormat: 'g711_ulaw',
          simulatedUserProvider: 'google',
        },
      }).callApi('Target prompt'),
    ).resolves.toEqual({
      error:
        'g711_ulaw audio is supported only when both local voice endpoints use OpenAI. Use pcm16 with Google Live or Amazon Nova Sonic.',
    });
    expect(providerMocks.start).not.toHaveBeenCalled();
  });

  it('uses the fixed 8 kHz rate for local OpenAI G.711 audio', () => {
    const builder = createConfigBuilder({ audioFormat: 'g711_ulaw', sampleRate: 24000 });

    expect(builder.buildTargetConfig('agent instructions').sampleRate).toBe(8000);
    expect(builder.buildSimulatedUserConfig('caller goal').sampleRate).toBe(8000);
  });

  it('rejects local conversations where neither Bedrock endpoint can initiate audio', async () => {
    await expect(
      new SimulatedVoiceUser({
        config: {
          targetProvider: 'bedrock',
          simulatedUserProvider: 'bedrock',
        },
      }).callApi('Target prompt'),
    ).resolves.toEqual({
      error:
        'Local Amazon Nova Sonic conversations require at least one non-Bedrock endpoint to initiate an audio turn.',
    });
    expect(providerMocks.start).not.toHaveBeenCalled();
  });

  it('uses caller-first startup for local Bedrock targets and honors recording opt-out', async () => {
    providerMocks.start.mockResolvedValue({
      combinedAudio: Buffer.from('stereo'),
      duration: 1,
      stopReason: 'goal_achieved',
      success: true,
      transcript: '',
      turnCount: 0,
      turns: [],
    });

    const result = await new SimulatedVoiceUser({
      config: {
        recordConversation: false,
        targetProvider: 'bedrock',
      },
    }).callApi('Target prompt');

    expect(providerMocks.MockOrchestrator.instances[0].config).toEqual(
      expect.objectContaining({
        recordFullAudio: false,
        targetSpeaksFirst: false,
      }),
    );
    expect(result.audio).toBeUndefined();
    expect(result.metadata).toEqual(expect.objectContaining({ audioTracks: undefined }));
  });

  it('uses the instructions test variable for caller goals by default', async () => {
    providerMocks.start.mockResolvedValue({
      duration: 1,
      stopReason: 'goal_achieved',
      success: true,
      transcript: '',
      turnCount: 0,
      turns: [],
    });

    await new SimulatedVoiceUser({}).callApi('Target prompt', {
      prompt: { raw: 'Target prompt', display: 'Target prompt', label: 'target' },
      vars: { instructions: 'Caller should ask about their balance.' },
    });

    expect(providerMocks.MockOrchestrator.instances[0].config).toEqual(
      expect.objectContaining({
        simulatedUserConfig: expect.objectContaining({
          instructions: expect.stringContaining('Caller should ask about their balance.'),
        }),
        targetConfig: expect.objectContaining({
          instructions: 'Target prompt',
        }),
      }),
    );
  });

  it('returns local orchestrator errors', async () => {
    providerMocks.start.mockRejectedValue(new Error('local failed'));

    await expect(new SimulatedVoiceUser({}).callApi('Target prompt')).resolves.toEqual({
      error: 'local failed',
    });
  });

  it('stops an active local conversation when its abort signal is cancelled', async () => {
    const controller = new AbortController();
    let resolveStart: ((value: any) => void) | undefined;
    providerMocks.start.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );

    const result = new SimulatedVoiceUser({}).callApi('Target prompt', undefined, {
      abortSignal: controller.signal,
    } as any);
    await vi.waitFor(() => {
      expect(providerMocks.MockOrchestrator.instances).toHaveLength(1);
    });

    controller.abort();

    await expect(result).resolves.toEqual({ error: 'Voice conversation aborted' });
    expect(providerMocks.MockOrchestrator.instances[0].stop).toHaveBeenCalledWith('user_hangup');
    resolveStart?.({
      duration: 0,
      stopReason: 'user_hangup',
      success: false,
      transcript: '',
      turnCount: 0,
      turns: [],
    });
  });

  it('uses the cloud voice-tau endpoint and formats remote mono audio', async () => {
    providerMocks.cloud.isEnabled.mockReturnValue(true);
    providerMocks.fetchWithProxy.mockResolvedValue(
      new Response(
        JSON.stringify({
          duration: 12,
          metadata: { targetProvider: 'bedrock', simulatedUserProvider: 'openai' },
          simulatedUserAudio: 'user-audio',
          stopReason: 'max_turns',
          success: false,
          targetAudio: 'target-audio',
          transcript: 'remote',
          turnCount: 1,
          turns: [{ speaker: 'agent', text: 'Remote greeting' }],
        }),
        { status: 200 },
      ),
    );

    const result = await new SimulatedVoiceUser({
      config: {
        audioFormat: 'pcm16',
        maxTurns: 4,
        targetProvider: 'bedrock',
        targetSpeaksFirst: false,
      },
    }).callApi('Target prompt');

    expect(providerMocks.fetchWithProxy).toHaveBeenCalledWith(
      'https://cloud.example.test/api/v1/task',
      expect.objectContaining({
        body: expect.stringContaining('"task":"voice-tau"'),
        headers: expect.objectContaining({
          Authorization: 'Bearer cloud-key',
          'x-promptfoo-silent': 'true',
        }),
        method: 'POST',
      }),
      expect.any(AbortSignal),
    );
    const remoteRequest = providerMocks.fetchWithProxy.mock.calls[0]?.[1] as RequestInit;
    const remoteBody = JSON.parse(String(remoteRequest.body));
    expect(remoteBody.simulatedUserInstructions).toContain('You are simulating a user');
    expect(remoteBody.simulatedUserInstructions).toContain('###STOP###');
    expect(result).toEqual(
      expect.objectContaining({
        audio: { data: 'target-audio', format: 'wav' },
        metadata: expect.objectContaining({
          audioTracks: {
            combined: undefined,
            targetOnly: 'mono (agent only)',
            userOnly: 'mono (user only)',
          },
          stopReason: 'max_turns',
        }),
        output: 'Assistant: Remote greeting',
      }),
    );
  });

  it('returns a clear remote error when no cloud token is configured', async () => {
    providerMocks.cloud.isEnabled.mockReturnValue(true);
    providerMocks.cloud.getApiKey.mockReturnValue(undefined);

    await expect(new SimulatedVoiceUser({}).callApi('Target prompt')).resolves.toEqual({
      error:
        'Remote voice-tau requires Promptfoo Cloud authentication. Run `promptfoo auth login` or set PROMPTFOO_API_KEY.',
    });
    expect(providerMocks.fetchWithProxy).not.toHaveBeenCalled();
  });

  it('does not log remote response bodies and reports remote transport failures', async () => {
    providerMocks.cloud.isEnabled.mockReturnValue(true);
    const error = vi.spyOn(logger, 'error');
    providerMocks.fetchWithProxy.mockResolvedValueOnce(
      new Response('private caller goal sentinel', { status: 502 }),
    );
    providerMocks.fetchWithProxy.mockRejectedValueOnce(new Error('network down'));

    await expect(new SimulatedVoiceUser({}).callApi('Target prompt')).resolves.toEqual({
      error: 'Remote voice-tau failed: 502 private caller goal sentinel',
    });
    await expect(new SimulatedVoiceUser({}).callApi('Target prompt')).resolves.toEqual({
      error: 'network down',
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain('private caller goal sentinel');
  });

  it('keeps conversations local when remote generation is disabled', async () => {
    vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true');
    providerMocks.cloud.isEnabled.mockReturnValue(true);
    providerMocks.start.mockResolvedValue({
      duration: 1,
      stopReason: 'goal_achieved',
      success: true,
      transcript: '',
      turnCount: 0,
      turns: [],
    });

    await new SimulatedVoiceUser({}).callApi('Target prompt');

    expect(providerMocks.fetchWithProxy).not.toHaveBeenCalled();
    expect(providerMocks.start).toHaveBeenCalled();
  });

  it('does not activate remote voice execution from API_HOST alone', async () => {
    vi.stubEnv('API_HOST', 'https://untrusted.example.test');
    providerMocks.start.mockResolvedValue({
      duration: 1,
      stopReason: 'goal_achieved',
      success: true,
      transcript: '',
      turnCount: 0,
      turns: [],
    });

    await new SimulatedVoiceUser({}).callApi('Target prompt');

    expect(providerMocks.fetchWithProxy).not.toHaveBeenCalled();
    expect(providerMocks.start).toHaveBeenCalled();
  });
});
