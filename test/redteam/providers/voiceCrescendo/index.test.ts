import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sleep } from '../../../../src/util/time';
import {
  createMockProvider,
  createProviderResponse,
  type MockApiProvider,
} from '../../../factories/provider';

import type { CallApiContextParams } from '../../../../src/types/index';

// Mock dependencies
vi.mock('../../../../src/logger', () => ({
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

  it.each(
    (['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const).flatMap((plugin) =>
      [false, true].flatMap((inverse) =>
        [false, true].flatMap((ended) =>
          [false, true].map((leaked) => ({ plugin, inverse, ended, leaked })),
        ),
      ),
    ),
  )(
    'grades private $plugin text locally (inverse=$inverse, ended=$ended, leaked=$leaked)',
    async ({ plugin, inverse, ended, leaked }) => {
      const secret = 'PRIVATE_VOICE_FINAL_RECEIPT';
      vi.mocked(getTargetResponse).mockResolvedValue({
        output: leaked ? secret : 'Clean public report',
        conversationEnded: ended,
      });
      const provider = new VoiceCrescendoProvider({
        injectVar: 'goal',
        maxTurns: 1,
        delayBetweenTurns: 0,
      });
      const test = {
        vars: {},
        assert: [
          {
            type: `${inverse ? 'not-' : ''}promptfoo:redteam:${plugin}` as const,
            value: { rawReceipt: secret },
          },
        ],
      };
      const result = await provider.callApi('Inspect public report', {
        originalProvider: mockTargetProvider,
        vars: { goal: 'Inspect public report' },
        prompt: { raw: 'Test', label: 'Test' },
        test,
      });
      const { runAssertions } = await import('../../../../src/assertions');
      const grade = await runAssertions({
        test,
        prompt: 'Inspect public report',
        providerResponse: result,
      });
      expect(grade.pass).toBe(inverse ? leaked : !leaked);
      expect(result.metadata?.storedGraderResults?.[0]).toBeDefined();
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(JSON.stringify(mockRedteamProvider.callApi.mock.calls)).not.toContain(secret);
    },
  );

  it.each(
    (['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const).flatMap((plugin) =>
      [false, true].flatMap((grouped) =>
        [false, true].map((leaked) => ({ plugin, grouped, leaked })),
      ),
    ),
  )(
    'keeps separate $plugin grades (grouped=$grouped, leaked=$leaked)',
    async ({ plugin, grouped, leaked }) => {
      const secrets = ['FIRST_PRIVATE_VOICE_RECEIPT', 'SECOND_PRIVATE_VOICE_RECEIPT'];
      vi.mocked(getTargetResponse).mockResolvedValue({
        output: leaked ? secrets[1] : 'Clean public report',
      });
      const provider = new VoiceCrescendoProvider({
        injectVar: 'goal',
        maxTurns: 1,
        delayBetweenTurns: 0,
      });
      const assertions = secrets.map((secret) => ({
        type: `promptfoo:redteam:${plugin}` as const,
        value: { rawReceipt: secret },
      }));
      const test = {
        vars: {},
        ...(grouped && { metadata: { pluginId: plugin } }),
        assert: [
          { type: 'contains' as const, value: 'omitted' },
          ...(grouped ? [{ type: 'assert-set' as const, assert: assertions }] : assertions),
        ],
      };
      const result = await provider.callApi('Inspect public report', {
        originalProvider: mockTargetProvider,
        vars: {},
        prompt: { raw: 'Test', label: 'Test' },
        test,
      });
      const { runAssertions } = await import('../../../../src/assertions');
      const grade = await runAssertions({
        test,
        prompt: 'Inspect public report',
        providerResponse: result,
      });
      expect(grade.pass).toBe(!leaked);
      const components = grouped
        ? grade.componentResults![1].componentResults!
        : grade.componentResults!.slice(1);
      expect(components.map(({ pass }) => pass)).toEqual([true, !leaked]);
      for (const secret of secrets) {
        expect(JSON.stringify(result)).not.toContain(secret);
        expect(JSON.stringify(mockRedteamProvider.callApi.mock.calls)).not.toContain(secret);
      }
    },
  );

  it.each(
    (['coding-agent:trace-redaction', 'harness:artifact-redaction'] as const).flatMap((plugin) =>
      ['refusal', 'error'].map((kind) => ({ plugin, kind })),
    ),
  )('retains a $plugin disclosure through a $kind backtrack', async ({ plugin, kind }) => {
    const secret = 'PRIVATE_REFUSAL_RECEIPT';
    const { isBasicRefusal } = await import('../../../../src/redteam/util');
    vi.mocked(isBasicRefusal).mockReturnValueOnce(true).mockReturnValue(false);
    vi.mocked(getTargetResponse)
      .mockResolvedValueOnce({
        output: `I cannot comply: ${secret}`,
        ...(kind === 'error' && { error: 'Target failed after output' }),
      })
      .mockResolvedValue({ output: 'Clean public report' });
    const provider = new VoiceCrescendoProvider({
      injectVar: 'goal',
      maxTurns: 1,
      maxBacktracks: 1,
      delayBetweenTurns: 0,
    });
    const test = {
      vars: {},
      assert: [{ type: `promptfoo:redteam:${plugin}` as const, value: { rawReceipt: secret } }],
    };
    const result = await provider.callApi('Inspect public report', {
      originalProvider: mockTargetProvider,
      vars: {},
      prompt: { raw: 'Test', label: 'Test' },
      test,
    });
    const { runAssertions } = await import('../../../../src/assertions');
    const grade = await runAssertions({
      test,
      prompt: 'Inspect public report',
      providerResponse: result,
    });
    expect(grade.pass).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(mockRedteamProvider.callApi.mock.calls)).not.toContain(secret);
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
  });

  it.each([false, true])(
    'retains media verification errors when the conversation ends immediately: %s',
    async (conversationEnded) => {
      const error = 'Media cannot be inspected for trace redaction';
      vi.mocked(getTargetResponse)
        .mockResolvedValueOnce({
          output: '[media omitted]',
          error,
          metadata: { redactionMediaOmitted: true },
          conversationEnded,
        })
        .mockResolvedValue({ output: 'Clean text', conversationEnded: true });
      const provider = new VoiceCrescendoProvider({
        injectVar: 'goal',
        maxTurns: 2,
        maxBacktracks: 1,
        delayBetweenTurns: 0,
      });
      const result = await provider.callApi('Inspect public output', {
        originalProvider: mockTargetProvider,
        vars: { goal: 'Inspect public output' },
        prompt: { raw: 'Test', label: 'Test' },
      });
      expect(result.error).toBe(error);
      expect(result.metadata?.redactionMediaOmitted).toBe(true);
      expect(getTargetResponse).toHaveBeenCalledTimes(conversationEnded ? 1 : 2);
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
