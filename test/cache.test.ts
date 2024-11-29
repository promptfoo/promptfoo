import { fetchWithCache, disableCache, enableCache, clearCache } from '../src/cache';

const mockedFetch = jest.mocked(jest.fn());
global.fetch = mockedFetch;

const mockedFetchResponse = (ok: boolean, response: object): Response => {
  const responseText = JSON.stringify(response);
  return {
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    text: () => Promise.resolve(responseText),
    json: () => Promise.resolve(response),
    headers: new Headers({
      'content-type': 'application/json',
      'x-session-id': '45',
    }),
  } as Response;
};

describe('fetchWithCache', () => {
  afterEach(() => {
    mockedFetch.mockReset();
  });

  it('should not cache data with failed request', async () => {
    enableCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(false, response));

    const result = await fetchWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      cached: false,
      data: response,
      headers: { 'content-type': 'application/json', 'x-session-id': '45' },
      status: 400,
      statusText: 'Bad Request',
    });
  });

  it('should fetch data with cache enabled', async () => {
    enableCache();

    const url = 'https://api.example.com/data';
    const response = {
      data: 'test data',
    };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      cached: false,
      data: response,
      status: 200,
      statusText: 'OK',
      headers: { 'x-session-id': '45', 'content-type': 'application/json' },
    });
  });

  it('should fetch data with cache enabled after previous test', async () => {
    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(0);
    expect(result).toEqual({
      cached: true,
      data: response,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json', 'x-session-id': '45' },
    });
  });

  it('should only fetch data once with cache enabled', async () => {
    enableCache();
    clearCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));
    mockedFetch.mockRejectedValue(new Error('Should not be called'));

    const [a, b] = await Promise.all([
      fetchWithCache(url, {}, 1000),
      fetchWithCache(url, {}, 1000),
    ]);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual({
      cached: false,
      data: response,
      status: 200,
      statusText: 'OK',
      headers: { 'x-session-id': '45', 'content-type': 'application/json' },
    });
    expect(b).toEqual({
      cached: true,
      data: response,
      status: 200,
      statusText: 'OK',
      headers: { 'x-session-id': '45', 'content-type': 'application/json' },
    });
  });

  it('should fetch data without cache for a single test', async () => {
    disableCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      cached: false,
      data: response,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json', 'x-session-id': '45' },
    });

    enableCache();
  });

  it('should still fetch data without cache for a single test', async () => {
    disableCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      cached: false,
      data: response,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json', 'x-session-id': '45' },
    });

    enableCache();
  });
});
