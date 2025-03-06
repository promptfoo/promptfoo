import { fetchWithProxy } from '../../src/fetch';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { makeRequest } from '../../src/util/cloud';

jest.mock('../../src/fetch');
jest.mock('../../src/globalConfig/cloud');

describe('cloud utils', () => {
  const mockFetchWithProxy = jest.mocked(fetchWithProxy);
  const mockCloudConfig = cloudConfig as jest.Mocked<typeof cloudConfig>;

  beforeEach(() => {
    jest.resetAllMocks();

    mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');
    mockCloudConfig.getApiKey.mockReturnValue('test-api-key');
  });

  describe('makeRequest', () => {
    it('should make request with correct URL and headers', async () => {
      const path = 'test/path';
      const method = 'POST';
      const body = { data: 'test' };

      await makeRequest(path, method, body);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should make GET request without body', async () => {
      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should handle undefined API key', async () => {
      mockCloudConfig.getApiKey.mockReturnValue(undefined);

      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer undefined' },
      });
    });

    it('should handle empty path', async () => {
      const path = '';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should handle API host without trailing slash', async () => {
      mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com');

      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/test/path',
        expect.any(Object),
      );
    });

    it('should handle API host with trailing slash', async () => {
      mockCloudConfig.getApiHost.mockReturnValue('https://api.example.com/');

      const path = 'test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com//test/path',
        expect.any(Object),
      );
    });

    it('should handle path with leading slash', async () => {
      const path = '/test/path';
      const method = 'GET';

      await makeRequest(path, method);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com//test/path', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should handle complex request body', async () => {
      const path = 'test/path';
      const method = 'POST';
      const body = {
        string: 'test',
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        nested: {
          field: 'value',
        },
      };

      await makeRequest(path, method, body);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should handle non-JSON body', async () => {
      const path = 'test/path';
      const method = 'POST';
      const body = 'plain text body';

      await makeRequest(path, method, body);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should handle null/undefined body', async () => {
      const path = 'test/path';
      const method = 'POST';

      await makeRequest(path, method, null);
      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'POST',
        body: 'null',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      await makeRequest(path, method, undefined);
      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'POST',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });
  });
});
