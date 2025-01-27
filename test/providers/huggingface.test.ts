import { clearCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import {
  HuggingfaceTextGenerationProvider,
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceTextClassificationProvider,
} from '../../src/providers/huggingface';

const mockFetch = jest.mocked(jest.fn());
global.fetch = mockFetch;

const defaultMockResponse = {
  status: 200,
  statusText: 'OK',
  headers: {
    get: jest.fn().mockReturnValue(null),
    entries: jest.fn().mockReturnValue([]),
  },
};

describe('Huggingface Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with huggingface:text-generation', async () => {
      const provider = await loadApiProvider('huggingface:text-generation:foobar/baz');
      expect(provider).toBeInstanceOf(HuggingfaceTextGenerationProvider);
    });

    it('loadApiProvider with huggingface:feature-extraction', async () => {
      const provider = await loadApiProvider('huggingface:feature-extraction:foobar/baz');
      expect(provider).toBeInstanceOf(HuggingfaceFeatureExtractionProvider);
    });

    it('loadApiProvider with huggingface:text-classification', async () => {
      const provider = await loadApiProvider('huggingface:text-classification:foobar/baz');
      expect(provider).toBeInstanceOf(HuggingfaceTextClassificationProvider);
    });

    it('loadApiProvider with hf:text-classification', async () => {
      const provider = await loadApiProvider('hf:text-classification:foobar/baz');
      expect(provider).toBeInstanceOf(HuggingfaceTextClassificationProvider);
    });
  });

  describe('API Calls', () => {
    describe.each([
      ['Array format', [{ generated_text: 'Test output' }]], // Array format
      ['Object format', { generated_text: 'Test output' }], // Object format
    ])('HuggingfaceTextGenerationProvider callApi with %s', (format, mockedData) => {
      it('returns expected output', async () => {
        const mockResponse = {
          ...defaultMockResponse,
          text: jest.fn().mockResolvedValue(JSON.stringify(mockedData)),
        };
        mockFetch.mockResolvedValue(mockResponse);

        const provider = new HuggingfaceTextGenerationProvider('gpt2');
        const result = await provider.callApi('Test prompt');

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(result.output).toBe('Test output');
      });
    });

    it('HuggingfaceFeatureExtractionProvider callEmbeddingApi', async () => {
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5])),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new HuggingfaceFeatureExtractionProvider('distilbert-base-uncased');
      const result = await provider.callEmbeddingApi('Test text');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('HuggingfaceTextClassificationProvider callClassificationApi', async () => {
      const mockClassification = [
        [
          {
            label: 'nothate',
            score: 0.9,
          },
          {
            label: 'hate',
            score: 0.1,
          },
        ],
      ];
      const mockResponse = {
        ...defaultMockResponse,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockClassification)),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const provider = new HuggingfaceTextClassificationProvider('foo');
      const result = await provider.callClassificationApi('Test text');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.classification).toEqual({
        nothate: 0.9,
        hate: 0.1,
      });
    });
  });
});
