import { jest } from '@jest/globals';
import RedteamIterativeProvider, {
  runRedteamConversation,
} from '../../../src/redteam/providers/iterative';
import type { ApiProvider, ProviderResponse, AtomicTestCase } from '../../../src/types';

const mockGetProvider = jest.fn<() => Promise<any>>();
const mockGetTargetResponse = jest.fn<() => Promise<any>>();
const mockCheckPenalizedPhrases = jest.fn<() => boolean>();

jest.mock('../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: mockGetProvider,
  },
  getTargetResponse: mockGetTargetResponse,
  checkPenalizedPhrases: mockCheckPenalizedPhrases,
}));

describe('RedteamIterativeProvider', () => {
  let mockRedteamProvider: jest.Mocked<ApiProvider>;
  let mockTargetProvider: jest.Mocked<ApiProvider>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedteamProvider = {
      id: jest.fn().mockReturnValue('mock-redteam'),
      callApi: jest
        .fn<(prompt: string, context?: any) => Promise<ProviderResponse>>()
        .mockImplementation(async (prompt: string) => {
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
    } as jest.Mocked<ApiProvider>;

    mockTargetProvider = {
      id: jest.fn().mockReturnValue('mock-target'),
      callApi: jest.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: 'mock target response',
      }),
    } as jest.Mocked<ApiProvider>;

    mockGetProvider.mockImplementation(() => Promise.resolve(mockRedteamProvider));
    mockGetTargetResponse.mockImplementation(async () =>
      Promise.resolve({
        output: 'mock target response',
      }),
    );
    mockCheckPenalizedPhrases.mockImplementation(() => false);
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
      // The environment variable takes precedence
      expect(provider['numIterations']).toBe(4);
    });

    it('should use environment variable for numIterations if set', () => {
      process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS = '15';
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      expect(provider['numIterations']).toBe(15);
      delete process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS;
    });
  });

  describe('runRedteamConversation', () => {
    it('should stop iteration when score reaches 10', async () => {
      mockRedteamProvider.callApi
        .mockImplementationOnce(async () => ({
          output: JSON.stringify({
            improvement: 'test',
            prompt: 'test',
          }),
        }))
        .mockImplementationOnce(async () => ({
          output: JSON.stringify({ onTopic: true }),
        }))
        .mockImplementationOnce(async () => ({
          output: JSON.stringify({
            currentResponse: { rating: 10, explanation: 'perfect' },
            previousBestResponse: { rating: 5, explanation: 'good' },
          }),
        }));

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

      expect(result.metadata.finalIteration).toBe(1);
      expect(result.metadata.highestScore).toBe(10);
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
      mockTargetProvider.callApi.mockImplementation(async (prompt: string) => {
        targetPrompts.push(prompt);
        return { output: 'mock target response' };
      });

      // Mock provider responses for 3 iterations
      mockRedteamProvider.callApi
        // First iteration
        .mockResolvedValueOnce({
          output: JSON.stringify({ improvement: 'test1', prompt: 'test1' }),
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({ onTopic: true }),
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
          output: JSON.stringify({ onTopic: true }),
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
          output: JSON.stringify({ onTopic: true }),
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
});
