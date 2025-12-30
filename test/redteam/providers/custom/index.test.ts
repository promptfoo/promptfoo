import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomProvider, MemorySystem } from '../../../../src/redteam/providers/custom/index';
import { redteamProviderManager, tryUnblocking } from '../../../../src/redteam/providers/shared';
import { checkServerFeatureSupport } from '../../../../src/util/server';

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
      if (options.provider && typeof options.provider === 'object') {
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

    // Mock grader to fail (jailbreak success)
    mockGetGraderById.mockImplementation(function () {
      return {
        getResult: vi.fn(async () => ({
          grade: mockGraderResult,
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
        // Eval score - partial success (not 100%)
        output: JSON.stringify({
          value: false,
          metadata: 50,
          rationale: 'Partial goal achievement',
        }),
      });

    const result = await testProvider.callApi(prompt, context);

    // Verify storedGraderResult is included in metadata (with assertion.value set to rubric)
    expect(result.metadata?.storedGraderResult).toEqual({
      ...mockGraderResult,
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
      });

      const context = {
        originalProvider: mockTargetProvider,
        vars: { objective: 'test objective' },
        prompt: { raw: 'test prompt', label: 'test' },
      };

      await testProvider.callApi('test prompt', context, options);

      // Scoring provider should be called with options
      expect(mockScoringProvider.callApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        options,
      );
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
        transformedPrompt: 'transformed prompt',
        audio: { data: 'base64-audio-data', format: 'mp3' },
        image: { data: 'base64-image-data', format: 'png' },
      });

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
  });
});
