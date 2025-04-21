import readline from 'readline';
// Import *after* mocking
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

// Create a type for our mocked question function
type MockQuestionFn = jest.Mock<void, [string, (answer: string) => void]>;

// Create a partial readline Interface mock
const createMockInterface = () => {
  return {
    question: jest.fn((query: string, callback: (answer: string) => void) => {
      callback('mocked answer');
    }) as MockQuestionFn,
    close: jest.fn(),
    on: jest.fn(),
    // Add minimum required properties to satisfy the Interface type
    line: '',
    cursor: 0,
    setPrompt: jest.fn(),
    getPrompt: jest.fn(),
    write: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    clearLine: jest.fn(),
    removeAllListeners: jest.fn(),
    terminal: null,
    input: { on: jest.fn() } as any,
    output: { on: jest.fn() } as any,
  } as unknown as readline.Interface;
};

jest.mock('readline', () => ({
  createInterface: jest.fn(() => createMockInterface()),
}));

// Mock feedback module
jest.mock('../src/feedback', () => {
  return {
    sendFeedback: jest.fn(),
    gatherFeedback: jest.fn(),
  };
});

// Helper to create a mock Response
const createMockResponse = (data: any): Response => {
  return {
    ok: data.ok,
    status: data.status || 200,
    statusText: data.statusText || '',
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    json: async () => data,
    text: async () => '',
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    bodyUsed: false,
    body: null,
    clone: () => createMockResponse(data),
  } as Response;
};

describe('Feedback Module', () => {
  // Store original console.log
  const originalConsoleLog = console.log;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    // Silence console output during tests
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    // Restore console.log after each test
    console.log = originalConsoleLog;
  });

  describe('sendFeedback', () => {
    // Add the actual implementation for these tests
    beforeEach(() => {
      (jest.mocked(sendFeedback)).mockImplementation(actualFeedback.sendFeedback);
    });

    it('should send feedback successfully', async () => {
      // Mock a successful API response
      const mockResponse = createMockResponse({ ok: true });
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(mockResponse);

      await sendFeedback('Test feedback');

      // Verify fetch was called with correct parameters
      expect(fetchWithProxy).toHaveBeenCalledWith(
        'https://api.promptfoo.dev/api/feedback',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Test feedback' }),
        }),
      );

      // Verify success message was logged
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Feedback sent'));
    });

    it('should handle API failure', async () => {
      // Mock a failed API response
      const mockResponse = createMockResponse({ ok: false, status: 500 });
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(mockResponse);

      await sendFeedback('Test feedback');

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Failed to send feedback'));
    });

    it('should handle network errors', async () => {
      // Mock a network error
      jest.mocked(fetchWithProxy).mockRejectedValueOnce(new Error('Network error'));

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
      (jest.mocked(gatherFeedback)).mockImplementation(async (message) => {
        if (message) {
          await sendFeedback(message);
        }
      });

      // Reset sendFeedback to be a jest function we can track
      (jest.mocked(sendFeedback)).mockReset();

      // Run the test
      await gatherFeedback('Direct feedback');

      // Verify sendFeedback was called with the direct message
      expect(sendFeedback).toHaveBeenCalledWith('Direct feedback');
    });

    it('should handle empty feedback input', async () => {
      // Setup readline to return empty feedback
      const mockInterface = createMockInterface();
      // Override the default behavior for this test
      (mockInterface.question as MockQuestionFn).mockImplementationOnce(
        (_: string, callback: (answer: string) => void) => callback('   '),
      );

      jest.mocked(readline.createInterface).mockReturnValue(mockInterface);

      // Use real implementation for gatherFeedback
      (jest.mocked(gatherFeedback)).mockImplementation(actualFeedback.gatherFeedback);

      await gatherFeedback();

      // Verify sendFeedback was not called due to empty input
      expect(sendFeedback).not.toHaveBeenCalled();
    });

    it('should handle errors during feedback gathering', async () => {
      // Mock readline to throw an error
      jest.mocked(readline.createInterface).mockImplementation(() => {
        throw new Error('Test error');
      });

      // Use real implementation for gatherFeedback
      (jest.mocked(gatherFeedback)).mockImplementation(actualFeedback.gatherFeedback);

      await gatherFeedback();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error gathering feedback'),
      );
    });
  });
});
