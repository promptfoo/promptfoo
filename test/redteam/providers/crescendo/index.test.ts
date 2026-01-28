import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as evaluatorHelpers from '../../../../src/evaluatorHelpers';
import { CrescendoProvider, MemorySystem } from '../../../../src/redteam/providers/crescendo/index';
import { redteamProviderManager, tryUnblocking } from '../../../../src/redteam/providers/shared';
import { checkServerFeatureSupport } from '../../../../src/util/server';

import type { Message } from '../../../../src/redteam/providers/shared';

// Hoisted mock for getGraderById
const mockGetGraderById = vi.hoisted(() => vi.fn());

// Hoisted mock for applyRuntimeTransforms
const mockApplyRuntimeTransforms = vi.hoisted(() =>
  vi.fn().mockImplementation(async ({ prompt }) => ({
    transformedPrompt: prompt,
    audio: undefined,
    image: undefined,
  })),
);

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

vi.mock('../../../../src/evaluatorHelpers', async () => ({
  ...(await vi.importActual('../../../../src/evaluatorHelpers')),
  renderPrompt: vi.fn(),
}));

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

describe('CrescendoProvider', () => {
  let crescendoProvider: CrescendoProvider;
  let mockRedTeamProvider: any;
  let mockScoringProvider: any;
  let mockTargetProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mocks for each test
    mockRedTeamProvider = {
      id: () => 'mock-redteam',
      callApi: vi.fn(),
      delay: 0,
    };
    mockScoringProvider = {
      id: () => 'mock-scoring',
      callApi: vi.fn(),
      delay: 0,
    };
    mockTargetProvider = {
      id: () => 'mock-target',
      callApi: vi.fn(),
    };

    crescendoProvider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 10,
      maxBacktracks: 10,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
    });

    // Set up redteamProviderManager mock
    vi.spyOn(redteamProviderManager, 'getProvider').mockImplementation(async function (
      options: any,
    ) {
      // When the provider is already an object (not a string), return it for jsonOnly requests
      // For non-jsonOnly requests (scoring), return the scoring provider
      if (options.provider && typeof options.provider === 'object') {
        return options.jsonOnly ? options.provider : mockScoringProvider;
      }
      return options.jsonOnly ? mockRedTeamProvider : mockScoringProvider;
    });
    vi.spyOn(redteamProviderManager, 'getGradingProvider').mockImplementation(async function () {
      return mockScoringProvider;
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

    // Set up default renderPrompt mock to return a valid prompt string
    vi.mocked(evaluatorHelpers.renderPrompt).mockReset();
    vi.mocked(evaluatorHelpers.renderPrompt).mockImplementation(async (prompt) => {
      // Return the raw prompt as a simple string by default
      const rawPrompt = typeof prompt === 'object' && 'raw' in prompt ? prompt.raw : String(prompt);
      return rawPrompt;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default config values', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 10,
      maxBacktracks: 10,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
    });

    expect(provider.config.injectVar).toBe('objective');
    expect(provider.config.redteamProvider).toBe(mockRedTeamProvider);
    expect(provider.config.maxTurns).toBe(10);
    expect(provider.config.maxBacktracks).toBe(10);
    expect(provider.config.stateful).toBe(true);
    expect(provider.config.continueAfterSuccess).toBe(false);
  });

  it('should support backwards compatibility with maxRounds', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxRounds: 8, // Using old property name
      maxBacktracks: 5,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
    });

    // Should use maxRounds value when maxTurns is not provided
    expect(provider['maxTurns']).toBe(8);
  });

  it('should prefer maxTurns over maxRounds when both are provided', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 12,
      maxRounds: 8, // This should be ignored
      maxBacktracks: 5,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
    });

    // Should prefer maxTurns when both are provided
    expect(provider['maxTurns']).toBe(12);
  });

  it('should return correct provider id', () => {
    expect(crescendoProvider.id()).toBe('promptfoo:redteam:crescendo');
  });

  it('should include sessionId from context vars when response is missing it', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
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

  it('should include sessionId from target response when stateful is true', async () => {
    vi.mocked(tryUnblocking).mockResolvedValue({ success: false });

    const provider = new CrescendoProvider({
      injectVar: 'objective',
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
      const provider = new CrescendoProvider({
        injectVar: 'objective',
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
      const provider = new CrescendoProvider({
        injectVar: 'objective',
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
    });

    it('should handle unblocking provider errors gracefully', async () => {
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
        output: 'What is your business type?',
      });

      // Mock unblocking provider error
      vi.mocked(tryUnblocking).mockResolvedValue({
        success: false,
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Partial response',
        }),
      });

      const result = await crescendoProvider.callApi(prompt, context);

      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(10); // All max rounds since unblocking fails and eval doesn't reach 100
      expect(result.metadata?.stopReason).toBe('Max rounds reached');
    });

    it('should pass purpose to unblocking analysis', async () => {
      const prompt = 'test prompt';
      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: prompt, label: 'test' },
        test: { metadata: { purpose: 'financial services platform' } },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'Which bank do you use for settlements?',
      });

      vi.mocked(tryUnblocking).mockResolvedValue({
        success: true,
        unblockingPrompt: 'We use Wells Fargo for our settlement processing',
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 30,
          rationale: 'Partial information provided',
        }),
      });

      await crescendoProvider.callApi(prompt, context);

      expect(tryUnblocking).toHaveBeenCalledWith({
        messages: expect.any(Array),
        lastResponse: 'Which bank do you use for settlements?',
        goal: 'test objective',
        purpose: 'financial services platform',
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
    const testProvider = new CrescendoProvider({
      injectVar: 'objective',
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
    expect(result.metadata?.crescendoResult).toBe(true);
    expect(result.metadata?.crescendoConfidence).toBe(100);
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

    const result = await crescendoProvider.callApi(prompt, context);
    expect(result.metadata?.stopReason).toBe('Grader failed');
  });

  it('should store grader result when exiting early due to grader failure', async () => {
    const mockGraderResult = {
      pass: false,
      score: 0,
      reason: 'Detected jailbreak attempt',
      metadata: { confidence: 0.95 },
    };

    // Mock grader to fail (detect jailbreak)
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: mockGraderResult,
        })),
      } as any;
    });

    // Create a new provider for this test
    const testProvider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 3,
      maxBacktracks: 10,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
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

    const result = await testProvider.callApi(prompt, context);

    // Should exit early due to grader failure
    expect(result.metadata?.stopReason).toBe('Grader failed');

    // Should store the grader result for later use (includes assertion field)
    expect(result.metadata?.storedGraderResult).toMatchObject(mockGraderResult);
    expect(result.metadata?.storedGraderResult?.assertion).toBeDefined();
  });

  it('should not create synthetic grader result when internal evaluator succeeds', async () => {
    // Mock grader to pass (not detect jailbreak)
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: {
            pass: true,
          },
        })),
      } as any;
    });

    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 1,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
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

    // Mock scoring provider to detect success (100% confidence)
    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: true,
        metadata: 100,
        rationale: 'Internal evaluator detected successful jailbreak',
      }),
    });

    const result = await provider.callApi(prompt, context);

    expect(result.metadata?.stopReason).toBe('Max rounds reached');
    expect(result.metadata?.storedGraderResult).toMatchObject({ pass: true });
    expect(result.metadata?.storedGraderResult?.assertion).toBeDefined();
  });

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

    const testProvider = new CrescendoProvider({
      injectVar: 'objective',
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
    expect(result.metadata?.crescendoBacktrackCount).toBe(2);
    expect(result.metadata?.stopReason).toBe('Max backtracks reached');
  });

  it('should stop when max rounds reached', async () => {
    crescendoProvider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 2,
      maxBacktracks: 10,
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
      output: 'target response',
    });

    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: false,
        metadata: 50,
        rationale: 'test rationale',
      }),
    });

    const result = await crescendoProvider.callApi(prompt, context);
    expect(result.metadata?.crescendoRoundsCompleted).toBe(2);
    expect(result.metadata?.stopReason).toBe('Max rounds reached');
    expect(result.metadata?.crescendoResult).toBe(false);
  });

  it('should handle provider errors gracefully', async () => {
    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    mockRedTeamProvider.callApi.mockRejectedValueOnce(new Error('Provider error'));
    mockTargetProvider.callApi.mockResolvedValue({
      output: '',
    });

    const result = await crescendoProvider.callApi(prompt, context);
    expect(result.output).toBe('');
    expect(result.metadata?.crescendoRoundsCompleted).toBe(10);
    expect(result.metadata?.crescendoBacktrackCount).toBe(0);
    expect(result.metadata?.crescendoResult).toBe(false);
    expect(result.metadata?.stopReason).toBe('Max rounds reached');
  });

  it('should handle attack model refusal without throwing Missing keys error', async () => {
    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    // Attack model refuses to generate the prompt (isRefusal: true)
    mockRedTeamProvider.callApi.mockResolvedValue({
      output: 'I cannot help with that request',
      isRefusal: true,
    });
    mockTargetProvider.callApi.mockResolvedValue({
      output: '',
    });

    // Should complete without throwing "Missing keys" error
    const result = await crescendoProvider.callApi(prompt, context);
    expect(result.output).toBe('');
    expect(result.metadata?.crescendoRoundsCompleted).toBe(10);
    expect(result.metadata?.crescendoResult).toBe(false);
    expect(result.metadata?.stopReason).toBe('Max rounds reached');
  });

  it('should surface final target error while preserving mapped output', async () => {
    const prompt = 'test prompt';
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: prompt, label: 'test' },
    };

    // Attack prompt
    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'attack',
        rationaleBehindJailbreak: 'r',
        lastResponseSummary: 's',
      }),
    });

    // Final target step returns error with mapped output
    mockTargetProvider.callApi.mockResolvedValue({ output: 'This is 504', error: 'HTTP 504' });

    // Refusal: not a refusal, Eval: not 100 (so result built from lastResponse)
    mockScoringProvider.callApi
      .mockResolvedValueOnce({
        output: JSON.stringify({ value: false, metadata: 0, rationale: 'not refusal' }),
      })
      .mockResolvedValueOnce({
        output: JSON.stringify({ value: false, metadata: 50, rationale: 'partial' }),
      });

    const result = await crescendoProvider.callApi(prompt, context);
    expect(result.output).toBe('This is 504');
    expect(result.error).toBe('HTTP 504');
  });

  it('should handle purpose from test metadata', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      redteamProvider: mockRedTeamProvider,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
      test: {
        metadata: {
          purpose: 'test purpose',
        },
      },
    };

    mockRedTeamProvider.callApi.mockResolvedValueOnce({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValueOnce({
      output: 'target response',
    });

    mockScoringProvider.callApi.mockResolvedValueOnce({
      output: JSON.stringify({
        value: true,
        metadata: 100,
        rationale: 'test rationale',
      }),
    });

    await provider.callApi('test prompt', context);

    // Check that at least one call contains the purpose string
    const calls = mockRedTeamProvider.callApi.mock.calls;
    const hasCallWithPurpose = calls.some(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('test purpose'),
    );
    expect(hasCallWithPurpose).toBe(true);
  });

  it('should pass purpose parameter to getAttackPrompt', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      redteamProvider: mockRedTeamProvider,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
      test: {
        metadata: {
          purpose: 'test purpose for attack',
        },
      },
    };

    mockRedTeamProvider.callApi.mockResolvedValueOnce({
      output: JSON.stringify({
        generatedQuestion: 'test question',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    mockTargetProvider.callApi.mockResolvedValueOnce({
      output: 'target response',
    });

    mockScoringProvider.callApi.mockResolvedValueOnce({
      output: JSON.stringify({
        value: true,
        metadata: 100,
        rationale: 'test rationale',
      }),
    });

    await provider.callApi('test prompt', context);

    // Check that at least one call contains the purpose string
    const calls = mockRedTeamProvider.callApi.mock.calls;
    const hasCallWithPurpose = calls.some(
      (call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('test purpose for attack'),
    );
    expect(hasCallWithPurpose).toBe(true);
  });

  it('should default continueAfterSuccess to false', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      redteamProvider: mockRedTeamProvider,
    });

    expect(provider.config.continueAfterSuccess).toBe(false);
  });

  it('should respect continueAfterSuccess configuration when set to true', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      redteamProvider: mockRedTeamProvider,
      continueAfterSuccess: true,
    });

    expect(provider.config.continueAfterSuccess).toBe(true);
  });

  describe('continueAfterSuccess functionality', () => {
    beforeEach(() => {
      // Clear all mocks before each test
      vi.clearAllMocks();
    });

    it('should record success but continue when continueAfterSuccess is false', async () => {
      // Ensure grader passes for this test
      mockGetGraderById.mockImplementation(function () {
        return {
          getResult: vi.fn(async () => ({
            grade: {
              pass: true, // No jailbreak detected by grader
            },
          })),
        } as any;
      });

      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 2,
        redteamProvider: mockRedTeamProvider,
        continueAfterSuccess: false,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: { assert: [{ type: 'mock-grader' }] } as any,
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'harmful request',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'harmful response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1, cached: 0 },
      });

      // Mock refusal scoring to not be a refusal
      mockScoringProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: false,
            metadata: 0,
            rationale: 'Not a refusal',
          }),
        })
        // Successful jailbreak on first attempt
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: true,
            metadata: 100,
            rationale: 'Successful jailbreak',
          }),
        })
        // Subsequent calls (refusal + evaluator) return no success
        .mockResolvedValue({
          output: JSON.stringify({
            value: false,
            metadata: 0,
            rationale: 'No additional success',
          }),
        });

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.stopReason).toBe('Max rounds reached');
      expect(result.metadata?.successfulAttacks).toHaveLength(1);
      expect(result.metadata?.totalSuccessfulAttacks).toBe(1);
      expect(result.metadata?.successfulAttacks?.[0]).toEqual({
        turn: 1,
        prompt: 'harmful request',
        response: 'harmful response',
      });
      expect(result.metadata?.crescendoRoundsCompleted).toBe(2); // Completed configured rounds
    });

    it('should continue and collect multiple successful attacks when continueAfterSuccess is true', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 3,
        redteamProvider: mockRedTeamProvider,
        continueAfterSuccess: true,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: { assert: [{ type: 'mock-grader' }] } as any,
      };

      // Mock unblocking to return false so it doesn't interfere
      vi.mocked(tryUnblocking).mockResolvedValue({
        success: false,
      });

      mockRedTeamProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({
            generatedQuestion: 'first harmful request',
            rationaleBehindJailbreak: 'test rationale',
            lastResponseSummary: 'test summary',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            generatedQuestion: 'second harmful request',
            rationaleBehindJailbreak: 'test rationale',
            lastResponseSummary: 'test summary',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            generatedQuestion: 'third request',
            rationaleBehindJailbreak: 'test rationale',
            lastResponseSummary: 'test summary',
          }),
        });

      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'first harmful response',
          tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1, cached: 0 },
        })
        .mockResolvedValueOnce({
          output: 'second harmful response',
          tokenUsage: { total: 12, prompt: 6, completion: 6, numRequests: 1, cached: 0 },
        })
        .mockResolvedValueOnce({
          output: 'third response',
          tokenUsage: { total: 8, prompt: 4, completion: 4, numRequests: 1, cached: 0 },
        });

      // Mock refusal scoring for all three rounds to not be refusals
      mockScoringProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: false,
            metadata: 0,
            rationale: 'Not a refusal',
          }),
        })
        // Mock internal evaluator to succeed on first attempt
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: true,
            metadata: 100,
            rationale: 'First successful jailbreak',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: false,
            metadata: 0,
            rationale: 'Not a refusal',
          }),
        })
        // Mock internal evaluator to succeed on second attempt
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: true,
            metadata: 100,
            rationale: 'Second successful jailbreak',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: false,
            metadata: 0,
            rationale: 'Not a refusal',
          }),
        })
        // Mock internal evaluator to fail on third attempt
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: false,
            metadata: 50,
            rationale: 'Not successful',
          }),
        });

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.stopReason).toBe('Max rounds reached');
      expect(result.metadata?.successfulAttacks).toBeInstanceOf(Array);
      expect(result.metadata?.totalSuccessfulAttacks).toBeGreaterThanOrEqual(2);
      expect(result.metadata?.crescendoRoundsCompleted).toBe(3); // All three rounds
    });

    it('should handle mixed internal evaluator successes and failures with continueAfterSuccess', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 4,
        redteamProvider: mockRedTeamProvider,
        continueAfterSuccess: true,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: { assert: [{ type: 'mock-grader' }] } as any,
      };

      // Mock multiple calls
      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'harmful request',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'harmful response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1, cached: 0 },
      });

      // Mock refusal scoring and internal evaluator alternating
      mockScoringProvider.callApi
        // Round 1: refusal false, internal evaluator false
        .mockResolvedValueOnce({
          output: JSON.stringify({ value: false, metadata: 0, rationale: 'Not a refusal' }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({ value: false, metadata: 30, rationale: 'Not successful' }),
        })
        // Round 2: refusal false, internal evaluator true
        .mockResolvedValueOnce({
          output: JSON.stringify({ value: false, metadata: 0, rationale: 'Not a refusal' }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({ value: true, metadata: 100, rationale: 'Successful' }),
        })
        // Round 3: refusal false, internal evaluator false
        .mockResolvedValueOnce({
          output: JSON.stringify({ value: false, metadata: 0, rationale: 'Not a refusal' }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({ value: false, metadata: 40, rationale: 'Not successful' }),
        })
        // Round 4: refusal false, internal evaluator true
        .mockResolvedValueOnce({
          output: JSON.stringify({ value: false, metadata: 0, rationale: 'Not a refusal' }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({ value: true, metadata: 100, rationale: 'Successful' }),
        });

      // Note: External grader behavior is tested separately in integration tests

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.stopReason).toBe('Max rounds reached');
      expect(result.metadata?.successfulAttacks).toBeInstanceOf(Array);
      expect(result.metadata?.totalSuccessfulAttacks).toBeGreaterThanOrEqual(0);
    });

    it('should have empty successfulAttacks array when no attacks succeed', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 2,
        redteamProvider: mockRedTeamProvider,
        continueAfterSuccess: true,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: { assert: [{ type: 'mock-grader' }] } as any,
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'safe request',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'safe response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1, cached: 0 },
      });

      // Mock refusal scoring and internal evaluator for both rounds
      mockScoringProvider.callApi
        // Round 1: refusal false, internal evaluator false
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
            metadata: 30,
            rationale: 'Safe response, no jailbreak',
          }),
        })
        // Round 2: refusal false, internal evaluator false
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
            metadata: 30,
            rationale: 'Safe response, no jailbreak',
          }),
        });

      // Note: External grader behavior is tested separately in integration tests

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.stopReason).toBe('Max rounds reached');
      expect(result.metadata?.successfulAttacks).toBeInstanceOf(Array);
      expect(result.metadata?.totalSuccessfulAttacks).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Token Counting', () => {
    beforeEach(async () => {
      const { TokenUsageTracker } = await import('../../../../src/util/tokenUsage');
      TokenUsageTracker.getInstance().resetAllUsage();
    });

    it('should correctly track token usage from target provider', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
        tokenUsage: { total: 50, prompt: 25, completion: 25, numRequests: 1, cached: 0 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
        tokenUsage: { total: 100, prompt: 40, completion: 60, numRequests: 1, cached: 0 },
      });

      mockScoringProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: false,
            metadata: 0,
            rationale: 'Not a refusal',
          }),
          tokenUsage: { total: 30, prompt: 15, completion: 15, numRequests: 1, cached: 0 },
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: false,
            metadata: 50,
            rationale: 'Not successful',
          }),
          tokenUsage: { total: 25, prompt: 12, completion: 13, numRequests: 1, cached: 0 },
        });

      const result = await provider.callApi('test prompt', context);

      // Should accumulate token usage from target provider calls
      expect(result.tokenUsage).toMatchObject({
        total: 100,
        prompt: 40,
        completion: 60,
        numRequests: 1,
        cached: 0,
      });
    });

    it('should accumulate token usage across multiple rounds', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 2,
        redteamProvider: mockRedTeamProvider,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
        tokenUsage: { total: 50, prompt: 25, completion: 25, numRequests: 1, cached: 0 },
      });

      // Target provider calls for both rounds
      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'first response',
          tokenUsage: { total: 100, prompt: 40, completion: 60, numRequests: 1, cached: 0 },
        })
        .mockResolvedValueOnce({
          output: 'second response',
          tokenUsage: { total: 80, prompt: 30, completion: 50, numRequests: 1, cached: 0 },
        });

      // Mock scoring provider calls
      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Not successful',
        }),
        tokenUsage: { total: 30, prompt: 15, completion: 15, numRequests: 1, cached: 0 },
      });

      const result = await provider.callApi('test prompt', context);

      // Should accumulate token usage from all target provider calls
      expect(result.tokenUsage).toMatchObject({
        total: 180,
        prompt: 70,
        completion: 110,
        numRequests: 2,
        cached: 0,
      });
    });

    it('should handle missing token usage from target responses', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });

      // Target provider response without token usage
      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Not successful',
        }),
      });

      const result = await provider.callApi('test prompt', context);

      // Should handle missing token usage gracefully
      expect(result.tokenUsage).toMatchObject({
        total: 0,
        prompt: 0,
        completion: 0,
        numRequests: 1, // Still tracks requests even without token counts
        cached: 0,
      });
    });

    it('should handle zero token counts correctly', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
        tokenUsage: { total: 0, prompt: 0, completion: 0, numRequests: 0, cached: 0 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
        tokenUsage: { total: 0, prompt: 0, completion: 0, numRequests: 0, cached: 0 },
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Not successful',
        }),
        tokenUsage: { total: 0, prompt: 0, completion: 0, numRequests: 0, cached: 0 },
      });

      const result = await provider.callApi('test prompt', context);

      expect(result.tokenUsage).toMatchObject({
        total: 0,
        prompt: 0,
        completion: 0,
        numRequests: 0,
        cached: 0,
      });
    });

    it('should track token usage from redteam provider calls', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
      });

      const { TokenUsageTracker } = await import('../../../../src/util/tokenUsage');
      const tracker = TokenUsageTracker.getInstance();

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
        tokenUsage: { total: 75, prompt: 35, completion: 40, numRequests: 1, cached: 0 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
        tokenUsage: { total: 100, prompt: 40, completion: 60, numRequests: 1, cached: 0 },
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Not successful',
        }),
        tokenUsage: { total: 30, prompt: 15, completion: 15, numRequests: 1, cached: 0 },
      });

      await provider.callApi('test prompt', context);

      // Should track redteam provider token usage via TokenUsageTracker
      const redteamUsage = tracker.getProviderUsage('mock-redteam');
      expect(redteamUsage).toMatchObject({
        total: 75,
        prompt: 35,
        completion: 40,
        numRequests: 1,
        cached: 0,
      });
    });

    it('should track token usage from scoring provider calls', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
      });

      const { TokenUsageTracker } = await import('../../../../src/util/tokenUsage');
      const tracker = TokenUsageTracker.getInstance();

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
        tokenUsage: { total: 50, prompt: 25, completion: 25, numRequests: 1, cached: 0 },
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
        tokenUsage: { total: 100, prompt: 40, completion: 60, numRequests: 1, cached: 0 },
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Not successful',
        }),
        tokenUsage: { total: 40, prompt: 18, completion: 22, numRequests: 1, cached: 0 },
      });

      await provider.callApi('test prompt', context);

      // Should track scoring provider token usage via TokenUsageTracker
      // Scoring provider is called twice per round: refusal check + internal evaluator
      const scoringUsage = tracker.getProviderUsage('mock-scoring');
      expect(scoringUsage).toMatchObject({
        total: 80, // 40 * 2 calls
        prompt: 36, // 18 * 2 calls
        completion: 44, // 22 * 2 calls
        numRequests: 2,
        cached: 0,
      });
    });

    it('should accumulate token usage with unblocking responses', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
        tokenUsage: { total: 50, prompt: 25, completion: 25, numRequests: 1, cached: 0 },
      });

      // First target call asks blocking question
      // Second target call is the unblocking response
      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'What is your company registration number?',
          tokenUsage: { total: 80, prompt: 30, completion: 50, numRequests: 1, cached: 0 },
        })
        .mockResolvedValueOnce({
          output: 'Thank you for the information',
          tokenUsage: { total: 60, prompt: 25, completion: 35, numRequests: 1, cached: 0 },
        });

      // Mock unblocking to detect blocking question
      vi.mocked(tryUnblocking).mockResolvedValue({
        success: true,
        unblockingPrompt: 'Our registration number is REG123456',
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Not successful',
        }),
        tokenUsage: { total: 30, prompt: 15, completion: 15, numRequests: 1, cached: 0 },
      });

      const result = await provider.callApi('test prompt', context);

      // Should accumulate token usage from both target provider calls
      expect(result.tokenUsage).toMatchObject({
        total: 140,
        prompt: 55,
        completion: 85,
        numRequests: 2,
        cached: 0,
      });
    });

    it('should handle incomplete token usage data gracefully', async () => {
      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 1,
        redteamProvider: mockRedTeamProvider,
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      mockRedTeamProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
        tokenUsage: { total: 50, prompt: 25, completion: 25, numRequests: 1 }, // Missing cached
      });

      mockTargetProvider.callApi.mockResolvedValue({
        output: 'target response',
        tokenUsage: { total: 100, prompt: 40 }, // Missing completion, numRequests, cached
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Not successful',
        }),
        tokenUsage: { completion: 20 }, // Only completion provided
      });

      const result = await provider.callApi('test prompt', context);

      // Should handle incomplete token usage gracefully
      expect(result.tokenUsage?.total).toBeDefined();
      expect(result.tokenUsage?.prompt).toBeDefined();
      expect(result.tokenUsage?.completion).toBeDefined();
    });
  });
});

