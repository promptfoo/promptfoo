import { getGraderById } from '../../../../src/redteam/graders';
import { CustomProvider, MemorySystem } from '../../../../src/redteam/providers/custom';
import { redteamProviderManager, tryUnblocking } from '../../../../src/redteam/providers/shared';
import { checkServerFeatureSupport } from '../../../../src/util/server';

import type { Message } from '../../../../src/redteam/providers/shared';

jest.mock('../../../../src/providers/promptfoo', () => ({
  PromptfooChatCompletionProvider: jest.fn().mockImplementation(() => ({
    id: () => 'mock-unblocking',
    callApi: jest.fn(),
    delay: 0,
  })),
}));

jest.mock('../../../../src/util/server', () => ({
  checkServerFeatureSupport: jest.fn(),
}));

jest.mock('../../../../src/redteam/providers/shared', () => ({
  ...jest.requireActual('../../../../src/redteam/providers/shared'),
  tryUnblocking: jest.fn(),
}));

jest.mock('../../../../src/redteam/graders', () => ({
  getGraderById: jest.fn(),
}));

jest.mock('../../../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn(() => false),
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

describe('CustomProvider', () => {
  let customProvider: CustomProvider;
  let mockRedTeamProvider: any;
  let mockScoringProvider: any;
  let mockTargetProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh mocks for each test
    mockRedTeamProvider = {
      id: () => 'mock-redteam',
      callApi: jest.fn(),
      delay: 0,
    };
    mockScoringProvider = {
      id: () => 'mock-scoring',
      callApi: jest.fn(),
      delay: 0,
    };
    mockTargetProvider = {
      id: () => 'mock-target',
      callApi: jest.fn(),
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
    jest.spyOn(redteamProviderManager, 'getProvider').mockImplementation(async (options) => {
      // When the provider is already an object (not a string), return it for jsonOnly requests
      // For non-jsonOnly requests (scoring), return the scoring provider
      if (options.provider && typeof options.provider === 'object') {
        return options.jsonOnly ? options.provider : mockScoringProvider;
      }
      return options.jsonOnly ? mockRedTeamProvider : mockScoringProvider;
    });

    // Mock server feature support to return true so unblocking logic runs
    jest.mocked(checkServerFeatureSupport).mockResolvedValue(true);

    // Set up default getGraderById mock
    jest.mocked(getGraderById).mockReset();
    jest.mocked(getGraderById).mockReturnValue({
      getResult: jest.fn(async () => ({
        grade: {
          pass: false,
        },
      })),
    } as any);

    // Set up default tryUnblocking mock
    jest.mocked(tryUnblocking).mockReset();
    jest.mocked(tryUnblocking).mockResolvedValue({ success: false });
  });

  afterEach(() => {
    jest.resetAllMocks();
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

  describe('Unblocking functionality', () => {
    it('should detect blocking question and send unblocking response', async () => {
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
      jest.mocked(tryUnblocking).mockResolvedValue({
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

      const result = await customProvider.callApi(prompt, context);

      expect(tryUnblocking).toHaveBeenCalledWith({
        messages: expect.any(Array),
        lastResponse: 'What is your company registration number?',
        goal: 'test objective',
        purpose: 'e-commerce platform',
      });

      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(2); // Original + unblocking response
      expect(result.metadata?.stopReason).toBe('Internal evaluator success');
    });

    it('should continue without unblocking when no blocking question detected', async () => {
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
      jest.mocked(tryUnblocking).mockResolvedValue({
        success: false,
      });

      mockScoringProvider.callApi.mockResolvedValue({
        output: JSON.stringify({
          value: true,
          metadata: 100,
          rationale: 'Direct helpful response',
        }),
      });

      const result = await customProvider.callApi(prompt, context);

      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1); // Only original call
      expect(result.metadata?.stopReason).toBe('Internal evaluator success');
    });
  });

  it('should succeed via internal evaluator when eval score is 100', async () => {
    // Set up grader to pass (not detect jailbreak) so we don't fail via grader
    jest.mocked(getGraderById).mockReturnValue({
      getResult: jest.fn(async () => ({
        grade: {
          pass: true, // Pass means no jailbreak detected
        },
      })),
    } as any);

    // Create a new provider with smaller max turns for this test
    const testProvider = new CustomProvider({
      injectVar: 'objective',
      strategyText: 'Custom strategy for testing',
      maxTurns: 2, // Use smaller max turns
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
    expect(result.metadata?.stopReason).toBe('Internal evaluator success');
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
    jest.mocked(tryUnblocking).mockResolvedValue({
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
    jest.mocked(getGraderById).mockReturnValue({
      getResult: jest.fn(async () => ({
        grade: {
          pass: true,
        },
      })),
    } as any);

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
      maxTurns: 2,
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

    expect(result.metadata?.stopReason).toBe('Internal evaluator success');
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
    jest.mocked(getGraderById).mockReturnValue({
      getResult: jest.fn(
        async (
          prompt: string,
          output: string,
          test: any,
          provider: any,
          value: any,
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
    } as any);

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

    // Mock grader to fail (jailbreak success)
    jest.mocked(getGraderById).mockReturnValue({
      getResult: jest.fn(async () => ({
        grade: mockGraderResult,
      })),
    } as any);

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

    // Verify storedGraderResult is included in metadata
    expect(result.metadata?.storedGraderResult).toEqual(mockGraderResult);
    expect(result.metadata?.stopReason).toBe('Grader failed');
    // Verify it's actually a successful attack
    expect(result.metadata?.successfulAttacks).toHaveLength(1);
    expect(result.metadata?.totalSuccessfulAttacks).toBe(1);
  });

  it('should store synthetic grader result when internal evaluator succeeds', async () => {
    const testProvider = new CustomProvider({
      injectVar: 'objective',
      maxTurns: 1,
      maxBacktracks: 1,
      redteamProvider: mockRedTeamProvider,
      stateful: false,
      strategyText: 'Test strategy',
    });

    // Mock grader to pass (no jailbreak)
    jest.mocked(getGraderById).mockReturnValue({
      getResult: jest.fn(async () => ({
        grade: {
          pass: true,
          score: 1,
          reason: 'No jailbreak detected',
        },
      })),
    } as any);

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

    // Should exit early due to internal evaluator success
    expect(result.metadata?.stopReason).toBe('Internal evaluator success');

    // Should store a synthetic grader result
    expect(result.metadata?.storedGraderResult).toEqual({
      pass: false,
      score: 0,
      reason: 'Goal fully achieved - sensitive data extracted',
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

    // Mock grader to fail on first turn, pass on second
    jest.mocked(getGraderById).mockReturnValue({
      getResult: jest
        .fn()
        .mockResolvedValueOnce({ grade: firstGraderResult })
        .mockResolvedValueOnce({ grade: secondGraderResult }),
    } as any);

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

    // Should continue to max turns and store the LAST grader result
    expect(result.metadata?.storedGraderResult).toEqual(secondGraderResult);
    expect(result.metadata?.stopReason).toBe('Max rounds reached');
    expect(result.metadata?.successfulAttacks).toHaveLength(1);
    expect(result.metadata?.totalSuccessfulAttacks).toBe(1);
  });
});
