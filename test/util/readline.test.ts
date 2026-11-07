import { once } from 'events';
import readline from 'readline';
import { PassThrough } from 'stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadlineInterface, promptUser, promptYesNo } from '../../src/util/readline';

describe('readline utils', () => {
  let input: PassThrough;

  beforeEach(() => {
    input = new PassThrough();
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as typeof process.stdin);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    input.destroy();
  });

  it('creates a readline interface with stdin and stdout', () => {
    const create = vi.spyOn(readline, 'createInterface');
    const rl = createReadlineInterface();
    rl.close();

    expect(create).toHaveBeenCalledWith({ input, output: process.stdout });
  });

  describe('promptUser', () => {
    it.each(['an answer', ''])('resolves a submitted line %j', async (line) => {
      const answer = promptUser('Question? ');
      input.write(line + '\n');

      await expect(answer).resolves.toBe(line);
      expect(process.stdout.write).toHaveBeenCalledWith('Question? ');
      expect(input.listenerCount('data')).toBe(0);
    });

    it.each(['', 'unfinished'])(
      'rejects when stdin ends before a line is submitted (%j)',
      async (line) => {
        const answer = promptUser('Question? ');
        input.end(line);

        await expect(answer).rejects.toThrow('Input closed before an answer was received');
      },
    );

    it('rejects when stdin has already ended', async () => {
      const ended = once(input, 'end');
      input.resume();
      input.end();
      await ended;

      await expect(promptUser('Question? ')).rejects.toThrow(
        'Input closed before an answer was received',
      );
    });

    it('preserves the input error and releases the input stream', async () => {
      const error = new Error('input failed');
      const answer = promptUser('Question? ');
      input.destroy(error);

      await expect(answer).rejects.toBe(error);
      expect(input.listenerCount('data')).toBe(0);
    });

    it('preserves a readline creation error', async () => {
      const error = new Error('creation failed');
      vi.spyOn(readline, 'createInterface').mockImplementationOnce(() => {
        throw error;
      });
      await expect(promptUser('Question? ')).rejects.toBe(error);
    });
  });

  describe('promptYesNo', () => {
    it.each([
      ['y', false, true],
      ['n', true, false],
      ['', true, true],
      ['', false, false],
      ['  YeS  ', undefined, true],
      ['  nO  ', true, false],
      ['maybe', true, true],
      ['maybe', false, false],
    ] as const)('interprets %j with default %s as %s', async (line, defaultYes, expected) => {
      const answer = promptYesNo('Question?', defaultYes);
      input.write(line + '\n');

      await expect(answer).resolves.toBe(expected);
      expect(process.stdout.write).toHaveBeenCalledWith(
        defaultYes ? 'Question? (Y/n): ' : 'Question? (y/N): ',
      );
    });
  });
});
