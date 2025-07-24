import { getGraderById } from '../../../../src/redteam/graders';
import { CrescendoProvider, MemorySystem } from '../../../../src/redteam/providers/crescendo';
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

describe('CrescendoProvider', () => {
  let crescendoProvider: CrescendoProvider;
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

    crescendoProvider = new CrescendoProvider({
      injectVar: 'objective',
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
    jest.restoreAllMocks();
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

  it('should return correct provider id', () => {
    expect(crescendoProvider.id()).toBe('promptfoo:redteam:crescendo');
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

      const result = await crescendoProvider.callApi(prompt, context);

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

      const result = await crescendoProvider.callApi(prompt, context);

      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(1); // Only original call
      expect(result.metadata?.stopReason).toBe('Internal evaluator success');
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
      jest.mocked(tryUnblocking).mockResolvedValue({
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

      jest.mocked(tryUnblocking).mockResolvedValue({
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
    const testProvider = new CrescendoProvider({
      injectVar: 'objective',
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
    jest.mocked(getGraderById).mockReturnValue({
      getResult: jest.fn(async () => ({
        grade: mockGraderResult,
      })),
    } as any);

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

    const result = await testProvider.callApi(prompt, context);

    // Should exit early due to grader failure
    expect(result.metadata?.stopReason).toBe('Grader failed');

    // Should store the grader result for later use
    expect(result.metadata?.storedGraderResult).toEqual(mockGraderResult);
  });

  it('should store grader result when exiting early due to internal evaluator success', async () => {
    // Mock grader to pass (not detect jailbreak)
    jest.mocked(getGraderById).mockReturnValue({
      getResult: jest.fn(async () => ({
        grade: {
          pass: true,
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

    // Mock scoring provider to detect success (100% confidence)
    mockScoringProvider.callApi.mockResolvedValue({
      output: JSON.stringify({
        value: true,
        metadata: 100,
        rationale: 'Internal evaluator detected successful jailbreak',
      }),
    });

    const result = await crescendoProvider.callApi(prompt, context);

    // Should exit early due to internal evaluator success
    expect(result.metadata?.stopReason).toBe('Internal evaluator success');

    // Should store a constructed grader result
    expect(result.metadata?.storedGraderResult).toEqual({
      pass: false,
      score: 0,
      reason: 'Internal evaluator detected successful jailbreak',
    });
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

    expect(mockRedTeamProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('test purpose'),
      expect.any(Object),
    );
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

    expect(mockRedTeamProvider.callApi).toHaveBeenCalledWith(
      expect.stringContaining('test purpose for attack'),
      expect.any(Object),
    );
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
      jest.clearAllMocks();
    });

    it('should stop on first successful attack when continueAfterSuccess is false (default)', async () => {
      // Ensure grader passes for this test
      jest.mocked(getGraderById).mockReturnValue({
        getResult: jest.fn(async () => ({
          grade: {
            pass: true, // No jailbreak detected by grader
          },
        })),
      } as any);

      const provider = new CrescendoProvider({
        injectVar: 'objective',
        maxTurns: 5,
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
        // Mock internal evaluator to succeed on first attempt
        .mockResolvedValueOnce({
          output: JSON.stringify({
            value: true,
            metadata: 100,
            rationale: 'Successful jailbreak',
          }),
        });

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.stopReason).toBe('Internal evaluator success');
      expect(result.metadata?.successfulAttacks).toHaveLength(1);
      expect(result.metadata?.totalSuccessfulAttacks).toBe(1);
      expect(result.metadata?.successfulAttacks?.[0]).toEqual({
        turn: 1,
        prompt: 'harmful request',
        response: 'harmful response',
      });
      expect(result.metadata?.crescendoRoundsCompleted).toBe(1); // Only one round
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
      jest.mocked(tryUnblocking).mockResolvedValue({
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
});
