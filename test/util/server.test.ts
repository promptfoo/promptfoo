import opener from 'opener';
import { VERSION, DEFAULT_PORT } from '../../src/constants';
import logger from '../../src/logger';
import { BrowserBehavior } from '../../src/util/server';
import { checkServerRunning, openBrowser } from '../../src/util/server';

jest.mock('opener');
jest.mock('readline');

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('server utilities', () => {
  let mockReadline: { question: jest.Mock; close: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockReadline = {
      question: jest.fn(),
      close: jest.fn(),
    };
    const readline = jest.requireMock('readline');
    readline.createInterface.mockReturnValue(mockReadline);
  });

  describe('checkServerRunning', () => {
    it('returns true when server is running with matching version', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ status: 'OK', version: VERSION }),
      });

      const result = await checkServerRunning(DEFAULT_PORT);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}/health`);
    });

    it('returns false when server returns non-OK status', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ status: 'ERROR', version: VERSION }),
      });

      const result = await checkServerRunning();
      expect(result).toBe(false);
    });

    it('returns false when server version does not match', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ status: 'OK', version: '0.0.0' }),
      });

      const result = await checkServerRunning();
      expect(result).toBe(false);
    });

    it('returns false and logs debug message when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await checkServerRunning();
      expect(result).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check server health'),
      );
    });

    it('uses default port when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ status: 'OK', version: VERSION }),
      });

      await checkServerRunning();
      expect(mockFetch).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}/health`);
    });
  });

  describe('openBrowser', () => {
    it('opens browser directly with OPEN behavior', async () => {
      await openBrowser(BrowserBehavior.OPEN);
      expect(opener).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}`);
      expect(logger.info).toHaveBeenCalledWith('Press Ctrl+C to stop the server');
    });

    it('opens report page with OPEN_TO_REPORT behavior', async () => {
      await openBrowser(BrowserBehavior.OPEN_TO_REPORT);
      expect(opener).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}/report`);
    });

    it('opens redteam setup with OPEN_TO_REDTEAM_CREATE behavior', async () => {
      await openBrowser(BrowserBehavior.OPEN_TO_REDTEAM_CREATE);
      expect(opener).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}/redteam/setup`);
    });

    it('does not open browser with SKIP behavior', async () => {
      await openBrowser(BrowserBehavior.SKIP);
      expect(opener).not.toHaveBeenCalled();
    });

    it('prompts user with ASK behavior and opens on yes', async () => {
      mockReadline.question.mockImplementationOnce((_, callback) => {
        callback('y');
      });

      await openBrowser(BrowserBehavior.ASK);

      expect(mockReadline.question).toHaveBeenCalledWith(
        'Open URL in browser? (y/N): ',
        expect.any(Function),
      );
      expect(opener).toHaveBeenCalledWith(`http://localhost:${DEFAULT_PORT}`);
      expect(mockReadline.close).toHaveBeenCalledWith();
    });

    it('prompts user with ASK behavior and skips on no', async () => {
      mockReadline.question.mockImplementationOnce((_, callback) => {
        callback('n');
      });

      await openBrowser(BrowserBehavior.ASK);

      expect(mockReadline.question).toHaveBeenCalledWith(
        'Open URL in browser? (y/N): ',
        expect.any(Function),
      );
      expect(opener).not.toHaveBeenCalled();
      expect(mockReadline.close).toHaveBeenCalledWith();
    });

    it('handles opener errors gracefully', async () => {
      jest.mocked(opener).mockImplementation(() => {
        throw new Error('Failed to open browser');
      });

      await openBrowser(BrowserBehavior.OPEN);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to open browser'));
    });

    it('uses custom port when specified', async () => {
      const customPort = 3000;
      await openBrowser(BrowserBehavior.OPEN, customPort);
      expect(opener).toHaveBeenCalledWith(`http://localhost:${customPort}`);
    });
  });
});
