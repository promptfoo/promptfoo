import { GoogleImageProvider } from '../../../src/providers/google/image';
import { fetchWithCache } from '../../../src/cache';

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('GoogleImageProvider', () => {
  const mockFetchWithCache = fetchWithCache as jest.Mock;
  const mockExecSync = require('child_process').execSync as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_PROJECT_ID;
  });

  it('should construct with model name', () => {
    const provider = new GoogleImageProvider('imagen-3.0-generate-001');
    expect(provider.id()).toBe('google:image:imagen-3.0-generate-001');
    expect(provider.toString()).toBe('[Google Image Generation Provider imagen-3.0-generate-001]');
  });

  it('should use Google AI Studio when project ID is missing but API key is available', async () => {
    delete process.env.GOOGLE_PROJECT_ID;
    const provider = new GoogleImageProvider('imagen-3.0-generate-001');

    mockFetchWithCache.mockResolvedValueOnce({
      status: 200,
      data: {
        predictions: [
          {
            bytesBase64Encoded: 'base64data',
            mimeType: 'image/png',
          },
        ],
      },
      cached: false,
    });

    const result = await provider.callApi('Test prompt');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-api-key': 'test-api-key',
        }),
      }),
      expect.any(Number),
      'json',
    );
    expect(result.output).toContain('![Generated Image](data:image/png;base64,base64data)');
  });

  it('should return error when both project ID and API key are missing', async () => {
    delete process.env.GOOGLE_PROJECT_ID;
    delete process.env.GOOGLE_API_KEY;
    const provider = new GoogleImageProvider('imagen-3.0-generate-001');

    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Imagen models require either:');
    expect(result.error).toContain('Google AI Studio');
    expect(result.error).toContain('Vertex AI');
  });

  describe('Vertex AI', () => {
    beforeEach(() => {
      process.env.GOOGLE_PROJECT_ID = 'test-project';
    });

    it('should use OAuth authentication for Vertex AI', async () => {
      const provider = new GoogleImageProvider('imagen-3.0-generate-001', {
        config: {
          projectId: 'test-project',
        },
      });

      mockExecSync.mockReturnValue('test-oauth-token\n');
      mockFetchWithCache.mockResolvedValue({
        data: {
          predictions: [
            {
              image: {
                mimeType: 'image/png',
                bytesBase64Encoded: 'base64data',
              },
            },
          ],
        },
        cached: false,
      });

      const result = await provider.callApi('Test prompt');

      expect(mockExecSync).toHaveBeenCalledWith(
        'gcloud auth application-default print-access-token',
        expect.objectContaining({
          encoding: 'utf-8',
        }),
      );

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('aiplatform.googleapis.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-oauth-token',
          }),
        }),
        300000,
        'json',
      );

      expect(result.output).toContain('![Generated Image](data:image/png;base64,base64data)');
    });

    it('should handle OAuth errors', async () => {
      const provider = new GoogleImageProvider('imagen-3.0-generate-001', {
        config: {
          projectId: 'test-project',
        },
      });

      mockExecSync.mockImplementation(() => {
        throw new Error('gcloud not found');
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Failed to get OAuth token');
      expect(result.error).toContain('gcloud not found');
    });
  });

  it('should support different model name formats', () => {
    const provider1 = new GoogleImageProvider('imagen-3.0-generate-001');
    expect(provider1['getModelPath']()).toBe('imagen-3.0-generate-001');

    // When model name already includes 'imagen', it should be returned as-is
    const provider2 = new GoogleImageProvider('gemini/imagen-3.0-generate-001');
    expect(provider2['getModelPath']()).toBe('gemini/imagen-3.0-generate-001');

    // When model name doesn't include 'imagen', it should be prefixed
    const provider3 = new GoogleImageProvider('3.0-generate-001');
    expect(provider3['getModelPath']()).toBe('imagen-3.0-generate-001');
  });

  it('should return correct cost for different models', () => {
    const provider1 = new GoogleImageProvider('imagen-4.0-ultra-generate-preview-06-06');
    expect(provider1['getCost']()).toBe(0.06);

    const provider2 = new GoogleImageProvider('imagen-4.0-generate-preview-06-06');
    expect(provider2['getCost']()).toBe(0.04);

    const provider3 = new GoogleImageProvider('imagen-4.0-fast-generate-preview-06-06');
    expect(provider3['getCost']()).toBe(0.02);

    const provider4 = new GoogleImageProvider('unknown-model');
    expect(provider4['getCost']()).toBe(0.04); // Default cost
  });

  describe('Google AI Studio', () => {
    beforeEach(() => {
      delete process.env.GOOGLE_PROJECT_ID;
      process.env.GOOGLE_API_KEY = 'test-api-key';
    });

    it('should make correct API request to Google AI Studio', async () => {
      const provider = new GoogleImageProvider('imagen-4.0-generate-preview-06-06', {
        config: {
          n: 2,
          aspectRatio: '16:9',
          safetyFilterLevel: 'block_few',
          personGeneration: 'allow_adult',
        },
      });

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          predictions: [
            {
              bytesBase64Encoded: 'base64data1',
              mimeType: 'image/png',
            },
            {
              bytesBase64Encoded: 'base64data2',
              mimeType: 'image/png',
            },
          ],
        },
        cached: false,
      });

      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-preview-06-06:predict',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-goog-api-key': 'test-api-key',
          }),
          body: JSON.stringify({
            instances: [
              {
                prompt: 'Test prompt',
              },
            ],
            parameters: {
              sampleCount: 2,
              aspectRatio: '16:9',
              personGeneration: 'allow_adult',
              safetySetting: 'block_low_and_above',
            },
          }),
        }),
        expect.any(Number),
        'json',
      );

      expect(result.output).toContain('![Generated Image](data:image/png;base64,base64data1)');
      expect(result.output).toContain('![Generated Image](data:image/png;base64,base64data2)');
      expect(result.cached).toBe(false);
      expect(result.cost).toBe(0.08); // 2 images * 0.04
    });

    it('should handle API errors from Google AI Studio', async () => {
      const provider = new GoogleImageProvider('imagen-3.0-generate-001');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 400,
        data: {
          error: {
            message: 'Invalid request',
          },
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.error).toBe('Google AI Studio error: Invalid request');
    });

    it('should handle missing API key for Google AI Studio', async () => {
      delete process.env.GOOGLE_API_KEY;
      const provider = new GoogleImageProvider('imagen-3.0-generate-001');

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Imagen models require either:');
    });

    it('should support different API key environment variables', async () => {
      delete process.env.GOOGLE_API_KEY;
      process.env.GEMINI_API_KEY = 'gemini-key';

      const provider = new GoogleImageProvider('imagen-3.0-generate-001');

      mockFetchWithCache.mockResolvedValueOnce({
        status: 200,
        data: {
          predictions: [
            {
              bytesBase64Encoded: 'base64data',
              mimeType: 'image/png',
            },
          ],
        },
        cached: false,
      });

      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-goog-api-key': 'gemini-key',
          }),
        }),
        expect.any(Number),
        'json',
      );
      expect(result.output).toContain('![Generated Image]');
    });
  });
});
