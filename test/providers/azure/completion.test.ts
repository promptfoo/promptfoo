import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { AzureCompletionProvider } from '../../../src/providers/azure/completion';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

const setAuthHeaders = (
  provider: AzureCompletionProvider,
  headers: Record<string, string> = { 'api-key': 'test-key' },
) => {
  (provider as any).authHeaders = headers;
  (provider as any).initialized = true;
};

describe('AzureCompletionProvider', () => {
  beforeEach(() => {
    vi.spyOn(AzureCompletionProvider.prototype as any, 'ensureInitialized').mockResolvedValue(
      undefined,
    );
    vi.spyOn(AzureCompletionProvider.prototype as any, 'getAuthHeaders').mockResolvedValue({
      'api-key': 'test-key',
    });
    delete process.env.OPENAI_STOP;
    process.env.AZURE_API_HOST = 'test.azure.com';
    process.env.AZURE_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.AZURE_API_HOST;
    delete process.env.AZURE_API_KEY;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should handle basic completion with caching', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: 'hello' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      },
      cached: false,
    } as any);

    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: 'hello' }],
        usage: { total_tokens: 10 },
      },
      cached: true,
    } as any);

    const provider = new AzureCompletionProvider('test', {
      config: { apiHost: 'test.azure.com' },
    });
    setAuthHeaders(provider);

    const result1 = await provider.callApi('test prompt');
    const result2 = await provider.callApi('test prompt');

    expect(result1.output).toBe('hello');
    expect(result2.output).toBe('hello');
    expect(result1.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    expect(result2.tokenUsage).toEqual({ cached: 10, total: 10 });
  });

  it('should pass custom headers from config to fetchWithCache', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: 'hello' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      },
      cached: false,
    } as any);

    const customHeaders = {
      'X-Test-Header': 'test-value',
      'Another-Header': 'another-value',
    };

    const provider = new AzureCompletionProvider('test-deployment', {
      config: {
        apiHost: 'test.azure.com',
        apiKey: 'test-key',
        headers: customHeaders,
      },
    });

    setAuthHeaders(provider);
    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'api-key': 'test-key',
          'X-Test-Header': 'test-value',
          'Another-Header': 'another-value',
        }),
      }),
      expect.any(Number),
      'json',
      undefined,
    );
  });

  it('should handle content filter response', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: null, finish_reason: 'content_filter' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      },
      cached: false,
    } as any);

    const provider = new AzureCompletionProvider('test', {
      config: { apiHost: 'test.azure.com' },
    });
    setAuthHeaders(provider);

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe(
      "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.",
    );
  });

  it('should handle API errors', async () => {
    vi.mocked(fetchWithCache).mockRejectedValueOnce(new Error('API Error'));

    const provider = new AzureCompletionProvider('test', {
      config: { apiHost: 'test.azure.com' },
    });
    setAuthHeaders(provider);

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API call error: Error: API Error');
  });

  it('should handle missing API host', async () => {
    vi.mocked(fetchWithCache).mockImplementationOnce(function () {
      throw new Error('Azure API host must be set.');
    });

    const provider = new AzureCompletionProvider('test', { config: {} });
    setAuthHeaders(provider);

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API call error: Error: Azure API host must be set.');
  });

  it('should handle empty response text', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: '', finish_reason: 'stop' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      },
      cached: false,
    } as any);

    const provider = new AzureCompletionProvider('test', {
      config: { apiHost: 'test.azure.com' },
    });
    setAuthHeaders(provider);

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('');
  });

  it('should handle invalid OPENAI_STOP env var', async () => {
    process.env.OPENAI_STOP = '{invalid json}';

    const provider = new AzureCompletionProvider('test', {
      config: { apiHost: 'test.azure.com' },
    });
    setAuthHeaders(provider);

    await expect(provider.callApi('test')).rejects.toThrow(
      /OPENAI_STOP is not a valid JSON string/,
    );

    delete process.env.OPENAI_STOP;
  });

  it('should handle missing output and finish_reason not content_filter', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: null, finish_reason: 'stop' }],
        usage: { total_tokens: 7, prompt_tokens: 3, completion_tokens: 4 },
      },
      cached: false,
    } as any);

    const provider = new AzureCompletionProvider('test', {
      config: { apiHost: 'test.azure.com' },
    });
    setAuthHeaders(provider);

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('');
    expect(result.tokenUsage).toEqual({ total: 7, prompt: 3, completion: 4 });
  });

  it('should handle exception in response parsing gracefully', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {},
      cached: false,
    } as any);

    const provider = new AzureCompletionProvider('test', {
      config: { apiHost: 'test.azure.com' },
    });
    setAuthHeaders(provider);

    const result = await provider.callApi('test prompt');
    expect(result.error).toMatch(/API response error:/);
    expect(result.tokenUsage).toEqual({
      total: undefined,
      prompt: undefined,
      completion: undefined,
    });
  });

  it('should pass passthrough config fields in body', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: 'foo' }],
        usage: { total_tokens: 1, prompt_tokens: 1, completion_tokens: 0 },
      },
      cached: false,
    } as any);

    const provider = new AzureCompletionProvider('test', {
      config: {
        apiHost: 'test.azure.com',
        passthrough: { logprobs: 3 },
      },
    });
    setAuthHeaders(provider);

    await provider.callApi('test prompt');

    const actualCall = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse(actualCall[1]?.body as string);
    expect(body.logprobs).toBe(3);
  });

  it('should allow config.headers to override authHeaders', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: 'override' }],
        usage: { total_tokens: 2, prompt_tokens: 1, completion_tokens: 1 },
      },
      cached: false,
    } as any);

    const provider = new AzureCompletionProvider('test-deployment', {
      config: {
        apiHost: 'test.azure.com',
        apiKey: 'test-key',
        headers: { 'api-key': 'override-key', Extra: 'foo' },
      },
    });

    setAuthHeaders(provider);
    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'api-key': 'override-key',
          Extra: 'foo',
        }),
      }),
      expect.any(Number),
      'json',
      undefined,
    );
  });
});
