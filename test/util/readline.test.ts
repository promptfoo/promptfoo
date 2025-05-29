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
    jest.clearAllMocks();
  });

  describe('createReadlineInterface', () => {
    it('should create readline interface with stdin/stdout', () => {
      const result = createReadlineInterface();

      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
      });
      expect(result).toBe(mockInterface);
    });
  });

  describe('promptUser', () => {
    it('should resolve with user answer and close interface', async () => {
      const answer = 'test answer';
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb(answer);
      });

      const result = await promptUser('Test question?');

      expect(result).toBe(answer);
      expect(mockInterface.question).toHaveBeenCalledWith('Test question?', expect.any(Function));
      expect(mockInterface.close).toHaveBeenCalledTimes(1);
    });

    it('should reject and close interface on error event', async () => {
      const error = new Error('test error');
      mockInterface.on.mockImplementation((event: string, cb: (err: Error) => void) => {
        if (event === 'error') {
          cb(error);
        }
      });

      await expect(promptUser('Test question?')).rejects.toThrow('test error');
      expect(mockInterface.close).toHaveBeenCalledTimes(1);
    });

    it('should reject and close interface if readline creation fails', async () => {
      const error = new Error('Creation failed');
      jest.mocked(readline.createInterface).mockImplementation(() => {
        throw error;
      });

      await expect(promptUser('Test question?')).rejects.toThrow('Creation failed');
    });

    it('should handle null readline interface', async () => {
      mockInterface = null;
      jest.mocked(readline.createInterface).mockReturnValue(mockInterface);

      await expect(promptUser('Test question?')).rejects.toThrow('Cannot read properties of null');
    });

    it('should cleanup interface on error during question', async () => {
      const error = new Error('Question error');
      mockInterface.question.mockImplementation(() => {
        throw error;
      });

      await expect(promptUser('Test question?')).rejects.toThrow('Question error');
      expect(mockInterface.close).toHaveBeenCalledTimes(1);
    });

    it('should handle error event with null interface', async () => {
      mockInterface.on.mockImplementation((event: string, cb: (err: Error) => void) => {
        if (event === 'error') {
          mockInterface = null;
          cb(new Error('test error'));
        }
      });

      await expect(promptUser('Test question?')).rejects.toThrow('test error');
    });
  });

  describe('promptYesNo', () => {
    beforeEach(() => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('');
      });
    });

    it('should return true for "y" with default no', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('y');
      });

      const result = await promptYesNo('Test question?', false);
      expect(result).toBe(true);
      expect(mockInterface.question).toHaveBeenCalledWith(
        'Test question? (y/N): ',
        expect.any(Function),
      );
    });

    it('should return false for "n" with default yes', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('n');
      });

      const result = await promptYesNo('Test question?', true);
      expect(result).toBe(false);
      expect(mockInterface.question).toHaveBeenCalledWith(
        'Test question? (Y/n): ',
        expect.any(Function),
      );
    });

    it('should return default value for empty response', async () => {
      await expect(promptYesNo('Test question?', true)).resolves.toBe(true);
      await expect(promptYesNo('Test question?', false)).resolves.toBe(false);
    });

    it('should handle different case inputs', async () => {
      mockInterface.question
        .mockImplementationOnce((q: string, cb: (answer: string) => void) => {
          cb('Y');
        })
        .mockImplementationOnce((q: string, cb: (answer: string) => void) => {
          cb('N');
        });

      await expect(promptYesNo('Test question?')).resolves.toBe(true);
      await expect(promptYesNo('Test question?', true)).resolves.toBe(false);
    });

    it('should append correct suffix based on default value', async () => {
      await promptYesNo('Test question?', true);
      expect(mockInterface.question).toHaveBeenCalledWith(
        'Test question? (Y/n): ',
        expect.any(Function),
      );

      await promptYesNo('Test question?', false);
      expect(mockInterface.question).toHaveBeenCalledWith(
        'Test question? (y/N): ',
        expect.any(Function),
      );
    });

    it('should return true for non-n input with defaultYes true', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('anything');
      });

      const result = await promptYesNo('Test question?', true);
      expect(result).toBe(true);
    });

    it('should return false for input not starting with y with defaultYes false', async () => {
      mockInterface.question.mockImplementation((q: string, cb: (answer: string) => void) => {
        cb('anything');
      });

      const result = await promptYesNo('Test question?', false);
      expect(result).toBe(false);
    });

    it('should cleanup readline interface on error', async () => {
      const error = new Error('test error');
      mockInterface.on.mockImplementation((event: string, cb: (err: Error) => void) => {
        if (event === 'error') {
          cb(error);
        }
      });

      await expect(promptYesNo('Test question?')).rejects.toThrow('test error');
    });
  });
});
