import { fetchJsonWithCache, disableCache, enableCache } from '../src/cache.js';
import fetch, { Response } from 'node-fetch';

jest.mock('node-fetch');
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('fetchJsonWithCache', () => {
  afterEach(() => {
    mockedFetch.mockReset();
  });

  it('should fetch data with cache enabled', async () => {
    enableCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(response),
    } as Response);

    const result = await fetchJsonWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(response);
  });

  it('should fetch data with cache enabled after previous test', async () => {
    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(response),
    } as Response);

    const result = await fetchJsonWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(0);
    expect(result).toEqual(response);
  });

  it('should fetch data without cache for a single test', async () => {
    disableCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(response),
    } as Response);

    const result = await fetchJsonWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(response);

    enableCache();
  });

  it('should still fetch data without cache for a single test', async () => {
    disableCache();

    const url = 'https://api.example.com/data';
    const response = { data: 'test data' };

    mockedFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(response),
    } as Response);

    const result = await fetchJsonWithCache(url, {}, 1000);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(response);

    enableCache();
  });
});
