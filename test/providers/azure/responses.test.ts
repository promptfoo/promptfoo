import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { AzureResponsesProvider } from '../../../src/providers/azure/responses';
import { maybeLoadResponseFormatFromExternalFile } from '../../../src/util/file';
import type { MockedFunction } from 'vitest';

// Mock external dependencies
vi.mock('../../../src/cache');
vi.mock('../../../src/util/file');

const mockFetchWithCache = fetchWithCache as MockedFunction<typeof fetchWithCache>;
const mockMaybeLoadResponseFormatFromExternalFile =
  maybeLoadResponseFormatFromExternalFile as MockedFunction<
    typeof maybeLoadResponseFormatFromExternalFile
  >;
let authHeadersValue: Record<string, string>;

describe('AzureResponsesProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Mock environment variables
    process.env.AZURE_API_KEY = 'test-key';
    process.env.AZURE_API_HOST = 'test.openai.azure.com';
    authHeadersValue = { 'api-key': 'test-key' };
  });

  afterEach(() => {
    delete process.env.AZURE_API_KEY;
    delete process.env.AZURE_API_HOST;
    delete (AzureResponsesProvider.prototype as any).authHeaders;
  });

  describe('constructor', () => {
    it('should create an instance with deployment name', () => {
      const provider = new AzureResponsesProvider('gpt-4.1-test');
      expect(provider).toBeInstanceOf(AzureResponsesProvider);
      expect(provider.deploymentName).toBe('gpt-4.1-test');
    });
  });

  describe('isReasoningModel', () => {
    it('should identify o1 models as reasoning models', () => {
      const provider = new AzureResponsesProvider('o1-preview');
      expect(provider.isReasoningModel()).toBe(true);
    });

    it('should identify o3 models as reasoning models', () => {
      const provider = new AzureResponsesProvider('o3-mini');
      expect(provider.isReasoningModel()).toBe(true);
    });

    it('should identify gpt-5 models as reasoning models', () => {
      const provider = new AzureResponsesProvider('gpt-5');
      expect(provider.isReasoningModel()).toBe(true);
    });

    it('should not identify gpt-4.1 as reasoning model', () => {
      const provider = new AzureResponsesProvider('gpt-4.1');
      expect(provider.isReasoningModel()).toBe(false);
    });

    it('should respect isReasoningModel config override for custom deployment names', () => {
      const provider = new AzureResponsesProvider('my-custom-deployment', {
        config: { isReasoningModel: true },
      });
      expect(provider.isReasoningModel()).toBe(true);
    });

    it('should respect o1 config override for custom deployment names', () => {
      const provider = new AzureResponsesProvider('my-custom-deployment', {
        config: { o1: true },
      });
      expect(provider.isReasoningModel()).toBe(true);
    });

    it('should not identify custom deployment as reasoning model without config override', () => {
      const provider = new AzureResponsesProvider('my-custom-deployment');
      expect(provider.isReasoningModel()).toBe(false);
    });
  });

  describe('supportsTemperature', () => {
    it('should support temperature for non-reasoning models', () => {
      const provider = new AzureResponsesProvider('gpt-4.1');
      expect(provider.supportsTemperature()).toBe(true);
    });

    it('should not support temperature for reasoning models', () => {
      const provider = new AzureResponsesProvider('o1-preview');
      expect(provider.supportsTemperature()).toBe(false);
    });
  });

  describe('getAzureResponsesBody', () => {
    it('should create correct request body for basic prompt', async () => {
      const provider = new AzureResponsesProvider('gpt-4.1-test');
      const body = await provider.getAzureResponsesBody('Hello world');

      expect(body).toMatchObject({
        model: 'gpt-4.1-test',
        input: 'Hello world',
        text: {
          format: {
            type: 'text',
          },
        },
      });
    });

    it('should handle external response_format file loading (fixed double-loading bug)', async () => {
      const mockSchema = {
        type: 'json_schema',
        json_schema: {
          name: 'test_schema',
          schema: { type: 'object', properties: { test: { type: 'string' } } },
        },
      };

      mockMaybeLoadResponseFormatFromExternalFile.mockReturnValue(mockSchema);

      const provider = new AzureResponsesProvider('gpt-4.1-test', {
        config: {
          response_format: 'file://test-schema.json' as any,
        },
      });

      const body = await provider.getAzureResponsesBody('Hello world');

      expect(mockMaybeLoadResponseFormatFromExternalFile).toHaveBeenCalledWith(
        'file://test-schema.json',
        undefined,
      );
      expect(mockMaybeLoadResponseFormatFromExternalFile).toHaveBeenCalledTimes(1); // Should only be called once (fix for double-loading)
      expect(body.text.format).toMatchObject({
        type: 'json_schema',
        name: 'test_schema',
        schema: mockSchema.json_schema.schema,
        strict: true,
      });
    });

    it('should handle inline response_format', async () => {
      // For inline schemas, maybeLoadResponseFormatFromExternalFile should return the object unchanged
      mockMaybeLoadResponseFormatFromExternalFile.mockImplementation(function (input: any) {
        return input;
      });

      const provider = new AzureResponsesProvider('gpt-4.1-test', {
        config: {
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'inline_schema',
              strict: true,
              schema: {
                type: 'object',
                properties: { result: { type: 'string' } },
                additionalProperties: false,
              },
            },
          },
        },
      });

      const body = await provider.getAzureResponsesBody('Hello world');

      expect(body.text.format).toMatchObject({
        type: 'json_schema',
        name: 'inline_schema',
        schema: {
          type: 'object',
          properties: { result: { type: 'string' } },
          additionalProperties: false,
        },
        strict: true,
      });
    });

    it('should not include temperature for reasoning models', async () => {
      const provider = new AzureResponsesProvider('o1-preview', {
        config: { temperature: 0.7 },
      });

      const body = await provider.getAzureResponsesBody('Hello world');

      expect(body).not.toHaveProperty('temperature');
    });

    it('should include temperature for non-reasoning models', async () => {
      const provider = new AzureResponsesProvider('gpt-4.1-test', {
        config: { temperature: 0.7 },
      });

      const body = await provider.getAzureResponsesBody('Hello world');

      expect(body.temperature).toBe(0.7);
    });

    it('should correctly send temperature: 0 in the request body', async () => {
      // Test that temperature: 0 is correctly sent (not filtered out by falsy check)
      const provider = new AzureResponsesProvider('gpt-4.1-test', {
        config: { temperature: 0 },
      });

      const body = await provider.getAzureResponsesBody('Hello world');

      // temperature: 0 should be present in the request body
      expect(body.temperature).toBe(0);
      expect('temperature' in body).toBe(true);
    });

    it('should correctly send max_output_tokens: 0 in the request body when explicitly set', async () => {
      // Test that max_output_tokens: 0 is correctly sent (not filtered out by falsy check)
      // Note: While max_output_tokens: 0 is impractical, it should still be sent if explicitly configured
      const provider = new AzureResponsesProvider('gpt-4.1-test', {
        config: { max_output_tokens: 0 } as any,
      });

      const body = await provider.getAzureResponsesBody('Hello world');

      // max_output_tokens: 0 should be present in the request body
      expect(body.max_output_tokens).toBe(0);
      expect('max_output_tokens' in body).toBe(true);
    });

    it('should include verbosity for reasoning models when configured', async () => {
      const provider = new AzureResponsesProvider('gpt-5', {
        config: { verbosity: 'high' },
      });

      const body = await provider.getAzureResponsesBody('Hello world');

      expect(body.text).toMatchObject({
        format: { type: 'text' },
        verbosity: 'high',
      });
    });

    it('should include verbosity for custom deployment with isReasoningModel override', async () => {
      const provider = new AzureResponsesProvider('my-custom-deployment', {
        config: { isReasoningModel: true, verbosity: 'medium' },
      });

      const body = await provider.getAzureResponsesBody('Hello world');

      expect(body.text).toMatchObject({
        format: { type: 'text' },
        verbosity: 'medium',
      });
    });

    it('should not include verbosity for non-reasoning models', async () => {
      const provider = new AzureResponsesProvider('gpt-4.1-test', {
        config: { verbosity: 'high' },
      });

      const body = await provider.getAzureResponsesBody('Hello world');

      expect(body.text).toMatchObject({
        format: { type: 'text' },
      });
      expect(body.text.verbosity).toBeUndefined();
    });
  });

  describe('callApi', () => {
    beforeEach(() => {
      // Mock the generic provider's method for getting auth headers and URL
      AzureResponsesProvider.prototype.ensureInitialized = vi.fn().mockResolvedValue(void 0);
      AzureResponsesProvider.prototype.getApiBaseUrl = vi
        .fn()
        .mockReturnValue('https://test.openai.azure.com');
      Object.defineProperty(AzureResponsesProvider.prototype, 'authHeaders', {
        get: vi.fn(() => authHeadersValue),
        set: vi.fn((value: Record<string, string>) => {
          authHeadersValue = value;
        }),
        configurable: true,
      });
    });

    it('should provide clear error for missing API host', async () => {
      const provider = new AzureResponsesProvider('gpt-4.1-test');
      vi.spyOn(provider, 'getApiBaseUrl').mockReturnValue('');

      await expect(provider.callApi('test')).rejects.toThrow(
        /Azure API configuration missing.*AZURE_API_HOST/,
      );
    });

    it('should provide clear error for missing authentication', async () => {
      const provider = new AzureResponsesProvider('gpt-4.1-test');

      // Mock initialization to set empty auth headers
      vi.spyOn(provider, 'ensureInitialized').mockImplementation(async function () {
        (provider as any).authHeaders = {}; // Set empty auth headers
      });

      await expect(provider.callApi('test')).rejects.toThrow(
        /Azure API authentication failed.*AZURE_API_KEY/,
      );
    });

    it('should accept Entra ID authentication with Authorization header', async () => {
      const mockResponse = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Hello from Entra ID auth!',
              },
            ],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 8,
        },
      };

      mockFetchWithCache.mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new AzureResponsesProvider('gpt-4.1-test');

      // Mock ensureInitialized to set authHeaders with Authorization (Entra ID)
      vi.spyOn(provider, 'ensureInitialized').mockImplementation(async function () {
        (provider as any).authHeaders = { Authorization: 'Bearer test-entra-token' };
      });

      const result = await provider.callApi('Hello');

      // Verify the call succeeded (no error about missing authentication)
      expect(result).toMatchObject({
        output: 'Hello from Entra ID auth!',
        cached: false,
      });

      // Verify the API was called (auth check passed)
      expect(mockFetchWithCache).toHaveBeenCalled();
    });

    it('should validate external response_format files', async () => {
      const provider = new AzureResponsesProvider('gpt-4.1-test', {
        config: { response_format: 'file://missing.json' as any },
      });

      mockMaybeLoadResponseFormatFromExternalFile.mockImplementation(function () {
        throw new Error('File does not exist');
      });

      await expect(provider.callApi('test')).rejects.toThrow(
        /Failed to load response_format file.*missing\.json/,
      );
    });

    it('should make successful API call', async () => {
      const mockResponse = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Hello! How can I help you?',
              },
            ],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 8,
        },
      };

      mockFetchWithCache.mockResolvedValue({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new AzureResponsesProvider('gpt-4.1-test');
      const result = await provider.callApi('Hello');

      expect(result).toMatchObject({
        output: 'Hello! How can I help you?',
        cached: false,
      });

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        'https://test.openai.azure.com/openai/v1/responses?api-version=preview',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'api-key': 'test-key',
          }),
          body: expect.stringContaining('gpt-4.1-test'),
        }),
        expect.any(Number),
        'json',
        undefined,
      );
    });

    it('should handle API errors', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: { error: { message: 'Invalid API key' } },
        cached: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const provider = new AzureResponsesProvider('gpt-4.1-test');
      const result = await provider.callApi('Hello');

      expect(result.error).toContain('API error: 401');
    });

    it('should handle deep research model timeout', async () => {
      const provider = new AzureResponsesProvider('o3-deep-research-test');

      mockFetchWithCache.mockResolvedValue({
        data: {
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Research complete' }],
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await provider.callApi('Research question');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        600000, // 10 minutes timeout for deep research
        'json',
        undefined,
      );
    });

    it('should construct correct Azure URL format', async () => {
      const provider = new AzureResponsesProvider('gpt-4.1-test');

      mockFetchWithCache.mockResolvedValue({
        data: {
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'response' }],
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await provider.callApi('Hello');

      // Verify the URL does NOT include deployment name (Azure Responses API pattern)
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        'https://test.openai.azure.com/openai/v1/responses?api-version=preview',
        expect.any(Object),
        expect.any(Number),
        'json',
        undefined,
      );
    });
  });
});
