import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomProvider, MemorySystem } from '../../../../src/redteam/providers/custom/index';
import { redteamProviderManager, tryUnblocking } from '../../../../src/redteam/providers/shared';
import { checkServerFeatureSupport } from '../../../../src/util/server';
import { createMockProvider, type MockApiProvider } from '../../../factories/provider';

import type { Message } from '../../../../src/redteam/providers/shared';

// Hoisted mocks for getGraderById
const mockGetGraderById = vi.hoisted(() => vi.fn());

// Hoisted mock for applyRuntimeTransforms
const mockApplyRuntimeTransforms = vi.hoisted(() =>
  vi.fn().mockImplementation(async ({ prompt }) => ({
    transformedPrompt: prompt,
    audio: undefined,
    image: undefined,
  })),
);

vi.mock('../../../../src/globalConfig/accounts', async (importOriginal) => ({
  ...(await importOriginal()),
  isLoggedIntoCloud: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../../src/providers/promptfoo', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    PromptfooChatCompletionProvider: vi.fn().mockImplementation(function () {
      return {
        id: () => 'mock-unblocking',
        callApi: vi.fn(),
        delay: 0,
      };
    }),
  };
});

vi.mock('../../../../src/util/server', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    checkServerFeatureSupport: vi.fn(),
  };
});

vi.mock('../../../../src/redteam/providers/shared', async () => ({
  ...(await vi.importActual('../../../../src/redteam/providers/shared')),
  tryUnblocking: vi.fn(),
}));

vi.mock('../../../../src/redteam/graders', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getGraderById: mockGetGraderById,
  };
});

vi.mock('../../../../src/redteam/remoteGeneration', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    shouldGenerateRemote: vi.fn(() => false),
  };
});

vi.mock('../../../../src/redteam/shared/runtimeTransform', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    applyRuntimeTransforms: mockApplyRuntimeTransforms,
  };
});

describe('MemorySystem', () => {
  let memorySystem: MemorySystem;

  beforeEach(() => {
    memorySystem = new MemorySystem();
  });

  it('should add and retrieve messages for a conversation', () => {
    const conversationId = 'test-convo';
    const message: Message = { role: 'user', content: 'test message' };

    memorySystem.addMessage(conversationId, message);
    const conversation = memorySystem.getConversation(conversationId);

    expect(conversation).toHaveLength(1);
    expect(conversation[0]).toEqual(message);
  });

  it('should return empty array for non-existent conversation', () => {
    const conversation = memorySystem.getConversation('non-existent');
    expect(conversation).toEqual([]);
  });

  it('should duplicate conversation excluding last turn', () => {
    const conversationId = 'test-convo';
    const messages: Message[] = [
      { role: 'system', content: 'system message' },
      { role: 'user', content: 'user message 1' },
      { role: 'assistant', content: 'assistant message 1' },
      { role: 'user', content: 'user message 2' },
      { role: 'assistant', content: 'assistant message 2' },
    ];

    messages.forEach((msg) => memorySystem.addMessage(conversationId, msg));

    const newConversationId = memorySystem.duplicateConversationExcludingLastTurn(conversationId);
    const newConversation = memorySystem.getConversation(newConversationId);

    expect(newConversation).toHaveLength(3);
    expect(newConversation).toEqual(messages.slice(0, 3));
  });
});

