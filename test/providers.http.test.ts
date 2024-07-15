import { fetchWithCache } from '../src/cache';
import { HttpProvider } from '../src/providers/http';

jest.mock('../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('HttpProvider', () => {
  const mockUrl = 'http://example.com/api';
  let provider: HttpProvider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call the API and return the response', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        responseParser: (data: any) => data.result,
      },
    });
    const mockResponse = { data: { result: 'response text' }, cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('response text');
    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'test prompt' }),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should handle API call errors', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: 'value' },
        responseParser: (data: any) => data.result,
      },
    });
    const mockError = new Error('Network error');
    jest.mocked(fetchWithCache).mockRejectedValueOnce(mockError);

    const result = await provider.callApi('test prompt');
    expect(result).toEqual({
      error: 'HTTP call error: Error: Network error',
    });
  });

  it('should use custom method and headers', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        headers: { Authorization: 'Bearer token' },
        responseParser: (data: any) => data,
      },
    });
    const mockResponse = { data: 'custom response', cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');
    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer token' },
      }),
      expect.any(Number),
      'json',
    );
  });

  const testCases = [
    { parser: (data: any) => data.custom, expected: 'parsed' },
    { parser: 'json.result', expected: 'parsed' },
  ];

  testCases.forEach(({ parser, expected }) => {
    it(`should handle response parser type: ${parser}`, async () => {
      provider = new HttpProvider(mockUrl, {
        config: { responseParser: parser },
      });
      const mockResponse = { data: { result: 'parsed', custom: 'parsed' }, cached: false };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');
      expect(result.output).toEqual(expected);
    });
  });

  it('should correctly render Nunjucks templates in config', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'X-Custom-Header': '{{ prompt | upper }}' },
        body: { key: '{{ prompt }}' },
        responseParser: (data: any) => data,
      },
    });
    const mockResponse = { data: 'custom response', cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');
    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      {
        method: 'POST',
        headers: { 'X-Custom-Header': 'TEST PROMPT' },
        body: JSON.stringify({ key: 'test prompt' }),
      },
      expect.any(Number),
      'json',
    );
  });

  it('should escape JSON prompts in Nunjucks rendering', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        responseParser: (data: any) => data,
      },
    });
    const jsonPrompt = '{"key": "value"}';
    const mockResponse = { data: 'response', cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi(jsonPrompt);
    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        body: JSON.stringify({ key: '{"key": "value"}' }),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should handle invalid JSON in config', async () => {
    const invalidConfig = '{invalid:json}';
    provider = new HttpProvider(mockUrl, {
      config: invalidConfig as any,
    });

    await expect(provider.callApi('test prompt')).rejects.toThrow(
      new Error("Cannot read properties of undefined (reading 'data')"),
    );
  });

  it('should return provider id and string representation', () => {
    provider = new HttpProvider(mockUrl, {
      config: {},
    });
    expect(provider.id()).toBe(mockUrl);
    expect(provider.toString()).toBe(`[HTTP Provider ${mockUrl}]`);
  });
});
