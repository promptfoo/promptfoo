import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvString } from '../../../src/envars';
import { sanitizeProvider } from '../../../src/models/evalResult';
import { providerRegistry } from '../../../src/providers/providerRegistry';
import { sanitizeConfigForOutput } from '../../../src/util/sanitizer';
import { mockProcessEnv } from '../../util/utils';

const { mocks } = vi.hoisted(() => {
  class MockOrchestrator {
    static instances: MockOrchestrator[] = [];
    start = vi.fn(async () => mocks.start(this));
    stop = vi.fn(async (_reason?: string) => {});
    on = vi.fn();
    constructor(public config: any) {
      MockOrchestrator.instances.push(this);
    }
  }
  return { mocks: { MockOrchestrator, start: vi.fn() } };
});
vi.mock('../../../src/providers/voice/orchestrator', () => ({
  VoiceConversationOrchestrator: mocks.MockOrchestrator,
}));

import { SimulatedVoiceUser } from '../../../src/providers/voice/simulatedVoiceUser';

import type { ConversationResult } from '../../../src/providers/voice/types';

function result(overrides: Partial<ConversationResult> = {}): ConversationResult {
  return {
    success: true,
    stopReason: 'goal_achieved',
    transcript: 'Hello',
    turns: [
      { speaker: 'agent', text: 'Hello' },
      { speaker: 'user', text: 'Thanks ###STOP###' },
    ],
    turnCount: 2,
    duration: 1000,
    combinedAudio: Buffer.from('fixture audio'),
    tokenUsage: { prompt: 15, completion: 12, total: 27, numRequests: 2 },
    ...overrides,
  };
}

