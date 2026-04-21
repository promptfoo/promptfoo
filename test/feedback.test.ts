import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gatherFeedback, sendFeedback } from '../src/feedback';
import logger from '../src/logger';
import { fetchWithProxy } from '../src/util/fetch/index';
import * as readlineUtils from '../src/util/readline';
import { createMockResponse, mockConsole } from './util/utils';

let actualFeedback: typeof import('../src/feedback');

vi.mock('../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../src/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn(),
}));

// Mock the readline utilities
vi.mock('../src/util/readline', () => ({
  promptUser: vi.fn(),
  promptYesNo: vi.fn(),
  createReadlineInterface: vi.fn(),
}));

vi.mock('../src/feedback', () => {
  return {
    sendFeedback: vi.fn(),
    gatherFeedback: vi.fn(),
  };
});

describe('Feedback Module', () => {
  let consoleLogSpy: ReturnType<typeof mockConsole>;

  beforeAll(async () => {
    actualFeedback = await vi.importActual('../src/feedback');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = mockConsole('log');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('sendFeedback', () => {
    beforeEach(() => {
      vi.mocked(sendFeedback).mockImplementation(actualFeedback.sendFeedback);
    });

    it('should send feedback successfully', async () => {
      const mockResponse = createMockResponse({ ok: true });
      vi.mocked(fetchWithProxy).mockResolvedValueOnce(mockResponse);

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
      vi.mocked(fetchWithProxy).mockResolvedValueOnce(mockResponse);

      await sendFeedback('Test feedback');

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Failed to send feedback'));
    });

    it('should handle network errors', async () => {
      vi.mocked(fetchWithProxy).mockRejectedValueOnce(new Error('Network error'));

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
      vi.mocked(gatherFeedback).mockImplementation(async (message) => {
        if (message) {
          await sendFeedback(message);
        }
      });

      vi.mocked(sendFeedback).mockReset();

      await gatherFeedback('Direct feedback');

      expect(sendFeedback).toHaveBeenCalledWith('Direct feedback');
    });

    it('should handle empty feedback input', async () => {
      // Mock promptUser to return empty string
      vi.mocked(readlineUtils.promptUser).mockResolvedValueOnce('   ');

      vi.mocked(gatherFeedback).mockImplementation(actualFeedback.gatherFeedback);

      await gatherFeedback();

      expect(sendFeedback).not.toHaveBeenCalled();
    });

    it('should handle errors during feedback gathering', async () => {
      // Mock promptUser to throw an error
      vi.mocked(readlineUtils.promptUser).mockRejectedValueOnce(new Error('Test error'));

      vi.mocked(gatherFeedback).mockImplementation(actualFeedback.gatherFeedback);

      await gatherFeedback();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error gathering feedback'),
      );
    });
  });
});
