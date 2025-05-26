import { callOpenAiImageApi } from '../../../src/providers/openai/image';
import { REQUEST_TIMEOUT_MS } from '../../../src/providers/shared';
import { XAIImageProvider, createXAIImageProvider } from '../../../src/providers/xai/image';

jest.mock('../../../src/providers/openai/image', () => ({
  ...jest.requireActual('../../../src/providers/openai/image'),
  callOpenAiImageApi: jest.fn(),
}));

describe('XAIImageProvider', () => {
  const mockApiKey = 'test-api-key';
  const mockPrompt = 'test prompt';
  const mockResponse = {
    data: {
      created: 1234567890,
      data: [
        {
          url: 'https://example.com/image.jpg',
        },
      ],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(callOpenAiImageApi).mockResolvedValue(mockResponse);
  });

  it('should create provider with correct defaults', () => {
    const provider = new XAIImageProvider('grok-2-image');
    expect(provider.config).toEqual({});
    expect(provider.modelName).toBe('grok-2-image');
  });

  it('should use correct API URL', () => {
    const provider = new XAIImageProvider('grok-2-image');
    expect(provider.getApiUrlDefault()).toBe('https://api.x.ai/v1');
  });

  it('should format provider ID correctly', () => {
    const provider = new XAIImageProvider('grok-2-image');
    expect(provider.id()).toBe('xai:image:grok-2-image');
  });

  it('should throw error if API key not set', async () => {
    const provider = new XAIImageProvider('grok-2-image');
    await expect(provider.callApi(mockPrompt)).rejects.toThrow('xAI API key is not set');
  });

  it('should call API with correct parameters', async () => {
    const provider = new XAIImageProvider('grok-2-image', {
      config: { apiKey: mockApiKey },
    });

    await provider.callApi(mockPrompt);

    expect(callOpenAiImageApi).toHaveBeenCalledWith(
      'https://api.x.ai/v1/images/generations',
      {
        model: 'grok-2-image',
        prompt: mockPrompt,
        n: 1,
        response_format: 'url',
      },
      {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mockApiKey}`,
      },
      REQUEST_TIMEOUT_MS,
    );
  });

  it('should handle API errors', async () => {
    const provider = new XAIImageProvider('grok-2-image', {
      config: { apiKey: mockApiKey },
    });

    jest.mocked(callOpenAiImageApi).mockRejectedValue(new Error('API Error'));

    const result = await provider.callApi(mockPrompt);
    expect(result.error).toBe('API call error: Error: API Error');
  });

  it('should calculate correct cost', async () => {
    const provider = new XAIImageProvider('grok-2-image', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi(mockPrompt);
    expect(result.cost).toBe(0.07); // $0.07 per image
  });

  it('should map model names correctly', async () => {
    const provider = new XAIImageProvider('grok-image', {
      config: { apiKey: mockApiKey },
    });

    await provider.callApi(mockPrompt);

    expect(callOpenAiImageApi).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        model: 'grok-2-image',
      }),
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('should handle non-200 API responses', async () => {
    const provider = new XAIImageProvider('grok-2-image', {
      config: { apiKey: mockApiKey },
    });

    jest.mocked(callOpenAiImageApi).mockResolvedValue({
      data: { error: 'Invalid request' },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const result = await provider.callApi(mockPrompt);
    expect(result.error).toMatch(/API error: 400 Bad Request/);
  });

  it('should handle custom response format', async () => {
    const provider = new XAIImageProvider('grok-2-image', {
      config: {
        apiKey: mockApiKey,
        response_format: 'b64_json',
      },
    });

    await provider.callApi(mockPrompt);

    expect(callOpenAiImageApi).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        response_format: 'b64_json',
      }),
      expect.any(Object),
      expect.any(Number),
    );
  });

  describe('createXAIImageProvider', () => {
    it('should create provider instance', () => {
      const provider = createXAIImageProvider('xai:image:grok-2-image');
      expect(provider).toBeInstanceOf(XAIImageProvider);
    });

    it('should throw error if model name missing', () => {
      expect(() => createXAIImageProvider('xai:image:')).toThrow('Model name is required');
    });
  });
});
