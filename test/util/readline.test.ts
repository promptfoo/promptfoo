import readline from 'readline';

import { afterAll, afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { createReadlineInterface, promptUser, promptYesNo } from '../../src/util/readline';

vi.mock('readline');

describe('readline utils', () => {
  let mockInterface: { question: Mock; close: Mock; on: Mock };

  beforeEach(() => {
    mockInterface = {
      question: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(
      mockInterface as unknown as readline.Interface,
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('createReadlineInterface', () => {
    it('should create readline interface with stdin/stdout', () => {
      expect(createReadlineInterface()).toBe(mockInterface);
      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
      });
    });
  });

  describe('promptUser', () => {
    it('should resolve with user answer', async () => {
      mockInterface.question.mockImplementation((_, callback) => callback('Test answer'));
      await expect(promptUser('Test question?')).resolves.toBe('Test answer');
      expect(mockInterface.question).toHaveBeenCalledWith('Test question?', expect.any(Function));
      expect(mockInterface.close).toHaveBeenCalledExactlyOnceWith();
    });

    it('should reject on error', async () => {
      const error = new Error('Test error');
      const answer = promptUser('Test question?');
      mockInterface.on.mock.calls[0][1](error);
      await expect(answer).rejects.toBe(error);
      expect(mockInterface.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockInterface.close).toHaveBeenCalledExactlyOnceWith();
    });

    it('should reject if readline creation fails', async () => {
      const error = new Error('Creation failed');
      vi.mocked(readline.createInterface).mockImplementation(() => {
        throw error;
      });
      await expect(promptUser('Test question?')).rejects.toBe(error);
      expect(mockInterface.close).not.toHaveBeenCalled();
    });
  });

  describe('promptYesNo', () => {
    it.each([
      ['should return true for "y" with default no', [['y', false, true, '(y/N): ']]],
      ['should return false for "n" with default yes', [['n', true, false, '(Y/n): ']]],
      [
        'should return default value for empty response',
        [
          ['', true, true, '(Y/n): '],
          ['', false, false, '(y/N): '],
        ],
      ],
      [
        'should handle different case inputs',
        [
          ['  YeS  ', undefined, true, '(y/N): '],
          ['  nO  ', true, false, '(Y/n): '],
        ],
      ],
      [
        'should append correct suffix based on default value',
        [
          ['y', true, true, '(Y/n): '],
          ['y', false, true, '(y/N): '],
        ],
      ],
      [
        'should return true for non-n input with defaultYes true',
        [['maybe', true, true, '(Y/n): ']],
      ],
      [
        'should return false for input not starting with y with defaultYes false',
        [['maybe', false, false, '(y/N): ']],
      ],
    ] as const)('%s', async (_, cases) => {
      for (const [answer, defaultYes, expected, suffix] of cases) {
        mockInterface.question.mockImplementation((_, callback) => callback(answer));
        await expect(promptYesNo('Test question?', defaultYes)).resolves.toBe(expected);
        expect(mockInterface.question).toHaveBeenLastCalledWith(
          `Test question? ${suffix}`,
          expect.any(Function),
        );
      }
      expect(mockInterface.close).toHaveBeenCalledTimes(cases.length);
    });
  });
});
