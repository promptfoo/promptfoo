import { jest } from '@jest/globals';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative';
import type { ApiProvider, ProviderResponse } from '../../../src/types';

const mockGetProvider = jest.fn<() => Promise<ApiProvider>>();
const mockGetTargetResponse = jest.fn<() => Promise<ProviderResponse>>();
const mockCheckPenalizedPhrases = jest.fn<() => boolean>();

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

    mockGetProvider.mockImplementation(() => Promise.resolve(mockRedteamProvider));
    mockGetTargetResponse.mockImplementation(() =>
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
});
