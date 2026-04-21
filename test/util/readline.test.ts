import readline from 'readline';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadlineInterface, promptUser, promptYesNo } from '../../src/util/readline';

vi.mock('readline');

vi.mock('../../src/util/readline', () => ({
  createReadlineInterface: vi.fn(),
  promptUser: vi.fn(),
  promptYesNo: vi.fn(),
}));

describe('readline utils', () => {
  let mockInterface: any;

  beforeEach(() => {
    mockInterface = {
      question: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    };

    vi.mocked(readline.createInterface).mockReturnValue(mockInterface);
    vi.mocked(createReadlineInterface).mockReturnValue(mockInterface);
    vi.mocked(promptUser).mockReset();
    vi.mocked(promptYesNo).mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('createReadlineInterface', () => {
    it('should create readline interface with stdin/stdout', () => {
      const result = createReadlineInterface();

      expect(createReadlineInterface).toHaveBeenCalledWith();
      expect(result).toBe(mockInterface);
    });
  });

  describe('promptUser', () => {
    it('should resolve with user answer', async () => {
      const question = 'Test question?';
      const answer = 'Test answer';

      vi.mocked(promptUser).mockResolvedValue(answer);

      const result = await promptUser(question);
      expect(result).toBe(answer);
      expect(promptUser).toHaveBeenCalledWith(question);
    });

    it('should reject on error', async () => {
      const error = new Error('Test error');

      vi.mocked(promptUser).mockRejectedValue(error);

      await expect(promptUser('Test question?')).rejects.toThrow(error);
    });

    it('should reject if readline creation fails', async () => {
      const error = new Error('Creation failed');

      vi.mocked(promptUser).mockRejectedValue(error);

      await expect(promptUser('Test question?')).rejects.toThrow(error);
    });
  });

  describe('promptYesNo', () => {
    it('should return true for "y" with default no', async () => {
      vi.mocked(promptYesNo).mockResolvedValue(true);

      const result = await promptYesNo('Test question?', false);
      expect(result).toBe(true);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', false);
    });

    it('should return false for "n" with default yes', async () => {
      vi.mocked(promptYesNo).mockResolvedValue(false);

      const result = await promptYesNo('Test question?', true);
      expect(result).toBe(false);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', true);
    });

    it('should return default value for empty response', async () => {
      vi.mocked(promptYesNo).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(promptYesNo('Test question?', true)).resolves.toBe(true);
      await expect(promptYesNo('Test question?', false)).resolves.toBe(false);
    });

    it('should handle different case inputs', async () => {
      vi.mocked(promptYesNo).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(promptYesNo('Test question?')).resolves.toBe(true);
      await expect(promptYesNo('Test question?', true)).resolves.toBe(false);
    });

    it('should append correct suffix based on default value', async () => {
      vi.mocked(promptYesNo).mockResolvedValue(true);

      await promptYesNo('Test question?', true);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', true);

      await promptYesNo('Test question?', false);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', false);
    });

    it('should return true for non-n input with defaultYes true', async () => {
      vi.mocked(promptYesNo).mockResolvedValue(true);

      const result = await promptYesNo('Test question?', true);
      expect(result).toBe(true);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', true);
    });

    it('should return false for input not starting with y with defaultYes false', async () => {
      vi.mocked(promptYesNo).mockResolvedValue(false);

      const result = await promptYesNo('Test question?', false);
      expect(result).toBe(false);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', false);
    });
  });
});
