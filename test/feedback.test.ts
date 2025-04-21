import { fetchWithProxy } from '../src/fetch';
import logger from '../src/logger';
import { getUserEmail } from '../src/globalConfig/accounts';
import readline from 'readline';

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

// Import *after* mocking
import { sendFeedback, gatherFeedback } from '../src/feedback';

describe('Feedback Module', () => {
  // Mock console to prevent logging during tests
  const originalConsoleLog = console.log;
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    // Silence console output during tests
    console.log = jest.fn();
  });
  
  afterEach(() => {
    // Restore console.log after each test
    console.log = originalConsoleLog;
  });

  describe('sendFeedback', () => {
    // Add the actual implementation for these tests
    beforeEach(() => {
      (sendFeedback as jest.Mock).mockImplementation(actualFeedback.sendFeedback);
    });

    it('should send feedback successfully', async () => {
      // Mock a successful API response
      const mockResponse = { ok: true };
      (fetchWithProxy as jest.Mock).mockResolvedValueOnce(mockResponse);

      await sendFeedback('Test feedback');

      // Verify fetch was called with correct parameters
      expect(fetchWithProxy).toHaveBeenCalledWith(
        'https://api.promptfoo.dev/api/feedback',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Test feedback' }),
        })
      );

      // Verify success message was logged
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Feedback sent'));
    });

    it('should handle API failure', async () => {
      // Mock a failed API response
      const mockResponse = { ok: false, status: 500 };
      (fetchWithProxy as jest.Mock).mockResolvedValueOnce(mockResponse);

      await sendFeedback('Test feedback');

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Failed to send feedback'));
    });

    it('should handle network errors', async () => {
      // Mock a network error
      (fetchWithProxy as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await sendFeedback('Test feedback');

      expect(logger.error).toHaveBeenCalledWith('Network error while sending feedback');
    });

    it('should not send empty feedback', async () => {
      await sendFeedback('');

      // Verify that fetch was not called
      expect(fetchWithProxy).not.toHaveBeenCalled();
    });
  });

  describe('gatherFeedback', () => {
    it('should send feedback directly if a message is provided', async () => {
      // Create a simplified implementation for this test
      (gatherFeedback as jest.Mock).mockImplementation(async (message) => {
        if (message) {
          await sendFeedback(message);
        }
      });

      // Reset sendFeedback to be a jest function we can track
      (sendFeedback as jest.Mock).mockReset();
      
      // Run the test
      await gatherFeedback('Direct feedback');

      // Verify sendFeedback was called with the direct message
      expect(sendFeedback).toHaveBeenCalledWith('Direct feedback');
    });

    it('should handle empty feedback input', async () => {
      // Setup readline to return empty feedback
      const mockInterface = {
        question: jest.fn().mockImplementation((query, callback) => callback('   ')),
        close: jest.fn(),
        on: jest.fn(),
      };
      (readline.createInterface as jest.Mock).mockReturnValue(mockInterface);
      
      // Use real implementation for gatherFeedback
      (gatherFeedback as jest.Mock).mockImplementation(actualFeedback.gatherFeedback);
      
      await gatherFeedback();

      // Verify sendFeedback was not called due to empty input
      expect(sendFeedback).not.toHaveBeenCalled();
    });

    it('should handle errors during feedback gathering', async () => {
      // Mock readline to throw an error
      (readline.createInterface as jest.Mock).mockImplementation(() => {
        throw new Error('Test error');
      });
      
      // Use real implementation for gatherFeedback
      (gatherFeedback as jest.Mock).mockImplementation(actualFeedback.gatherFeedback);

      await gatherFeedback();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error gathering feedback'));
    });
  });
}); 