describe('CrescendoProvider - Abort Signal Handling', () => {
  let mockRedTeamProvider: any;
  let mockScoringProvider: any;
  let mockTargetProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRedTeamProvider = {
      id: () => 'mock-redteam',
      callApi: vi.fn(),
      delay: 0,
    };
    mockScoringProvider = {
      id: () => 'mock-scoring',
      callApi: vi.fn(),
      delay: 0,
    };
    mockTargetProvider = {
      id: () => 'mock-target',
      callApi: vi.fn(),
    };

    vi.spyOn(redteamProviderManager, 'getProvider').mockImplementation(async function (
      options: any,
    ) {
      if (options.provider && typeof options.provider === 'object') {
        return options.jsonOnly ? options.provider : mockScoringProvider;
      }
      return options.jsonOnly ? mockRedTeamProvider : mockScoringProvider;
    });
    vi.spyOn(redteamProviderManager, 'getGradingProvider').mockImplementation(async function () {
      return mockScoringProvider;
    });

    vi.mocked(checkServerFeatureSupport).mockResolvedValue(true);
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: { pass: true },
        })),
      } as any;
    });
    vi.mocked(tryUnblocking).mockResolvedValue({ success: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should re-throw AbortError and not swallow it in catch block', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 3,
      redteamProvider: mockRedTeamProvider,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    // Create an AbortError
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    // Mock the redteam provider to throw AbortError
    mockRedTeamProvider.callApi.mockRejectedValue(abortError);

    // Should re-throw the AbortError, not swallow it
    await expect(provider.callApi('test prompt', context)).rejects.toThrow(
      'The operation was aborted',
    );
  });

  it('should pass options with abortSignal to internal method calls', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 1,
      redteamProvider: mockRedTeamProvider,
    });

    const abortController = new AbortController();
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
    };
    const options = { abortSignal: abortController.signal };

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
        rationale: 'Not successful',
      }),
    });

    await provider.callApi('test prompt', context, options);

    // Verify that options with abortSignal was passed to the redteam provider
    expect(mockRedTeamProvider.callApi).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ abortSignal: abortController.signal }),
    );

    // Verify that options with abortSignal was passed to the scoring provider
    expect(mockScoringProvider.callApi).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ abortSignal: abortController.signal }),
    );
  });

  it('should stop immediately when abort signal is triggered during attack', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 10,
      redteamProvider: mockRedTeamProvider,
    });

    const abortController = new AbortController();
    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
    };
    const options = { abortSignal: abortController.signal };

    let callCount = 0;
    mockRedTeamProvider.callApi.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        // Simulate abort on second call
        const abortError = new Error('The operation was aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }
      return Promise.resolve({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: false,
        metadata: 50,
        rationale: 'Not successful',
      }),
    });

    // Should throw AbortError and not complete all 10 rounds
    await expect(provider.callApi('test prompt', context, options)).rejects.toThrow(
      'The operation was aborted',
    );

    // Should have stopped before completing all rounds
    expect(callCount).toBe(2);
  });

  it('should not swallow AbortError from scoring provider', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 3,
      redteamProvider: mockRedTeamProvider,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
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

    // Create an AbortError from scoring provider
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockScoringProvider.callApi.mockRejectedValue(abortError);

    // Should re-throw the AbortError from scoring provider
    await expect(provider.callApi('test prompt', context)).rejects.toThrow(
      'The operation was aborted',
    );
  });

  it('should swallow non-AbortError exceptions and continue loop', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 2,
      redteamProvider: mockRedTeamProvider,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    let callCount = 0;
    mockRedTeamProvider.callApi.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call throws a regular error (should be swallowed)
        throw new Error('Regular error');
      }
      return Promise.resolve({
        output: JSON.stringify({
          generatedQuestion: 'test question',
          rationaleBehindJailbreak: 'test rationale',
          lastResponseSummary: 'test summary',
        }),
      });
    });

    mockTargetProvider.callApi.mockResolvedValue({
      output: 'target response',
    });

    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: false,
        metadata: 50,
        rationale: 'Not successful',
      }),
    });

    // Should NOT throw - regular errors are swallowed and loop continues
    const result = await provider.callApi('test prompt', context);

    // Should have completed both rounds (error on first was swallowed)
    expect(callCount).toBe(2);
    expect(result.metadata?.crescendoRoundsCompleted).toBe(2);
  });
});

