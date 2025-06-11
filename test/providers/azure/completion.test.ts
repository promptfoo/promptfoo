import { fetchWithCache } from '../../../src/cache';
import { AzureCompletionProvider } from '../../../src/providers/azure/completion';

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('AzureCompletionProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle basic completion with caching', async () => {
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: 'hello' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      },
      cached: false,
    } as any);

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ text: 'hello' }],
        usage: { total_tokens: 10 },
      },
      cached: true,
    } as any);

    const provider = new AzureCompletionProvider('test', {
      config: { apiHost: 'test.azure.com' },
    });
    (provider as any).authHeaders = {};

    const result1 = await provider.callApi('test prompt');
    const result2 = await provider.callApi('test prompt');

    expect(result1.output).toBe('hello');
    expect(result2.output).toBe('hello');
    expect(result1.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    expect(result2.tokenUsage).toEqual({ cached: 10, total: 10 });
  });

  it('should pass custom headers from config to fetchWithCache', async () => {
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
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
    );
  });
});
