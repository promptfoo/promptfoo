import { fetchWithCache, disableCache, enableCache } from '../src/cache';
import fetch, { Response } from 'node-fetch';

jest.mock('node-fetch');
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

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