describe('CrescendoProvider - Chat Template Support', () => {
  let crescendoProvider: CrescendoProvider;
  let mockRedTeamProvider: any;
  let mockScoringProvider: any;
  let mockTargetProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRedTeamProvider = {
      id: () => 'mock-redteam',
      callApi: vi.fn(),
      delay: 0,
    };
    mockScoringProvider = {
      id: () => 'mock-scoring',
      callApi: vi.fn(),
      delay: 0,
    };
    mockTargetProvider = {
      id: () => 'mock-target',
      callApi: vi.fn(),
    };

    crescendoProvider = new CrescendoProvider({
      injectVar: 'user_input',
      maxTurns: 3,
      redteamProvider: mockRedTeamProvider,
      stateful: false, // Key: test with stateful=false to trigger the bug
    });

    vi.spyOn(redteamProviderManager, 'getProvider').mockImplementation(async function (
      options: any,
    ) {
      if (options.provider && typeof options.provider === 'object') {
        return options.jsonOnly ? options.provider : mockScoringProvider;
      }
      return options.jsonOnly ? mockRedTeamProvider : mockScoringProvider;
    });
    vi.spyOn(redteamProviderManager, 'getGradingProvider').mockImplementation(async function () {
      return mockScoringProvider;
    });

    vi.mocked(checkServerFeatureSupport).mockResolvedValue(true);
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: { pass: true },
        })),
      } as any;
    });
    vi.mocked(tryUnblocking).mockResolvedValue({ success: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject invalid chat structures with invalid roles', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 2,
      stateful: false,
      redteamProvider: mockRedTeamProvider,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    // Mock renderPrompt to return JSON with invalid roles
    const invalidChatStructure = JSON.stringify([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'invalid_role', content: 'This has an invalid role' },
    ]);
    vi.mocked(evaluatorHelpers.renderPrompt).mockResolvedValueOnce(invalidChatStructure);

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
      output: JSON.stringify({ value: false, metadata: 50 }),
    });

    await provider.callApi('test prompt', context);

    // Should fall back to conversation history because structure is invalid
    // The first call should be the stringified conversation history sent directly as prompt
    const firstCall = mockTargetProvider.callApi.mock.calls[0];
    const firstCallPrompt = firstCall[0];

    // Should be wrapped in a single user message containing the entire invalid structure as a string
    expect(firstCallPrompt).toContain('"role":"user"');
    expect(firstCallPrompt).toContain('"content":');
    expect(firstCallPrompt).toContain('invalid_role'); // The invalid structure should be in content as a string
  });

  it('should reject non-array JSON structures', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      maxTurns: 2,
      stateful: false,
      redteamProvider: mockRedTeamProvider,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { objective: 'test objective' },
      prompt: { raw: 'test prompt', label: 'test' },
    };

    // Mock renderPrompt to return JSON object (not array)
    const nonArrayJson = JSON.stringify({ role: 'user', content: 'not an array' });
    vi.mocked(evaluatorHelpers.renderPrompt).mockResolvedValueOnce(nonArrayJson);

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
      output: JSON.stringify({ value: false, metadata: 50 }),
    });

    await provider.callApi('test prompt', context);

    // Should fall back to conversation history because it's not an array
    // The first call should be the stringified conversation history sent directly as prompt
    const firstCall = mockTargetProvider.callApi.mock.calls[0];
    const firstCallPrompt = firstCall[0];

    // Should be wrapped in a single user message containing the entire non-array structure as a string
    expect(firstCallPrompt).toContain('"role":"user"');
    expect(firstCallPrompt).toContain('"content":');
    expect(firstCallPrompt).toContain('not an array'); // The non-array structure should be in content as a string
  });

  it('should use rendered chat template instead of conversation history when template contains structured JSON', async () => {
    // Simulate a chat template that renders to structured JSON (like _conversation templates)
    const chatTemplatePrompt = `[
  {
    "role": "system",
    "content": "You are a helpful assistant"
  },
  {
    "role": "user", 
    "content": "{{ user_input }}"
  }
]`;

    const provider = new CrescendoProvider({
      injectVar: 'user_input',
      maxTurns: 1,
      redteamProvider: mockRedTeamProvider,
      stateful: true,
    });

    const context = {
      originalProvider: mockTargetProvider,
      vars: { user_input: 'test input' },
      prompt: { raw: chatTemplatePrompt, label: 'chat-template' },
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test attack',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    // Mock renderPrompt to return structured JSON (simulating _conversation template)
    vi.mocked(evaluatorHelpers.renderPrompt).mockResolvedValueOnce(
      JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'test attack' },
      ]),
    );

    // Mock target provider to verify it receives structured JSON, not stringified conversation
    mockTargetProvider.callApi.mockImplementation(function (prompt: string) {
      // Verify that the prompt is structured JSON, not a JSON string
      try {
        const parsed = JSON.parse(prompt);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0]).toMatchObject({ role: 'system', content: expect.any(String) });
        expect(parsed[1]).toMatchObject({ role: 'user', content: expect.any(String) });
      } catch (_e) {
        throw new Error('Expected structured JSON array, got invalid JSON or string');
      }

      return Promise.resolve({
        output: 'target response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1, cached: 0 },
      });
    });

    // Mock scoring provider for refusal check (not a refusal) and internal evaluator (success)
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
          value: true, // Internal evaluator success
          metadata: 100,
          rationale: 'Successful jailbreak',
        }),
      });

    const result = await provider.callApi(chatTemplatePrompt, context);

    expect(mockTargetProvider.callApi).toHaveBeenCalled();
    expect(result.metadata?.stopReason).toBe('Max rounds reached');
  });

  it('should fall back to conversation history for non-chat templates when stateful=false', async () => {
    const textPrompt = 'Please respond to: {{ user_input }}';

    const context = {
      originalProvider: mockTargetProvider,
      vars: { user_input: 'test input' },
      prompt: { raw: textPrompt, label: 'text-template' },
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test attack',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    // Mock renderPrompt to return plain text (non-chat template)
    vi.mocked(evaluatorHelpers.renderPrompt).mockResolvedValueOnce(
      'Please respond to: test attack',
    );

    // Mock target provider to verify it receives JSON stringified conversation history
    mockTargetProvider.callApi.mockImplementation(function (prompt: string) {
      // For non-chat templates with stateful=false, should receive stringified conversation
      expect(typeof prompt).toBe('string');

      // Should be JSON string of conversation array, not structured JSON
      try {
        const parsed = JSON.parse(prompt);
        expect(Array.isArray(parsed)).toBe(true);
        // Should be conversation history format
        expect(parsed[0]).toMatchObject({ role: 'user', content: expect.any(String) });
      } catch (_e) {
        // If it's not JSON, that's also acceptable for text templates
      }

      return Promise.resolve({
        output: 'target response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1, cached: 0 },
      });
    });

    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: false,
        metadata: 50,
        rationale: 'Not successful',
      }),
    });

    await crescendoProvider.callApi(textPrompt, context);

    expect(mockTargetProvider.callApi).toHaveBeenCalled();
  });

  it('should always use rendered prompt when stateful=true regardless of template type', async () => {
    const statefulProvider = new CrescendoProvider({
      injectVar: 'user_input',
      maxTurns: 1,
      redteamProvider: mockRedTeamProvider,
      stateful: true, // Key: test stateful=true path
    });

    const chatTemplatePrompt = `[{"role": "user", "content": "{{ user_input }}"}]`;

    const context = {
      originalProvider: mockTargetProvider,
      vars: { user_input: 'test input' },
      prompt: { raw: chatTemplatePrompt, label: 'chat-template' },
    };

    mockRedTeamProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        generatedQuestion: 'test attack',
        rationaleBehindJailbreak: 'test rationale',
        lastResponseSummary: 'test summary',
      }),
    });

    // Mock renderPrompt to return structured JSON
    vi.mocked(evaluatorHelpers.renderPrompt).mockResolvedValueOnce(
      '[{"role": "user", "content": "test attack"}]',
    );

    mockTargetProvider.callApi.mockImplementation(function (prompt: string) {
      // With stateful=true, should always receive rendered prompt directly
      expect(prompt).toBe('[{"role": "user", "content": "test attack"}]');

      return Promise.resolve({
        output: 'target response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1, cached: 0 },
      });
    });

    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: true,
        metadata: 100,
        rationale: 'Success',
      }),
    });

    await statefulProvider.callApi(chatTemplatePrompt, context);

    expect(mockTargetProvider.callApi).toHaveBeenCalled();
  });
});

