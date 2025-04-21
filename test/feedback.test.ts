import readline from 'readline';
import { sendFeedback, gatherFeedback } from '../src/feedback';
import { fetchWithProxy } from '../src/fetch';
import logger from '../src/logger';

// Store the original implementation to reference in mocks
const actualFeedback = jest.requireActual('../src/feedback');

// Mock dependencies
jest.mock('../src/fetch', () => ({
  fetchWithProxy: jest.fn(),
}));

jest.mock('../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn(),
}));

jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: jest.fn((q, cb) => cb('mocked answer')),
    close: jest.fn(),
    on: jest.fn(),
  })),
}));

// Mock feedback module
jest.mock('../src/feedback', () => {
  return {
    sendFeedback: jest.fn(),
    gatherFeedback: jest.fn(),
  };
});

describe('Feedback Module', () => {
  const originalConsoleLog = console.log;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe('sendFeedback', () => {
    beforeEach(() => {
      jest.mocked(sendFeedback).mockImplementation(actualFeedback.sendFeedback);
    });

    it('should send feedback successfully', async () => {
      const mockResponse = new Response(null, {
        status: 200,
        statusText: 'OK',
      });
      Object.defineProperty(mockResponse, 'ok', { value: true });
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(mockResponse);

      await sendFeedback('Test feedback');

      expect(fetchWithProxy).toHaveBeenCalledWith(
        'https://api.promptfoo.dev/api/feedback',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Test feedback' }),
        }),
      );

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Feedback sent'));
    });

    it('should handle API failure', async () => {
      const mockResponse = new Response(null, {
        status: 500,
        statusText: 'Internal Server Error',
      });
      Object.defineProperty(mockResponse, 'ok', { value: false });
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(mockResponse);

      await sendFeedback('Test feedback');

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Failed to send feedback'));
    });

    it('should handle network errors', async () => {
      jest.mocked(fetchWithProxy).mockRejectedValueOnce(new Error('Network error'));

      await sendFeedback('Test feedback');

      expect(logger.error).toHaveBeenCalledWith('Network error while sending feedback');
    });

    it('should not send empty feedback', async () => {
      await sendFeedback('');
      expect(fetchWithProxy).not.toHaveBeenCalled();
    });
  });

  describe('gatherFeedback', () => {
    it('should send feedback directly if a message is provided', async () => {
      jest.mocked(gatherFeedback).mockImplementation(async (message) => {
        if (message) {
          await sendFeedback(message);
        }
      });

      jest.mocked(sendFeedback).mockReset();

      await gatherFeedback('Direct feedback');

      expect(sendFeedback).toHaveBeenCalledWith('Direct feedback');
    });

    it('should handle empty feedback input', async () => {
      const mockInterface = {
        question: jest.fn().mockImplementation((query, callback) => callback('   ')),
        close: jest.fn(),
        on: jest.fn(),
        terminal: null,
        line: '',
        cursor: 0,
        getPrompt: jest.fn(),
        setPrompt: jest.fn(),
        removeAllListeners: jest.fn(),
        resume: jest.fn(),
        pause: jest.fn(),
        prompt: jest.fn(),
        write: jest.fn(),
      } as any;
      jest.mocked(readline.createInterface).mockReturnValue(mockInterface);

      jest.mocked(gatherFeedback).mockImplementation(actualFeedback.gatherFeedback);

      await gatherFeedback();

      expect(sendFeedback).not.toHaveBeenCalled();
    });

    it('should handle errors during feedback gathering', async () => {
      jest.mocked(readline.createInterface).mockImplementation(() => {
        throw new Error('Test error');
      });

      jest.mocked(gatherFeedback).mockImplementation(actualFeedback.gatherFeedback);

      await gatherFeedback();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error gathering feedback'),
      );
    });
  });
});
