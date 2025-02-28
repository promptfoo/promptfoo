import OpenAI from 'openai';
import { isCacheEnabled, getCache } from '../../../src/cache';
import { OpenAiModerationProvider } from '../../../src/providers/openai/moderation';

jest.mock('openai');
jest.mock('../../../src/cache');
jest.mock('../../../src/logger');

describe('OpenAiModerationProvider', () => {
  const mockOpenAI = {
    moderations: {
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(OpenAI).mockImplementation(() => mockOpenAI as any);
    jest.mocked(isCacheEnabled).mockReturnValue(false);
  });

  it('should moderate content successfully', async () => {
    const provider = new OpenAiModerationProvider('text-moderation-latest', {
      config: { apiKey: 'test-key' },
    });

    const mockResponse = {
      results: [
        {
          flagged: true,
          categories: {
            hate: true,
            'hate/threatening': false,
          },
          category_scores: {
            hate: 0.99,
            'hate/threatening': 0.01,
          },
        },
      ],
    };

    mockOpenAI.moderations.create.mockResolvedValue(mockResponse);

    const result = await provider.callModerationApi('user input', 'assistant response');

    expect(result).toEqual({
      flags: [
        {
          code: 'hate',
          description: 'hate',
          confidence: 0.99,
        },
      ],
    });
  });

  it('should handle moderation API errors', async () => {
    const provider = new OpenAiModerationProvider('text-moderation-latest', {
      config: { apiKey: 'test-key' },
    });

    mockOpenAI.moderations.create.mockRejectedValue(new Error('API Error'));

    const result = await provider.callModerationApi('user input', 'assistant response');

    expect(result).toEqual({
      error: expect.stringContaining('API call error'),
    });
  });

  it('should return empty flags for non-flagged content', async () => {
    const provider = new OpenAiModerationProvider('text-moderation-latest', {
      config: { apiKey: 'test-key' },
    });

    const mockResponse = {
      results: [
        {
          flagged: false,
          categories: {
            hate: false,
            'hate/threatening': false,
          },
          category_scores: {
            hate: 0.01,
            'hate/threatening': 0.01,
          },
        },
      ],
    };

    mockOpenAI.moderations.create.mockResolvedValue(mockResponse);

    const result = await provider.callModerationApi('user input', 'assistant response');

    expect(result).toEqual({
      flags: [],
    });
  });

  it('should handle missing API key', async () => {
    const provider = new OpenAiModerationProvider('text-moderation-latest');

    mockOpenAI.moderations.create.mockRejectedValue(new Error('OpenAI API key is not set'));

    const result = await provider.callModerationApi('user input', 'assistant response');
    expect(result).toEqual({
      error: expect.stringContaining('API call error'),
    });
  });

  it('should use cache when enabled', async () => {
    jest.mocked(isCacheEnabled).mockReturnValue(true);

    const provider = new OpenAiModerationProvider('text-moderation-latest', {
      config: { apiKey: 'test-key' },
    });

    const mockResponse = {
      flags: [
        {
          code: 'hate',
          description: 'hate',
          confidence: 0.9,
        },
      ],
    };

    const mockCache = {
      get: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      set: jest.fn(),
    };

    jest.mocked(getCache).mockReturnValue(mockCache as any);

    const result = await provider.callModerationApi('user input', 'assistant response');

    expect(result).toEqual(mockResponse);
    expect(mockCache.get).toHaveBeenCalledWith(
      expect.stringContaining('openai:text-moderation-latest:'),
    );
  });
});
