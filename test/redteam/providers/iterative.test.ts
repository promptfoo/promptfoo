import { jest } from '@jest/globals';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative';
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../../src/types';

const mockGetProvider = jest.fn();
const mockGetTargetResponse = jest.fn();
const mockCheckPenalizedPhrases = jest.fn();

jest.mock('../../../src/redteam/providers/shared', () => ({
  redteamProviderManager: {
    getProvider: mockGetProvider,
  },
  getTargetResponse: mockGetTargetResponse,
  checkPenalizedPhrases: mockCheckPenalizedPhrases,
}));

jest.mock('../../../src/cliState', () => ({
  config: {
    openai: {
      apiKey: 'test-key',
    },
  },
}));

jest.mock('../../../src/providers/openai', () => ({
  OpenAiChatCompletionProvider: jest.fn().mockImplementation(() => ({
    id: jest.fn().mockReturnValue('mock-openai'),
    callApi: jest.fn(),
  })),
}));

jest.mock('../../../src/providers', () => ({
  loadApiProviders: jest.fn().mockImplementation(
    () =>
      [
        {
          id: () => 'mock-provider',
          callApi: jest.fn(),
        },
      ] as ApiProvider[],
  ),
}));

describe('RedteamIterativeProvider', () => {
  let mockRedteamProvider: jest.Mocked<ApiProvider>;
  let mockTargetProvider: jest.Mocked<ApiProvider>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedteamProvider = {
      id: jest.fn().mockReturnValue('mock-redteam'),
      callApi: jest.fn().mockImplementation((prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> => {
        const input = typeof prompt === 'string' ? JSON.parse(prompt) : prompt;
        
        if (input.role === 'system' && input.content.includes('OBJECTIVE')) {
          // Attacker response
          return Promise.resolve({ 
            output: JSON.stringify({ 
              improvement: 'test improvement',
              prompt: 'test prompt'
            })
          });
        } else if (input[0]?.content?.includes('on-topic')) {
          // On-topic check
          return Promise.resolve({ 
            output: JSON.stringify({ onTopic: true })
          });
        } else {
          // Judge response
          return Promise.resolve({ 
            output: JSON.stringify({
              currentResponse: { rating: 5, explanation: 'test' },
              previousBestResponse: { rating: 0, explanation: 'none' }
            })
          });
        }
      }),
    } as unknown as jest.Mocked<ApiProvider>;

    mockTargetProvider = {
      id: jest.fn().mockReturnValue('mock-target'),
      callApi: jest.fn().mockResolvedValue({ output: 'mock target response' }),
    } as unknown as jest.Mocked<ApiProvider>;

    mockGetProvider.mockImplementation(() => mockRedteamProvider);
    mockGetTargetResponse.mockResolvedValue({ output: 'mock target response' });
    mockCheckPenalizedPhrases.mockReturnValue(false);
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
      expect(provider['numIterations']).toBe(10);
    });

    it('should use configured numIterations when provided', () => {
      const provider = new RedteamIterativeProvider({
        injectVar: 'test',
        numIterations: '5',
      });
      expect(provider['numIterations']).toBe(5);
    });

    it('should use environment variable for numIterations if set', () => {
      process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS = '15';
      const provider = new RedteamIterativeProvider({ injectVar: 'test' });
      expect(provider['numIterations']).toBe(15);
      delete process.env.PROMPTFOO_NUM_JAILBREAK_ITERATIONS;
    });
  });

  describe('callApi', () => {
    let provider: RedteamIterativeProvider;
    const mockContext: CallApiContextParams = {
      prompt: {
        raw: 'test prompt',
        label: 'test',
      },
      vars: { goal: 'test goal' },
      originalProvider: mockTargetProvider,
      filters: undefined,
    };
    const mockOptions: CallApiOptionsParams = {};

    beforeEach(() => {
      provider = new RedteamIterativeProvider({ injectVar: 'goal' });
    });

    it('should run for configured number of iterations', async () => {
      provider = new RedteamIterativeProvider({
        injectVar: 'goal',
        numIterations: '2',
      });

      await provider.callApi('test prompt', mockContext, mockOptions);

      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(6);
    });

    it('should pass conversation history to redteam provider', async () => {
      await provider.callApi(mockContext, mockOptions);

      const lastCall = mockRedteamProvider.callApi.mock.calls[0][0];
      expect(JSON.parse(lastCall.vars.conversation)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            goal: 'test goal',
          }),
        ]),
      );
    });

    it('should return most effective prompt found', async () => {
      mockGetTargetResponse.mockResolvedValueOnce('success');

      const result = await provider.callApi(mockContext, mockOptions);

      expect(result).toEqual(
        expect.objectContaining({
          output: expect.any(String),
          metadata: expect.objectContaining({
            numIterations: expect.any(Number),
            finalIteration: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      mockRedteamProvider.callApi.mockRejectedValueOnce(new Error('Test error'));

      const result = await provider.callApi('test prompt', mockContext, mockOptions);
      expect(result).toHaveProperty('error');
    });

    it('should track best performing prompt', async () => {
      mockRedteamProvider.callApi.mockImplementation((prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> => {
        const input = typeof prompt === 'string' ? JSON.parse(prompt) : prompt;
        const iteration = Number(context?.vars?.iteration || 0);

        if (input.role === 'system' && input.content.includes('OBJECTIVE')) {
          return Promise.resolve({ 
            output: JSON.stringify({ 
              improvement: `improvement ${iteration}`,
              prompt: `prompt ${iteration}`
            })
          });
        } else if (input[0]?.content?.includes('on-topic')) {
          return Promise.resolve({ 
            output: JSON.stringify({ onTopic: true })
          });
        } else {
          return Promise.resolve({ 
            output: JSON.stringify({
              currentResponse: { 
                rating: iteration === 1 ? 8 : 5, 
                explanation: iteration === 1 ? 'better' : 'partial' 
              },
              previousBestResponse: { 
                rating: iteration === 1 ? 5 : 0, 
                explanation: iteration === 1 ? 'partial' : 'none' 
              }
            })
          });
        }
      });

      const result = await provider.callApi('test prompt', mockContext, mockOptions);

      expect(result.metadata).toEqual(
        expect.objectContaining({
          highestScore: 8,
          finalIteration: 2,
        }),
      );
    });

    it('should stop iterations if successful prompt is found', async () => {
      provider = new RedteamIterativeProvider({
        injectVar: 'goal',
        numIterations: '5',
      });

      // Mock a successful response on second try
      mockGetTargetResponse.mockResolvedValueOnce('partial').mockResolvedValueOnce('success');

      await provider.callApi(mockContext, mockOptions);

      // Should stop after finding success, not continue all 5 iterations
      expect(mockRedteamProvider.callApi).toHaveBeenCalledTimes(2);
    });

    it('should handle penalized phrases check', async () => {
      mockCheckPenalizedPhrases.mockReturnValueOnce(true);

      const result = await provider.callApi(mockContext, mockOptions);

      expect(result.metadata).toEqual(
        expect.objectContaining({
          penalized: true,
        }),
      );
    });

    it('should pass filters to target response check', async () => {
      const mockFilters = {
        testFilter: () => true,
      };
      const contextWithFilters = {
        ...mockContext,
        filters: mockFilters,
      };

      await provider.callApi('test prompt', contextWithFilters, mockOptions);

      expect(mockGetTargetResponse).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          filters: mockFilters,
        }),
      );
    });

    it('should include iteration number in redteam provider context', async () => {
      await provider.callApi(mockContext, mockOptions);

      const redteamCall = mockRedteamProvider.callApi.mock.calls[0][0];
      expect(redteamCall.vars).toEqual(
        expect.objectContaining({
          iteration: 0,
        }),
      );
    });
  });
});
