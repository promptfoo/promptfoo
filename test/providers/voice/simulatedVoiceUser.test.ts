import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { providerMocks } = vi.hoisted(() => {
  class MockOrchestrator {
    static instances: MockOrchestrator[] = [];
    config: unknown;
    listeners = new Map<string, Array<(...args: any[]) => void>>();
    start = vi.fn(() => providerMocks.start(this));

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
        getApiKey: vi.fn(() => 'cloud-key'),
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

  it('runs local orchestrated conversations and formats stereo audio output', async () => {
    providerMocks.start.mockImplementation((orchestrator) => {
      orchestrator.emit('state_change', 'active');
      orchestrator.emit('turn_complete', { speaker: 'agent', text: 'hello'.repeat(30) });
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
        instructions: 'Caller goal for {{ name }}',
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
          instructions: expect.stringContaining('Caller goal for Ari'),
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
        headers: expect.objectContaining({ Authorization: 'Bearer cloud-key' }),
        method: 'POST',
      }),
    );
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

  it('uses API_HOST for remote errors and reports remote transport failures', async () => {
    vi.stubEnv('API_HOST', 'https://alt.example.test');
    providerMocks.fetchWithProxy.mockResolvedValueOnce(new Response('bad target', { status: 502 }));
    providerMocks.fetchWithProxy.mockRejectedValueOnce(new Error('network down'));

    await expect(new SimulatedVoiceUser({}).callApi('Target prompt')).resolves.toEqual({
      error: 'Remote voice-tau failed: 502 bad target',
    });
    await expect(new SimulatedVoiceUser({}).callApi('Target prompt')).resolves.toEqual({
      error: 'network down',
    });
  });
});
