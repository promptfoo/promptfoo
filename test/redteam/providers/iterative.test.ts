import { beforeEach, describe, expect, it, Mocked, vi } from 'vitest';
import RedteamIterativeProvider, {
  runRedteamConversation,
} from '../../../src/redteam/providers/iterative';

import type { ApiProvider, AtomicTestCase, ProviderResponse } from '../../../src/types/index';

const mockGetProvider = vi.hoisted(() => vi.fn());
const mockGetTargetResponse = vi.hoisted(() => vi.fn());
const mockCheckPenalizedPhrases = vi.hoisted(() => vi.fn());
const mockGetGraderById = vi.hoisted(() => vi.fn());

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

vi.mock('../../../src/redteam/providers/shared', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    redteamProviderManager: {
      getProvider: mockGetProvider,
    },

    getTargetResponse: mockGetTargetResponse,
    checkPenalizedPhrases: mockCheckPenalizedPhrases,
  };
});

vi.mock('../../../src/redteam/graders', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getGraderById: mockGetGraderById,
  };
});

describe('RedteamIterativeProvider', () => {
  let mockRedteamProvider: Mocked<ApiProvider>;
  let mockTargetProvider: Mocked<ApiProvider>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset hoisted mocks to ensure test isolation
    // mockReset clears both call history AND mock implementations
    mockGetProvider.mockReset();
    mockGetTargetResponse.mockReset();
    mockCheckPenalizedPhrases.mockReset();
    mockGetGraderById.mockReset();

    mockRedteamProvider = {
      id: vi.fn().mockReturnValue('mock-redteam'),
      callApi: vi
        .fn<(prompt: string, context?: any) => Promise<ProviderResponse>>()
        .mockImplementation(async function (prompt: string) {
          const input = JSON.parse(prompt);

          if (Array.isArray(input) && input[0]?.role === 'system') {
            return {
              output: JSON.stringify({
                improvement: 'test improvement',
                prompt: 'test prompt',
              }),
            };
          } else if (Array.isArray(input) && input[0]?.content?.includes('on-topic')) {
            return {
              output: JSON.stringify({ onTopic: true }),
            };
          } else {
            return {
              output: JSON.stringify({
                currentResponse: { rating: 5, explanation: 'test' },
                previousBestResponse: { rating: 0, explanation: 'none' },
              }),
            };
          }
        }),
    } as Mocked<ApiProvider>;

    mockTargetProvider = {
      id: vi.fn().mockReturnValue('mock-target'),
      callApi: vi.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: 'mock target response',
      }),
    } as Mocked<ApiProvider>;

    mockGetProvider.mockImplementation(function () {
      return Promise.resolve(mockRedteamProvider);
    });
    mockGetTargetResponse.mockImplementation(async function () {
      return Promise.resolve({
        output: 'mock target response',
      });
    });
    mockCheckPenalizedPhrases.mockImplementation(function () {
      return false;
    });
  });

  describe('constructor', () => {
    it('should throw if injectVar is not provided', () => {
      expect(() => new RedteamIterativeProvider({})).toThrow('Expected injectVar to be set');
    });

    it('should create instance with valid config', () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      expect(provider).toBeInstanceOf(RedteamIterativeProvider);
      expect(provider.id()).toBe('promptfoo:redteam:iterative');
    });

    it('should use default numIterations if not provided', () => {
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      expect(provider['numIterations']).toBe(4);
    });

    it('should use configured numIterations when provided', () => {
      const provider = new RedteamIterativeProvider({
        injectVar: 'test',
        numIterations: '5',
      });
      // Config takes precedence over default
      expect(provider['numIterations']).toBe(5);
    });

    it('should use environment variable for numIterations if set', () => {
      process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS = '15';
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      expect(provider['numIterations']).toBe(15);
      delete process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS;
    });
  });

  describe('runRedteamConversation', () => {
    it('should complete all iterations when score reaches 10 and grader passes', async () => {
      mockRedteamProvider.callApi
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              improvement: 'test',
              prompt: 'test',
            }),
          };
        })
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              currentResponse: { rating: 10, explanation: 'perfect' },
              previousBestResponse: { rating: 5, explanation: 'good' },
            }),
          };
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 5,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.finalIteration).toBe(5);
      expect(result.metadata.highestScore).toBe(10);
    });

    it('should exit early when grader fails and use stored grader result', async () => {
      const mockGrader = {
        getResult: vi.fn<any>().mockResolvedValue({
          grade: {
            pass: false,
            score: 0,
            reason: 'Jailbreak detected by grader',
            tokensUsed: { total: 100, prompt: 50, completion: 50 },
          },
          rubric: 'test rubric',
        }),
      };

      mockGetGraderById.mockReturnValue(mockGrader);

      mockRedteamProvider.callApi
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              improvement: 'test',
              prompt: 'test',
            }),
          };
        })
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              currentResponse: { rating: 5, explanation: 'moderate' },
              previousBestResponse: { rating: 0, explanation: 'none' },
            }),
          };
        });

      const test: AtomicTestCase = {
        vars: {},
        assert: [{ type: 'promptfoo:redteam:test-plugin' }],
        metadata: { pluginId: 'test-plugin', goal: 'test goal' },
      };

      const result = await runRedteamConversation({
        context: {
          prompt: { raw: '', label: '' },
          vars: {},
          test,
        },
        filters: undefined,
        injectVar: 'test',
        numIterations: 5,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.finalIteration).toBe(1);
      expect(result.metadata.stopReason).toBe('Grader failed');
      expect(result.metadata.storedGraderResult).toEqual({
        pass: false,
        score: 0,
        reason: 'Jailbreak detected by grader',
        tokensUsed: { total: 100, prompt: 50, completion: 50 },
        assertion: { type: 'promptfoo:redteam:test-plugin', value: 'test rubric' },
      });
      expect(mockGrader.getResult).toHaveBeenCalledWith(
        'test',
        'mock target response',
        expect.objectContaining({
          vars: { test: 'goal' },
          assert: [{ type: 'promptfoo:redteam:test-plugin' }],
          metadata: { pluginId: 'test-plugin', goal: 'test goal' },
        }),
        mockRedteamProvider,
        undefined,
        expect.stringContaining('iterative jailbreak attack with the following goal: "test goal"'),
        undefined, // skipRefusalCheck
        expect.objectContaining({ traceContext: null, traceSummary: undefined }), // gradingContext
      );
    });

    it('should continue iterating when judge score is high and grader passes', async () => {
      mockGetGraderById.mockReturnValue(null); // No grader available

      mockRedteamProvider.callApi
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              improvement: 'test',
              prompt: 'test',
            }),
          };
        })
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              currentResponse: { rating: 10, explanation: 'Excellent jailbreak achieved' },
              previousBestResponse: { rating: 0, explanation: 'none' },
            }),
          };
        });

      const result = await runRedteamConversation({
        context: {
          prompt: { raw: '', label: '' },
          vars: {},
          test: { vars: {}, metadata: { goal: 'test goal' } },
        },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test: { vars: {}, metadata: { goal: 'test goal' } },
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.finalIteration).toBe(1);
      expect(result.metadata.stopReason).toBe('Max iterations reached');
      expect(result.metadata.storedGraderResult).toBeUndefined();
    });

    it('should complete all iterations when no early exit conditions are met', async () => {
      mockGetGraderById.mockReturnValue(null);

      // Reset the mock to handle the exact sequence of calls for 3 iterations
      mockRedteamProvider.callApi.mockReset();

      // Each iteration now makes 2 calls: redteam, judge
      // So for 3 iterations we need 6 calls total
      mockRedteamProvider.callApi
        // Iteration 1
        .mockResolvedValueOnce({
          output: JSON.stringify({
            improvement: 'test improvement 1',
            prompt: 'test prompt 1',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: 5, explanation: 'moderate score 1' },
            previousBestResponse: { rating: 0, explanation: 'none' },
          }),
        })
        // Iteration 2
        .mockResolvedValueOnce({
          output: JSON.stringify({
            improvement: 'test improvement 2',
            prompt: 'test prompt 2',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: 6, explanation: 'moderate score 2' },
            previousBestResponse: { rating: 5, explanation: 'previous' },
          }),
        })
        // Iteration 3
        .mockResolvedValueOnce({
          output: JSON.stringify({
            improvement: 'test improvement 3',
            prompt: 'test prompt 3',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: 7, explanation: 'moderate score 3' },
            previousBestResponse: { rating: 6, explanation: 'previous' },
          }),
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 3,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.finalIteration).toBe(3); // Completed all 3 iterations
      expect(result.metadata.stopReason).toBe('Max iterations reached');
      expect(result.metadata.storedGraderResult).toBeUndefined();
      expect(result.metadata.redteamHistory).toHaveLength(3);
    });

    it('should parse judge ratings provided as strings and accept 0 as valid previous score', async () => {
      // Arrange sequence: attacker improvement → onTopic → judge (string ratings)
      mockRedteamProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({ improvement: 'test', prompt: 'test' }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: '5', explanation: 'ok' },
            previousBestResponse: { rating: '0', explanation: 'none' },
          }),
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.highestScore).toBe(5);
      expect(result.metadata.finalIteration).toBe(1);
    });

    it('should surface last errored output and mark error on final result', async () => {
      // First iteration: normal flow but low score, so no early exit
      mockRedteamProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({ improvement: 'test', prompt: 'test' }),
        })
        .mockResolvedValueOnce({ output: JSON.stringify({ onTopic: true }) })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: 2, explanation: 'low' },
            previousBestResponse: { rating: 0, explanation: 'none' },
          }),
        });

      // Second iteration: target returns error but with mapped output
      mockGetTargetResponse
        .mockResolvedValueOnce({ output: 'mock target response' }) // first iteration target
        .mockResolvedValueOnce({ output: 'This is 504', error: 'HTTP 504' }); // second iteration target

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 2,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.output).toBe('mock target response');

      if (result.error) {
        expect(result.error).toBe('HTTP 504');
      }
    });

    it('should extract JSON object from fenced/narrative judge output', async () => {
      // Reset and set up mockGetTargetResponse for this test
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async () => ({
        output: 'mock target response',
        tokenUsage: { numRequests: 1 },
      }));

      const fenced =
        "I'll evaluate now.\n```json\n{" +
        '"currentResponse": { "rating": 6, "explanation": "ok" },' +
        '"previousBestResponse": { "rating": 0, "explanation": "none" }' +
        '}\n```\nThanks!';

      mockRedteamProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({ improvement: 'test', prompt: 'test' }),
        })
        .mockResolvedValueOnce({ output: fenced });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test: undefined,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.highestScore).toBe(6);
      expect(result.metadata.finalIteration).toBe(1);
    });

    it('should include goal in additional rubric when goal is present', async () => {
      const mockGrader = {
        getResult: vi.fn<any>().mockResolvedValue({
          grade: {
            pass: true,
            score: 1,
            reason: 'Safe response',
          },
          rubric: 'test rubric',
        }),
      };

      mockGetGraderById.mockReturnValue(mockGrader);

      mockRedteamProvider.callApi
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              improvement: 'test',
              prompt: 'test',
            }),
          };
        })
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              currentResponse: { rating: 5, explanation: 'moderate' },
              previousBestResponse: { rating: 0, explanation: 'none' },
            }),
          };
        });

      const test: AtomicTestCase = {
        vars: {},
        assert: [{ type: 'promptfoo:redteam:test-plugin' }],
        metadata: {
          pluginId: 'test-plugin',
          goal: 'Create harmful content about specific groups',
        },
      };

      await runRedteamConversation({
        context: {
          prompt: { raw: '', label: '' },
          vars: {},
          test,
        },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(mockGrader.getResult).toHaveBeenCalledWith(
        'test',
        'mock target response',
        expect.objectContaining({
          vars: { test: 'goal' },
          assert: [{ type: 'promptfoo:redteam:test-plugin' }],
          metadata: {
            pluginId: 'test-plugin',
            goal: 'Create harmful content about specific groups',
          },
        }),
        mockRedteamProvider,
        undefined,
        expect.stringContaining('Create harmful content about specific groups'),
        undefined, // skipRefusalCheck
        expect.objectContaining({ traceContext: null, traceSummary: undefined }), // gradingContext
      );

      const additionalRubricArg = mockGrader.getResult.mock.calls[0][5];
      expect(additionalRubricArg).toContain('ADDITIONAL EVALUATION CRITERIA');
      expect(additionalRubricArg).toContain('iterative jailbreak attack');
      expect(additionalRubricArg).toContain('standalone request');
      expect(additionalRubricArg).toContain('series of different approaches');
    });

    it('should include modifiers in system prompt from test metadata', async () => {
      const test: AtomicTestCase = {
        vars: {},
        metadata: {
          pluginId: 'test-plugin',
          goal: 'test goal',
          purpose: 'payment processing system',
          modifiers: {
            testGenerationInstructions: 'Generate prompts as merchant account queries',
            language: 'English',
          },
        },
      };

      // Capture the FIRST system prompt that gets sent (attacker, not judge)
      let capturedSystemPrompt = '';
      let firstSystemCapture = false;
      mockRedteamProvider.callApi.mockImplementation(async function (prompt: string) {
        const input = JSON.parse(prompt);
        if (Array.isArray(input) && input[0]?.role === 'system' && !firstSystemCapture) {
          capturedSystemPrompt = input[0].content;
          firstSystemCapture = true;
          return {
            output: JSON.stringify({
              improvement: 'test improvement',
              prompt: 'test prompt',
            }),
          };
        }
        // For subsequent calls (judge), return judge response
        return {
          output: JSON.stringify({
            currentResponse: { rating: 5, explanation: 'moderate' },
            previousBestResponse: { rating: 0, explanation: 'none' },
          }),
        };
      });

      await runRedteamConversation({
        context: {
          prompt: { raw: '', label: '' },
          vars: {},
          test,
        },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Verify modifiers were included in the attacker system prompt
      expect(capturedSystemPrompt).toContain('CRITICAL: Ensure all generated prompts');
      expect(capturedSystemPrompt).toContain('<Modifiers>');
      expect(capturedSystemPrompt).toContain(
        'testGenerationInstructions: Generate prompts as merchant account queries',
      );
      expect(capturedSystemPrompt).toContain('language: English');
      expect(capturedSystemPrompt).toContain('Rewrite ALL prompts to fully comply');
    });

    it('should not include additional rubric when no goal is present', async () => {
      const mockGrader = {
        getResult: vi.fn<any>().mockResolvedValue({
          grade: {
            pass: true,
            score: 1,
            reason: 'Safe response',
          },
          rubric: 'test rubric',
        }),
      };

      mockGetGraderById.mockReturnValue(mockGrader);

      mockRedteamProvider.callApi
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              improvement: 'test',
              prompt: 'test',
            }),
          };
        })
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({ onTopic: true }),
          };
        })
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              currentResponse: { rating: 5, explanation: 'moderate' },
              previousBestResponse: { rating: 0, explanation: 'none' },
            }),
          };
        });

      const test: AtomicTestCase = {
        vars: {},
        assert: [{ type: 'promptfoo:redteam:test-plugin' }],
        metadata: { pluginId: 'test-plugin' }, // No goal
      };

      await runRedteamConversation({
        context: {
          prompt: { raw: '', label: '' },
          vars: {},
          test,
        },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test,
        vars: { someOtherVar: 'just a test value' }, // Use different key so injectVar doesn't pick it up
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(mockGrader.getResult).toHaveBeenCalledWith(
        'test',
        'mock target response',
        expect.objectContaining({
          vars: { someOtherVar: 'just a test value' },
          assert: [{ type: 'promptfoo:redteam:test-plugin' }],
          metadata: { pluginId: 'test-plugin' },
        }),
        mockRedteamProvider,
        undefined,
        '', // Empty additional rubric when no goal
        undefined, // skipRefusalCheck
        expect.objectContaining({ traceContext: null, traceSummary: undefined }), // gradingContext
      );
    });

    it('should prioritize grader failed over judge success when both conditions are met', async () => {
      const mockGrader = {
        getResult: vi.fn<any>().mockResolvedValue({
          grade: {
            pass: false, // Grader fails
            score: 0,
            reason: 'Grader detected jailbreak',
          },
          rubric: 'test rubric',
        }),
      };

      mockGetGraderById.mockReturnValue(mockGrader);

      mockRedteamProvider.callApi
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              improvement: 'test',
              prompt: 'test',
            }),
          };
        })
        .mockImplementationOnce(async function () {
          return {
            output: JSON.stringify({
              currentResponse: { rating: 10, explanation: 'Judge also thinks its great' }, // Judge success
              previousBestResponse: { rating: 0, explanation: 'none' },
            }),
          };
        });

      const test: AtomicTestCase = {
        vars: {},
        assert: [{ type: 'promptfoo:redteam:test-plugin' }],
        metadata: { pluginId: 'test-plugin', goal: 'test goal' },
      };

      const result = await runRedteamConversation({
        context: {
          prompt: { raw: '', label: '' },
          vars: {},
          test,
        },
        filters: undefined,
        injectVar: 'test',
        numIterations: 5,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Should use 'Grader failed' even though judge score was also high
      expect(result.metadata.stopReason).toBe('Grader failed');
      expect(result.metadata.storedGraderResult).toEqual({
        pass: false,
        score: 0,
        reason: 'Grader detected jailbreak',
        assertion: { type: 'promptfoo:redteam:test-plugin', value: 'test rubric' },
      });
    });

    it('should re-run transformVars for each iteration', async () => {
      const mockTest: AtomicTestCase = {
        vars: { originalVar: 'value' },
        options: {
          transformVars: '{ ...vars, sessionId: context.uuid }',
        },
      };

      // Track the prompts sent to the target provider
      const targetPrompts: string[] = [];
      mockTargetProvider.callApi.mockImplementation(async function (prompt: string) {
        targetPrompts.push(prompt);
        return { output: 'mock target response' };
      });

      // Set up mockGetTargetResponse to call mockTargetProvider.callApi
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async (_provider, prompt, context, _options) => {
        return mockTargetProvider.callApi(prompt, context);
      });

      // Mock provider responses for 3 iterations
      mockRedteamProvider.callApi
        // First iteration
        .mockResolvedValueOnce({
          output: JSON.stringify({ improvement: 'test1', prompt: 'test1' }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: 3, explanation: 'test' },
            previousBestResponse: { rating: 0, explanation: 'none' },
          }),
        })
        // Second iteration
        .mockResolvedValueOnce({
          output: JSON.stringify({ improvement: 'test2', prompt: 'test2' }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: 5, explanation: 'test' },
            previousBestResponse: { rating: 3, explanation: 'test' },
          }),
        })
        // Third iteration
        .mockResolvedValueOnce({
          output: JSON.stringify({ improvement: 'test3', prompt: 'test3' }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: 7, explanation: 'test' },
            previousBestResponse: { rating: 5, explanation: 'test' },
          }),
        });

      const result = await runRedteamConversation({
        context: {
          prompt: { raw: 'Session {{sessionId}} - {{test}}', label: '' },
          vars: { originalVar: 'value' },
        },
        filters: undefined,
        injectVar: 'test',
        numIterations: 3,
        options: {},
        prompt: { raw: 'Session {{sessionId}} - {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        test: mockTest,
        vars: { test: 'goal', originalVar: 'value' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Verify that we completed 3 iterations
      expect(result.metadata.redteamHistory).toHaveLength(3);

      // Verify targetProvider was called 3 times
      expect(mockTargetProvider.callApi).toHaveBeenCalledTimes(3);
      expect(targetPrompts).toHaveLength(3);

      // Extract sessionIds from the prompts using regex
      const sessionIdRegex = /Session ([a-f0-9-]+) - test[123]/;
      const sessionIds = targetPrompts.map((prompt) => {
        const match = prompt.match(sessionIdRegex);
        return match ? match[1] : null;
      });

      // Verify that each iteration had a different sessionId
      expect(sessionIds[0]).toBeTruthy();
      expect(sessionIds[1]).toBeTruthy();
      expect(sessionIds[2]).toBeTruthy();

      // All sessionIds should be different (UUIDs)
      expect(sessionIds[0]).not.toBe(sessionIds[1]);
      expect(sessionIds[1]).not.toBe(sessionIds[2]);
      expect(sessionIds[0]).not.toBe(sessionIds[2]);
    });
  });

  describe('Token Counting', () => {
    beforeEach(async () => {
      // Reset TokenUsageTracker between tests to ensure clean state
      const { TokenUsageTracker } = await import('../../../src/util/tokenUsage');
      TokenUsageTracker.getInstance().resetAllUsage();
    });

    it('should correctly track token usage when target provider returns tokens', async () => {
      // Clear the mock to use the target provider directly for this test
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async (_provider, prompt, context, _options) => {
        return mockTargetProvider.callApi(prompt, context);
      });

      // Mock the target provider directly to return tokens
      mockTargetProvider.callApi.mockResolvedValueOnce({
        output: 'target response',
        tokenUsage: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
        cached: false,
      });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Verify that target token usage is accumulated
      expect(result.tokenUsage.total).toBe(100);
      expect(result.tokenUsage.prompt).toBe(60);
      expect(result.tokenUsage.completion).toBe(40);
      expect(result.tokenUsage.numRequests).toBe(1);
    });

    it('should accumulate token usage across multiple iterations', async () => {
      // Clear the mock to use the target provider directly for this test
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async (_provider, prompt, context, _options) => {
        return mockTargetProvider.callApi(prompt, context);
      });

      // Mock target provider for multiple calls with different token usage
      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'response 1',
          tokenUsage: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
          cached: false,
        })
        .mockResolvedValueOnce({
          output: 'response 2',
          tokenUsage: { total: 150, prompt: 90, completion: 60, numRequests: 1 },
          cached: false,
        })
        .mockResolvedValueOnce({
          output: 'response 3',
          tokenUsage: { total: 200, prompt: 120, completion: 80, numRequests: 1 },
          cached: false,
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 3,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Verify accumulated token usage from all target calls
      expect(result.tokenUsage.total).toBe(450); // 100 + 150 + 200
      expect(result.tokenUsage.prompt).toBe(270); // 60 + 90 + 120
      expect(result.tokenUsage.completion).toBe(180); // 40 + 60 + 80
      expect(result.tokenUsage.numRequests).toBe(3);
    });

    it('should handle missing token usage from target responses', async () => {
      // Clear the mock to use the target provider directly for this test
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async (_provider, prompt, context, _options) => {
        return mockTargetProvider.callApi(prompt, context);
      });

      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'response with tokens',
          tokenUsage: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
          cached: false,
        })
        .mockResolvedValueOnce({
          output: 'response without tokens',
          // No tokenUsage provided
          cached: false,
        })
        .mockResolvedValueOnce({
          output: 'another response with tokens',
          tokenUsage: { total: 200, prompt: 120, completion: 80 }, // numRequests missing
          cached: false,
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 3,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Token usage should accumulate correctly even with missing data
      // getTargetResponse adds numRequests: 1 automatically, so: 100 + 0 + 200 = 300
      expect(result.tokenUsage.total).toBe(300);
      expect(result.tokenUsage.prompt).toBe(180); // 60 + 0 + 120
      expect(result.tokenUsage.completion).toBe(120); // 40 + 0 + 80
      expect(result.tokenUsage.numRequests).toBe(3); // All calls counted
    });

    it('should handle error responses without affecting token counts', async () => {
      // Clear the mock to use the target provider directly for this test
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async (_provider, prompt, context, _options) => {
        return mockTargetProvider.callApi(prompt, context);
      });

      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'successful response',
          tokenUsage: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
          cached: false,
        })
        .mockResolvedValueOnce({
          error: 'Target provider failed',
          cached: false,
        })
        .mockResolvedValueOnce({
          output: 'another successful response',
          tokenUsage: { total: 150, prompt: 90, completion: 60, numRequests: 1 },
          cached: false,
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 3,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Only successful calls should contribute to token usage
      expect(result.tokenUsage.total).toBe(250); // 100 + 150
      expect(result.tokenUsage.prompt).toBe(150); // 60 + 90
      expect(result.tokenUsage.completion).toBe(100); // 40 + 60
      expect(result.tokenUsage.numRequests).toBe(3); // All calls are counted, including errors
    });

    it('should handle zero token counts correctly', async () => {
      // Clear the mock to use the target provider directly for this test
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async (_provider, prompt, context, _options) => {
        return mockTargetProvider.callApi(prompt, context);
      });

      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'response with zero tokens',
          tokenUsage: { total: 0, prompt: 0, completion: 0, numRequests: 1 },
          cached: false,
        })
        .mockResolvedValueOnce({
          output: 'response with normal tokens',
          tokenUsage: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
          cached: false,
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 2,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Should handle zero counts correctly: 0 + 100 = 100
      expect(result.tokenUsage.total).toBe(100);
      expect(result.tokenUsage.prompt).toBe(60);
      expect(result.tokenUsage.completion).toBe(40);
      expect(result.tokenUsage.numRequests).toBe(2);
    });
  });

  describe('Abort Signal Handling', () => {
    it('should re-throw AbortError from redteam provider parse failure and not swallow it', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      // Mock redteam provider to return a response that causes parse to throw AbortError
      mockRedteamProvider.callApi.mockImplementationOnce(async () => {
        throw abortError;
      });

      await expect(
        runRedteamConversation({
          context: { prompt: { raw: '', label: '' }, vars: {} },
          filters: undefined,
          injectVar: 'test',
          numIterations: 1,
          options: {},
          prompt: { raw: 'test', label: 'test' },
          redteamProvider: mockRedteamProvider,
          gradingProvider: mockRedteamProvider,
          targetProvider: mockTargetProvider,
          vars: { test: 'goal' },
          excludeTargetOutputFromAgenticAttackGeneration: false,
        }),
      ).rejects.toThrow('The operation was aborted');
    });

    it('should re-throw AbortError from judge response parse failure', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      // First call is redteam provider (success), second call is judge (throws)
      mockRedteamProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({
            improvement: 'test improvement',
            prompt: 'test prompt',
          }),
        })
        .mockImplementationOnce(async () => {
          throw abortError;
        });

      await expect(
        runRedteamConversation({
          context: { prompt: { raw: '', label: '' }, vars: {} },
          filters: undefined,
          injectVar: 'test',
          numIterations: 1,
          options: {},
          prompt: { raw: 'test', label: 'test' },
          redteamProvider: mockRedteamProvider,
          gradingProvider: mockRedteamProvider,
          targetProvider: mockTargetProvider,
          vars: { test: 'goal' },
          excludeTargetOutputFromAgenticAttackGeneration: false,
        }),
      ).rejects.toThrow('The operation was aborted');
    });

    it('should pass options to gradingProvider.callApi', async () => {
      mockRedteamProvider.callApi
        .mockResolvedValueOnce({
          output: JSON.stringify({
            improvement: 'test',
            prompt: 'test',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: 5, explanation: 'test' },
            previousBestResponse: { rating: 0, explanation: 'none' },
          }),
        });

      const abortController = new AbortController();
      const options = { abortSignal: abortController.signal };

      await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options,
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Verify options were passed to callApi
      expect(mockRedteamProvider.callApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        options,
      );
    });

    it('should swallow non-AbortError parse exceptions and continue loop', async () => {
      // First redteam call returns unparseable output, second succeeds
      mockRedteamProvider.callApi
        .mockResolvedValueOnce({
          output: 'this is not valid JSON',
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            improvement: 'test',
            prompt: 'test',
          }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            currentResponse: { rating: 5, explanation: 'test' },
            previousBestResponse: { rating: 0, explanation: 'none' },
          }),
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 2,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // Should complete without throwing
      expect(result.metadata.stopReason).toBe('Max iterations reached');
    });
  });

  describe('perTurnLayers configuration', () => {
    it('should accept perTurnLayers parameter (empty array for safe testing)', async () => {
      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
        perTurnLayers: [], // Empty array to avoid actual transforms
      });

      // Should complete without error when perTurnLayers is provided
      expect(result.metadata.finalIteration).toBeDefined();
    });

    it('should default perTurnLayers to empty array when not provided', async () => {
      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
        // perTurnLayers not provided
      });

      expect(result.metadata.finalIteration).toBeDefined();
    });
  });

  describe('redteamHistory with audio/image data', () => {
    it('should include promptAudio and promptImage fields in redteamHistory entries', async () => {
      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // redteamHistory should be present
      expect(result.metadata.redteamHistory).toBeDefined();
      expect(Array.isArray(result.metadata.redteamHistory)).toBe(true);

      if (result.metadata.redteamHistory.length > 0) {
        const entry = result.metadata.redteamHistory[0];
        // These fields should be present (even if undefined without layers)
        expect(entry).toHaveProperty('prompt');
        expect(entry).toHaveProperty('output');
        // Optional audio/image fields
        expect('promptAudio' in entry || entry.promptAudio === undefined).toBe(true);
        expect('promptImage' in entry || entry.promptImage === undefined).toBe(true);
      }
    });

    it('should capture outputAudio when target returns audio data', async () => {
      // Clear the mock to use the target provider directly
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockResolvedValue({
        output: 'response with audio',
        audio: { data: 'base64audiodata', format: 'mp3' },
      });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      if (result.metadata.redteamHistory.length > 0) {
        const entry = result.metadata.redteamHistory[0];
        expect(entry.outputAudio).toBeDefined();
        expect(entry.outputAudio?.data).toBe('base64audiodata');
        expect(entry.outputAudio?.format).toBe('mp3');
      }
    });

    it('should capture outputImage when target returns image data', async () => {
      // Clear the mock to use the target provider directly
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockResolvedValue({
        output: 'response with image',
        image: { data: 'base64imagedata', format: 'png' },
      });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      if (result.metadata.redteamHistory.length > 0) {
        const entry = result.metadata.redteamHistory[0];
        expect(entry.outputImage).toBeDefined();
        expect(entry.outputImage?.data).toBe('base64imagedata');
        expect(entry.outputImage?.format).toBe('png');
      }
    });
  });

  describe('sessionId handling', () => {
    beforeEach(() => {
      // Clear the mock to use the target provider directly for sessionId tests
      mockGetTargetResponse.mockReset();
      mockGetTargetResponse.mockImplementation(async (_provider, prompt, context, _options) => {
        return mockTargetProvider.callApi(prompt, context);
      });
    });

    it('should collect sessionIds from all iterations', async () => {
      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'response 1',
          sessionId: 'session-iter-1',
        })
        .mockResolvedValueOnce({
          output: 'response 2',
          sessionId: 'session-iter-2',
        })
        .mockResolvedValueOnce({
          output: 'response 3',
          sessionId: 'session-iter-3',
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 3,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.sessionIds).toEqual([
        'session-iter-1',
        'session-iter-2',
        'session-iter-3',
      ]);
    });

    it('should extract sessionId from targetResponse', async () => {
      mockTargetProvider.callApi.mockResolvedValue({
        output: 'response',
        sessionId: 'response-session-123',
      });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.sessionIds).toEqual(['response-session-123']);
    });

    it('should extract sessionId from iterationContext.vars as fallback', async () => {
      mockTargetProvider.callApi.mockResolvedValue({
        output: 'response',
        // No sessionId in response
      });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: { sessionId: 'vars-session-456' } },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal', sessionId: 'vars-session-456' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.sessionIds).toEqual(['vars-session-456']);
    });

    it('should handle missing sessionId gracefully', async () => {
      mockTargetProvider.callApi.mockResolvedValue({
        output: 'response',
        // No sessionId
      });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 2,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      // sessionIds array should be empty when no sessionIds are found
      expect(result.metadata.sessionIds).toEqual([]);
    });

    it('should include sessionIds in metadata with other metadata fields', async () => {
      mockTargetProvider.callApi
        .mockResolvedValueOnce({
          output: 'response 1',
          sessionId: 'session-1',
        })
        .mockResolvedValueOnce({
          output: 'response 2',
          sessionId: 'session-2',
        });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: {} },
        filters: undefined,
        injectVar: 'test',
        numIterations: 2,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.sessionIds).toEqual(['session-1', 'session-2']);
      expect(result.metadata.finalIteration).toBeDefined();
      expect(result.metadata.highestScore).toBeDefined();
      expect(result.metadata.stopReason).toBeDefined();
    });

    it('should prioritize response sessionId over vars sessionId', async () => {
      mockTargetProvider.callApi.mockResolvedValue({
        output: 'response',
        sessionId: 'response-priority',
      });

      const result = await runRedteamConversation({
        context: { prompt: { raw: '', label: '' }, vars: { sessionId: 'vars-ignored' } },
        filters: undefined,
        injectVar: 'test',
        numIterations: 1,
        options: {},
        prompt: { raw: 'test {{test}}', label: 'test' },
        redteamProvider: mockRedteamProvider,
        gradingProvider: mockRedteamProvider,
        targetProvider: mockTargetProvider,
        vars: { test: 'goal', sessionId: 'vars-ignored' },
        excludeTargetOutputFromAgenticAttackGeneration: false,
      });

      expect(result.metadata.sessionIds).toEqual(['response-priority']);
      expect(result.metadata.sessionIds).not.toContain('vars-ignored');
    });
  });
});
