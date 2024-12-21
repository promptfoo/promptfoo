import { jest } from '@jest/globals';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative';
import type { ApiProvider } from '../../../src/types';

// Mock the shared module
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

// Mock the cliState module to prevent real API calls
jest.mock('../../../src/cliState', () => ({
  config: {
    openai: {
      apiKey: 'test-key',
    },
  },
}));

// Mock the OpenAI provider module
jest.mock('../../../src/providers/openai', () => ({
  OpenAiChatCompletionProvider: jest.fn().mockImplementation(() => ({
    id: jest.fn().mockReturnValue('mock-openai'),
    callApi: jest.fn(),
  })),
}));

// Mock the providers module
jest.mock('../../../src/providers', () => ({
  loadApiProviders: jest.fn().mockResolvedValue([
    {
      id: jest.fn().mockReturnValue('mock-provider'),
      callApi: jest.fn(),
    },
  ]),
}));

describe('RedteamIterativeProvider', () => {
  let mockRedteamProvider: jest.Mocked<ApiProvider>;
  let mockTargetProvider: jest.Mocked<ApiProvider>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock providers
    mockRedteamProvider = {
      id: jest.fn().mockReturnValue('mock-redteam'),
      callApi: jest.fn(),
    } as unknown as jest.Mocked<ApiProvider>;

    mockTargetProvider = {
      id: jest.fn().mockReturnValue('mock-target'),
      callApi: jest.fn(),
    } as unknown as jest.Mocked<ApiProvider>;

    // Setup redteamProviderManager mock
    mockGetProvider.mockResolvedValue(mockRedteamProvider);
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

  describe('callApi', () => {
    let provider: RedteamIterativeProvider;

    beforeEach(() => {
      provider = new RedteamIterativeProvider({ injectVar: 'goal' });
    });

    it('should throw if context is missing required fields', async () => {
      await expect(provider.callApi('test')).rejects.toThrow('Expected originalProvider to be set');
      await expect(provider.callApi('test', {})).rejects.toThrow(
        'Expected originalProvider to be set',
      );
      await expect(
        provider.callApi('test', { originalProvider: mockTargetProvider }),
      ).rejects.toThrow('Expected vars to be set');
    });
  });
});
