import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
