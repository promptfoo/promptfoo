import { jest } from '@jest/globals';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative';
import type { ApiProvider } from '../../../src/types';

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

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedteamProvider = {
      id: jest.fn().mockReturnValue('mock-redteam'),
      callApi: () => ({ output: 'mock response' }),
    } as unknown as jest.Mocked<ApiProvider>;

    mockGetProvider.mockImplementation(() => mockRedteamProvider);
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
  });
});
