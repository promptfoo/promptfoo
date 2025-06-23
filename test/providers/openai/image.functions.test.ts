import { fetchWithCache } from '../../../src/cache';
import {
  validateSizeForModel,
  formatOutput,
  prepareRequestBody,
  calculateImageCost,
  callOpenAiImageApi,
  processApiResponse,
  DALLE2_COSTS,
  DALLE3_COSTS,
} from '../../../src/providers/openai/image';

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('OpenAI Image Provider Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateSizeForModel', () => {
    it('should validate valid DALL-E 3 sizes', () => {
      expect(validateSizeForModel('1024x1024', 'dall-e-3')).toEqual({ valid: true });
      expect(validateSizeForModel('1792x1024', 'dall-e-3')).toEqual({ valid: true });
      expect(validateSizeForModel('1024x1792', 'dall-e-3')).toEqual({ valid: true });
    });

    it('should invalidate incorrect DALL-E 3 sizes', () => {
      const result = validateSizeForModel('512x512', 'dall-e-3');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid size "512x512" for DALL-E 3');
    });

    it('should validate valid DALL-E 2 sizes', () => {
      expect(validateSizeForModel('256x256', 'dall-e-2')).toEqual({ valid: true });
      expect(validateSizeForModel('512x512', 'dall-e-2')).toEqual({ valid: true });
      expect(validateSizeForModel('1024x1024', 'dall-e-2')).toEqual({ valid: true });
    });

    it('should invalidate incorrect DALL-E 2 sizes', () => {
      const result = validateSizeForModel('1792x1024', 'dall-e-2');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid size "1792x1024" for DALL-E 2');
    });

    it('should validate valid GPT Image 1 sizes', () => {
      expect(validateSizeForModel('1024x1024', 'gpt-image-1')).toEqual({ valid: true });
      expect(validateSizeForModel('1024x1536', 'gpt-image-1')).toEqual({ valid: true });
      expect(validateSizeForModel('1536x1024', 'gpt-image-1')).toEqual({ valid: true });
      expect(validateSizeForModel('auto', 'gpt-image-1')).toEqual({ valid: true });
    });

    it('should invalidate incorrect GPT Image 1 sizes', () => {
      const result = validateSizeForModel('512x512', 'gpt-image-1');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid size "512x512" for GPT Image 1');
    });

    it('should validate any size for unknown models', () => {
      expect(validateSizeForModel('any-size', 'unknown-model')).toEqual({ valid: true });
    });
  });

  describe('formatOutput', () => {
    it('should format URL output correctly', () => {
      const data = {
        data: [{ url: 'https://example.com/image.png' }],
      };
      const prompt = 'A test prompt';
      const result = formatOutput(data, prompt, 'url');
      expect(typeof result).toBe('string');
      expect(result).toContain('![');
      expect(result).toContain('](https://example.com/image.png)');
    });

    it('should sanitize prompt text with special characters', () => {
      const data = {
        data: [{ url: 'https://example.com/image.png' }],
      };
      const prompt = 'A test [with] brackets\nand newlines';
      const result = formatOutput(data, prompt, 'url');
      expect(typeof result).toBe('string');
      expect(result).toContain('A test (with) brackets and newlines');
    });

    it('should format base64 output correctly', () => {
      const mockData = {
        data: [{ b64_json: 'base64encodeddata' }],
      };
      const result = formatOutput(mockData, 'prompt', 'b64_json');
      expect(typeof result).toBe('string');
      expect(result).toBe(JSON.stringify(mockData));
    });

    it('should return error when URL is missing', () => {
      const data = { data: [{}] };
      const result = formatOutput(data, 'prompt');
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('error');
    });

    it('should return error when base64 data is missing', () => {
      const data = { data: [{}] };
      const result = formatOutput(data, 'prompt', 'b64_json');
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('error');
    });

    it('should format GPT Image 1 output as markdown image', () => {
      const mockData = {
        data: [
          {
            b64_json:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          },
        ],
      };
      const result = formatOutput(mockData, 'test prompt', 'b64_json', 'gpt-image-1');
      expect(typeof result).toBe('string');
      expect(result).toBe(
        '![test prompt](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)',
      );
    });

    it('should detect JPEG format for GPT Image 1', () => {
      const mockData = {
        data: [{ b64_json: '/9j/4AAQSkZJRgABAQEASABIAAD' }],
      };
      const result = formatOutput(mockData, 'jpeg test', 'b64_json', 'gpt-image-1');
      expect(typeof result).toBe('string');
      expect(result).toBe('![jpeg test](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD)');
    });
  });

  describe('prepareRequestBody', () => {
    it('should prepare basic request body correctly', () => {
      const model = 'dall-e-2';
      const prompt = 'A test prompt';
      const size = '512x512';
      const responseFormat = 'url';
      const config = {};

      const body = prepareRequestBody(model, prompt, size, responseFormat, config);

      expect(body).toEqual({
        model,
        prompt,
        size,
        n: 1,
        response_format: responseFormat,
      });
    });

    it('should include n parameter from config', () => {
      const config = { n: 2 };
      const body = prepareRequestBody('dall-e-2', 'prompt', '512x512', 'url', config);
      expect(body.n).toBe(2);
    });

    it('should include DALL-E 3 specific parameters', () => {
      const config = {
        quality: 'hd',
        style: 'vivid',
      };
      const body = prepareRequestBody('dall-e-3', 'prompt', '1024x1024', 'url', config);

      expect(body).toEqual({
        model: 'dall-e-3',
        prompt: 'prompt',
        size: '1024x1024',
        n: 1,
        response_format: 'url',
        quality: 'hd',
        style: 'vivid',
      });
    });

    it('should not include DALL-E 3 parameters for DALL-E 2', () => {
      const config = {
        quality: 'hd',
        style: 'vivid',
      };
      const body = prepareRequestBody('dall-e-2', 'prompt', '512x512', 'url', config);

      expect(body).not.toHaveProperty('quality');
      expect(body).not.toHaveProperty('style');
    });

    it('should include GPT Image 1 specific parameters', () => {
      const config = {
        quality: 'high',
        output_format: 'jpeg',
        output_compression: 85,
        background: 'transparent',
        moderation: 'low',
        size: '1024x1536',
      };
      const body = prepareRequestBody('gpt-image-1', 'prompt', '1024x1024', 'url', config);

      expect(body).toEqual({
        model: 'gpt-image-1',
        prompt: 'prompt',
        n: 1,
        size: '1024x1536', // Should use config.size
        quality: 'high',
        output_format: 'jpeg',
        output_compression: 85,
        background: 'transparent',
        moderation: 'low',
      });
      // response_format should not be included for GPT Image 1
      expect(body).not.toHaveProperty('response_format');
    });

    it('should not include response_format for GPT Image 1', () => {
      const config = {};
      const body = prepareRequestBody('gpt-image-1', 'prompt', 'auto', 'b64_json', config);

      expect(body.model).toBe('gpt-image-1');
      expect(body.prompt).toBe('prompt');
      expect(body.n).toBe(1);
      expect(body).not.toHaveProperty('response_format');
      expect(body).not.toHaveProperty('size'); // auto size should not be included
    });
  });

  describe('calculateImageCost', () => {
    it('should calculate correct cost for DALL-E 2', () => {
      expect(calculateImageCost('dall-e-2', '256x256')).toBe(DALLE2_COSTS['256x256']);
      expect(calculateImageCost('dall-e-2', '512x512')).toBe(DALLE2_COSTS['512x512']);
      expect(calculateImageCost('dall-e-2', '1024x1024')).toBe(DALLE2_COSTS['1024x1024']);
    });

    it('should use default size cost if size is invalid for DALL-E 2', () => {
      expect(calculateImageCost('dall-e-2', 'invalid-size')).toBe(DALLE2_COSTS['1024x1024']);
    });

    it('should calculate correct cost for standard DALL-E 3', () => {
      expect(calculateImageCost('dall-e-3', '1024x1024', 'standard')).toBe(
        DALLE3_COSTS['standard_1024x1024'],
      );
      expect(calculateImageCost('dall-e-3', '1024x1792', 'standard')).toBe(
        DALLE3_COSTS['standard_1024x1792'],
      );
    });

    it('should calculate correct cost for HD DALL-E 3', () => {
      expect(calculateImageCost('dall-e-3', '1024x1024', 'hd')).toBe(DALLE3_COSTS['hd_1024x1024']);
      expect(calculateImageCost('dall-e-3', '1024x1792', 'hd')).toBe(DALLE3_COSTS['hd_1024x1792']);
    });

    it('should use standard quality if quality is not specified for DALL-E 3', () => {
      expect(calculateImageCost('dall-e-3', '1024x1024')).toBe(DALLE3_COSTS['standard_1024x1024']);
    });

    it('should use default cost if model is unknown', () => {
      expect(calculateImageCost('unknown-model', '1024x1024')).toBe(0.04);
    });

    it('should multiply cost by number of images', () => {
      expect(calculateImageCost('dall-e-2', '256x256', undefined, 3)).toBe(
        DALLE2_COSTS['256x256'] * 3,
      );
      expect(calculateImageCost('dall-e-3', '1024x1024', 'standard', 2)).toBe(
        DALLE3_COSTS['standard_1024x1024'] * 2,
      );
    });

    it('should use default cost for models other than DALL-E 2 or 3', () => {
      expect(calculateImageCost('gpt-4', '1024x1024')).toBe(0.04);
      expect(calculateImageCost('', '1024x1024')).toBe(0.04);
    });

    it('should calculate DALL-E 2 costs correctly', () => {
      expect(calculateImageCost('dall-e-2', '256x256', undefined, 1)).toBe(0.016);
      expect(calculateImageCost('dall-e-2', '512x512', undefined, 1)).toBe(0.018);
      expect(calculateImageCost('dall-e-2', '1024x1024', undefined, 1)).toBe(0.02);
      expect(calculateImageCost('dall-e-2', '1024x1024', undefined, 3)).toBe(0.06);
    });

    it('should calculate DALL-E 3 costs correctly', () => {
      expect(calculateImageCost('dall-e-3', '1024x1024', 'standard', 1)).toBe(0.04);
      expect(calculateImageCost('dall-e-3', '1024x1024', 'hd', 1)).toBe(0.08);
      expect(calculateImageCost('dall-e-3', '1024x1792', 'standard', 1)).toBe(0.08);
      expect(calculateImageCost('dall-e-3', '1024x1792', 'hd', 1)).toBe(0.12);
      expect(calculateImageCost('dall-e-3', '1792x1024', 'hd', 2)).toBe(0.24);
    });

    it('should calculate GPT Image 1 costs correctly', () => {
      // Low quality costs
      expect(calculateImageCost('gpt-image-1', '1024x1024', 'low', 1)).toBeCloseTo(
        (272 * 40.0) / 1e6,
        6,
      );
      expect(calculateImageCost('gpt-image-1', '1024x1536', 'low', 1)).toBeCloseTo(
        (408 * 40.0) / 1e6,
        6,
      );
      expect(calculateImageCost('gpt-image-1', '1536x1024', 'low', 1)).toBeCloseTo(
        (400 * 40.0) / 1e6,
        6,
      );

      // Medium quality costs
      expect(calculateImageCost('gpt-image-1', '1024x1024', 'medium', 1)).toBeCloseTo(
        (1056 * 40.0) / 1e6,
        6,
      );
      expect(calculateImageCost('gpt-image-1', '1024x1536', 'medium', 1)).toBeCloseTo(
        (1584 * 40.0) / 1e6,
        6,
      );
      expect(calculateImageCost('gpt-image-1', '1536x1024', 'medium', 1)).toBeCloseTo(
        (1568 * 40.0) / 1e6,
        6,
      );

      // High quality costs
      expect(calculateImageCost('gpt-image-1', '1024x1024', 'high', 1)).toBeCloseTo(
        (4160 * 40.0) / 1e6,
        6,
      );
      expect(calculateImageCost('gpt-image-1', '1024x1536', 'high', 1)).toBeCloseTo(
        (6240 * 40.0) / 1e6,
        6,
      );
      expect(calculateImageCost('gpt-image-1', '1536x1024', 'high', 1)).toBeCloseTo(
        (6208 * 40.0) / 1e6,
        6,
      );

      // Multiple images
      expect(calculateImageCost('gpt-image-1', '1024x1024', 'medium', 3)).toBeCloseTo(
        ((1056 * 40.0) / 1e6) * 3,
        6,
      );

      // Auto quality should use medium 1024x1024 as default
      expect(calculateImageCost('gpt-image-1', '1024x1024', 'auto', 1)).toBeCloseTo(
        (1056 * 40.0) / 1e6,
        6,
      );
      expect(calculateImageCost('gpt-image-1', 'auto', 'auto', 1)).toBeCloseTo(
        (1056 * 40.0) / 1e6,
        6,
      );
    });

    it('should handle unknown models with default cost', () => {
      expect(calculateImageCost('unknown-model', '1024x1024', undefined, 1)).toBe(0.04);
    });
  });

  describe('callOpenAiImageApi', () => {
    it('should call fetchWithCache with correct parameters', async () => {
      const mockResponse = {
        data: { some: 'data' },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const url = 'https://api.openai.com/v1/images/generations';
      const body = { model: 'dall-e-3', prompt: 'test' };
      const headers = { 'Content-Type': 'application/json' };
      const timeout = 30000;

      const result = await callOpenAiImageApi(url, body, headers, timeout);

      expect(fetchWithCache).toHaveBeenCalledWith(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
        timeout,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('processApiResponse', () => {
    it('should handle error in data', async () => {
      const mockDeleteFromCache = jest.fn();
      const data = {
        error: { message: 'Some API error' },
        deleteFromCache: mockDeleteFromCache,
      };

      const result = await processApiResponse(data, 'prompt', 'url', false, 'dall-e-2', '512x512');

      expect(mockDeleteFromCache).toHaveBeenCalledWith();
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Some API error');
    });

    it('should return formatted output for successful response', async () => {
      const data = {
        data: [{ url: 'https://example.com/image.png' }],
      };

      const result = await processApiResponse(
        data,
        'test prompt',
        'url',
        false,
        'dall-e-2',
        '512x512',
      );

      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('cost');
      expect(result.cost).toBe(DALLE2_COSTS['512x512']);
    });

    it('should include base64 flags for b64_json response format', async () => {
      const data = {
        data: [{ b64_json: 'base64data' }],
      };

      const result = await processApiResponse(
        data,
        'test prompt',
        'b64_json',
        false,
        'dall-e-3',
        '1024x1024',
        'standard',
      );

      expect(result).toHaveProperty('isBase64', true);
      expect(result).toHaveProperty('format', 'json');
    });

    it('should set cost to 0 for cached responses', async () => {
      const data = {
        data: [{ url: 'https://example.com/image.png' }],
      };

      const result = await processApiResponse(
        data,
        'test prompt',
        'url',
        true,
        'dall-e-2',
        '512x512',
      );

      expect(result.cost).toBe(0);
    });

    it('should handle errors during output formatting', async () => {
      const mockDeleteFromCache = jest.fn();
      const data = {
        data: undefined,
        deleteFromCache: mockDeleteFromCache,
      };

      const result = await processApiResponse(
        data,
        'test prompt',
        'url',
        false,
        'dall-e-2',
        '512x512',
      );

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API error: TypeError');
      expect(result.error).toContain('Cannot read properties of undefined');
      expect(mockDeleteFromCache).toHaveBeenCalledWith();
    });

    it('should handle a specific error case with malformed response', async () => {
      const mockDeleteFromCache = jest.fn();
      const data = {
        data: { data: 'not-an-array' },
        deleteFromCache: mockDeleteFromCache,
      };

      const result = await processApiResponse(
        data,
        'test prompt',
        'url',
        false,
        'dall-e-2',
        '512x512',
      );

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API error:');
      expect(mockDeleteFromCache).toHaveBeenCalledWith();
    });
  });
});
