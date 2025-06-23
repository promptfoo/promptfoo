import opener from 'opener';
import * as cache from '../../src/cache';
import { getDefaultPort, VERSION } from '../../src/constants';
import logger from '../../src/logger';
import * as remoteGeneration from '../../src/redteam/remoteGeneration';
import * as readlineUtils from '../../src/util/readline';
// Import the module under test after mocks are set up
import {
  __clearFeatureCache,
  BrowserBehavior,
  checkServerFeatureSupport,
  checkServerRunning,
  openBrowser,
} from '../../src/util/server';

// Mock opener
jest.mock('opener', () => jest.fn());

// Mock logger
jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

// Mock the readline utilities
jest.mock('../../src/util/readline', () => ({
  promptYesNo: jest.fn(),
  promptUser: jest.fn(),
  createReadlineInterface: jest.fn(),
}));

// Mock fetchWithCache
jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

// Mock remoteGeneration
jest.mock('../../src/redteam/remoteGeneration', () => ({
  getRemoteVersionUrl: jest.fn(),
}));

// Properly mock fetch
const originalFetch = global.fetch;
const mockFetch = jest.fn();

describe('Server Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup global.fetch as a Jest mock
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('checkServerRunning', () => {
    it('should return true when server is running with matching version', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ status: 'OK', version: VERSION }),
      });

      const result = await checkServerRunning();

      expect(mockFetch).toHaveBeenCalledWith(`http://localhost:${getDefaultPort()}/health`);
      expect(result).toBe(true);
    });

    it('should return false when server status is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ status: 'ERROR', version: VERSION }),
      });

      const result = await checkServerRunning();

      expect(result).toBe(false);
    });

    it('should return false when server version does not match', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ status: 'OK', version: 'wrong-version' }),
      });

      const result = await checkServerRunning();

      expect(result).toBe(false);
    });

    it('should return false when fetch throws an error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await checkServerRunning();

      expect(result).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check server health'),
      );
    });

    it('should use custom port when provided', async () => {
      const customPort = 4000;
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ status: 'OK', version: VERSION }),
      });

      await checkServerRunning(customPort);

      expect(mockFetch).toHaveBeenCalledWith(`http://localhost:${customPort}/health`);
    });
  });

  describe('openBrowser', () => {
    it('should open browser with default URL when BrowserBehavior.OPEN', async () => {
      await openBrowser(BrowserBehavior.OPEN);

      expect(opener).toHaveBeenCalledWith(`http://localhost:${getDefaultPort()}`);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Press Ctrl+C'));
    });

    it('should open browser with report URL when BrowserBehavior.OPEN_TO_REPORT', async () => {
      await openBrowser(BrowserBehavior.OPEN_TO_REPORT);

      expect(opener).toHaveBeenCalledWith(`http://localhost:${getDefaultPort()}/report`);
    });

    it('should open browser with redteam setup URL when BrowserBehavior.OPEN_TO_REDTEAM_CREATE', async () => {
      await openBrowser(BrowserBehavior.OPEN_TO_REDTEAM_CREATE);

      expect(opener).toHaveBeenCalledWith(`http://localhost:${getDefaultPort()}/redteam/setup`);
    });

    it('should not open browser when BrowserBehavior.SKIP', async () => {
      await openBrowser(BrowserBehavior.SKIP);

      expect(opener).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle opener errors gracefully', async () => {
      jest.mocked(opener).mockImplementationOnce(() => {
        throw new Error('Failed to open browser');
      });

      await openBrowser(BrowserBehavior.OPEN);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to open browser'));
    });

    it('should ask user before opening browser when BrowserBehavior.ASK', async () => {
      // Mock promptYesNo to return true
      jest.mocked(readlineUtils.promptYesNo).mockResolvedValueOnce(true);

      await openBrowser(BrowserBehavior.ASK);

      expect(readlineUtils.promptYesNo).toHaveBeenCalledWith('Open URL in browser?', false);
      expect(opener).toHaveBeenCalledWith(`http://localhost:${getDefaultPort()}`);
    });

    it('should not open browser when user answers no to ASK prompt', async () => {
      // Mock promptYesNo to return false
      jest.mocked(readlineUtils.promptYesNo).mockResolvedValueOnce(false);

      await openBrowser(BrowserBehavior.ASK);

      expect(readlineUtils.promptYesNo).toHaveBeenCalledWith('Open URL in browser?', false);
      expect(opener).not.toHaveBeenCalled();
    });

    it('should use custom port when provided', async () => {
      const customPort = 5000;
      await openBrowser(BrowserBehavior.OPEN, customPort);

      expect(opener).toHaveBeenCalledWith(`http://localhost:${customPort}`);
    });
  });

  describe('checkServerFeatureSupport', () => {
    const featureName = 'test-feature';

    beforeEach(() => {
      // Clear the feature cache before each test to ensure isolation
      __clearFeatureCache();
      jest.clearAllMocks();
      // Setup default mock for getRemoteVersionUrl to return a valid URL
      jest
        .mocked(remoteGeneration.getRemoteVersionUrl)
        .mockReturnValue('https://api.promptfoo.app/version');
    });

    it('should return true when server buildDate is after required date', async () => {
      const requiredDate = '2024-01-01T00:00:00Z';
      const serverBuildDate = '2024-06-15T10:30:00Z';

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: { buildDate: serverBuildDate, version: '1.0.0' },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await checkServerFeatureSupport(featureName, requiredDate);

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        'https://api.promptfoo.app/version',
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
        5000,
      );
      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          `${featureName}: buildDate=${serverBuildDate}, required=${requiredDate}, supported=true`,
        ),
      );
    });

    it('should return false when server buildDate is before required date', async () => {
      const requiredDate = '2024-06-01T00:00:00Z';
      const serverBuildDate = '2024-01-15T10:30:00Z';

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: { buildDate: serverBuildDate, version: '1.0.0' },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await checkServerFeatureSupport(featureName, requiredDate);

      expect(result).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          `${featureName}: buildDate=${serverBuildDate}, required=${requiredDate}, supported=false`,
        ),
      );
    });

    it('should return false when no version info available', async () => {
      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {},
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await checkServerFeatureSupport(featureName, '2024-01-01T00:00:00Z');

      expect(result).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`${featureName}: no version info, assuming not supported`),
      );
    });

    it('should return true when no remote URL is available (local server assumption)', async () => {
      // Mock getRemoteVersionUrl to return null for this specific test
      jest.mocked(remoteGeneration.getRemoteVersionUrl).mockReturnValueOnce(null);

      const result = await checkServerFeatureSupport(featureName, '2024-01-01T00:00:00Z');

      expect(result).toBe(true);
      expect(cache.fetchWithCache).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          `No remote URL available for ${featureName}, assuming local server supports it`,
        ),
      );
    });

    it('should return false when fetchWithCache throws an error', async () => {
      jest.mocked(cache.fetchWithCache).mockRejectedValueOnce(new Error('Network error'));

      const result = await checkServerFeatureSupport(featureName, '2024-01-01T00:00:00Z');

      expect(result).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          `Version check failed for ${featureName}, assuming not supported: Error: Network error`,
        ),
      );
    });

    it('should cache results to avoid repeated API calls', async () => {
      const requiredDate = '2024-01-01T00:00:00Z';
      const serverBuildDate = '2024-06-15T10:30:00Z';

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: { buildDate: serverBuildDate, version: '1.0.0' },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      // First call
      const result1 = await checkServerFeatureSupport(featureName, requiredDate);
      // Second call with same parameters
      const result2 = await checkServerFeatureSupport(featureName, requiredDate);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      // fetchWithCache should only be called once due to caching
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(1);
    });

    it('should handle different feature names with separate cache entries', async () => {
      const feature1 = 'feature-one';
      const feature2 = 'feature-two';
      const requiredDate = '2024-01-01T00:00:00Z';

      jest
        .mocked(cache.fetchWithCache)
        .mockResolvedValueOnce({
          data: { buildDate: '2024-06-15T10:30:00Z', version: '1.0.0' },
          cached: false,
          status: 200,
          statusText: 'OK',
        })
        .mockResolvedValueOnce({
          data: { buildDate: '2023-12-15T10:30:00Z', version: '1.0.0' },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

      const result1 = await checkServerFeatureSupport(feature1, requiredDate);
      const result2 = await checkServerFeatureSupport(feature2, requiredDate);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(cache.fetchWithCache).toHaveBeenCalledTimes(2);
    });

    it('should handle timezone differences correctly', async () => {
      const requiredDate = '2024-06-01T00:00:00Z'; // UTC
      const serverBuildDate = '2024-06-01T08:00:00+08:00'; // Same moment in different timezone

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: { buildDate: serverBuildDate, version: '1.0.0' },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await checkServerFeatureSupport(featureName, requiredDate);

      expect(result).toBe(true);
    });
  });
});
