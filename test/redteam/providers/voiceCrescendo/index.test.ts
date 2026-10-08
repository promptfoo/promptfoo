import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sleep } from '../../../../src/util/time';
import {
  createMockProvider,
  createProviderResponse,
  type MockApiProvider,
} from '../../../factories/provider';

import type { AtomicTestCase, CallApiContextParams } from '../../../../src/types/index';

// Mock dependencies
vi.mock('../../../../src/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/logger')>()),
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/redteam/providers/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/redteam/providers/shared')>()),
  callGradingProvider: vi.fn((provider, prompt, context, options) =>
    options === undefined
      ? provider.callApi(prompt, context)
      : provider.callApi(prompt, context, options),
  ),
  redteamProviderManager: {
    getProvider: vi.fn(),
    getGradingProvider: vi.fn(),
  },
  getTargetResponse: vi.fn(),
  externalizeResponseForRedteamHistory: vi.fn(async (response: unknown) => response),
}));

vi.mock('../../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/redteam/remoteGeneration')>()),
  shouldGenerateRemote: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../../src/redteam/strategies/simpleAudio', () => ({
  textToAudio: vi.fn().mockResolvedValue('base64-audio-data'),
}));

vi.mock('../../../../src/util/time', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/util/time')>()),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/redteam/util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/redteam/util')>()),
  isBasicRefusal: vi.fn().mockReturnValue(false),
}));

