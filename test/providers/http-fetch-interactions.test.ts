import { HttpProvider } from '../../src/providers/http';

// Mock the global fetch function
describe('error handling', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    jest.spyOn(global, 'fetch').mockImplementation(jest.fn());
    const mockResponse = {
      data: 'Error message',
    };

    jest.mocked(global.fetch).mockResolvedValueOnce({
      json: async () => mockResponse,
      status: 500,
      statusText: 'Bad Request',
      ok: false,
      headers: new Headers(),
      redirected: false,
      type: 'basic',
      url: 'http://test.com',
      clone: jest.fn(),
      body: null,
      bodyUsed: false,
      text: async () => JSON.stringify(mockResponse),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    process.env.PROMPTFOO_RETRY_5XX = undefined;
  });

  it('throws an error without validateStatus check being set due to retry code', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        maxRetries: 0,
      },
    });

    process.env.PROMPTFOO_RETRY_5XX = 'true';

    await expect(provider.callApi('test')).rejects.toThrow(
      'Request failed after 0 retries: Error: Internal Server Error: 500 Bad Request',
    );
  });

  it('throws an error when validateStatus is not set nor retry configured', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        maxRetries: 0,
      },
    });

    await expect(provider.callApi('test')).rejects.toThrow(
      'HTTP call failed with status 500 Bad Request: {\"data\":\"Error message\"}',
    );
  });

  it('throws an error when validateStatus is set nor retry configured', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        maxRetries: 0,
        validateStatus: 'status >= 200 && status < 300', // Only accept 2xx responses
      },
    });

    await expect(provider.callApi('test')).rejects.toThrow(
      'HTTP call failed with status 500 Bad Request: {\"data\":\"Error message\"}',
    );
  });
});
