import { fetchWithCache } from '../../../src/cache';
import { AzureCompletionProvider } from '../../../src/providers/azure/completion';

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('AzureCompletionProvider', () => {
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

    const provider = new AzureCompletionProvider('test', {
      config: { apiHost: 'test.azure.com', headers: customHeaders },
    });
    (provider as any).authHeaders = { 'api-key': 'test-key' };

    await provider.callApi('test prompt');

    const callArgs = jest.mocked(fetchWithCache).mock.calls[0][1]!;
    expect(callArgs).toBeDefined();
    expect(callArgs.headers).toBeDefined();
    const headers = callArgs.headers as Record<string, string>;
    expect(headers['X-Test-Header']).toBe('test-value');
    expect(headers['Another-Header']).toBe('another-value');
    expect(headers['api-key']).toBe('test-key');
    expect(headers['Content-Type']).toBe('application/json');
  });
});
