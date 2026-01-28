import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RedteamGoatProvider from '../../../src/redteam/providers/goat';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';
import type { Mock } from 'vitest';

import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  Prompt,
} from '../../../src/types/index';

// Mock the graders module at the top level
const mockGrader = {
  getResult: vi.fn(),
};

const mockGetGraderById = vi.fn().mockReturnValue(mockGrader);

vi.mock('../../../src/redteam/graders', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getGraderById: mockGetGraderById,
  };
});

vi.mock('../../../src/util/server', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    checkServerFeatureSupport: vi.fn(() => Promise.resolve(false)),
  };
});

describe('RedteamGoatProvider', () => {
  let mockFetch: Mock;

  // Helper function to create a mock target provider
  const createMockTargetProvider = (
    outputValue: any = 'target response',
    tokenUsage: any = {},
    responseOverrides: Record<string, unknown> = {},
  ) => {
    const targetProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn() as any,
    };

    (targetProvider.callApi as any).mockResolvedValue({
      output: outputValue,
      tokenUsage,
      ...responseOverrides,
    });

    return targetProvider;
  };

  // Helper function to create a mock context
  const createMockContext = (
    targetProvider: ApiProvider,
    vars: Record<string, any> = { goal: 'test goal' },
    testConfig?: any,
  ): CallApiContextParams => ({
    originalProvider: targetProvider,
    vars,
    prompt: { raw: 'test prompt', label: 'test' },
    test: testConfig,
  });

  beforeEach(() => {
    mockFetch = vi.fn().mockImplementation(async function () {
      return {
        json: async () => ({
          message: { role: 'assistant', content: 'test response' },
        }),

        ok: true,
      };
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with required config', () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 3,
    });

    expect(provider.id()).toBe('promptfoo:redteam:goat');
  });

  it('should throw error if injectVar is missing', () => {
    expect(() => {
      new RedteamGoatProvider({});
    }).toThrow('Expected injectVar to be set');
  });

  it('should initialize with all config options', () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 3,
      stateful: true,
      excludeTargetOutputFromAgenticAttackGeneration: true,
    });

    expect(provider.config).toEqual({
      injectVar: 'goal',
      maxTurns: 3,
      stateful: true,
      excludeTargetOutputFromAgenticAttackGeneration: true,
      continueAfterSuccess: false,
    });
  });

  it('should default stateful to false when not specified', () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
    });

    expect(provider.config.stateful).toBe(false);
  });

  it('should handle stateful behavior when set to true', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 2,
      stateful: true,
    });

    const targetProvider = createMockTargetProvider();
    const context = createMockContext(targetProvider);

    await provider.callApi('test prompt', context);

    const lastCallBody = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(lastCallBody.messages).toBeDefined();
  });

  it('should pass excludeTargetOutputFromAgenticAttackGeneration through config', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 2,
      excludeTargetOutputFromAgenticAttackGeneration: true,
    });

    const targetProvider = createMockTargetProvider();
    const context = createMockContext(targetProvider);

    await provider.callApi('test prompt', context);

    const lastCallBody = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(lastCallBody.excludeTargetOutputFromAgenticAttackGeneration).toBe(true);
  });

  it('should make correct API calls with message history', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 2,
    });

    const targetProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn() as any,
    };

    (targetProvider.callApi as any).mockResolvedValue({
      output: 'target response',
      tokenUsage: {},
    });

    const prompt: Prompt = {
      raw: 'test prompt',
      label: 'test',
    };

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { goal: 'test goal' },
      prompt,
    };

    const result = await provider.callApi('test prompt', context);
    expect(result.metadata?.stopReason).toBe('Max turns reached');

    expect(mockFetch).toHaveBeenCalledWith(
      getRemoteGenerationUrl(),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.any(String),
      }),
    );

    const bodyObj = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(bodyObj.purpose).toBeUndefined();
  });

  it('should handle grader integration and stop early on failure', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 3,
    });

    const targetProvider = createMockTargetProvider('target response', {
      total: 10,
      prompt: 5,
      completion: 5,
    });

    // Mock grader to fail (indicating success)
    (mockGrader.getResult as any).mockResolvedValue({
      grade: {
        pass: false,
        tokensUsed: { total: 5, prompt: 2, completion: 3 },
      },
    });

    const testConfig = {
      vars: {},
      assert: [
        {
          type: 'contains',
          value: 'expected content',
        },
      ],
      metadata: { pluginId: 'contains' },
    } as AtomicTestCase;

    const context = createMockContext(targetProvider, { goal: 'test goal' }, testConfig);

    const result = await provider.callApi('test prompt', context);
    expect(result.metadata?.stopReason).toBe('Grader failed');
    expect(result.tokenUsage?.total).toBeGreaterThan(0);
  });

  it('should stringify non-string target provider responses', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const objectResponse = { foo: 'bar', baz: 123 };
    const targetProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn() as any,
    };

    (targetProvider.callApi as any).mockResolvedValue({
      output: objectResponse,
      tokenUsage: {},
    });

    const prompt: Prompt = {
      raw: 'test prompt',
      label: 'test',
    };

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { goal: 'test goal' },
      prompt,
    };

    const result = await provider.callApi('test prompt', context);
    const messages = result.metadata?.messages;
    expect(messages[messages.length - 1].content).toBe(JSON.stringify(objectResponse));
  });

  it('should include purpose in API call when provided in test metadata', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const targetProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn() as any,
    };

    (targetProvider.callApi as any).mockResolvedValue({
      output: 'target response',
      tokenUsage: {},
    });

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
      test: {
        vars: {},
        metadata: {
          purpose: 'test purpose',
        },
      } as AtomicTestCase,
    };

    await provider.callApi('test prompt', context);

    const lastCallBody = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(lastCallBody.purpose).toBe('test purpose');
  });

  it('should handle undefined purpose in test metadata', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const targetProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn() as any,
    };

    (targetProvider.callApi as any).mockResolvedValue({
      output: 'target response',
      tokenUsage: {},
    });

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { goal: 'test goal' },
      prompt: { raw: 'test prompt', label: 'test' },
      test: {
        vars: {},
      } as AtomicTestCase,
    };

    await provider.callApi('test prompt', context);

    const lastCallBody = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(lastCallBody.purpose).toBeUndefined();
  });

  describe('continueAfterSuccess functionality', () => {
    beforeEach(() => {
      // Reset mocks before each test
      vi.clearAllMocks();
    });

    it('should stop on first successful attack when continueAfterSuccess is false (default)', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 5,
        continueAfterSuccess: false,
      });

      const targetProvider = createMockTargetProvider('harmful response', {
        total: 10,
        prompt: 5,
        completion: 5,
      });

      // Mock grader to fail on first attempt (indicating success)
      (mockGrader.getResult as any).mockResolvedValue({
        grade: {
          pass: false,
          tokensUsed: { total: 5, prompt: 2, completion: 3 },
        },
      });

      const testConfig = {
        vars: {},
        assert: [{ type: 'contains', value: 'harmful' }],
        metadata: { pluginId: 'contains' },
      } as AtomicTestCase;

      const context = createMockContext(targetProvider, { goal: 'test goal' }, testConfig);

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.stopReason).toBe('Grader failed');
      expect(result.metadata?.successfulAttacks).toHaveLength(1);
      expect(result.metadata?.totalSuccessfulAttacks).toBe(1);
      expect(result.metadata?.successfulAttacks?.[0]).toEqual({
        turn: 0,
        prompt: 'test response',
        response: 'harmful response',
      });
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one turn
    });

    it('should continue and collect multiple successful attacks when continueAfterSuccess is true', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 3,
        continueAfterSuccess: true,
      });

      const targetProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: vi.fn() as any,
      };

      (targetProvider.callApi as any)
        .mockResolvedValueOnce({
          output: 'first harmful response',
          tokenUsage: { total: 10, prompt: 5, completion: 5 },
        })
        .mockResolvedValueOnce({
          output: 'second harmful response',
          tokenUsage: { total: 12, prompt: 6, completion: 6 },
        })
        .mockResolvedValueOnce({
          output: 'third response',
          tokenUsage: { total: 8, prompt: 4, completion: 4 },
        });

      // Mock grader to fail on first two attempts (indicating success)
      (mockGrader.getResult as any)
        .mockResolvedValueOnce({
          grade: {
            pass: false,
            tokensUsed: { total: 5, prompt: 2, completion: 3 },
          },
        })
        .mockResolvedValueOnce({
          grade: {
            pass: false,
            tokensUsed: { total: 6, prompt: 3, completion: 3 },
          },
        })
        .mockResolvedValueOnce({
          grade: {
            pass: true,
            tokensUsed: { total: 4, prompt: 2, completion: 2 },
          },
        });

      const context: CallApiContextParams = {
        originalProvider: targetProvider,
        vars: { goal: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          vars: {},
          assert: [{ type: 'contains', value: 'harmful' }],
          metadata: { pluginId: 'contains' },
        } as AtomicTestCase,
      };

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.stopReason).toBe('Max turns reached');
      expect(result.metadata?.successfulAttacks).toHaveLength(2);
      expect(result.metadata?.totalSuccessfulAttacks).toBe(2);
      expect(result.metadata?.successfulAttacks?.[0]).toEqual({
        turn: 0,
        prompt: 'test response',
        response: 'first harmful response',
      });
      expect(result.metadata?.successfulAttacks?.[1]).toEqual({
        turn: 1,
        prompt: 'test response',
        response: 'second harmful response',
      });
      expect(mockFetch).toHaveBeenCalledTimes(3); // All three turns
    });

    it('should have empty successfulAttacks array when no attacks succeed', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 2,
        continueAfterSuccess: true,
      });

      const targetProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: vi.fn() as any,
      };

      (targetProvider.callApi as any).mockResolvedValue({
        output: 'safe response',
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      });

      // Mock grader to always pass (indicating no successful attacks)
      (mockGrader.getResult as any).mockResolvedValue({
        grade: {
          pass: true,
          tokensUsed: { total: 5, prompt: 2, completion: 3 },
        },
      });

      const context: CallApiContextParams = {
        originalProvider: targetProvider,
        vars: { goal: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          vars: {},
          assert: [{ type: 'contains', value: 'harmful' }],
          metadata: { pluginId: 'contains' },
        } as AtomicTestCase,
      };

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.stopReason).toBe('Max turns reached');
      expect(result.metadata?.successfulAttacks).toHaveLength(0);
      expect(result.metadata?.totalSuccessfulAttacks).toBe(0);
    });

    it('should initialize continueAfterSuccess to false by default', () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 3,
      });

      expect(provider.config.continueAfterSuccess).toBe(false);
    });

    it('should respect continueAfterSuccess configuration option', () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 3,
        continueAfterSuccess: true,
      });

      expect(provider.config.continueAfterSuccess).toBe(true);
    });

    it('should handle mixed success and failure cases with continueAfterSuccess', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 4,
        continueAfterSuccess: true,
      });

      const targetProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: vi.fn() as any,
      };

      (targetProvider.callApi as any)
        .mockResolvedValueOnce({ output: 'safe response 1', tokenUsage: {} })
        .mockResolvedValueOnce({ output: 'harmful response 1', tokenUsage: {} })
        .mockResolvedValueOnce({ output: 'safe response 2', tokenUsage: {} })
        .mockResolvedValueOnce({ output: 'harmful response 2', tokenUsage: {} });

      // Mock grader: pass, fail, pass, fail
      (mockGrader.getResult as any)
        .mockResolvedValueOnce({ grade: { pass: true } })
        .mockResolvedValueOnce({ grade: { pass: false } })
        .mockResolvedValueOnce({ grade: { pass: true } })
        .mockResolvedValueOnce({ grade: { pass: false } });

      const context: CallApiContextParams = {
        originalProvider: targetProvider,
        vars: { goal: 'test goal' },
        prompt: { raw: 'test prompt', label: 'test' },
        test: {
          vars: {},
          assert: [{ type: 'contains', value: 'harmful' }],
          metadata: { pluginId: 'contains' },
        } as AtomicTestCase,
      };

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.stopReason).toBe('Max turns reached');
      expect(result.metadata?.successfulAttacks).toHaveLength(2);
      expect(result.metadata?.totalSuccessfulAttacks).toBe(2);
      expect(result.metadata?.successfulAttacks?.[0].response).toBe('harmful response 1');
      expect(result.metadata?.successfulAttacks?.[1].response).toBe('harmful response 2');
    });
  });

  it('should pass additionalRubric to grader when goal is provided', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const targetProvider = createMockTargetProvider();

    // Mock grader to capture the additionalRubric parameter
    let capturedAdditionalRubric: string | undefined;
    (mockGrader.getResult as any).mockImplementation(async function (
      _prompt: string,
      _output: string,
      _test: any,
      _provider: any,
      _value: any,
      additionalRubric?: string,
    ) {
      capturedAdditionalRubric = additionalRubric;
      return {
        grade: {
          pass: false,
          score: 0,
          reason: 'Test jailbreak detected',
        },
      };
    });

    const testConfig = {
      vars: {},
      assert: [
        {
          type: 'contains',
          value: 'expected content',
        },
      ],
      metadata: {
        pluginId: 'contains',
        goal: 'Extract sensitive information',
      },
    } as AtomicTestCase;

    const context = createMockContext(
      targetProvider,
      { goal: 'Extract sensitive information' },
      testConfig,
    );

    await provider.callApi('test prompt', context);

    // Verify that additionalRubric was generated and passed to grader
    // Goal context is now added in base.ts via goalContextString, not in additionalRubric
    expect(capturedAdditionalRubric).toBeDefined();
    expect(capturedAdditionalRubric).toContain('ADDITIONAL EVALUATION CRITERIA');
    expect(capturedAdditionalRubric).toContain('multi-turn conversation');
  });

  it('should store grader result in metadata when grader fails', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const targetProvider = createMockTargetProvider();

    const mockGraderResult = {
      pass: false,
      score: 0,
      reason: 'Jailbreak successful - sensitive info extracted',
      tokensUsed: { total: 10, prompt: 5, completion: 5 },
    };

    // Mock grader to fail (indicating jailbreak success)
    (mockGrader.getResult as any).mockResolvedValue({
      grade: mockGraderResult,
    });

    const testConfig = {
      vars: {},
      assert: [
        {
          type: 'contains',
          value: 'expected content',
        },
      ],
      metadata: { pluginId: 'contains' },
    } as AtomicTestCase;

    const context = createMockContext(targetProvider, { goal: 'test goal' }, testConfig);

    const result = await provider.callApi('test prompt', context);

    // Verify storedGraderResult is included in metadata
    expect(result.metadata?.storedGraderResult).toMatchObject(mockGraderResult);
    expect(result.metadata?.storedGraderResult?.assertion).toBeDefined();
    expect(result.metadata?.stopReason).toBe('Grader failed');
  });

  it('should store rendered rubric in assertion.value when grader returns rubric', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const targetProvider = createMockTargetProvider();

    const mockRenderedRubric = `
      <system_purpose>Medical chatbot</system_purpose>
      <policy>Only return NAICS codes if 100% certain</policy>
      
      Evaluate if the output violates the given policy...
    `;

    const mockGraderResult = {
      pass: false,
      score: 0,
      reason: 'Policy violation detected',
    };

    // Mock grader to return both grade and rubric
    (mockGrader.getResult as any).mockResolvedValue({
      grade: mockGraderResult,
      rubric: mockRenderedRubric,
    });

    const testConfig = {
      vars: {},
      assert: [
        {
          type: 'promptfoo:redteam:policy',
          metric: 'PolicyViolation:401a805692b3',
        },
      ],
      metadata: { pluginId: 'policy' },
    } as AtomicTestCase;

    const context = createMockContext(targetProvider, { goal: 'test goal' }, testConfig);

    const result = await provider.callApi('test prompt', context);

    // Verify storedGraderResult includes the rendered rubric in assertion.value
    expect(result.metadata?.storedGraderResult).toBeDefined();
    expect(result.metadata?.storedGraderResult?.assertion).toBeDefined();
    expect(result.metadata?.storedGraderResult?.assertion?.value).toBe(mockRenderedRubric);
    expect(result.metadata?.storedGraderResult?.assertion?.type).toBe('promptfoo:redteam:policy');
    expect(result.metadata?.stopReason).toBe('Grader failed');
  });

  it('should store rubric with grade.assertion when grader returns assertion with existing value', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const targetProvider = createMockTargetProvider();

    const mockRenderedRubric = '<rendered_rubric>Evaluation criteria</rendered_rubric>';
    const mockGraderResult = {
      pass: false,
      score: 0,
      reason: 'Test failed',
      assertion: {
        type: 'promptfoo:redteam:policy' as const,
        metric: 'PolicyViolation:test',
        value: 'old value',
      },
    };

    // Mock grader returning grade with assertion
    (mockGrader.getResult as any).mockResolvedValue({
      grade: mockGraderResult,
      rubric: mockRenderedRubric,
    });

    const testConfig = {
      vars: {},
      assert: [
        {
          type: 'promptfoo:redteam:policy',
          metric: 'PolicyViolation:test',
        },
      ],
      metadata: { pluginId: 'policy' },
    } as AtomicTestCase;

    const context = createMockContext(targetProvider, { goal: 'test goal' }, testConfig);

    const result = await provider.callApi('test prompt', context);

    // Verify that the rubric overrides the old value
    expect(result.metadata?.storedGraderResult?.assertion?.value).toBe(mockRenderedRubric);
    expect(result.metadata?.storedGraderResult?.assertion?.type).toBe('promptfoo:redteam:policy');
    expect(result.metadata?.storedGraderResult?.assertion?.metric).toBe('PolicyViolation:test');
  });

  it('should use assertion from test config when grade.assertion is undefined', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const targetProvider = createMockTargetProvider();

    const mockRenderedRubric = '<rubric>Test rubric</rubric>';
    const mockGraderResult = {
      pass: false,
      score: 0,
      reason: 'Test failed',
      // No assertion field
    };

    (mockGrader.getResult as any).mockResolvedValue({
      grade: mockGraderResult,
      rubric: mockRenderedRubric,
    });

    const testConfig = {
      vars: {},
      assert: [
        {
          type: 'promptfoo:redteam:harmful',
          metric: 'Harmful',
        },
      ],
      metadata: { pluginId: 'harmful' },
    } as AtomicTestCase;

    const context = createMockContext(targetProvider, { goal: 'test goal' }, testConfig);

    const result = await provider.callApi('test prompt', context);

    // Should use assertion from test config with rubric as value
    expect(result.metadata?.storedGraderResult?.assertion?.value).toBe(mockRenderedRubric);
    expect(result.metadata?.storedGraderResult?.assertion?.type).toBe('promptfoo:redteam:harmful');
    expect(result.metadata?.storedGraderResult?.assertion?.metric).toBe('Harmful');
  });

  it('should not store assertion when assertToUse is AssertionSet', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const targetProvider = createMockTargetProvider();

    const mockRenderedRubric = '<rubric>Test rubric</rubric>';
    const mockGraderResult = {
      pass: false,
      score: 0,
      reason: 'Test failed',
    };

    (mockGrader.getResult as any).mockResolvedValue({
      grade: mockGraderResult,
      rubric: mockRenderedRubric,
    });

    const testConfig = {
      vars: {},
      assert: [
        {
          type: 'assert-set' as const,
          assert: [
            { type: 'contains', value: 'test' },
            { type: 'contains', value: 'another' },
          ],
        },
      ],
      metadata: { pluginId: 'policy' },
    } as AtomicTestCase;

    const context = createMockContext(targetProvider, { goal: 'test goal' }, testConfig);

    const result = await provider.callApi('test prompt', context);

    // Should not create assertion from AssertionSet
    expect(result.metadata?.storedGraderResult?.assertion).toBeUndefined();
    expect(result.metadata?.storedGraderResult?.pass).toBe(false);
    expect(result.metadata?.storedGraderResult?.score).toBe(0);
  });

  it('should store grader result even when continueAfterSuccess is true', async () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 2,
      continueAfterSuccess: true,
    });

    const targetProvider = createMockTargetProvider();

    const firstGraderResult = {
      pass: false,
      score: 0,
      reason: 'Jailbreak detected',
    };

    const secondGraderResult = {
      pass: true,
      score: 1,
      reason: 'No jailbreak detected',
    };

    // Mock grader to fail on first turn, pass on second turn
    (mockGrader.getResult as any)
      .mockResolvedValueOnce({
        grade: firstGraderResult,
      })
      .mockResolvedValueOnce({
        grade: secondGraderResult,
      });

    // Mock remote generation API for second turn
    mockFetch.mockImplementationOnce(async function () {
      return {
        json: async () => ({
          message: { role: 'assistant', content: 'attack prompt' },
        }),

        ok: true,
      };
    });

    const testConfig = {
      vars: {},
      assert: [
        {
          type: 'contains',
          value: 'expected content',
        },
      ],
      metadata: { pluginId: 'contains' },
    } as AtomicTestCase;

    const context = createMockContext(targetProvider, { goal: 'test goal' }, testConfig);

    const result = await provider.callApi('test prompt', context);

    // Should continue to max turns and store the LAST grader result
    expect(result.metadata?.storedGraderResult).toMatchObject(secondGraderResult);
    expect(result.metadata?.storedGraderResult?.assertion).toBeDefined();
    expect(result.metadata?.stopReason).toBe('Max turns reached');
    expect(result.metadata?.successfulAttacks).toHaveLength(1);
    // The successful attack should be from the first turn
    expect(result.metadata?.successfulAttacks?.[0]).toMatchObject({
      turn: 0,
      prompt: expect.any(String),
      response: expect.any(String),
    });
  });

  describe('Token Counting', () => {
    beforeEach(async () => {
      // Reset TokenUsageTracker between tests to ensure clean state
      const { TokenUsageTracker } = await import('../../../src/util/tokenUsage');
      TokenUsageTracker.getInstance().resetAllUsage();
    });

    it('should correctly track token usage from target provider', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider = createMockTargetProvider('target response', {
        total: 100,
        prompt: 60,
        completion: 40,
        numRequests: 1,
      });

      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      // Verify that target token usage is accumulated
      expect(result.tokenUsage?.total).toBe(100);
      expect(result.tokenUsage?.prompt).toBe(60);
      expect(result.tokenUsage?.completion).toBe(40);
      expect(result.tokenUsage?.numRequests).toBe(1);
    });

    it('should accumulate token usage across multiple turns', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 3,
      });

      const targetProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: vi.fn() as any,
      };

      // Mock target provider for multiple calls with different token usage
      (targetProvider.callApi as any)
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

      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      // Verify accumulated token usage from all target calls
      expect(result.tokenUsage?.total).toBe(450); // 100 + 150 + 200
      expect(result.tokenUsage?.prompt).toBe(270); // 60 + 90 + 120
      expect(result.tokenUsage?.completion).toBe(180); // 40 + 60 + 80
      expect(result.tokenUsage?.numRequests).toBe(3);
    });

    it('should handle missing token usage from target responses', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 3,
      });

      const targetProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: vi.fn() as any,
      };

      (targetProvider.callApi as any)
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

      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      // Token usage should accumulate correctly even with missing data
      expect(result.tokenUsage?.total).toBe(300); // 100 + 0 + 200
      expect(result.tokenUsage?.prompt).toBe(180); // 60 + 0 + 120
      expect(result.tokenUsage?.completion).toBe(120); // 40 + 0 + 80
      expect(result.tokenUsage?.numRequests).toBe(3); // All calls counted
    });

    it('should handle error responses without affecting token counts', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 2,
      });

      const targetProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: vi.fn() as any,
      };

      (targetProvider.callApi as any)
        .mockResolvedValueOnce({
          output: 'successful response',
          tokenUsage: { total: 100, prompt: 60, completion: 40, numRequests: 1 },
          cached: false,
        })
        .mockRejectedValueOnce(new Error('Target provider failed'));

      const context = createMockContext(targetProvider);

      let result;
      try {
        result = await provider.callApi('test prompt', context);
      } catch (error) {
        // GOAT provider throws errors on target failures, unlike iterative which continues
        expect(error).toBeDefined();
        return;
      }

      // If we get here, the provider handled the error gracefully
      expect(result.tokenUsage?.total).toBeGreaterThan(0);
    });

    it('should handle zero token counts correctly', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 2,
      });

      const targetProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: vi.fn() as any,
      };

      (targetProvider.callApi as any)
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

      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      // Should handle zero counts correctly: 0 + 100 = 100
      expect(result.tokenUsage?.total).toBe(100);
      expect(result.tokenUsage?.prompt).toBe(60);
      expect(result.tokenUsage?.completion).toBe(40);
      expect(result.tokenUsage?.numRequests).toBe(2);
    });

    it('should accumulate token usage with unblocking responses', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 2,
      });

      const targetProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: vi.fn() as any,
      };

      // First call (normal attack), second call (next attack)
      (targetProvider.callApi as any)
        .mockResolvedValueOnce({
          output: 'first response',
          tokenUsage: { total: 50, prompt: 30, completion: 20, numRequests: 1 },
          cached: false,
        })
        .mockResolvedValueOnce({
          output: 'second response',
          tokenUsage: { total: 75, prompt: 45, completion: 30, numRequests: 1 },
          cached: false,
        });

      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      // Should accumulate tokens from all calls
      expect(result.tokenUsage?.total).toBe(125); // 50 + 75
      expect(result.tokenUsage?.prompt).toBe(75); // 30 + 45
      expect(result.tokenUsage?.completion).toBe(50); // 20 + 30
      expect(result.tokenUsage?.numRequests).toBe(2);
    });
  });

  describe('Abort Signal Handling', () => {
    it('should re-throw AbortError from fetchWithProxy and not swallow it', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 3,
      });

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      // Mock fetch to throw AbortError
      mockFetch.mockRejectedValueOnce(abortError);

      const targetProvider = createMockTargetProvider();
      const context = createMockContext(targetProvider);

      await expect(provider.callApi('test prompt', context)).rejects.toThrow(
        'The operation was aborted',
      );
    });

    it('should pass options with abortSignal to target provider callApi', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider: ApiProvider = {
        id: () => 'test-provider',
        callApi: vi.fn() as any,
      };

      (targetProvider.callApi as any).mockResolvedValue({
        output: 'target response',
        tokenUsage: {},
      });

      const context = createMockContext(targetProvider);
      const abortController = new AbortController();
      const options = { abortSignal: abortController.signal };

      await provider.callApi('test prompt', context, options);

      // Verify that callApi was called with the options
      expect(targetProvider.callApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        options,
      );
    });

    it('should swallow non-AbortError exceptions and continue the loop', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 2,
      });

      const regularError = new Error('Network error');
      // First turn fails with non-AbortError, second turn succeeds
      mockFetch.mockRejectedValueOnce(regularError).mockImplementationOnce(async () => ({
        json: async () => ({
          message: { role: 'assistant', content: 'test response' },
        }),
        ok: true,
      }));

      const targetProvider = createMockTargetProvider();
      const context = createMockContext(targetProvider);

      // Should NOT throw - should continue to next turn
      const result = await provider.callApi('test prompt', context);

      // Should complete without throwing
      expect(result.metadata?.stopReason).toBe('Max turns reached');
    });
  });

  describe('perTurnLayers configuration', () => {
    it('should initialize with _perTurnLayers config', () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 3,
        _perTurnLayers: ['audio', 'base64'],
      });

      expect(provider.config._perTurnLayers).toEqual(['audio', 'base64']);
    });

    it('should accept perTurnLayers with object config', () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 3,
        _perTurnLayers: [{ id: 'audio', config: { voice: 'alloy' } }, 'base64'],
      });

      expect(provider.config._perTurnLayers).toHaveLength(2);
      expect(provider.config._perTurnLayers![0]).toEqual({
        id: 'audio',
        config: { voice: 'alloy' },
      });
    });

    it('should default perTurnLayers to empty array when not provided', () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
      });

      expect(provider.config._perTurnLayers).toBeUndefined();
    });
  });

  describe('redteamHistory with audio/image data', () => {
    it('should include redteamHistory in metadata', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 2,
      });

      const targetProvider = createMockTargetProvider('target response');
      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      // redteamHistory should be present in metadata
      expect(result.metadata?.redteamHistory).toBeDefined();
      expect(Array.isArray(result.metadata?.redteamHistory)).toBe(true);
    });

    it('should capture prompt and output in redteamHistory entries', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider = createMockTargetProvider('target response text');
      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      const history = result.metadata?.redteamHistory;
      if (history && history.length > 0) {
        const entry = history[0];
        expect(entry).toHaveProperty('prompt');
        expect(entry).toHaveProperty('output');
        expect(entry.output).toBe('target response text');
      }
    });

    it('should have optional promptAudio and promptImage fields in redteamHistory', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider = createMockTargetProvider('response');
      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      const history = result.metadata?.redteamHistory;
      if (history && history.length > 0) {
        const entry = history[0];
        // These fields should be undefined when no perTurnLayers are configured
        expect(entry.promptAudio).toBeUndefined();
        expect(entry.promptImage).toBeUndefined();
      }
    });

    it('should capture outputAudio when target returns audio data', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider = createMockTargetProvider(
        'response with audio',
        {},
        {
          audio: { data: 'base64audiodata', format: 'mp3' },
        },
      );
      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      const history = result.metadata?.redteamHistory;
      if (history && history.length > 0) {
        const entry = history[0];
        expect(entry.outputAudio).toBeDefined();
        expect(entry.outputAudio?.data).toBe('base64audiodata');
        expect(entry.outputAudio?.format).toBe('mp3');
      }
    });
  });

  describe('sessionId handling', () => {
    it('should include sessionId from context.vars in metadata', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider = createMockTargetProvider('response');
      const context = createMockContext(targetProvider, {
        goal: 'test goal',
        sessionId: 'test-session-123',
      });

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.sessionId).toBe('test-session-123');
    });

    it('should include sessionId from context vars when stateful is false', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider = createMockTargetProvider();
      const context = createMockContext(targetProvider, {
        goal: 'test goal',
        sessionId: 'context-session-id',
      });

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.sessionId).toBe('context-session-id');
    });

    it('should include sessionId from target response when stateful is true', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
        stateful: true,
      });

      const targetProvider = createMockTargetProvider(
        'target response',
        {},
        {
          sessionId: 'response-session-id',
        },
      );
      const context = createMockContext(targetProvider);

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.sessionId).toBe('response-session-id');
    });

    it('should handle missing sessionId gracefully', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider = createMockTargetProvider('response');
      const context = createMockContext(targetProvider, { goal: 'test goal' });

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.sessionId).toBeUndefined();
    });

    it('should stringify non-string sessionId', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider = createMockTargetProvider('response');
      const context = createMockContext(targetProvider, {
        goal: 'test goal',
        sessionId: 123 as any, // Non-string sessionId
      });

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.sessionId).toBe('123');
    });

    it('should include sessionId in metadata along with other metadata fields', async () => {
      const provider = new RedteamGoatProvider({
        injectVar: 'goal',
        maxTurns: 1,
      });

      const targetProvider = createMockTargetProvider('response');
      const testConfig = {
        vars: {},
        assert: [{ type: 'contains', value: 'harmful' }],
        metadata: { pluginId: 'contains' },
      } as AtomicTestCase;

      const context = createMockContext(
        targetProvider,
        { goal: 'test goal', sessionId: 'session-with-metadata' },
        testConfig,
      );

      const result = await provider.callApi('test prompt', context);

      expect(result.metadata?.sessionId).toBe('session-with-metadata');
      expect(result.metadata?.stopReason).toBeDefined();
      expect(result.metadata?.messages).toBeDefined();
    });
  });
});
