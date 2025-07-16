import { fetchWithCache } from '../../../src/cache';
import { HyperbolicImageProvider } from '../../../src/providers/hyperbolic/image';
import * as assetStorage from '../../../src/util/assetStorage';

jest.mock('../../../src/cache');
jest.mock('../../../src/logger');
jest.mock('../../../src/util/assetStorage');

describe('HyperbolicImageProvider', () => {
  const mockFetchResponse = {
    data: {
      status: 'success',
      images: [
        {
          image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          seed: 12345,
        },
      ],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fetchWithCache).mockResolvedValue(mockFetchResponse);
    
    // Mock asset storage
    jest.mocked(assetStorage.saveBase64Asset).mockImplementation((base64, mimeType, originalName) => ({
      id: 'mock-uuid',
      path: '/path/to/asset',
      url: '/assets/mock-uuid.png',
      mimeType: mimeType || 'image/png',
      originalName,
      createdAt: new Date(),
      type: 'image',
    }));
  });

  describe('Basic functionality', () => {
    it('should generate an image successfully', async () => {
      const provider = new HyperbolicImageProvider('FLUX.1-dev', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('Generate a red panda');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/image/generation'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
          body: expect.stringContaining('"prompt":"Generate a red panda"'),
        }),
        expect.any(Number),
      );

      expect(result).toEqual({
        output: '![Generate a red panda](/assets/mock-uuid.png)',
        cached: false,
        cost: 0.025, // Default cost for hyperbolic
      });
    });

    it('should handle base64 responses and save as assets', async () => {
      const provider = new HyperbolicImageProvider('FLUX.1-dev', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('Test image');

      expect(assetStorage.saveBase64Asset).toHaveBeenCalledWith(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'image/png',
        'Test image.png',
      );

      expect(result.output).toBe('![Test image](/assets/mock-uuid.png)');
    });

    it('should detect different image formats correctly', async () => {
      // Test JPEG
      const jpegResponse = {
        ...mockFetchResponse,
        data: {
          ...mockFetchResponse.data,
          images: [
            {
              image: '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAg=',
              seed: 12345,
            },
          ],
        },
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(jpegResponse);

      const provider = new HyperbolicImageProvider('FLUX.1-dev', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('JPEG test');

      expect(assetStorage.saveBase64Asset).toHaveBeenCalledWith(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAg=',
        'image/jpeg',
        'JPEG test.jpg',
      );
    });

    it('should detect WebP format', async () => {
      // Test WebP
      const webpResponse = {
        ...mockFetchResponse,
        data: {
          ...mockFetchResponse.data,
          images: [
            {
              image: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
              seed: 12345,
            },
          ],
        },
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(webpResponse);

      const provider = new HyperbolicImageProvider('FLUX.1-dev', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('WebP test');

      expect(assetStorage.saveBase64Asset).toHaveBeenCalledWith(
        'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
        'image/webp',
        'WebP test.webp',
      );
    });
  });

  describe('Error handling', () => {
    it('should handle missing API key', async () => {
      // Clear any environment variables that might be set
      const originalEnv = process.env.HYPERBOLIC_API_KEY;
      delete process.env.HYPERBOLIC_API_KEY;
      
      const provider = new HyperbolicImageProvider('FLUX.1-dev', {
        config: {},
      });

      await expect(provider.callApi('test prompt')).rejects.toThrow('Hyperbolic API key is not set');
      
      // Restore original env
      if (originalEnv) {
        process.env.HYPERBOLIC_API_KEY = originalEnv;
      }
    });

    it('should handle API errors', async () => {
      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: { error: 'Invalid request' },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const provider = new HyperbolicImageProvider('FLUX.1-dev', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toContain('Invalid request');
    });

    it('should handle missing images in response', async () => {
      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: { status: 'success', images: [] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new HyperbolicImageProvider('FLUX.1-dev', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test prompt');

      expect(result.error).toBe('No images returned from API');
    });
  });

  describe('Configuration options', () => {
    it('should pass through configuration options', async () => {
      const provider = new HyperbolicImageProvider('FLUX.1-dev', {
        config: {
          apiKey: 'test-key',
          width: 1024,
          height: 768,
          steps: 30,
          cfg_scale: 8.5,
          negative_prompt: 'blurry, low quality',
        },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"width":1024'),
        }),
        expect.any(Number),
      );

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"height":768'),
        }),
        expect.any(Number),
      );

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"negative_prompt":"blurry, low quality"'),
        }),
        expect.any(Number),
      );
    });
  });
});
