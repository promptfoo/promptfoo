import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import RedteamGoatProvider from '../../../src/redteam/providers/goat';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';
import type { ApiProvider, AtomicTestCase, CallApiContextParams, Prompt } from '../../../src/types';

// Mock the graders module at the top level
const mockGrader = {
  getResult: jest.fn(),
};

const mockGetGraderById = jest.fn().mockReturnValue(mockGrader);

jest.mock('../../../src/redteam/graders', () => ({
  getGraderById: mockGetGraderById,
}));

jest.mock('../../../src/util/server', () => ({
  checkServerFeatureSupport: jest.fn(() => Promise.resolve(false)),
}));

describe('RedteamGoatProvider', () => {
  let mockFetch: jest.Mock;

  // Helper function to create a mock target provider
  const createMockTargetProvider = (outputValue: any = 'target response', tokenUsage: any = {}) => {
    const targetProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn() as any,
    };

    (targetProvider.callApi as any).mockResolvedValue({
      output: outputValue,
      tokenUsage,
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
    mockFetch = jest.fn().mockImplementation(async () => ({
      json: async () => ({
        message: { role: 'assistant', content: 'test response' },
      }),
      ok: true,
    }));
    global.fetch = mockFetch as unknown as typeof fetch;

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      callApi: jest.fn() as any,
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
        headers: {
          'Content-Type': 'application/json',
        },
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
      callApi: jest.fn() as any,
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
      callApi: jest.fn() as any,
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
      callApi: jest.fn() as any,
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
      jest.clearAllMocks();
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
        callApi: jest.fn() as any,
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
        callApi: jest.fn() as any,
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
        callApi: jest.fn() as any,
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
});
