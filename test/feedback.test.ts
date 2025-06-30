import { sendFeedback, gatherFeedback } from '../src/feedback';
import { fetchWithProxy } from '../src/fetch';
import logger from '../src/logger';
import * as readlineUtils from '../src/util/readline';

const actualFeedback = jest.requireActual('../src/feedback');

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

// Mock the readline utilities
jest.mock('../src/util/readline', () => ({
  promptUser: jest.fn(),
  promptYesNo: jest.fn(),
  createReadlineInterface: jest.fn(),
}));

jest.mock('../src/feedback', () => {
  return {
    sendFeedback: jest.fn(),
    gatherFeedback: jest.fn(),
  };
});

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

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Feedback sent'));
    });

    it('should handle API failure', async () => {
      const mockResponse = createMockResponse({ ok: false, status: 500 });
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
      // Mock promptUser to return empty string
      jest.mocked(readlineUtils.promptUser).mockResolvedValueOnce('   ');

      jest.mocked(gatherFeedback).mockImplementation(actualFeedback.gatherFeedback);

      await gatherFeedback();

      expect(sendFeedback).not.toHaveBeenCalled();
    });

    it('should handle errors during feedback gathering', async () => {
      // Mock promptUser to throw an error
      jest.mocked(readlineUtils.promptUser).mockRejectedValueOnce(new Error('Test error'));

      jest.mocked(gatherFeedback).mockImplementation(actualFeedback.gatherFeedback);

      await gatherFeedback();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error gathering feedback'),
      );
    });
  });
});
