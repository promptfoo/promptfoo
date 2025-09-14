import readline from 'readline';

import { createReadlineInterface, promptUser, promptYesNo } from '../../src/util/readline';

jest.mock('readline');

jest.mock('../../src/util/readline', () => ({
  createReadlineInterface: jest.fn(),
  promptUser: jest.fn(),
  promptYesNo: jest.fn(),
}));

describe('readline utils', () => {
  let mockInterface: any;

  beforeEach(() => {
    mockInterface = {
      question: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };

    jest.mocked(readline.createInterface).mockReturnValue(mockInterface);
    jest.mocked(createReadlineInterface).mockReturnValue(mockInterface);
    jest.mocked(promptUser).mockReset();
    jest.mocked(promptYesNo).mockReset();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
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

      jest.mocked(promptUser).mockResolvedValue(answer);

      const result = await promptUser(question);
      expect(result).toBe(answer);
      expect(promptUser).toHaveBeenCalledWith(question);
    });

    it('should reject on error', async () => {
      const error = new Error('Test error');

      jest.mocked(promptUser).mockRejectedValue(error);

      await expect(promptUser('Test question?')).rejects.toThrow(error);
    });

    it('should reject if readline creation fails', async () => {
      const error = new Error('Creation failed');

      jest.mocked(promptUser).mockRejectedValue(error);

      await expect(promptUser('Test question?')).rejects.toThrow(error);
    });
  });

  describe('promptYesNo', () => {
    it('should return true for "y" with default no', async () => {
      jest.mocked(promptYesNo).mockResolvedValue(true);

      const result = await promptYesNo('Test question?', false);
      expect(result).toBe(true);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', false);
    });

    it('should return false for "n" with default yes', async () => {
      jest.mocked(promptYesNo).mockResolvedValue(false);

      const result = await promptYesNo('Test question?', true);
      expect(result).toBe(false);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', true);
    });

    it('should return default value for empty response', async () => {
      jest.mocked(promptYesNo).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(promptYesNo('Test question?', true)).resolves.toBe(true);
      await expect(promptYesNo('Test question?', false)).resolves.toBe(false);
    });

    it('should handle different case inputs', async () => {
      jest.mocked(promptYesNo).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(promptYesNo('Test question?')).resolves.toBe(true);
      await expect(promptYesNo('Test question?', true)).resolves.toBe(false);
    });

    it('should append correct suffix based on default value', async () => {
      jest.mocked(promptYesNo).mockResolvedValue(true);

      await promptYesNo('Test question?', true);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', true);

      await promptYesNo('Test question?', false);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', false);
    });

    it('should return true for non-n input with defaultYes true', async () => {
      jest.mocked(promptYesNo).mockResolvedValue(true);

      const result = await promptYesNo('Test question?', true);
      expect(result).toBe(true);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', true);
    });

    it('should return false for input not starting with y with defaultYes false', async () => {
      jest.mocked(promptYesNo).mockResolvedValue(false);

      const result = await promptYesNo('Test question?', false);
      expect(result).toBe(false);
      expect(promptYesNo).toHaveBeenCalledWith('Test question?', false);
    });
  });
});
