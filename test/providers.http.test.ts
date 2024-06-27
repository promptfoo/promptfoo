import { fetchWithCache } from '../src/cache';
import { HttpProvider } from '../src/providers/http';

jest.mock('../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

describe('HttpProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call the API and return the response', async () => {
    const provider = new HttpProvider('http://example.com/api', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: 'value' },
        responseParser: (data: any) => data.result,
      },
    });
    const mockResponse = { data: { result: 'response text' }, cached: false };
    jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('response text');
  });

  it('should handle API call errors', async () => {
    const provider = new HttpProvider('http://example.com/api', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: 'value' },
        responseParser: (data: any) => data.result,
      },
    });
    const mockError = new Error('something went wrong');
    jest.mocked(fetchWithCache).mockRejectedValue(mockError);

    const result = await provider.callApi('test prompt');
    expect(result).toEqual({
      error: `HTTP call error: Error: something went wrong`,
    });
  });
});
