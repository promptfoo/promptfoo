import OpenAI from 'openai';
import { isCacheEnabled, getCache } from '../../../src/cache';
import { OpenAiImageProvider, OpenAiModerationProvider } from '../../../src/providers/openai/image';

jest.mock('openai');
jest.mock('../../../src/cache');
jest.mock('../../../src/logger');

describe('OpenAiImageProvider', () => {
  const mockOpenAI = {
    images: {
      generate: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(OpenAI).mockImplementation(() => mockOpenAI as any);
    jest.mocked(isCacheEnabled).mockReturnValue(false);
  });

  it('should generate an image successfully', async () => {
    const provider = new OpenAiImageProvider('dall-e-3', {
      config: { apiKey: 'test-key' },
    });

    const mockResponse = {
      data: [{ url: 'https://example.com/image.png' }],
    };

    mockOpenAI.images.generate.mockResolvedValue(mockResponse);

    const result = await provider.callApi('Generate a cat');

    expect(result).toEqual({
      output: '![Generate a cat](https://example.com/image.png)',
      cached: false,
    });
    expect(mockOpenAI.images.generate).toHaveBeenCalledWith({
      model: 'dall-e-3',
      prompt: 'Generate a cat',
      n: 1,
      size: '1024x1024',
    });
  });

  it('should handle missing API key', async () => {
    const provider = new OpenAiImageProvider('dall-e-3');

    mockOpenAI.images.generate.mockRejectedValue(new Error('OpenAI API key is not set'));

    await expect(provider.callApi('test prompt')).rejects.toThrow('OpenAI API key is not set');
  });

  it('should handle missing image URL in response', async () => {
    const provider = new OpenAiImageProvider('dall-e-3', {
      config: { apiKey: 'test-key' },
    });

    const mockResponse = { data: [{}] };
    mockOpenAI.images.generate.mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      error: expect.stringContaining('No image URL found in response'),
    });
  });

  it('should use cache when enabled', async () => {
    jest.mocked(isCacheEnabled).mockReturnValue(true);

    const provider = new OpenAiImageProvider('dall-e-3', {
      config: { apiKey: 'test-key' },
    });

    const mockResponse = {
      data: [{ url: 'https://example.com/image.png' }],
    };

    const mockCache = {
      get: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
      set: jest.fn(),
    };

    jest.mocked(getCache).mockReturnValue(mockCache as any);

    const result = await provider.callApi('test prompt');

    expect(result).toEqual({
      output: '![test prompt](https://example.com/image.png)',
      cached: true,
    });
    expect(mockCache.get).toHaveBeenCalledWith(expect.stringContaining('openai:image:'));
  });

  it('should sanitize prompt text', async () => {
    const provider = new OpenAiImageProvider('dall-e-3', {
      config: { apiKey: 'test-key' },
    });

    const mockResponse = {
      data: [{ url: 'https://example.com/image.png' }],
    };

    mockOpenAI.images.generate.mockResolvedValue(mockResponse);

    const result = await provider.callApi('Test [prompt] with\nnewlines');

    expect(result.output).toBe('![Test (prompt) with newlines](https://example.com/image.png)');
  });
});

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
