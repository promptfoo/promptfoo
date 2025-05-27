import readline from 'readline';
import { sendFeedback, gatherFeedback } from '../src/feedback';
import { fetchWithProxy } from '../src/fetch';
import logger from '../src/logger';

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

type MockQuestionFn = jest.Mock<void, [string, (answer: string) => void]>;

const createMockInterface = () => {
  return {
    question: jest.fn((query: string, callback: (answer: string) => void) => {
      callback('mocked answer');
    }) as MockQuestionFn,
    close: jest.fn(),
    on: jest.fn(),
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
      const mockInterface = createMockInterface();
      (mockInterface.question as MockQuestionFn).mockImplementationOnce(
        (_: string, callback: (answer: string) => void) => callback('   '),
      );

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
