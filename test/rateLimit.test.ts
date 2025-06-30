import { fetchWithRetries } from '../src/fetch';

const mockedFetch = jest.spyOn(global, 'fetch');

const mockedFetchResponse = (ok: boolean, response: object, headers: object = {}) => {
  const responseText = JSON.stringify(response);
  return {
    ok,
    status: ok ? 200 : 429,
    statusText: ok ? 'OK' : 'Too Many Requests',
    text: () => Promise.resolve(responseText),
    json: () => Promise.resolve(response),
    headers: new Headers({
      'content-type': 'application/json',
      ...headers,
    }),
  } as Response;
};

const mockedSetTimeout = (reqTimeout: number) =>
  jest.spyOn(global, 'setTimeout').mockImplementation((cb: () => void, ms?: number) => {
    if (ms !== reqTimeout) {
      cb();
    }
    return 0 as any;
  });

describe('fetchWithRetries', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    mockedFetch.mockReset();
    jest.useRealTimers();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  it('should fetch data', async () => {
    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithRetries(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    await expect(result.json()).resolves.toEqual(response);
  });

  it('should retry after given time if rate limited, using X-Limit headers', async () => {
    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };
    const rateLimitReset = 47_000;
    const timeout = 1234;
    const now = Date.now();

    const setTimeoutMock = mockedSetTimeout(timeout);

    mockedFetch
      .mockResolvedValueOnce(
        mockedFetchResponse(false, response, {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': `${(now + rateLimitReset) / 1000}`,
        }),
      )
      .mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithRetries(url, {}, timeout);
    const waitTime = setTimeoutMock.mock.calls[1][1];

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(waitTime).toBeGreaterThan(rateLimitReset);
    expect(waitTime).toBeLessThanOrEqual(rateLimitReset + 1000);
    await expect(result.json()).resolves.toEqual(response);
  });

  it('should retry after given time if rate limited, using status and Retry-After', async () => {
    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };
    const retryAfter = 15;
    const timeout = 1234;

    const setTimeoutMock = mockedSetTimeout(timeout);

    mockedFetch
      .mockResolvedValueOnce(
        mockedFetchResponse(false, response, { 'Retry-After': String(retryAfter) }),
      )
      .mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithRetries(url, {}, timeout);
    const waitTime = setTimeoutMock.mock.calls[1][1];

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(waitTime).toBe(retryAfter * 1000);
    await expect(result.json()).resolves.toEqual(response);
  });

  it('should retry after default wait time if rate limited and wait time not found', async () => {
    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };
    const timeout = 1234;

    const setTimeoutMock = mockedSetTimeout(timeout);

    mockedFetch
      .mockResolvedValueOnce(mockedFetchResponse(false, response))
      .mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithRetries(url, {}, timeout);
    const waitTime = setTimeoutMock.mock.calls[1][1];

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(waitTime).toBe(60_000);
    await expect(result.json()).resolves.toEqual(response);
  });
});
