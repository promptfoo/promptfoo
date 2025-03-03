import { clearCache, fetchWithCache } from '../../src/cache';
import { VoyageEmbeddingProvider } from '../../src/providers/voyage';

jest.mock('../../src/cache', () => ({
  ...jest.requireActual('../../src/cache'),
  fetchWithCache: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = jest.requireMock('../../src/logger').default;

describe('VoyageEmbeddingProvider', () => {
  const mockApiResponse = {
    data: [
      {
        embedding: [0.1, 0.2, 0.3],
      },
    ],
    usage: {
      total_tokens: 10,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await clearCache();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const provider = new VoyageEmbeddingProvider('voyage-3-large');
      expect(provider.modelName).toBe('voyage-3-large');
      expect(provider.config).toEqual({});
      expect(provider.toString()).toBe('[Voyage Provider voyage-3-large]');
      expect(provider.id()).toBe('voyage:voyage-3-large');
    });

    it('should warn when initializing with unknown model', () => {
      const provider = new VoyageEmbeddingProvider('unknown-model');
      expect(mockLogger.warn).toHaveBeenCalledWith('Using unknown Voyage model: unknown-model');
      expect(provider.modelName).toBe('unknown-model');
    });

    it('should initialize with custom configuration', () => {
      const provider = new VoyageEmbeddingProvider('voyage-3-large', {
        config: {
          apiKey: 'test-key',
          input_type: 'query',
        },
      });
      expect(provider.modelName).toBe('voyage-3-large');
      expect(provider.config.apiKey).toBe('test-key');
      expect(provider.config.input_type).toBe('query');
      expect(provider.getApiKey()).toBe('test-key');
    });

    describe('dimension validation', () => {
      it('should warn when using output_dimension with unsupported model', () => {
        const provider = new VoyageEmbeddingProvider('voyage-3', {
          config: { output_dimension: 512 },
        });
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Model voyage-3 does not support custom output dimensions',
        );
        expect(provider.config.output_dimension).toBe(512);
      });

      it('should warn when using invalid output_dimension', () => {
        const provider = new VoyageEmbeddingProvider('voyage-3-large', {
          config: { output_dimension: 768 },
        });
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Invalid output dimension 768. Supported values are: 256, 512, 1024, 2048',
        );
        expect(provider.config.output_dimension).toBe(768);
      });

      it('should not warn when using valid output_dimension with supported model', () => {
        const provider = new VoyageEmbeddingProvider('voyage-3-large', {
          config: { output_dimension: 512 },
        });
        expect(mockLogger.warn).not.toHaveBeenCalled();
        expect(provider.config.output_dimension).toBe(512);
      });
    });
  });

  describe('API methods', () => {
    it('should throw error when calling text inference API', async () => {
      const provider = new VoyageEmbeddingProvider('voyage-3-large');
      await expect(provider.callApi()).rejects.toThrow(
        'Voyage API only supports embeddings, not text generation',
      );
    });

    describe('callEmbeddingApi', () => {
      describe('successful calls', () => {
        it('should return embeddings with cost for successful API call', async () => {
          const provider = new VoyageEmbeddingProvider('voyage-3-large', {
            config: { apiKey: 'test-key' },
          });

          jest.mocked(fetchWithCache).mockResolvedValueOnce({
            data: mockApiResponse,
            cached: false,
            status: 200,
            statusText: 'OK',
          });

          const result = await provider.callEmbeddingApi('test input');
          expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
          expect(result.tokenUsage).toEqual({
            total: 10,
            cached: 0,
            prompt: 10,
            completion: 0,
          });
          expect(result.cost).toBeCloseTo(0.0018, 6); // 10 tokens * $0.00018 per token, with 6 decimal precision

          expect(fetchWithCache).toHaveBeenCalledWith(
            'https://api.voyageai.com/v1/embeddings',
            expect.objectContaining({
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer test-key',
              },
              body: expect.stringMatching(
                /.*"input":\["test input"\].*"model":"voyage-3-large".*"input_type":"document".*/,
              ),
            }),
            expect.any(Number),
          );
        });

        it('should not charge for cached responses', async () => {
          const provider = new VoyageEmbeddingProvider('voyage-3-large', {
            config: { apiKey: 'test-key' },
          });

          jest.mocked(fetchWithCache).mockResolvedValueOnce({
            data: mockApiResponse,
            cached: true,
            status: 200,
            statusText: 'OK',
          });

          const result = await provider.callEmbeddingApi('test input');
          expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
          expect(result.tokenUsage).toEqual({
            total: 10,
            cached: 10,
            prompt: 10,
            completion: 0,
          });
          expect(result.cost).toBe(0); // No cost for cached responses

          expect(fetchWithCache).toHaveBeenCalledTimes(1);
        });

        it('should calculate correct cost for different models', async () => {
          const provider = new VoyageEmbeddingProvider('voyage-3-lite', {
            config: { apiKey: 'test-key' },
          });

          jest.mocked(fetchWithCache).mockResolvedValueOnce({
            data: mockApiResponse,
            cached: false,
            status: 200,
            statusText: 'OK',
          });

          const result = await provider.callEmbeddingApi('test input');
          expect(result.cost).toBeCloseTo(0.0002, 6); // 10 tokens * $0.00002 per token, with 6 decimal precision
        });

        it('should use query input type when specified', async () => {
          const provider = new VoyageEmbeddingProvider('voyage-3-large', {
            config: {
              apiKey: 'test-key',
              input_type: 'query',
            },
          });

          jest.mocked(fetchWithCache).mockResolvedValueOnce({
            data: mockApiResponse,
            cached: false,
            status: 200,
            statusText: 'OK',
          });

          await provider.callEmbeddingApi('test input');

          expect(fetchWithCache).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              body: expect.stringMatching(
                /.*"input":\["test input"\].*"model":"voyage-3-large".*"input_type":"query".*/,
              ),
            }),
            expect.any(Number),
          );
        });
      });

      describe('error handling', () => {
        it('should handle missing API key', async () => {
          const provider = new VoyageEmbeddingProvider('voyage-3-large');

          await expect(provider.callEmbeddingApi('test input')).rejects.toThrow(
            'Voyage API key must be set',
          );
        });

        it('should handle API errors', async () => {
          const provider = new VoyageEmbeddingProvider('voyage-3-large', {
            config: { apiKey: 'test-key' },
          });

          jest.mocked(fetchWithCache).mockRejectedValueOnce(new Error('API call failed'));

          await expect(provider.callEmbeddingApi('test input')).rejects.toThrow('API call failed');
          expect(mockLogger.error).toHaveBeenCalledWith('API call error: Error: API call failed');
        });

        it('should handle API errors with status code', async () => {
          const provider = new VoyageEmbeddingProvider('voyage-3-large', {
            config: { apiKey: 'test-key' },
          });

          const error = {
            status: 400,
            statusText: 'Bad Request',
            data: { error: { message: 'Invalid request' } },
          };

          jest.mocked(fetchWithCache).mockRejectedValueOnce(error);

          await expect(provider.callEmbeddingApi('test input')).rejects.toThrow(
            'Voyage API call failed: 400 Bad Request - Invalid request',
          );
          expect(mockLogger.error).toHaveBeenCalledWith(`API call error: ${error}`);
        });

        describe('malformed responses', () => {
          it('should handle malformed API responses', async () => {
            const provider = new VoyageEmbeddingProvider('voyage-3-large', {
              config: { apiKey: 'test-key' },
            });

            jest.mocked(fetchWithCache).mockResolvedValueOnce({
              data: { invalid: 'response' },
              cached: false,
              status: 200,
              statusText: 'OK',
            });

            await expect(provider.callEmbeddingApi('test input')).rejects.toThrow(
              'No embedding found in Voyage embeddings API response',
            );
          });

          it('should handle malformed API responses with missing data property', async () => {
            const provider = new VoyageEmbeddingProvider('voyage-3-large', {
              config: { apiKey: 'test-key' },
            });

            jest.mocked(fetchWithCache).mockResolvedValueOnce({
              data: {},
              cached: false,
              status: 200,
              statusText: 'OK',
            });

            await expect(provider.callEmbeddingApi('test input')).rejects.toThrow(
              'No embedding found in Voyage embeddings API response',
            );
          });

          it('should handle malformed API responses with empty data array', async () => {
            const provider = new VoyageEmbeddingProvider('voyage-3-large', {
              config: { apiKey: 'test-key' },
            });

            jest.mocked(fetchWithCache).mockResolvedValueOnce({
              data: { data: [] },
              cached: false,
              status: 200,
              statusText: 'OK',
            });

            await expect(provider.callEmbeddingApi('test input')).rejects.toThrow(
              'No embedding found in Voyage embeddings API response',
            );
          });
        });
      });
    });
  });
});