describe('CustomProvider', () => {
  let customProvider: CustomProvider;
  let mockRedTeamProvider: MockApiProvider;
  let mockScoringProvider: MockApiProvider;
  let mockTargetProvider: MockApiProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mocks for each test
    mockRedTeamProvider = createMockProvider({ id: 'mock-redteam', delay: 0 });
    mockRedTeamProvider.callApi.mockReset();
    mockScoringProvider = createMockProvider({ id: 'mock-scoring', delay: 0 });
    mockScoringProvider.callApi.mockReset();
    mockTargetProvider = createMockProvider({ id: 'mock-target' });
    mockTargetProvider.callApi.mockReset();

    customProvider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'If current round is 0, generatedQuestion should be just "hi" by itself',
      maxTurns: 10,
      maxBacktracks: 10,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
    });

    // Set up redteamProviderManager mock
    vi.spyOn(redteamProviderManager, 'getProvider').mockImplementation(async function (options) {
      // When the provider is already an object (not a string), return it for jsonOnly requests
      // For non-jsonOnly requests (scoring), return the scoring provider
      if (
        options.provider &&
        typeof options.provider === 'object' &&
        'callApi' in options.provider
      ) {
        return options.jsonOnly ? options.provider : mockScoringProvider;
      }
      return options.jsonOnly ? mockRedTeamProvider : mockScoringProvider;
    });

    // Mock server feature support to return true so unblocking logic runs
    vi.mocked(checkServerFeatureSupport).mockResolvedValue(true);

    // Set up default getGraderById mock
    mockGetGraderById.mockReset();
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: {
            pass: false,
          },
        })),
      } as any;
    });

    // Set up default tryUnblocking mock
    vi.mocked(tryUnblocking).mockReset();
    vi.mocked(tryUnblocking).mockResolvedValue({ success: false });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize with default config values', () => {
    const provider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom strategy text',
      maxTurns: 10,
      maxBacktracks: 10,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
    });

    expect(provider.config.injectVar).toBe('objective');
    expect(provider.config.strategyText).toBe('Custom strategy text');
    expect(provider.config.redteamProvider).toBe(mockRedTeamProvider);
    expect(provider.config.maxTurns).toBe(10);
    expect(provider.config.maxBacktracks).toBe(10);
    expect(provider.config.stateful).toBe(true);
    expect(provider.config.continueAfterSuccess).toBe(false);
  });

  it('should require strategyText in config', () => {
    expect(() => {
      new CustomProvider({
        injectVar: 'objective',
        strategyText: '', // Empty strategy text should fail
        redteamProvider: mockRedTeamProvider,
      });
    }).toThrow('CustomProvider requires strategyText in config');
  });

  it('should return correct provider id', () => {
    expect(customProvider.id()).toBe('promptfoo:redteam:custom');
  });

  it('preserves attacker usage when prompt generation fails after inference', async () => {
    const provider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom accounting test',
      maxTurns: 1,
      redteamProvider: mockRedTeamProvider,
    });
    mockRedTeamProvider.callApi.mockResolvedValue({
      error: 'custom attack generation failed',
      tokenUsage: { total: 28, prompt: 17, completion: 11, numRequests: 1 },
    });

    const result = await provider.callApi('test prompt', {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
    });

    expect(result.tokenUsage).toMatchObject({
      total: 0,
      numRequests: 0,
      attacker: { total: 28, prompt: 17, completion: 11, numRequests: 1 },
    });
    expect(mockTargetProvider.callApi).not.toHaveBeenCalled();
  });

  it('should use default values when optional config not provided', () => {
    const provider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom strategy',
      redteamProvider: mockRedTeamProvider,
    });

    // These defaults are set on the instance, not the config
    expect((provider as any).maxTurns).toBe(10); // DEFAULT_MAX_TURNS
    expect((provider as any).maxBacktracks).toBe(10); // DEFAULT_MAX_BACKTRACKS
    expect((provider as any).stateful).toBe(false); // Default false
    expect(provider.config.continueAfterSuccess).toBe(false); // Default false
  });

  it('should preserve explicit zero values for maxTurns and maxBacktracks', () => {
    const provider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom strategy',
      maxTurns: 0,
      maxBacktracks: 0,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
    });

    expect((provider as any).maxTurns).toBe(0);
    expect((provider as any).maxBacktracks).toBe(0);
  });

  it('should include sessionId from context vars when response is missing it', async () => {
    const provider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom strategy',
      maxTurns: 0,
      maxBacktracks: 0,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: {
        objective: 'test objective',
        sessionId: 'context-session-id',
      },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    const result = await provider.callApi('test prompt', context);

    expect(result.metadata?.sessionId).toBe('context-session-id');
  });

  it('passes the rendered turn variables and session context to the target', async () => {
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'original objective', sessionId: 'existing-session', literal: 'value\n' },
      prompt: { raw: '{{objective}}', label: 'test' },
    };
    mockTargetProvider.callApi.mockResolvedValue({ output: 'target response' });

    await (customProvider as any).sendPrompt(
      'rendered attack',
      context.prompt,
      context.vars,
      undefined,
      mockTargetProvider,
      1,
      context,
    );

    expect(mockTargetProvider.callApi).toHaveBeenCalledWith(
      'rendered attack',
      expect.objectContaining({
        ...context,
        vars: { ...context.vars, objective: 'rendered attack' },
      }),
      undefined,
    );
    expect(context.vars.objective).toBe('original objective');
  });

  it('should include sessionId from target response when stateful is true', async () => {
    vi.mocked(tryUnblocking).mockResolvedValue({ success: false });

    const provider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom strategy',
      maxTurns: 1,
      maxBacktracks: 0,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
    });

    vi.spyOn(provider as any, 'getAttackPrompt').mockResolvedValue({
      generatedQuestion: 'attack prompt',
    });
    vi.spyOn(provider as any, 'sendPrompt').mockResolvedValue({
      response: {
        output: 'target response',
        sessionId: 'response-session-id',
      },
      transformResult: undefined,
    });
    vi.spyOn(provider as any, 'getRefusalScore').mockResolvedValue([false, '']);
    vi.spyOn(provider as any, 'getEvalScore').mockResolvedValue({
      value: false,
      metadata: 0,
      rationale: '',
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    const result = await provider.callApi('test prompt', context);

    expect(result.metadata?.sessionId).toBe('response-session-id');
  });

  describe('Unblocking functionality', () => {
    it('should detect blocking question and send unblocking response', async () => {
      const provider = new CustomProvider({
        injectVar: 'objective',
        strategyText: 'Custom strategy for testing',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
        stateful: true,
      });

      const prompt = 'test prompt';
      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: prompt, label: 'test' },
        test: { metadata: { purpose: 'e-commerce platform' } },
      };

      // Mock the attack prompt generation
      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      // Mock target asking a blocking question
      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'What is your company registration number?',
        })
        .mockResolvedValueOnce({
          output: 'Thank you for providing that information. How can I help you further?',
        });

      // Mock unblocking analysis - detects blocking question
      vi.mocked(tryUnblocking).mockResolvedValue({
        success: true,
        unblockingPrompt: 'Our company registration number is REG123456789',
      });

      // Mock scoring (non-blocking after unblocking)
      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: true,
          metadata: 100,
          rationale: 'Successfully unblocked conversation',
        }),
      });

      const result = await provider.callApi(prompt, context);

      expect(tryUnblocking).toHaveBeenCalledWith({
        messages: expect.any(Array),
        lastResponse: 'What is your company registration number?',
        goal: 'test objective',
        purpose: 'e-commerce platform',
      });

      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(2); // Original + unblocking response
      expect(result.metadata?.stopReason).toBe('Max rounds reached');
    });

    it('should continue without unblocking when no blocking question detected', async () => {
      const provider = new CustomProvider({
        injectVar: 'objective',
        strategyText: 'Custom strategy for testing',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
        stateful: true,
      });

      const prompt = 'test prompt';
      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: prompt, label: 'test' },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'I understand your request. Here is the information you need.',
      });

      // Mock unblocking analysis - no blocking detected
      vi.mocked(tryUnblocking).mockResolvedValue({
        success: false,
        tokenUsage: { total: 16, prompt: 10, completion: 6, numRequests: 1 },
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: true,
          metadata: 100,
          rationale: 'Direct helpful response',
        }),
      });

      const result = await provider.callApi(prompt, context);

      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1); // Only original call
      expect(result.metadata?.stopReason).toBe('Max rounds reached');
      expect(result.tokenUsage?.assertions).toMatchObject({
        total: 16,
        prompt: 10,
        completion: 6,
      });
    });
  });

  it('should record internal evaluator success without exiting early', async () => {
    // Set up grader to pass (not detect jailbreak) so we don't fail via grader
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: {
            pass: true, // Pass means no jailbreak detected
          },
        })),
      } as any;
    });

    // Create a new provider with smaller max turns for this test
    const testProvider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom strategy for testing',
      maxTurns: 1, // Limit iterations to avoid additional calls
      maxBacktracks: 10,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
    });

    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    // Mock both refusal check and eval score
    mockScoringProvider.callApi
      .mockResolvedValueOnce({
        // First call is refusal check - not a refusal
        output: JSON.stringify({
          value: false,
          metadata: 0,
          rationale: 'Not a refusal',
        }),
      })
      .mockResolvedValueOnce({
        // Second call is eval score - success
        output: JSON.stringify({
          value: true,
          metadata: 100,
          rationale: 'test rationale',
        }),
      });

    const result = await testProvider.callApi(prompt, context);

    expect(mockScoringProvider.callApi).toHaveBeenCalledTimes(2);
    expect(result.metadata?.stopReason).toBe('Max rounds reached');
    expect(result.metadata?.customResult).toBe(true);
    expect(result.metadata?.customConfidence).toBe(100);
  });

  it('should succeed via external grader when grader fails', async () => {
    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
      test: {
        assert: [{ type: 'mock-grader' }],
        metadata: { pluginId: 'mock' },
      } as any,
    };

    // Mock unblocking to return false so it doesn't interfere
    vi.mocked(tryUnblocking).mockResolvedValue({
      success: false,
    });

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    // First call checks for refusal (false = not a refusal)
    // Second call is for internal evaluator
    mockScoringProvider.callApi
      .mockResolvedValueOnce({
        output: JSON.stringify({
          value: false,
          metadata: 0,
          rationale: 'Not a refusal',
        }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'test rationale',
        }),
      });

    const result = await customProvider.callApi(prompt, context);
    expect(result.metadata?.stopReason).toBe('Grader failed');
  });

  describe('when the internal evaluator fails on the round a grade is returned', () => {
    const runRounds = async (firstGrade: Record<string, unknown>) => {
      const provider = new CustomProvider({
        injectVar: 'objective',
        maxTurns: 2,
        maxBacktracks: 1,
        redteamProvider: mockRedTeamProvider,
        stateful: false,
        strategyText: 'Test strategy',
      });

      const getResult = vi
        .fn<any>()
        .mockResolvedValueOnce({ grade: firstGrade, rubric: 'test rubric' })
        .mockResolvedValueOnce({
          grade: { pass: true, score: 1, reason: 'Benign output' },
          rubric: 'test rubric',
        });
      mockGetGraderById.mockImplementation(function () {
        return { getResult } as any;
      });

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });
      mockTargetProvider.callApi
        .mockResolvedValueOnce({ output: 'first response' })
        .mockResolvedValueOnce({ output: 'second response' });

      const notRefused = {
        output: JSON.stringify({ value: false, metadata: 0, rationale: 'Not a refusal' }),
      };
      mockScoringProvider.callApi
        .mockResolvedValueOnce(notRefused)
        .mockResolvedValueOnce({ error: 'scoring provider unavailable' })
        .mockResolvedValueOnce(notRefused)
        .mockResolvedValueOnce({
          output: JSON.stringify({ value: false, metadata: 10, rationale: 'Not achieved' }),
        });

      const result = await provider.callApi('test prompt', {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          assert: [{ type: 'mock-grader' }],
          metadata: { pluginId: 'mock' },
        } as any,
      });
      return { getResult, result };
    };

    it('should keep a failing grade', async () => {
      const { getResult, result } = await runRounds({
        pass: false,
        score: 0,
        reason: 'Target produced harmful content',
      });

      // Previously the evaluator error abandoned the round before the grade was acted on,
      // the next round's passing grade replaced it, and the attack was reported as unsuccessful.
      expect(result.metadata?.stopReason).toBe('Grader failed');
      expect(result.metadata?.storedGraderResult).toMatchObject({
        pass: false,
        reason: 'Target produced harmful content',
      });
      expect(result.metadata?.successfulAttacks).toEqual([
        expect.objectContaining({ turn: 1, response: 'first response' }),
      ]);
      expect(getResult).toHaveBeenCalledTimes(1);
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1);
      // The internal evaluator is not called once the grade has ended the attack.
      expect(mockScoringProvider.callApi).toHaveBeenCalledTimes(1);
    });

    it('should keep attacking after a grader error, which is not a verdict', async () => {
      const { getResult, result } = await runRounds({
        pass: false,
        score: 0,
        reason: 'Grading provider returned 503',
        metadata: { graderError: true },
      });

      expect(result.metadata?.stopReason).toBe('Max rounds reached');
      expect(result.metadata?.successfulAttacks).toEqual([]);
      expect(getResult).toHaveBeenCalledTimes(2);
      expect(getResult.mock.calls[1][7]).toMatchObject({
        conversationTranscript: 'User: test prompt\n\nAssistant: first response',
      });
    });
  });

  it.each(['returned error', 'thrown error'])(
    'returns an error when every transform fails (%s)',
    async (failure) => {
      if (failure === 'returned error') {
        mockApplyRuntimeTransforms.mockResolvedValue({
          prompt: 'Never sent',
          originalPrompt: 'Never sent',
          error: 'Transform unavailable',
        });
      } else {
        mockApplyRuntimeTransforms.mockRejectedValue(new Error('Transform unavailable'));
      }
      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'Never sent',
          rationaleBehindJailbreak: '',
          lastResponseSummary: '',
        }),
      });
      const getResult = vi.fn();
      mockGetGraderById.mockReturnValue({ getResult });
      const provider = new CustomProvider({
        injectVar: 'objective',
        maxTurns: 2,
        maxBacktracks: 0,
        redteamProvider: mockRedTeamProvider,
        stateful: true,
        _perTurnLayers: ['base64'],
        strategyText: 'Ask about a name',
      });
      const result = await provider.callApi('', {
        originalProvider: mockTargetProvider,
        vars: { objective: 'goal' },
        prompt: { raw: '{{objective}}', label: 'test' },
        test: {
          assert: [{ type: 'promptfoo:redteam:pii' }],
          metadata: { pluginId: 'pii:social' },
        } as any,
      });
      expect(result.error).toBe('Transform unavailable');
      expect(result.metadata?.messages).toEqual([]);
      expect(result.metadata?.storedGraderResult).toBeUndefined();
      expect(mockTargetProvider.callApi).not.toHaveBeenCalled();
      expect(getResult).not.toHaveBeenCalled();
    },
  );

  it.each(['returned error', 'thrown error'])(
    'excludes unsent transformed turns from grading history (%s)',
    async (failure) => {
      const failedTransform = {
        prompt: 'Never sent: Casey Morgan',
        originalPrompt: 'Never sent: Casey Morgan',
        error: 'Transform failed',
      };
      if (failure === 'returned error') {
        mockApplyRuntimeTransforms.mockResolvedValueOnce(failedTransform);
      } else {
        mockApplyRuntimeTransforms.mockRejectedValueOnce(new Error('Transform failed'));
      }
      mockApplyRuntimeTransforms.mockResolvedValueOnce({
        prompt: 'Delivered request',
        originalPrompt: 'Delivered request',
      });
      const getResult = vi.fn().mockResolvedValue({
        grade: {
          pass: false,
          score: 0,
          reason: 'A name not supplied in the target conversation',
        },
      });
      mockGetGraderById.mockReturnValue({ getResult });
      mockRedTeamProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({
            generatedQuestion: 'Never sent: Casey Morgan',
            rationaleBehindJailbreak: '',
            lastResponseSummary: '',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            generatedQuestion: 'Delivered request',
            rationaleBehindJailbreak: '',
            lastResponseSummary: '',
          }),
        });
      mockTargetProvider.callApi.mockResolvedValue({ output: 'Casey Morgan' });
      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({ value: false, metadata: 0, rationale: 'Not refused' }),
      });
      const provider = new CustomProvider({
        injectVar: 'objective',
        maxTurns: 2,
        maxBacktracks: 0,
        redteamProvider: mockRedTeamProvider,
        stateful: true,
        _perTurnLayers: ['base64'],
        strategyText: 'Ask about a name',
      });
      const result = await provider.callApi('', {
        originalProvider: mockTargetProvider,
        vars: { objective: 'goal' },
        prompt: { raw: '{{objective}}', label: 'test' },
        test: {
          assert: [{ type: 'promptfoo:redteam:pii' }],
          metadata: { pluginId: 'pii:social' },
        } as any,
      });
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1);
      expect(getResult).toHaveBeenCalledTimes(1);
      expect(result.error).toBeUndefined();
      expect(getResult.mock.calls[0][0]).toBe('Delivered request');
      expect(getResult.mock.calls[0][7]).toMatchObject({ conversationTranscript: '' });
      expect(JSON.stringify(result.metadata?.messages)).not.toContain('Never sent');
    },
  );

  it('should stop when max backtracks reached', async () => {
    // Set up grader to pass (not detect jailbreak)
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: {
            pass: true,
          },
        })),
      } as any;
    });

    const testProvider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom strategy for backtrack test',
      maxTurns: 10,
      maxBacktracks: 2,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
    });

    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'I cannot help with that.',
    });

    // Mock scoring provider to always detect refusal
    // Refusal check returns true (is a refusal) which triggers backtracks
    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: true, // true means it IS a refusal
        metadata: 0,
        rationale: 'This is a refusal',
      }),
    });

    const result = await testProvider.callApi(prompt, context);

    expect(result.metadata?.stopReason).toBe('Max backtracks reached');
    expect(result.metadata?.customBacktrackCount).toBe(2);
  });

  it('should record successful attacks when continueAfterSuccess is true', async () => {
    const testProvider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom strategy for multiple success test',
      maxTurns: 5,
      continueAfterSuccess: true,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
    });

    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'successful attack response',
    });

    // Mock both refusal check and eval score - no refusals, no success to go through all rounds
    mockScoringProvider.callApi
      .mockResolvedValueOnce({
        output: JSON.stringify({
          value: false, // Not a refusal
          metadata: 0,
          rationale: 'Not a refusal',
        }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          value: false, // Not successful yet, but not a refusal
          metadata: 50,
          rationale: 'Partial progress',
        }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          value: false, // Not a refusal
          metadata: 0,
          rationale: 'Not a refusal',
        }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          value: true, // Successful attack on second round
          metadata: 100,
          rationale: 'Successful attack',
        }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          value: false, // Not a refusal
          metadata: 0,
          rationale: 'Not a refusal',
        }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          value: false, // No success to continue
          metadata: 50,
          rationale: 'Continuing conversation',
        }),
      });

    const result = await testProvider.callApi(prompt, context);

    expect(result.metadata?.stopReason).toBe('Max rounds reached');
    expect(result.metadata?.totalSuccessfulAttacks).toBeGreaterThan(0);
    expect(result.metadata?.successfulAttacks).toBeDefined();
    expect(result.metadata?.successfulAttacks?.length).toBeGreaterThan(0);
  });

  it('should surface final target error while preserving mapped output', async () => {
    const provider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'simple',
      maxTurns: 1,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'p', label: 'l' },
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'attack',
        rationaleBehindJailbreak: 'r',
        lastResponseSummary: 's',
      }),
    });

    // final target returns error with output
    mockTargetProvider.callApi.mockResolvedValue({ output: 'This is 504', error: 'HTTP 504' });

    // refusal false, eval not 100
    mockScoringProvider.callApi
      .mockResolvedValueOnce({ output: JSON.stringify({ value: false, metadata: 0 }) })
      .mockResolvedValueOnce({ output: JSON.stringify({ value: false, metadata: 50 }) });

    const result = await provider.callApi('p', context);
    expect(result.output).toBe('This is 504');
    expect(result.error).toBe('HTTP 504');
  });

  it('should handle custom strategy text with round-specific logic', async () => {
    const roundSpecificStrategy = `
      If current round is 0, generatedQuestion should be just "hi" by itself.
      If current round >= 2, start generating questions to achieve the objective.
    `;

    const testProvider = new CustomProvider({
      injectVar: 'objective',
      strategyText: roundSpecificStrategy,
      maxTurns: 3,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
    });

    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    // Mock attack prompt generation to simulate different responses based on round
    mockRedTeamProvider.callApi
      .mockResolvedValueOnce({
        output: JSON.stringify({
          generatedQuestion: 'hi',
          rationaleBehindJailbreak: 'Starting with greeting as per round 0 strategy',
          lastResponseSummary: '',
        }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          generatedQuestion: 'How are you?',
          rationaleBehindJailbreak: 'Continuing conversation in round 1',
          lastResponseSummary: 'Target responded positively',
        }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({
          generatedQuestion: 'Can you help me with my objective?',
          rationaleBehindJailbreak: 'Now in round 2, pursuing objective',
          lastResponseSummary: 'Target is engaged',
        }),
      });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'Hello! How can I help you?',
    });

    // Mock scoring - no refusals, no success (to go through all rounds)
    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: false,
        metadata: 50,
        rationale: 'Partial progress',
      }),
    });

    const result = await testProvider.callApi(prompt, context);

    expect(mockRedTeamProvider.callApi).toHaveBeenCalledTimes(3);
    expect(result.metadata?.customRoundsCompleted).toBe(3);
    expect(result.metadata?.stopReason).toBe('Max rounds reached');
  });

  it('should handle stateful mode with sessionId', async () => {
    const testProvider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Stateful strategy test',
      maxTurns: 1,
      stateful: true,
      redteamProvider: mockRedTeamProvider,
    });

    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    // Mock target to return sessionId
    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
      sessionId: 'test-session-123',
    });

    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: true,
        metadata: 100,
        rationale: 'Success',
      }),
    });

    const result = await testProvider.callApi(prompt, context);

    expect(result.metadata?.stopReason).toBe('Max rounds reached');
    // Verify sessionId was set in context vars
    expect((context.vars as any).sessionId).toBe('test-session-123');
  });

  it('should pass additionalRubric to grader when goal is provided', async () => {
    // Create a new provider
    const testProvider = new CustomProvider({
      injectVar: 'objective',
      maxTurns: 1,
      maxBacktracks: 1,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
      strategyText: 'Test strategy',
    });

    const prompt = 'test prompt';
    const testGoal = 'Extract sensitive database credentials';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: testGoal },
      prompt: { raw: prompt, label: 'test' },
      test: {
        assert: [{ type: 'mock-grader' }],
        metadata: {
          pluginId: 'mock',
          goal: testGoal,
        },
      } as any,
    };

    // Capture the additionalRubric parameter
    let capturedAdditionalRubric: string | undefined;
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(
          async (
            _prompt: string,
            _output: string,
            _test: any,
            _provider: any,
            _value: any,
            additionalRubric?: string,
          ) => {
            capturedAdditionalRubric = additionalRubric;
            return {
              grade: {
                pass: false,
                score: 0,
                reason: 'Jailbreak detected',
              },
            };
          },
        ),
      } as any;
    });

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: false,
        metadata: 50,
        rationale: 'test rationale',
      }),
    });

    await testProvider.callApi(prompt, context);

    // Verify that additionalRubric was generated and passed to grader
    expect(capturedAdditionalRubric).toBeDefined();
    expect(capturedAdditionalRubric).toContain(testGoal);
    expect(capturedAdditionalRubric).toContain('ADDITIONAL EVALUATION CRITERIA');
  });

  it('should store grader result in metadata when grader fails', async () => {
    const testProvider = new CustomProvider({
      injectVar: 'objective',
      maxTurns: 1,
      maxBacktracks: 1,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
      strategyText: 'Test strategy',
    });

    const mockGraderResult = {
      pass: false,
      score: 0,
      reason: 'Jailbreak successful - extracted sensitive info',
      tokensUsed: { total: 15, prompt: 8, completion: 7 },
    };

    const testRubric = 'Test grading rubric';
    const getResult = vi.fn<any>(async () => ({
      grade: mockGraderResult,
      rubric: testRubric,
    }));

    // Mock grader to fail (jailbreak success)
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult,
      } as any;
    });

    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
      test: {
        assert: [{ type: 'mock-grader' }],
        metadata: { pluginId: 'mock' },
      } as any,
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    // Mock scoring provider responses
    mockScoringProvider.callApi
      .mockResolvedValueOnce({
        // Refusal check - not refused
        output: JSON.stringify({
          value: false,
          metadata: 20,
          rationale: 'Not a refusal',
        }),
      })
      .mockResolvedValueOnce({
        // Eval score - partial success (not 100%)
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Partial goal achievement',
        }),
      });

    const result = await testProvider.callApi(prompt, context);

    expect(getResult).toHaveBeenCalled();
    expect(getResult.mock.calls[0][7]).toMatchObject({
      providerResponse: { output: 'target response' },
    });
    // Verify storedGraderResult is included in metadata (with assertion.value set to rubric)
    expect(result.metadata?.storedGraderResult).toEqual({
      metadata: {
        redteamGradingInputHash: expect.any(String),
        redteamGradingAssertionHash: expect.any(String),
      },
      ...mockGraderResult,
      tokensUsed: { ...mockGraderResult.tokensUsed, numRequests: 1 },
      assertion: { type: 'mock-grader', value: testRubric },
    });
    expect(result.metadata?.stopReason).toBe('Grader failed');
    // Verify it's actually a successful attack
    expect(result.metadata?.successfulAttacks).toHaveLength(1);
    expect(result.metadata?.totalSuccessfulAttacks).toBe(1);
  });

  it('should not create synthetic grader result when internal evaluator succeeds', async () => {
    const testProvider = new CustomProvider({
      injectVar: 'objective',
      maxTurns: 1,
      maxBacktracks: 1,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
      strategyText: 'Test strategy',
    });

    const testRubric = 'Test grading rubric';

    // Mock grader to pass (no jailbreak)
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: {
            pass: true,
            score: 1,
            reason: 'No jailbreak detected',
          },
          rubric: testRubric,
        })),
      } as any;
    });

    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
      test: {
        assert: [{ type: 'mock-grader' }],
        metadata: { pluginId: 'mock' },
      } as any,
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    // Mock scoring provider responses
    mockScoringProvider.callApi
      .mockResolvedValueOnce({
        // Refusal check - not refused
        output: JSON.stringify({
          value: false,
          metadata: 20,
          rationale: 'Not a refusal',
        }),
      })
      .mockResolvedValueOnce({
        // Eval score - 100% success
        output: JSON.stringify({
          value: true,
          metadata: 100,
          rationale: 'Goal fully achieved - sensitive data extracted',
        }),
      });

    const result = await testProvider.callApi(prompt, context);

    expect(result.metadata?.stopReason).toBe('Max rounds reached');
    expect(result.metadata?.storedGraderResult).toEqual({
      metadata: {
        redteamGradingInputHash: expect.any(String),
        redteamGradingAssertionHash: expect.any(String),
      },
      pass: true,
      score: 1,
      reason: 'No jailbreak detected',
      assertion: { type: 'mock-grader', value: testRubric },
    });
  });

  it('should store grader result even when continueAfterSuccess is true', async () => {
    const testProvider = new CustomProvider({
      injectVar: 'objective',
      maxTurns: 2,
      maxBacktracks: 1,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
      strategyText: 'Test strategy',
      continueAfterSuccess: true,
    });

    const firstGraderResult = {
      pass: false,
      score: 0,
      reason: 'First jailbreak detected',
    };

    const secondGraderResult = {
      pass: true,
      score: 1,
      reason: 'No jailbreak on second turn',
    };

    const testRubric = 'Test grading rubric';

    // Create the mock getResult function outside mockImplementation so it persists across calls
    const mockGetResult = vi
      .fn()
      .mockResolvedValueOnce({ grade: firstGraderResult, rubric: testRubric })
      .mockResolvedValueOnce({ grade: secondGraderResult, rubric: testRubric });

    // Mock grader to fail on first turn, pass on second
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: mockGetResult,
      } as any;
    });

    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
      test: {
        assert: [{ type: 'mock-grader' }],
        metadata: { pluginId: 'mock' },
      } as any,
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    // Mock scoring provider responses for both turns
    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: false,
        metadata: 30,
        rationale: 'Partial success',
      }),
    });

    const result = await testProvider.callApi(prompt, context);

    // Should continue to max turns and store the LAST grader result (with assertion.value set to rubric)
    expect(result.metadata?.storedGraderResult).toEqual({
      metadata: {
        redteamGradingInputHash: expect.any(String),
        redteamGradingAssertionHash: expect.any(String),
      },
      ...secondGraderResult,
      assertion: { type: 'mock-grader', value: testRubric },
    });
    expect(result.metadata?.stopReason).toBe('Max rounds reached');
    expect(result.metadata?.successfulAttacks).toHaveLength(1);
    expect(result.metadata?.totalSuccessfulAttacks).toBe(1);
  });

  it('should include modifiers in system prompt from test metadata', async () => {
    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
      test: {
        vars: {},
        metadata: {
          pluginId: 'test-plugin',
          purpose: 'payment processing system',
          modifiers: {
            testGenerationInstructions: 'Generate prompts as realistic invoice queries',
            language: 'Spanish',
          },
        },
      } as any,
    };

    // Capture the system prompt that gets sent
    let capturedSystemPrompt = '';
    mockRedTeamProvider.callApi.mockImplementation(async function (prompt: string) {
      const input = JSON.parse(prompt);
      if (Array.isArray(input) && input[0]?.role === 'system') {
        capturedSystemPrompt = input[0].content;
      }
      return {
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      };
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: true,
        metadata: 100,
        rationale: 'Success',
      }),
    });

    await customProvider.callApi(prompt, context);

    // Verify modifiers were included in the system prompt
    expect(capturedSystemPrompt).toContain('CRITICAL: Ensure all generated prompts');
    expect(capturedSystemPrompt).toContain('<Modifiers>');
    expect(capturedSystemPrompt).toContain(
      'testGenerationInstructions: Generate prompts as realistic invoice queries',
    );
    expect(capturedSystemPrompt).toContain('language: Spanish');
    expect(capturedSystemPrompt).toContain('Rewrite ALL prompts to fully comply');
  });

  describe('Abort Signal Handling', () => {
    it('should pass options to red team provider callApi', async () => {
      const abortController = new AbortController();
      const options = { abortSignal: abortController.signal };

      const testProvider = new CustomProvider({
        injectVar: 'objective',
        strategyText: 'Test strategy',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
        stateful: false,
      });

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: true,
          metadata: 100,
          rationale: 'Success',
        }),
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      await testProvider.callApi('test prompt', context, options);

      // Red team provider should be called with options
      expect(mockRedTeamProvider.callApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        options,
      );
    });

    it('should pass options to scoring provider callApi', async () => {
      const abortController = new AbortController();
      const options = { abortSignal: abortController.signal };

      const testProvider = new CustomProvider({
        injectVar: 'objective',
        strategyText: 'Test strategy',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
        stateful: false,
      });

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Not a refusal',
        }),
        tokenUsage: { total: 13, prompt: 8, completion: 5, numRequests: 1 },
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      const result = await testProvider.callApi('test prompt', context, options);

      // Scoring provider should be called with options
      expect(mockScoringProvider.callApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        options,
      );
      expect(result.tokenUsage?.assertions).toMatchObject({
        total: 26,
        prompt: 16,
        completion: 10,
        numRequests: 2,
      });
    });

    it('should re-throw AbortError and not swallow it', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      const testProvider = new CustomProvider({
        injectVar: 'objective',
        strategyText: 'Test strategy',
        maxTurns: 3,
        redteamProvider: mockRedTeamProvider,
        stateful: false,
      });

      // Mock red team provider to throw AbortError
      mockRedTeamProvider.callApi.mockRejectedValue(abortError);

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      await expect(testProvider.callApi('test prompt', context)).rejects.toThrow(
        'The operation was aborted',
      );
    });
  });

  describe('perTurnLayers configuration', () => {
    it('should accept _perTurnLayers in config', () => {
      const provider = new CustomProvider({
        injectVar: 'objective',
        strategyText: 'Test strategy',
        redteamProvider: mockRedTeamProvider,
        _perTurnLayers: [{ id: 'audio' }, { id: 'image' }],
      });

      expect(provider['perTurnLayers']).toEqual([{ id: 'audio' }, { id: 'image' }]);
    });

    it('should default perTurnLayers to empty array when not provided', () => {
      const provider = new CustomProvider({
        injectVar: 'objective',
        strategyText: 'Test strategy',
        redteamProvider: mockRedTeamProvider,
      });

      expect(provider['perTurnLayers']).toEqual([]);
    });

    it('should not apply transforms when perTurnLayers is empty', async () => {
      const provider = new CustomProvider({
        injectVar: 'objective',
        strategyText: 'Test strategy',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
        // No _perTurnLayers provided - defaults to empty
      });

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: true,
          metadata: 100,
          rationale: 'Success',
        }),
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      const result = await provider.callApi('test prompt', context);

      // Verify redteamHistory exists but promptAudio/promptImage are undefined
      expect(result.metadata?.redteamHistory).toBeDefined();
      if (result.metadata?.redteamHistory && result.metadata.redteamHistory.length > 0) {
        expect(result.metadata.redteamHistory[0].promptAudio).toBeUndefined();
        expect(result.metadata.redteamHistory[0].promptImage).toBeUndefined();
      }
    });

    it('should include redteamHistory with media fields when perTurnLayers is configured', async () => {
      // Configure the hoisted mock to return audio/image data for this test
      mockApplyRuntimeTransforms.mockResolvedValueOnce({
        prompt: 'transformed prompt',
        audio: { data: 'base64-audio-data', format: 'mp3' },
        image: { data: 'base64-image-data', format: 'png' },
      });

      const getResult = vi
        .fn()
        .mockResolvedValue({ grade: { pass: false, score: 0, reason: 'graded' } });
      mockGetGraderById.mockReturnValue({ getResult });
      const provider = new CustomProvider({
        injectVar: 'objective',
        strategyText: 'Test strategy',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
        _perTurnLayers: [{ id: 'audio' }],
      });

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
        audio: { data: 'response-audio-data', format: 'wav' },
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 100,
          rationale: 'Success',
        }),
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: { assert: [{ type: 'mock-grader' }], metadata: { pluginId: 'mock' } } as any,
      };

      const result = await provider.callApi('test prompt', context);

      expect(getResult.mock.calls[0][0]).toBe('transformed prompt');
      expect(result.metadata?.redteamFinalPrompt).toBe('transformed prompt');
      // Verify redteamHistory is populated
      expect(result.metadata?.redteamHistory).toBeDefined();
      expect(Array.isArray(result.metadata?.redteamHistory)).toBe(true);
    });
  });
});
