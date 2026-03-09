import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isBlobStorageEnabled } from '../../../src/blobs/extractor';
import { storeBlob } from '../../../src/blobs/index';
import { fetchWithCache } from '../../../src/cache';
import {
  buildSafeStructuredImageOutputs,
  buildStructuredImageOutputs,
  calculateImageCost,
  callOpenAiImageApi,
  DALLE2_COSTS,
  DALLE3_COSTS,
  formatOutput,
  formatStructuredImageOutput,
  prepareRequestBody,
  processApiResponse,
  validateSizeForModel,
} from '../../../src/providers/openai/image';
import { fetchWithProxy } from '../../../src/util/fetch/index';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});
vi.mock('../../../src/blobs/extractor', () => ({
  isBlobStorageEnabled: vi.fn(),
}));
vi.mock('../../../src/blobs/index', () => ({
  storeBlob: vi.fn(),
}));
vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

describe('OpenAI Image Provider Functions', () => {
  const blobUri = (index: number) => `promptfoo://blob/${index.toString(16).padStart(32, '0')}`;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isBlobStorageEnabled).mockReturnValue(true);
    vi.mocked(fetchWithProxy).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => new ArrayBuffer(1024),
    } as Response);
    let blobIndex = 0;
    vi.mocked(storeBlob).mockImplementation(async (_buffer, mimeType) => {
      blobIndex += 1;
      return {
        ref: {
          uri: blobUri(blobIndex),
          hash: blobIndex.toString(16).padStart(32, '0'),
          mimeType,
          sizeBytes: 1024,
          provider: 'filesystem',
        },
        deduplicated: false,
      };
    });
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
      expect(result).toBe('data:image/png;base64,base64encodeddata');
    });

    it('should honor output format when formatting base64 output', () => {
      const mockData = {
        data: [{ b64_json: 'base64encodeddata' }],
      };
      const result = formatOutput(mockData, 'prompt', 'b64_json', 'jpeg');
      expect(typeof result).toBe('string');
      expect(result).toBe('data:image/jpeg;base64,base64encodeddata');
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
  });

  describe('callOpenAiImageApi', () => {
    it('should call fetchWithCache with correct parameters', async () => {
      const mockResponse = {
        data: { some: 'data' },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

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
      const mockDeleteFromCache = vi.fn();
      const data = {
        error: { message: 'Some API error' },
        deleteFromCache: mockDeleteFromCache,
      };

      const result = await processApiResponse(
        data,
        'prompt',
        'url',
        false,
        'dall-e-2',
        '512x512',
        undefined,
      );

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
        undefined,
      );

      expect(result).toMatchObject({
        output: `![test prompt](${blobUri(1)})`,
        images: [{ blobRef: expect.objectContaining({ uri: blobUri(1) }), mimeType: 'image/png' }],
        cost: DALLE2_COSTS['512x512'],
      });
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
        undefined,
        'standard',
      );

      expect(result).toHaveProperty('isBase64', true);
      expect(result).toHaveProperty('format', 'json');
    });

    it('should use output_format when building structured base64 images', async () => {
      const data = {
        data: [{ b64_json: 'base64data' }],
      };

      const result = await processApiResponse(
        data,
        'test prompt',
        'b64_json',
        false,
        'gpt-image-1',
        '1024x1024',
        undefined,
        'low',
        1,
        'webp',
      );

      expect(result).toMatchObject({
        output: 'data:image/webp;base64,base64data',
        images: [{ data: 'data:image/webp;base64,base64data', mimeType: 'image/webp' }],
      });
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
        undefined,
      );

      expect(result.cost).toBe(0);
    });

    it('should handle errors during output formatting', async () => {
      const mockDeleteFromCache = vi.fn();
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
        undefined,
      );

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('No image URL found in response');
      expect(mockDeleteFromCache).toHaveBeenCalledWith();
    });

    it('should handle a specific error case with malformed response', async () => {
      const mockDeleteFromCache = vi.fn();
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
        undefined,
      );

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('No image URL found in response');
      expect(mockDeleteFromCache).toHaveBeenCalledWith();
    });
  });

  describe('buildStructuredImageOutputs', () => {
    it('should omit external URLs from structured outputs', () => {
      expect(
        buildStructuredImageOutputs({
          data: [{ url: 'https://example.com/image.jpg?size=large' }],
        }),
      ).toEqual([]);
    });

    it('should omit external URLs with unknown extensions from structured outputs', () => {
      expect(
        buildStructuredImageOutputs({
          data: [{ url: 'https://example.com/generated-image' }],
        }),
      ).toEqual([]);
    });
  });

  describe('buildSafeStructuredImageOutputs', () => {
    it('should internalize external URLs into blob refs', async () => {
      const result = await buildSafeStructuredImageOutputs({
        data: [{ url: 'https://example.com/image.jpg?size=large' }],
      });

      expect(result).toMatchObject([
        { blobRef: expect.objectContaining({ uri: blobUri(1) }), mimeType: 'image/png' },
      ]);
    });

    it('should skip external URLs when blob storage is disabled', async () => {
      vi.mocked(isBlobStorageEnabled).mockReturnValue(false);

      const result = await buildSafeStructuredImageOutputs({
        data: [{ url: 'https://example.com/image.jpg?size=large' }],
      });

      expect(result).toBeUndefined();
    });
  });

  describe('formatStructuredImageOutput', () => {
    it('should format a markdown image from a safe primary image source', () => {
      const result = formatStructuredImageOutput(
        { data: [{ url: 'https://example.com/image.png' }] },
        'prompt',
        'url',
        undefined,
        [{ blobRef: { uri: blobUri(1) } as any, mimeType: 'image/png' }],
      );

      expect(result).toBe(`![prompt](${blobUri(1)})`);
    });

    it('should fall back to plain text when no safe image source is available', () => {
      const result = formatStructuredImageOutput(
        { data: [{ url: 'https://example.com/image.png' }] },
        'prompt',
        'url',
      );

      expect(result).toBe('https://example.com/image.png');
    });
  });
});
