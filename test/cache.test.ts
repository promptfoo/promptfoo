import fetch, { Response } from 'node-fetch';

import { fetchWithCache, disableCache, enableCache, clearCache } from '../src/cache';

jest.mock('node-fetch');
const mockedFetch = jest.mocked(fetch);

const mockedFetchResponse = (ok: boolean, response: object) => {
  return {
    ok,
    text: () => Promise.resolve(JSON.stringify(response)),
    headers: {
      get: (name: string) => {
        if (name === 'content-type') {
          return 'application/json';
        }
        return null;
      },
    },
  } as unknown as Response;
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
    expect(result).toEqual({ cached: false, data: response });
  });

  it('should fetch data with cache enabled', async () => {
    enableCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ cached: false, data: response });
  });

  it('should fetch data with cache enabled after previous test', async () => {
    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(0);
    expect(result).toEqual({ cached: true, data: response });
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
    expect(a).toEqual({ cached: false, data: response });
    expect(b).toEqual({ cached: true, data: response });
  });

  it('should fetch data without cache for a single test', async () => {
    disableCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ cached: false, data: response });

    enableCache();
  });

  it('should still fetch data without cache for a single test', async () => {
    disableCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce(mockedFetchResponse(true, response));

    const result = await fetchWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ cached: false, data: response });

    enableCache();
  });
});
