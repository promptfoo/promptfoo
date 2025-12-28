import opener from 'opener';
import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
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
vi.mock('opener', () => ({ default: vi.fn() }));

// Mock logger
vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the readline utilities
vi.mock('../../src/util/readline', () => ({
  promptYesNo: vi.fn(),
  promptUser: vi.fn(),
  createReadlineInterface: vi.fn(),
}));

// Mock fetchWithProxy
vi.mock('../../src/util/fetch', () => ({
  fetchWithProxy: vi.fn(),
}));

// Mock remoteGeneration
vi.mock('../../src/redteam/remoteGeneration', () => ({
  getRemoteVersionUrl: vi.fn(),
}));

// Import the mocked fetchWithProxy for use in tests
import * as fetchModule from '../../src/util/fetch/index';

const mockFetchWithProxy = fetchModule.fetchWithProxy as MockedFunction<
  typeof fetchModule.fetchWithProxy
>;

describe('Server Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkServerRunning', () => {
    it('should return true when server is running with matching version', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({ status: 'OK', version: VERSION }),
      } as Response);

      const result = await checkServerRunning();

      expect(mockFetchWithProxy).toHaveBeenCalledWith(
        `http://localhost:${getDefaultPort()}/health`,
        {
          headers: {
            'x-promptfoo-silent': 'true',
          },
        },
      );
      expect(result).toBe(true);
    });

    it('should return false when server status is not OK', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({ status: 'ERROR', version: VERSION }),
      } as Response);

      const result = await checkServerRunning();

      expect(result).toBe(false);
    });

    it('should return false when server version does not match', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({ status: 'OK', version: 'wrong-version' }),
      } as Response);

      const result = await checkServerRunning();

      expect(result).toBe(false);
    });

    it('should return false when fetch throws an error', async () => {
      mockFetchWithProxy.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await checkServerRunning();

      expect(result).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('No existing server found'),
      );
    });

    it('should use custom port when provided', async () => {
      const customPort = 4000;
      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({ status: 'OK', version: VERSION }),
      } as Response);

      await checkServerRunning(customPort);

      expect(mockFetchWithProxy).toHaveBeenCalledWith(`http://localhost:${customPort}/health`, {
        headers: {
          'x-promptfoo-silent': 'true',
        },
      });
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
      vi.mocked(opener).mockImplementationOnce(() => {
        throw new Error('Failed to open browser');
      });

      await openBrowser(BrowserBehavior.OPEN);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to open browser'));
    });

    it('should ask user before opening browser when BrowserBehavior.ASK', async () => {
      // Mock promptYesNo to return true
      vi.mocked(readlineUtils.promptYesNo).mockResolvedValueOnce(true);

      await openBrowser(BrowserBehavior.ASK);

      expect(readlineUtils.promptYesNo).toHaveBeenCalledWith('Open URL in browser?', false);
      expect(opener).toHaveBeenCalledWith(`http://localhost:${getDefaultPort()}`);
    });

    it('should not open browser when user answers no to ASK prompt', async () => {
      // Mock promptYesNo to return false
      vi.mocked(readlineUtils.promptYesNo).mockResolvedValueOnce(false);

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
      vi.clearAllMocks();
      // Setup default mock for getRemoteVersionUrl to return a valid URL
      vi.mocked(remoteGeneration.getRemoteVersionUrl).mockReturnValue(
        'https://api.promptfoo.app/version',
      );
    });

    it('should return true when server buildDate is after required date', async () => {
      const requiredDate = '2024-01-01T00:00:00Z';
      const serverBuildDate = '2024-06-15T10:30:00Z';

      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({ buildDate: serverBuildDate, version: '1.0.0' }),
      } as Response);

      const result = await checkServerFeatureSupport(featureName, requiredDate);

      expect(mockFetchWithProxy).toHaveBeenCalledWith('https://api.promptfoo.app/version', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
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

      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({ buildDate: serverBuildDate, version: '1.0.0' }),
      } as Response);

      const result = await checkServerFeatureSupport(featureName, requiredDate);

      expect(result).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          `${featureName}: buildDate=${serverBuildDate}, required=${requiredDate}, supported=false`,
        ),
      );
    });

    it('should return false when no version info available', async () => {
      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({}),
      } as Response);

      const result = await checkServerFeatureSupport(featureName, '2024-01-01T00:00:00Z');

      expect(result).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(`${featureName}: no version info, assuming not supported`),
      );
    });

    it('should return true when no remote URL is available (local server assumption)', async () => {
      // Mock getRemoteVersionUrl to return null for this specific test
      vi.mocked(remoteGeneration.getRemoteVersionUrl).mockReturnValueOnce(null);

      const result = await checkServerFeatureSupport(featureName, '2024-01-01T00:00:00Z');

      expect(result).toBe(true);
      expect(mockFetchWithProxy).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining(
          `No remote URL available for ${featureName}, assuming local server supports it`,
        ),
      );
    });

    it('should return false when fetchWithProxy throws an error', async () => {
      mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

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

      mockFetchWithProxy.mockResolvedValue({
        json: async () => ({ buildDate: serverBuildDate, version: '1.0.0' }),
      } as Response);

      // First call
      const result1 = await checkServerFeatureSupport(featureName, requiredDate);
      // Second call with same parameters
      const result2 = await checkServerFeatureSupport(featureName, requiredDate);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      // fetchWithProxy should only be called once due to caching
      expect(mockFetchWithProxy).toHaveBeenCalledTimes(1);
    });

    it('should handle different feature names with separate cache entries', async () => {
      const feature1 = 'feature-one';
      const feature2 = 'feature-two';
      const requiredDate = '2024-01-01T00:00:00Z';

      mockFetchWithProxy
        .mockResolvedValueOnce({
          json: async () => ({ buildDate: '2024-06-15T10:30:00Z', version: '1.0.0' }),
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({ buildDate: '2023-12-15T10:30:00Z', version: '1.0.0' }),
        } as Response);

      const result1 = await checkServerFeatureSupport(feature1, requiredDate);
      const result2 = await checkServerFeatureSupport(feature2, requiredDate);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(mockFetchWithProxy).toHaveBeenCalledTimes(2);
    });

    it('should handle timezone differences correctly', async () => {
      const requiredDate = '2024-06-01T00:00:00Z'; // UTC
      const serverBuildDate = '2024-06-01T08:00:00+08:00'; // Same moment in different timezone

      mockFetchWithProxy.mockResolvedValueOnce({
        json: async () => ({ buildDate: serverBuildDate, version: '1.0.0' }),
      } as Response);

      const result = await checkServerFeatureSupport(featureName, requiredDate);

      expect(result).toBe(true);
    });
  });
});
