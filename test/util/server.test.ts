import opener from 'opener';
import { VERSION, DEFAULT_PORT } from '../../src/constants';
import logger from '../../src/logger';
// Import the module under test after mocks are set up
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../src/util/server';

// Mock opener
jest.mock('opener', () => jest.fn());

// Mock logger
jest.mock('../../src/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

// Mock readline
const mockQuestion = jest.fn();
const mockClose = jest.fn();
jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: mockQuestion,
    close: mockClose,
    on: jest.fn(),
  })),
}));

// Properly mock fetch
const originalFetch = global.fetch;
const mockFetch = jest.fn();

describe('Server Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup global.fetch as a Jest mock
    global.fetch = mockFetch;
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

      expect(mockFetch).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}/health`);
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

      expect(opener).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}`);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Press Ctrl+C'));
    });

    it('should open browser with report URL when BrowserBehavior.OPEN_TO_REPORT', async () => {
      await openBrowser(BrowserBehavior.OPEN_TO_REPORT);

      expect(opener).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}/report`);
    });

    it('should open browser with redteam setup URL when BrowserBehavior.OPEN_TO_REDTEAM_CREATE', async () => {
      await openBrowser(BrowserBehavior.OPEN_TO_REDTEAM_CREATE);

      expect(opener).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}/redteam/setup`);
    });

    it('should not open browser when BrowserBehavior.SKIP', async () => {
      await openBrowser(BrowserBehavior.SKIP);

      expect(opener).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle opener errors gracefully', async () => {
      (jest.mocked(opener)).mockImplementationOnce(() => {
        throw new Error('Failed to open browser');
      });

      await openBrowser(BrowserBehavior.OPEN);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to open browser'));
    });

    it('should ask user before opening browser when BrowserBehavior.ASK', async () => {
      // Setup readline to return 'y'
      mockQuestion.mockImplementationOnce((_, callback) => callback('y'));

      await openBrowser(BrowserBehavior.ASK);

      expect(mockQuestion).toHaveBeenCalledWith(
        'Open URL in browser? (y/N): ',
        expect.any(Function),
      );
      expect(mockClose).toHaveBeenCalledWith();
      expect(opener).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}`);
    });

    it('should not open browser when user answers no to ASK prompt', async () => {
      // Setup readline to return 'n'
      mockQuestion.mockImplementationOnce((_, callback) => callback('n'));

      await openBrowser(BrowserBehavior.ASK);

      expect(mockQuestion).toHaveBeenCalledWith(
        'Open URL in browser? (y/N): ',
        expect.any(Function),
      );
      expect(mockClose).toHaveBeenCalledWith();
      expect(opener).not.toHaveBeenCalled();
    });

    it('should use custom port when provided', async () => {
      const customPort = 5000;
      await openBrowser(BrowserBehavior.OPEN, customPort);

      expect(opener).toHaveBeenCalledWith(`http://localhost:${customPort}`);
    });
  });
});