describe('SimulatedVoiceUser', () => {
  beforeEach(() => {
    mocks.MockOrchestrator.instances.length = 0;
    mocks.start.mockReset().mockResolvedValue(result());
  });
  afterEach(async () => {
    await providerRegistry.shutdownAll();
    vi.restoreAllMocks();
  });

  it('uses provider identity defaults and overrides', () => {
    expect(new SimulatedVoiceUser({}).id()).toBe('promptfoo:simulated-voice-user');
    expect(new SimulatedVoiceUser({ label: 'caller' }).id()).toBe('caller');
    expect(new SimulatedVoiceUser({ id: 'voice' }).toString()).toBe('[SimulatedVoiceUser voice]');
  });

  it('preserves programmatic provider settings in the saved provider config', () => {
    const settings = {
      maxTurns: 3,
      recordConversation: false,
      targetVoice: 'alloy',
      sampleRate: 16000,
      targetModel: 'fixture-model',
    };
    const saved = sanitizeProvider(new SimulatedVoiceUser({ config: settings }));
    expect(saved).toMatchObject({ id: 'promptfoo:simulated-voice-user', config: settings });
    const restored = new SimulatedVoiceUser(saved);
    expect(restored.config).toEqual(saved.config);
  });

  it('renders caller goals, preserves explicit keys, and reports transcript, audio and usage', async () => {
    const provider = new SimulatedVoiceUser({
      config: {
        targetApiKey: 'target-fixture',
        simulatedUserApiKey: 'caller-fixture',
        targetSpeaksFirst: false,
        silenceThresholdMs: 0,
      },
    });
    const response = await provider.callApi('Agent instructions', {
      vars: { instructions: 'Order soup' },
    } as any);
    const config = mocks.MockOrchestrator.instances[0].config;
    expect(config.targetConfig).toMatchObject({
      provider: 'openai',
      apiKey: 'target-fixture',
      voice: 'alloy',
      instructions: 'Agent instructions',
    });
    expect(config.simulatedUserConfig).toMatchObject({
      provider: 'openai',
      apiKey: 'caller-fixture',
      voice: 'echo',
    });
    expect(config.simulatedUserConfig.instructions).toContain('Order soup');
    expect(config.targetConfig.turnDetection).toBeUndefined();
    expect(config.targetSpeaksFirst).toBe(false);
    expect(config.turnDetection.silenceThresholdMs).toBe(0);
    expect(response).toMatchObject({
      output: 'Assistant: Hello\n---\nUser: Thanks ###STOP###',
      tokenUsage: result().tokenUsage,
      audio: { format: 'wav', transcript: 'Assistant: Hello\n---\nUser: Thanks ###STOP###' },
    });
    expect(Buffer.from(response.audio!.data!, 'base64').toString()).toBe('fixture audio');
  });

  it('redacts both voice credentials in saved and exported provider config', () => {
    const config = {
      targetApiKey: 'ek_target_fixture',
      simulatedUserApiKey: 'ek_caller_fixture',
      targetVoice: 'alloy',
    };
    const saved = sanitizeProvider(new SimulatedVoiceUser({ config }));
    const exported = sanitizeConfigForOutput({
      providers: [{ id: 'promptfoo:simulated-voice-user', config }],
    });
    const redactedProvider = {
      config: {
        targetApiKey: '[REDACTED]',
        simulatedUserApiKey: '[REDACTED]',
        targetVoice: 'alloy',
      },
    };
    expect(saved).toMatchObject(redactedProvider);
    expect(exported).toMatchObject({ providers: [redactedProvider] });
    expect(config.targetApiKey).toBe('ek_target_fixture');
  });

  it('keeps provider-specific credentials isolated during concurrent calls', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-fixture' });
    const seen: string[] = [];
    mocks.start.mockImplementation(async () => {
      await Promise.resolve();
      seen.push(getEnvString('OPENAI_API_KEY') ?? '');
      return result();
    });
    await Promise.all([
      new SimulatedVoiceUser({ env: { OPENAI_API_KEY: 'scoped-fixture' } }).callApi('one'),
      new SimulatedVoiceUser({ env: { OPENAI_API_KEY: '' } }).callApi('two'),
    ]);
    expect(seen.sort()).toEqual(['', 'scoped-fixture']);
    expect(getEnvString('OPENAI_API_KEY')).toBe('ambient-fixture');
  });

  it.each(['google', 'bedrock', 'unknown'])(
    'rejects unsupported endpoint %s before connecting',
    async (endpoint) => {
      const response = await new SimulatedVoiceUser({
        config: { targetProvider: endpoint as 'openai' },
      }).callApi('Agent');
      expect(response.error).toContain('OpenAI Realtime endpoints only');
      expect(mocks.start).not.toHaveBeenCalled();
    },
  );

  it('keeps G.711 recordings at 8 kHz and omits audio when recording is disabled', async () => {
    const response = await new SimulatedVoiceUser({
      config: { audioFormat: 'g711_ulaw', sampleRate: 16000, recordConversation: false },
    }).callApi('Agent');
    expect(mocks.MockOrchestrator.instances[0].config.targetConfig.sampleRate).toBe(8000);
    expect(response.audio).toBeUndefined();
  });

  it.each(['wav', '', 'mp3'])(
    'rejects unsupported audio format %j before connecting',
    async (format) => {
      const response = await new SimulatedVoiceUser({
        config: { audioFormat: format as 'pcm16' },
      }).callApi('Agent');
      expect(response.error).toContain('audioFormat must be pcm16, g711_ulaw, or g711_alaw');
      expect(mocks.MockOrchestrator.instances).toHaveLength(0);
    },
  );

  it('retains partial transcript and usage when a response fails', async () => {
    mocks.start.mockResolvedValue(
      result({ success: false, stopReason: 'error', error: 'terminal failure' }),
    );
    const response = await new SimulatedVoiceUser({}).callApi('Agent');
    expect(response).toMatchObject({ error: 'terminal failure', tokenUsage: result().tokenUsage });
    expect(response.output).toContain('Assistant: Hello');
  });

  it('reports connection failures', async () => {
    mocks.start.mockRejectedValue(new Error('connection failed'));
    expect(await new SimulatedVoiceUser({}).callApi('Agent')).toEqual({
      error: 'connection failed',
    });
  });

  it.each([-1, 0, 1.5, Number.NaN, 192001])(
    'rejects invalid recording rate %s before setup',
    async (sampleRate) => {
      const response = await new SimulatedVoiceUser({ config: { sampleRate } }).callApi('Agent');
      expect(response.error).toContain('sampleRate must be a positive integer');
      expect(mocks.start).not.toHaveBeenCalled();
    },
  );

  describe.each(['maxTurns', 'timeoutMs'] as const)('%s validation', (setting) => {
    it.each([0, -1, 1.5, Number.NaN, Infinity, '10', null])(
      'rejects %j before creating a connection',
      async (value) => {
        const response = await new SimulatedVoiceUser({
          config: { [setting]: value },
        }).callApi('Agent');
        expect(response.error).toContain(`${setting} must be a positive integer`);
        expect(mocks.MockOrchestrator.instances).toHaveLength(0);
      },
    );

    it('preserves a positive integer', async () => {
      await new SimulatedVoiceUser({ config: { [setting]: 12 } }).callApi('Agent');
      expect(mocks.MockOrchestrator.instances[0].config[setting]).toBe(12);
    });
  });

  it('uses bounded defaults for omitted limits', async () => {
    await new SimulatedVoiceUser({
      config: { maxTurns: undefined, timeoutMs: undefined },
    }).callApi('Agent');
    expect(mocks.MockOrchestrator.instances[0].config).toMatchObject({
      maxTurns: 10,
      timeoutMs: 120000,
    });
  });

  it('reports a setup timeout as an error when no turn completed', async () => {
    mocks.start.mockResolvedValue(
      result({ success: false, stopReason: 'timeout', turns: [], turnCount: 0 }),
    );
    expect(await new SimulatedVoiceUser({}).callApi('Agent')).toMatchObject({
      error: 'Voice conversation timed out before a turn completed',
      output: '',
    });
  });

  it('stops every active conversation during evaluator cleanup', async () => {
    mocks.start.mockImplementation(
      (orchestrator) =>
        new Promise((resolve) => {
          orchestrator.stop.mockImplementation(async () => {
            resolve(result({ success: false, stopReason: 'user_hangup' }));
          });
        }),
    );
    const provider = new SimulatedVoiceUser({});
    const first = provider.callApi('one');
    const second = provider.callApi('two');
    await providerRegistry.shutdownAll();
    for (const response of await Promise.all([first, second])) {
      expect(response.error).toBe('Voice conversation aborted');
    }
    for (const orchestrator of mocks.MockOrchestrator.instances) {
      expect(orchestrator.stop).toHaveBeenCalledOnce();
    }
  });

  it('stops a conversation on abort and skips already-aborted calls', async () => {
    mocks.start.mockImplementation(
      (orchestrator) =>
        new Promise((resolve) => {
          orchestrator.stop.mockImplementation(async () => {
            resolve(result({ success: false, stopReason: 'user_hangup' }));
          });
        }),
    );
    const controller = new AbortController();
    const provider = new SimulatedVoiceUser({});
    const pending = provider.callApi('one', undefined, { abortSignal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({
      error: 'Voice conversation aborted',
      tokenUsage: result().tokenUsage,
    });
    expect(mocks.MockOrchestrator.instances[0].stop).toHaveBeenCalledOnce();
    await provider.callApi('two', undefined, { abortSignal: controller.signal });
    expect(mocks.start).toHaveBeenCalledOnce();
  });
});
