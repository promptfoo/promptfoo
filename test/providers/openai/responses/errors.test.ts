import { createApiKeyOptions } from '../../../factories/literalFixtures';
import { createMockFetchResponse } from '../../mockProviderResponses';
// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import logger from '../../../../src/logger';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';
import { getOpenAiMissingApiKeyMessage } from '../shared';

describe('OpenAiResponsesProvider error handling', () => {
  it.each([
    { event: 'response.in_progress', status: 'in_progress', usage: true },
    { event: 'response.completed', status: 'in_progress', usage: true },
    { event: 'response.in_progress', status: 'in_progress', usage: false },
    { event: 'response.completed', status: 'completed', usage: true },
  ])('retains foreground HTTP metadata for $event/$status (usage: $usage)', async (testCase) => {
    class StrictStreamProvider extends OpenAiResponsesProvider {
      protected requiresResponsesStreamTerminalEvent() {
        return true;
      }
    }
    const response = {
      id: 'resp_stream',
      status: testCase.status,
      output: [
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'READY' }] },
      ],
      ...(testCase.usage
        ? { usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } }
        : {}),
    };
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      ...createMockFetchResponse(
        `data: ${JSON.stringify({ type: testCase.event, response })}\n\n`,
        { status: 201, statusText: 'Created' },
      ),
      headers: { 'x-fixture-response': 'stream' },
    });
    const provider = new StrictStreamProvider('gpt-4.1', {
      config: { apiKey: 'test-key', stream: true, inputCost: 0.01, outputCost: 0.02 },
    });

    const result = await provider.callApi('Test prompt');

    expect(result.metadata?.http).toEqual({
      status: 201,
      statusText: 'Created',
      headers: { 'x-fixture-response': 'stream' },
    });
    if (testCase.status === 'completed') {
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('READY');
    } else {
      expect(result.error).toContain('before a terminal response event');
      expect(result.output).toBeUndefined();
    }
    if (testCase.usage) {
      expect(result.tokenUsage).toMatchObject({ prompt: 100, completion: 20, total: 120 });
      expect(result.cost).toBeCloseTo(1.4);
    } else {
      expect(result.tokenUsage).toBeUndefined();
      expect(result.cost).toBeUndefined();
    }
  });

  it('keeps foreground transport-error defaults before a response arrives', async () => {
    vi.mocked(cache.fetchWithCache).mockRejectedValue(new Error('Transport fixture failed'));
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', stream: true },
    });

    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Transport fixture failed');
    expect(result.metadata?.http).toEqual({ status: 0, statusText: 'Error', headers: {} });
    expect(result.tokenUsage).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it('does not reuse a creation status after a background poll transport failure', async () => {
    vi.mocked(cache.fetchWithCache)
      .mockResolvedValueOnce(
        createMockFetchResponse(
          { id: 'resp_poll_http_metadata', status: 'queued', output: [] },
          { status: 201, statusText: 'Created' },
        ),
      )
      .mockRejectedValueOnce(new Error('Poll fixture failed'));
    const provider = new OpenAiResponsesProvider('gpt-4.1', {
      config: { apiKey: 'test-key', background: true, maxRetries: 0 },
    });

    const result = await provider.callApi('Test prompt', { bustCache: true } as any);

    expect(result.error).toContain('Poll fixture failed');
    expect(result.metadata?.http).toMatchObject({ status: 0, statusText: 'Error' });
    expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
    expect(result.tokenUsage).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it.each([
    { name: 'reported usage', tokens: 100, priced: true, cost: 1.4 },
    { name: 'zero usage', tokens: 0, priced: true, cost: 0 },
    { name: 'unknown model price', tokens: 100, priced: false, cost: undefined },
    { name: 'missing usage', tokens: undefined, priced: true, cost: undefined },
  ])('preserves terminal failure accounting for $name', async ({ tokens, priced, cost }) => {
    const callback = vi.fn().mockResolvedValue('Unexpected callback');
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    const usage =
      tokens === undefined
        ? undefined
        : {
            input_tokens: tokens,
            output_tokens: tokens / 5,
            total_tokens: tokens * 1.2,
            input_tokens_details: { cached_tokens: tokens * 0.4 },
          };
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      ...createMockFetchResponse({
        id: 'resp_failed',
        status: 'failed',
        error: { code: 'server_error', message: 'Generation failed' },
        output: [
          {
            type: 'function_call',
            name: 'lookup',
            arguments: '{"value":"partial"}',
            status: 'completed',
          },
        ],
        ...(usage ? { usage } : {}),
      }),
      headers: { 'x-fixture-response': 'failed' },
      deleteFromCache,
    });
    const provider = new OpenAiResponsesProvider(
      priced ? 'gpt-4.1' : 'uncatalogued-fixture-model',
      {
        config: {
          apiKey: 'test-key',
          ...(priced ? { inputCost: 0.01, outputCost: 0.02 } : {}),
          functionToolCallbacks: { lookup: callback },
        },
      },
    );

    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('Generation failed');
    expect(result.output).toBeUndefined();
    expect(callback).not.toHaveBeenCalled();
    expect(deleteFromCache).toHaveBeenCalledOnce();
    expect(result.metadata?.http).toEqual({
      status: 200,
      statusText: 'OK',
      headers: { 'x-fixture-response': 'failed' },
    });
    if (usage) {
      expect(result.tokenUsage).toMatchObject({
        prompt: usage.input_tokens,
        completion: usage.output_tokens,
        total: usage.total_tokens,
      });
      expect(result.cached).toBe(false);
    } else {
      expect(result.tokenUsage).toBeUndefined();
    }
    if (cost === undefined) {
      expect(result.cost).toBeUndefined();
    } else {
      expect(result.cost).toBeCloseTo(cost);
    }
  });

  it('should handle JSON schema validation errors correctly', async () => {
    const mockApiResponse = {
      error: {
        message: 'The response format is invalid. Cannot parse as JSON schema.',
        type: 'invalid_response_format',
        code: 'json_schema_validation_error',
        param: 'response_format',
      },
      status: 400,
      statusText: 'Bad Request',
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue(
      createMockFetchResponse(mockApiResponse, { status: 400, statusText: 'Bad Request' }),
    );

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'InvalidSchema',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                result: { type: 'string' },
              },
              // The API will complain about something even though the schema is valid
              required: ['missing_field'],
              additionalProperties: false,
            },
          },
        },
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Assert error is present
    expect(result.error).toContain('json_schema_validation_error');
  });

  it('should handle API errors correctly', async () => {
    // Setup mock for fetchWithCache to return an error
    vi.mocked(cache.fetchWithCache).mockResolvedValue(
      createMockFetchResponse(
        {
          error: {
            message: 'Invalid request',
            type: 'invalid_request_error',
            code: 'invalid_api_key',
          },
        },
        { status: 400, statusText: 'Bad Request' },
      ),
    );

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'invalid-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Assertions
    expect(result.error).toContain('API error');
    expect(result.output).toBeUndefined();
  });

  it('should throw error when API key is not set', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {},
    });

    vi.spyOn(provider, 'getApiKey').mockReturnValue(undefined);

    await expect(provider.callApi('Test prompt')).rejects.toThrow(getOpenAiMissingApiKeyMessage());
  });

  it('should use custom apiKeyEnvar in missing API key errors', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKeyEnvar: 'CUSTOM_RESPONSES_API_KEY',
      },
    });

    vi.spyOn(provider, 'getApiKey').mockReturnValue(undefined);

    await expect(provider.callApi('Test prompt')).rejects.toThrow(
      getOpenAiMissingApiKeyMessage('CUSTOM_RESPONSES_API_KEY'),
    );
  });

  it('should handle error in API response data correctly', async () => {
    const mockApiResponse = {
      error: {
        message: 'Content policy violation',
        type: 'content_policy_violation',
        code: 'content_filter',
      },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue(
      createMockFetchResponse(mockApiResponse, { status: 400, statusText: 'Bad Request' }),
    );

    const provider = new OpenAiResponsesProvider('gpt-4o', createApiKeyOptions());

    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('content_policy_violation');
  });

  it('should handle missing output array correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      // No output array
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    // Setup mock for fetchWithCache
    vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(mockApiResponse));

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', createApiKeyOptions());

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Verify error about missing output array
    expect(result.error).toContain('Invalid response format: Missing output array');
  });

  it('should handle successful JSON response payloads correctly', async () => {
    // Mock API response
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Test response',
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', createApiKeyOptions());

    vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(mockApiResponse));

    // Ensure we get output without error
    const result = await provider.callApi('Test prompt');

    // Verify the API was called successfully
    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses'),
      expect.anything(),
      expect.anything(),
      'json',
      undefined,
      undefined,
    );
    expect(result.output).toBe('Test response');
    expect(result.error).toBeUndefined();
  });

  it('should handle null content in message output', async () => {
    // Mock API response with content that will cause error during processing
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: null, // Will cause TypeError when trying to iterate
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    // Setup mock for fetchWithCache
    vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(mockApiResponse));

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', createApiKeyOptions());

    // Call the API - since there's no content, it should return an empty string
    const result = await provider.callApi('Test prompt');

    // Verify we get a result with empty output
    expect(result.output).toBe('');
    expect(result.raw).toEqual(mockApiResponse);

    // Error is not set since this is treated as an empty response, not an error
    expect(result.error).toBeUndefined();
  });

  it('should handle error processing results with non-array output', async () => {
    // Setup mock for fetchWithCache to return data that will trigger a processing error
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: 'not-an-array', // This will cause an error when trying to process as an array
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(mockApiResponse));

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', createApiKeyOptions());

    // Call the API
    const result = await provider.callApi('Test prompt');

    // This should have returned an invalid format error
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Invalid response format');
    expect(result.output).toBeUndefined();

    // The implementation doesn't include raw data when format is invalid
    // So we shouldn't test for it
  });

  // Test for lines 169-174: Testing when fetch throws an error (not just returns error status)

  it('should handle network errors correctly', async () => {
    // Setup mock to throw an error
    vi.mocked(cache.fetchWithCache).mockRejectedValue(new Error('Network error'));

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', createApiKeyOptions());

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Verify error is handled correctly
    expect(result.error).toContain('API call error:');
    expect(result.error).toContain('Network error');

    // Expect logger to be called with the error
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
  });
});
