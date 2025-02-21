import { fetchWithProxy } from '../../../src/fetch';
import { logger } from '../../../src/logger';
import { fetchAndParseUrl, fetchAllTexts, URLS } from '../../../src/redteam/plugins/pliny';

jest.mock('../../../src/fetch');
jest.mock('../../../src/logger');

const mockFetchWithProxy = jest.mocked(fetchWithProxy);

describe('pliny plugin', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('fetchAndParseUrl', () => {
    it('should fetch and parse URL content correctly', async () => {
      const mockResponse = new Response(`# Header 1
Content 1

## Header 2
Content 2

### Header 3
Content 3`);

      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const result = await fetchAndParseUrl('test-url');

      expect(result).toEqual(
        ['Content 1', 'Content 2', 'Content 3'].filter((section) => section.includes('\n')),
      );
      expect(mockFetchWithProxy).toHaveBeenCalledWith('test-url');
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      const result = await fetchAndParseUrl('test-url');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith('Error fetching test-url: Error: Network error');
    });

    it('should filter out empty sections and sections without newlines', async () => {
      const mockResponse = new Response(`# Header 1
Content 1

# Header 2
singleline

# Header 3
`);

      mockFetchWithProxy.mockResolvedValue(mockResponse);

      const result = await fetchAndParseUrl('test-url');

      expect(result).toEqual(['Content 1'].filter((section) => section.includes('\n')));
    });
  });

  describe('fetchAllTexts', () => {
    it('should handle fetch errors gracefully', async () => {
      mockFetchWithProxy.mockImplementation((url) => {
        if (url === URLS[0]) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve(
          new Response(`# Header
Content for ${url}`),
        );
      });

      const result = await fetchAllTexts();

      expect(result).toEqual(
        URLS.slice(1)
          .map((url) => `Content for ${url}`)
          .filter((content) => content.includes('\n')),
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching https://raw.githubusercontent.com/elder-plinius/L1B3RT4S/refs/heads/main/GOOGLE.mkd: Error: Network error',
      );
    });

    it('should filter out empty results', async () => {
      mockFetchWithProxy.mockResolvedValue(new Response(''));

      const result = await fetchAllTexts();

      expect(result).toEqual([]);
    });

    it('should handle all URLs failing to fetch', async () => {
      mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

      const result = await fetchAllTexts();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledTimes(URLS.length);
      URLS.forEach((url) => {
        expect(logger.error).toHaveBeenCalledWith(`Error fetching ${url}: Error: Network error`);
      });
    });

    it('should handle mixed success and failure scenarios', async () => {
      mockFetchWithProxy.mockImplementation((url) => {
        if (url === URLS[1] || url === URLS[3]) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve(
          new Response(`# Header
Content for ${url}`),
        );
      });

      const result = await fetchAllTexts();

      expect(result).toEqual(
        URLS.filter((_, idx) => idx !== 1 && idx !== 3)
          .map((url) => `Content for ${url}`)
          .filter((content) => content.includes('\n')),
      );
      expect(logger.error).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching https://raw.githubusercontent.com/elder-plinius/L1B3RT4S/refs/heads/main/AMAZON.mkd: Error: Network error',
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching https://raw.githubusercontent.com/elder-plinius/L1B3RT4S/refs/heads/main/OPENAI.mkd: Error: Network error',
      );
    });
  });
});