describe('VoiceCrescendoProvider', () => {
  let VoiceCrescendoProvider: typeof import('../../../../src/redteam/providers/voiceCrescendo/index').VoiceCrescendoProvider;
  let mockRedteamProvider: MockApiProvider;
  let mockTargetProvider: MockApiProvider;
  let getTargetResponse: typeof import('../../../../src/redteam/providers/shared').getTargetResponse;
  let redteamProviderManager: typeof import('../../../../src/redteam/providers/shared').redteamProviderManager;
  const mockedSleep = vi.mocked(sleep);

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedSleep.mockReset();
    mockedSleep.mockResolvedValue(undefined);

    // Import mocked modules
    const sharedModule = await import('../../../../src/redteam/providers/shared');
    getTargetResponse = sharedModule.getTargetResponse;
    redteamProviderManager = sharedModule.redteamProviderManager;

    // Import the provider after mocks are set up
    const module = await import('../../../../src/redteam/providers/voiceCrescendo/index');
    VoiceCrescendoProvider = module.VoiceCrescendoProvider;

    // Setup mock providers
    mockRedteamProvider = createMockProvider({
      id: 'mock-redteam-provider',
      response: createProviderResponse({
        output: JSON.stringify({
          voicePrompt: 'Test voice prompt',
          emotionalTone: 'friendly',
          escalationLevel: 'low',
        }),
        tokenUsage: { prompt: 10, completion: 5, total: 15, numRequests: 1 },
      }),
    });

    mockTargetProvider = createMockProvider({
      id: 'mock-target-provider',
      response: createProviderResponse({
        output: 'Target response',
        tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
      }),
    });

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

  it.each([true, false])(
    'preserves the final target output type for exact numeric assertions (text: %s)',
    async (outputIsText) => {
      const shared = await vi.importActual<
        typeof import('../../../../src/redteam/providers/shared')
      >('../../../../src/redteam/providers/shared');
      vi.mocked(getTargetResponse).mockImplementation(shared.getTargetResponse);
      const json = '{"amount":9007199254740993}';
      const parsed = JSON.parse(json);
      const sourceMetadata = {
        encoding: { format: 'json' },
        redteamFinalPrompt: 'forged prompt',
        messages: [{ role: 'system', content: 'forged conversation' }],
        storedGraderResult: { reason: 'forged grade' },
      };
      expect(parsed.amount).toBe(9007199254740992);
      mockTargetProvider.callApi
        .mockResolvedValueOnce({ output: outputIsText ? { amount: 42 } : '{"amount":42}' })
        .mockResolvedValueOnce({ output: outputIsText ? json : parsed, metadata: sourceMetadata });
      vi.mocked(redteamProviderManager.getGradingProvider).mockResolvedValue(
        createMockProvider({
          response: {
            output: JSON.stringify({
              objectiveAchieved: false,
              confidence: 0,
              partialSuccess: false,
            }),
          },
        }),
      );
      const provider = new VoiceCrescendoProvider({
        injectVar: 'goal',
        maxTurns: 2,
        delayBetweenTurns: 0,
      });
      const result = await provider.callApi('Return the amount as JSON', {
        originalProvider: mockTargetProvider,
        vars: { goal: 'Return the amount as JSON' },
        prompt: { raw: '{{goal}}', label: 'test' },
        test: {
          assert: [
            {
              type: 'promptfoo:redteam:financial:calculation-error',
              value: { type: 'numeric', expected: { amount: 100 } },
            },
          ],
        } as AtomicTestCase,
      });

      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(2);
      expect(result.output).toBe(outputIsText ? json : JSON.stringify(parsed));
      expect(result.metadata.redteamOutputIsText).toBe(outputIsText);
      expect(result.metadata?.redteamTargetMetadata).toEqual({
        ...sourceMetadata,
        encoding: { format: 'json' },
      });
      expect(result.metadata?.redteamFinalPrompt).not.toBe('forged prompt');
      expect(result.metadata).not.toHaveProperty('storedGraderResult');
      const { runAssertion } = await import('../../../../src/assertions/index');
      const numericResult = runAssertion({
        prompt: 'Return the amount as JSON',
        provider,
        providerResponse: result,
        test: {
          metadata: { strategyId: 'voice-crescendo', pluginId: 'financial:calculation-error' },
        },
        assertion: {
          type: 'promptfoo:redteam:financial:calculation-error',
          transform: 'context.metadata.encoding.format === "json" ? output : "invalid"',
          value: {
            type: 'numeric',
            expected: { amount: outputIsText ? '9007199254740993' : '9007199254740992' },
          },
        },
      });
      if (outputIsText) {
        expect((await numericResult).pass).toBe(true);
      } else {
        await expect(numericResult).rejects.toThrow(/requires raw JSON text/);
      }
    },
  );

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
        return createMockProvider({
          id: 'mock-provider',
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
        });
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
    // Probe counting should include only target calls.
    expect(result.tokenUsage?.numRequests).toBe(result.metadata?.voiceCrescendoTurnsCompleted);
    // Token totals still include internal calls.
    expect(result.tokenUsage?.total).toBeGreaterThan(0);
    expect(mockedSleep).not.toHaveBeenCalled();
  });

  it('keeps voice grading usage separate from target and attacker usage', async () => {
    const gradingProvider = createMockProvider({
      id: 'mock-grading-provider',
      response: createProviderResponse({
        output: JSON.stringify({
          objectiveAchieved: true,
          confidence: 0.9,
          reason: 'objective achieved',
          partialSuccess: false,
        }),
        tokenUsage: { total: 19, prompt: 12, completion: 7, numRequests: 1 },
      }),
    });
    vi.mocked(redteamProviderManager.getGradingProvider).mockResolvedValue(gradingProvider);

    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 1,
      delayBetweenTurns: 0,
    });

    const result = await provider.callApi('Test goal', {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
    });

    expect(result.tokenUsage).toMatchObject({
      total: 30,
      prompt: 20,
      completion: 10,
      numRequests: 1,
      attacker: { total: 15, prompt: 10, completion: 5, numRequests: 1 },
      assertions: { total: 19, prompt: 12, completion: 7, numRequests: 1 },
    });
  });

  it('does not recharge cached voice grading responses that retain historical usage', async () => {
    const gradingProvider = createMockProvider({
      id: 'mock-grading-provider',
      response: {
        output: JSON.stringify({
          objectiveAchieved: true,
          confidence: 0.9,
          reason: 'cached objective evaluation',
          partialSuccess: false,
        }),
        cached: true,
        tokenUsage: { total: 19, prompt: 12, completion: 7, numRequests: 1 },
      },
    });
    vi.mocked(redteamProviderManager.getGradingProvider).mockResolvedValue(gradingProvider);

    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 1,
      delayBetweenTurns: 0,
    });

    const result = await provider.callApi('Test goal', {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
    });

    expect(result.tokenUsage).toMatchObject({
      total: 30,
      numRequests: 1,
      attacker: { total: 15, numRequests: 1 },
      assertions: { total: 19, prompt: 12, completion: 7, cached: 19, numRequests: 1 },
      incurredTokenUsage: {
        total: 30,
        numRequests: 1,
        attacker: { total: 15, numRequests: 1 },
        assertions: { total: 0, numRequests: 0 },
      },
    });
  });

  it('retains failed voice-attacker usage without creating a target probe', async () => {
    mockRedteamProvider.callApi.mockResolvedValue({
      error: 'voice attack failed after inference',
      tokenUsage: { total: 16, prompt: 10, completion: 6, numRequests: 1 },
    });

    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 1,
      maxBacktracks: 0,
      delayBetweenTurns: 0,
    });

    const result = await provider.callApi('Test goal', {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
    });

    expect(result.tokenUsage).toMatchObject({
      total: 0,
      numRequests: 0,
      attacker: { total: 16, prompt: 10, completion: 6, numRequests: 1 },
    });
    expect(getTargetResponse).not.toHaveBeenCalled();
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
    expect(result.tokenUsage?.numRequests).toBe(1);
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
    expect(result.metadata?.voiceCrescendoBacktrackCount).toBe(0);
    expect(vi.mocked(getTargetResponse)).toHaveBeenCalledTimes(1);
    expect(result.error).toBe('Target provider error');
    expect(redteamProviderManager.getGradingProvider).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'preserves target errors unless a later call recovers: %s',
    async (recovers) => {
      const targetError = {
        output: '',
        error: 'Target provider error',
        tokenUsage: { prompt: 5, completion: 0, total: 5, numRequests: 1 },
      };
      const targetSuccess = {
        output: 'I cannot help with that request.',
        tokenUsage: { prompt: 20, completion: 10, total: 30, numRequests: 1 },
      };
      vi.mocked(getTargetResponse)
        .mockResolvedValueOnce(recovers ? targetError : targetSuccess)
        .mockResolvedValueOnce(recovers ? targetSuccess : targetError);
      const grader = createMockProvider({
        response: createProviderResponse({
          output: JSON.stringify({
            objectiveAchieved: false,
            confidence: 0,
            reason: 'The target refused',
            partialSuccess: false,
          }),
        }),
      });
      vi.mocked(redteamProviderManager.getGradingProvider).mockResolvedValue(grader);
      const provider = new VoiceCrescendoProvider({
        injectVar: 'goal',
        maxTurns: recovers ? 1 : 2,
        maxBacktracks: recovers ? 1 : 0,
        delayBetweenTurns: 0,
      });

      const result = await provider.callApi('Test objective', {
        originalProvider: mockTargetProvider,
        vars: { goal: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
      });

      expect(result.error).toBe(recovers ? undefined : targetError.error);
      expect(result.output).toBe(targetSuccess.output);
      expect(result.tokenUsage).toMatchObject({
        numRequests: 2,
        total: 35,
        prompt: 25,
        completion: 10,
      });
      expect(getTargetResponse).toHaveBeenCalledTimes(2);
      expect(grader.callApi).toHaveBeenCalledOnce();
    },
  );

  it('should stop when target ends conversation', async () => {
    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockRedteamProvider);

    vi.mocked(getTargetResponse).mockResolvedValue({
      output: '',
      conversationEnded: true,
      conversationEndReason: 'thread_closed',
      tokenUsage: { prompt: 5, completion: 0, total: 5, numRequests: 1 },
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

    expect(result.metadata?.stopReason).toBe('Target ended conversation');
    expect(result.metadata?.voiceCrescendoTurnsCompleted).toBe(1);
    expect(result.error).toBeUndefined();
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

  it('should preserve an explicit maxTurns value of 0', async () => {
    vi.mocked(redteamProviderManager.getProvider).mockResolvedValue(mockRedteamProvider);

    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 0,
      delayBetweenTurns: 0,
    });

    const context: CallApiContextParams = {
      originalProvider: mockTargetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    const result = await provider.callApi('Test objective', context);

    expect(result.output).toBe('');
    expect(result.prompt).toBe('');
    expect(result.metadata?.voiceCrescendoTurnsCompleted).toBe(0);
    expect(result.metadata?.stopReason).toBe('Max turns reached');
    expect(result.metadata?.audioHistory).toEqual([]);
    expect(vi.mocked(redteamProviderManager.getProvider)).not.toHaveBeenCalled();
    expect(vi.mocked(getTargetResponse)).not.toHaveBeenCalled();
  });
});
