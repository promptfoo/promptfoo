import readline from 'readline';
import { createReadlineInterface, promptUser, promptYesNo } from '../../src/util/readline';

jest.mock('readline');

describe('readline utils', () => {
  let mockInterface: any;

  beforeEach(() => {
    mockInterface = {
      question: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };
    jest.mocked(readline.createInterface).mockReturnValue(mockInterface);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createReadlineInterface', () => {
    it('should create readline interface with stdin/stdout', () => {
      createReadlineInterface();
      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
      });
    });
  });

  describe('promptUser', () => {
    it('should resolve with user answer', async () => {
      const question = 'Test question?';
      const answer = 'Test answer';

      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        expect(q).toBe(question);
        cb(answer);
      });

      const result = await promptUser(question);
      expect(result).toBe(answer);
      expect(mockInterface.close).toHaveBeenCalledWith();
    });

    it('should reject on error', async () => {
      const error = new Error('Test error');
      mockInterface.on.mockImplementation((event: string, cb: (err: Error) => void) => {
        if (event === 'error') {
          cb(error);
        }
      });

      await expect(promptUser('Test question?')).rejects.toThrow(error);
      expect(mockInterface.close).toHaveBeenCalledWith();
    });

    it('should reject if readline creation fails', async () => {
      const error = new Error('Creation failed');
      jest.mocked(readline.createInterface).mockImplementation(() => {
        throw error;
      });

      await expect(promptUser('Test question?')).rejects.toThrow(error);
    });
  });

  describe('promptYesNo', () => {
    it('should return true for "y" with default no', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('y');
      });

      const result = await promptYesNo('Test question?', false);
      expect(result).toBe(true);
    });

    it('should return false for "n" with default yes', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('n');
      });

      const result = await promptYesNo('Test question?', true);
      expect(result).toBe(false);
    });

    it('should return default value for empty response', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('');
      });

      await expect(promptYesNo('Test question?', true)).resolves.toBe(true);
      await expect(promptYesNo('Test question?', false)).resolves.toBe(false);
    });

    it('should handle different case inputs', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('YES');
      });
      await expect(promptYesNo('Test question?')).resolves.toBe(true);

      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('No');
      });
      await expect(promptYesNo('Test question?', true)).resolves.toBe(false);
    });

    it('should append correct suffix based on default value', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('y');
      });

      await promptYesNo('Test question?', true);
      expect(mockInterface.question.mock.calls[0][0]).toContain('(Y/n)');

      await promptYesNo('Test question?', false);
      expect(mockInterface.question.mock.calls[1][0]).toContain('(y/N)');
    });

    it('should return true for non-n input with defaultYes true', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('maybe');
      });
      await expect(promptYesNo('Test question?', true)).resolves.toBe(true);
    });

    it('should return false for input not starting with y with defaultYes false', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('nope');
      });
      await expect(promptYesNo('Test question?', false)).resolves.toBe(false);
    });
  });
});
