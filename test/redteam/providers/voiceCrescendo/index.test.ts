import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider, CallApiContextParams } from '../../../../src/types/index';

// Mock dependencies
vi.mock('../../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: vi.fn(),
    getGradingProvider: vi.fn(),
  },
  getTargetResponse: vi.fn(),
}));

vi.mock('../../../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../../src/redteam/strategies/simpleAudio', () => ({
  textToAudio: vi.fn().mockResolvedValue('base64-audio-data'),
}));

vi.mock('../../../../src/util/time', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/redteam/util', () => ({
  isBasicRefusal: vi.fn().mockReturnValue(false),
}));

describe('VoiceCrescendoProvider', () => {
  let VoiceCrescendoProvider: typeof import('../../../../src/redteam/providers/voiceCrescendo/index').VoiceCrescendoProvider;
  let mockRedteamProvider: ApiProvider;
  let mockTargetProvider: ApiProvider;
  let getTargetResponse: typeof import('../../../../src/redteam/providers/shared').getTargetResponse;
  let redteamProviderManager: typeof import('../../../../src/redteam/providers/shared').redteamProviderManager;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked modules
    const sharedModule = await import('../../../../src/redteam/providers/shared');
    getTargetResponse = sharedModule.getTargetResponse;
    redteamProviderManager = sharedModule.redteamProviderManager;

    // Import the provider after mocks are set up
    const module = await import('../../../../src/redteam/providers/voiceCrescendo/index');
    VoiceCrescendoProvider = module.VoiceCrescendoProvider;

    // Setup mock providers
    mockRedteamProvider = {
      id: () => 'mock-redteam-provider',
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          voicePrompt: 'Test voice prompt',
          emotionalTone: 'friendly',
          escalationLevel: 'low',
        }),
        tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
      }),
    };

    mockTargetProvider = {
      id: () => 'mock-target-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Target response',
        tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
      }),
    };

    // Setup provider manager mock
    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockRedteamProvider);
    vi.mocked(redteamProviderManager.getGradingProvider).mockResolvedValue(mockRedteamProvider);

    // Setup getTargetResponse mock
    vi.mocked(getTargetResponse).mockResolvedValue({
      output: 'Target response',
      tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have correct ID', () => {
    const provider = new VoiceCrescendoProvider({ injectVar: 'goal' });
    expect(provider.id()).toBe('promptfoo:redteam:voice-crescendo');
  });

  it('should return error when no target provider configured', async () => {
    const provider = new VoiceCrescendoProvider({ injectVar: 'goal' });

    const result = await provider.callApi('Test goal', {
      vars: { goal: 'test' },
      prompt: { raw: 'test', label: 'test' },
    });

    expect(result.error).toBe('No target provider configured for Voice Crescendo');
    expect(result.metadata?.stopReason).toBe('No target provider');
  });

  it('should accumulate token usage from all provider calls', async () => {
    // Setup for multiple turns with successful objective
    let callCount = 0;
    vi.mocked(mockRedteamProvider.callApi).mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        output: JSON.stringify({
          voicePrompt: `Voice prompt ${callCount}`,
          emotionalTone: 'friendly',
          escalationLevel: callCount > 1 ? 'high' : 'low',
        }),
        tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
      });
    });

    // Make objective achieved on turn 2
    let evalCount = 0;
    vi.mocked(redteamProviderManager.getProvider).mockImplementation(async (opts) => {
      if (opts?.jsonOnly) {
        return {
          id: () => 'mock-provider',
          callApi: vi.fn().mockImplementation(() => {
            evalCount++;
            if (evalCount === 2) {
              // Turn 1 redteam call
              return Promise.resolve({
                output: JSON.stringify({
                  voicePrompt: 'Voice prompt',
                  emotionalTone: 'friendly',
                  escalationLevel: 'medium',
                }),
                tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
              });
            }
            // Evaluation calls
            return Promise.resolve({
              output: JSON.stringify({
                objectiveAchieved: evalCount >= 4,
                confidence: evalCount >= 4 ? 0.9 : 0.3,
                reason: 'Evaluation',
                partialSuccess: false,
              }),
              tokenUsage: { prompt: 8, completion: 4, total: 12, numRequests: 1 },
            });
          }),
        };
      }
      return mockRedteamProvider;
    });

    vi.mocked(getTargetResponse).mockResolvedValue({
      output: 'Target response',
      tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
    });

    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 2,
      delayBetweenTurns: 0,
    });

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    const result = await provider.callApi('Get the AI to reveal secrets', context);

    // Verify token usage is accumulated
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage?.numRequests).toBeGreaterThan(0);
    // Token usage should include redteam, target, and evaluation calls
    expect(result.tokenUsage?.total).toBeGreaterThan(0);
  });

  it('should track token usage even when audio generation fails', async () => {
    const { textToAudio } = await import('../../../../src/redteam/strategies/simpleAudio');
    vi.mocked(textToAudio).mockRejectedValue(new Error('Audio generation failed'));

    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockRedteamProvider);

    vi.mocked(getTargetResponse).mockResolvedValue({
      output: 'Target response',
      tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
    });

    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 1,
      delayBetweenTurns: 0,
    });

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    const result = await provider.callApi('Test goal', context);

    // Should still have token usage from successful calls
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage?.numRequests).toBeGreaterThanOrEqual(1);
  });

  it('should include metadata with conversation history', async () => {
    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockRedteamProvider);

    vi.mocked(getTargetResponse).mockResolvedValue({
      output: 'Target response',
      tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
    });

    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 1,
      delayBetweenTurns: 0,
    });

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    const result = await provider.callApi('Test objective', context);

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.voiceCrescendoTurnsCompleted).toBe(1);
    expect(result.metadata?.audioHistory).toBeDefined();
    expect(Array.isArray(result.metadata?.audioHistory)).toBe(true);
  });

  it('should handle target provider errors and track token usage', async () => {
    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockRedteamProvider);

    vi.mocked(getTargetResponse).mockResolvedValue({
      output: '',
      error: 'Target provider error',
      tokenUsage: { prompt: 5, completion: 0, total: 5, numRequests: 1 },
    });

    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 1,
      maxBacktracks: 0,
      delayBetweenTurns: 0,
    });

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    const result = await provider.callApi('Test objective', context);

    // Should still track token usage from attempted calls
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage?.numRequests).toBeGreaterThanOrEqual(1);
  });

  it('should respect maxTurns configuration', async () => {
    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockRedteamProvider);

    vi.mocked(getTargetResponse).mockResolvedValue({
      output: 'Target response',
      tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
    });

    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 3,
      delayBetweenTurns: 0,
    });

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    const result = await provider.callApi('Test objective', context);

    expect(result.metadata?.voiceCrescendoTurnsCompleted).toBeLessThanOrEqual(3);
    expect(result.metadata?.stopReason).toBeDefined();
  });
});