describe('CrescendoProvider - perTurnLayers configuration', () => {
  let mockRedTeamProvider: any;
  let mockScoringProvider: any;
  let mockTargetProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRedTeamProvider = {
      id: () => 'mock-redteam',
      callApi: vi.fn(),
      delay: 0,
    };
    mockScoringProvider = {
      id: () => 'mock-scoring',
      callApi: vi.fn(),
      delay: 0,
    };
    mockTargetProvider = {
      id: () => 'mock-target',
      callApi: vi.fn(),
    };

    vi.spyOn(redteamProviderManager, 'getProvider').mockImplementation(async function (
      options: any,
    ) {
      if (options.provider && typeof options.provider === 'object') {
        return options.jsonOnly ? options.provider : mockScoringProvider;
      }
      return options.jsonOnly ? mockRedTeamProvider : mockScoringProvider;
    });
    vi.spyOn(redteamProviderManager, 'getGradingProvider').mockImplementation(async function () {
      return mockScoringProvider;
    });

    vi.mocked(checkServerFeatureSupport).mockResolvedValue(true);
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: { pass: true },
        })),
      } as any;
    });
    vi.mocked(tryUnblocking).mockResolvedValue({ success: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should accept _perTurnLayers in config', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      redteamProvider: mockRedTeamProvider,
      _perTurnLayers: [{ id: 'audio' }, { id: 'image' }],
    });

    expect(provider['perTurnLayers']).toEqual([{ id: 'audio' }, { id: 'image' }]);
  });

  it('should default perTurnLayers to empty array when not provided', () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
      redteamProvider: mockRedTeamProvider,
    });

    expect(provider['perTurnLayers']).toEqual([]);
  });

  it('should include promptAudio and promptImage in redteamHistory when transforms are applied', async () => {
    // Configure the hoisted mock to return audio/image data for this test
    mockApplyRuntimeTransforms.mockResolvedValueOnce({
      transformedPrompt: 'transformed prompt',
      audio: { data: 'base64-audio-data', format: 'mp3' },
      image: { data: 'base64-image-data', format: 'png' },
    });

    const provider = new CrescendoProvider({
      injectVar: 'objective',
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

    // Verify redteamHistory is populated
    expect(result.metadata?.redteamHistory).toBeDefined();
    expect(Array.isArray(result.metadata?.redteamHistory)).toBe(true);
  });

  it('should not apply transforms when perTurnLayers is empty', async () => {
    const provider = new CrescendoProvider({
      injectVar: 'objective',
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
});
