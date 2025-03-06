import { fetchWithProxy } from '../../src/fetch';
import { cloudConfig } from '../../src/globalConfig/cloud';
import {
  makeRequest,
  targetApiBuildDate,
  cloudCanAcceptChunkedResults,
  CHUNKED_RESULTS_BUILD_DATE,
} from '../../src/util/cloud';

jest.mock('../../src/fetch');
jest.mock('../../src/globalConfig/cloud');

describe('cloud utils', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('makeRequest', () => {
    it('should make request with correct params', async () => {
      const mockApiHost = 'https://api.example.com';
      const mockApiKey = 'test-api-key';

      jest.mocked(cloudConfig.getApiHost).mockReturnValue(mockApiHost);
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(mockApiKey);

      await makeRequest('test/path', 'POST', { data: 'test' });

      expect(fetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'POST',
        body: JSON.stringify({ data: 'test' }),
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });

    it('should make request without body', async () => {
      const mockApiHost = 'https://api.example.com';
      const mockApiKey = 'test-api-key';

      jest.mocked(cloudConfig.getApiHost).mockReturnValue(mockApiHost);
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(mockApiKey);

      await makeRequest('test/path', 'GET');

      expect(fetchWithProxy).toHaveBeenCalledWith('https://api.example.com/test/path', {
        method: 'GET',
        body: undefined,
        headers: { Authorization: 'Bearer test-api-key' },
      });
    });
  });

  describe('targetApiBuildDate', () => {
    it('should return build date from API response', async () => {
      const mockBuildDate = '2025-01-15T00:00:00.000Z';
      const mockResponse = new Response(JSON.stringify({ buildDate: mockBuildDate }), {
        status: 200,
        statusText: 'OK',
      });

      jest.mocked(fetchWithProxy).mockResolvedValue(mockResponse);

      const result = await targetApiBuildDate();
      expect(result).toEqual(new Date(mockBuildDate));
    });

    it('should return null if API call fails', async () => {
      jest.mocked(fetchWithProxy).mockRejectedValue(new Error('API Error'));

      const result = await targetApiBuildDate();
      expect(result).toBeNull();
    });

    it('should return null if build date is missing', async () => {
      const mockResponse = new Response(JSON.stringify({}), {
        status: 200,
        statusText: 'OK',
      });

      jest.mocked(fetchWithProxy).mockResolvedValue(mockResponse);

      const result = await targetApiBuildDate();
      expect(result).toBeNull();
    });
  });

  describe('cloudCanAcceptChunkedResults', () => {
    it('should return true if build date is after cutoff date', async () => {
      const mockBuildDate = new Date('2025-02-01');
      const mockResponse = new Response(
        JSON.stringify({ buildDate: mockBuildDate.toISOString() }),
        {
          status: 200,
          statusText: 'OK',
        },
      );

      jest.mocked(fetchWithProxy).mockResolvedValue(mockResponse);

      const result = await cloudCanAcceptChunkedResults();
      expect(result).toBe(true);
    });

    it('should return false if build date is before cutoff date', async () => {
      const mockBuildDate = new Date('2024-12-01');
      const mockResponse = new Response(
        JSON.stringify({ buildDate: mockBuildDate.toISOString() }),
        {
          status: 200,
          statusText: 'OK',
        },
      );

      jest.mocked(fetchWithProxy).mockResolvedValue(mockResponse);

      const result = await cloudCanAcceptChunkedResults();
      expect(result).toBe(false);
    });

    it('should return false if build date is null', async () => {
      jest.mocked(fetchWithProxy).mockRejectedValue(new Error('API Error'));

      const result = await cloudCanAcceptChunkedResults();
      expect(result).toBe(false);
    });

    it('should use correct cutoff date constant', () => {
      expect(CHUNKED_RESULTS_BUILD_DATE).toEqual(new Date('2025-01-10'));
    });
  });
});
