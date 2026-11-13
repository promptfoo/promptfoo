import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../../src/util/runCommand';

const { execFile, onExit, removeExitHandler } = vi.hoisted(() => ({
  execFile: vi.fn(),
  onExit: vi.fn(),
  removeExitHandler: vi.fn(),
}));

vi.mock('node:child_process', () => ({ execFile }));
vi.mock('signal-exit', () => ({ onExit }));

beforeEach(() => {
  onExit.mockReturnValue(removeExitHandler);
});

afterEach(() => {
  vi.resetAllMocks();
});

function finishAfterStdinError(inputError: NodeJS.ErrnoException, exitError: Error | null = null) {
  const stdin = new PassThrough();
  const kill = vi.fn();
  execFile.mockReturnValue({ stdin, kill });

  const result = runCommand('fixture-command', [], { input: 'input' });
  stdin.emit('error', inputError);
  const callback = execFile.mock.calls[0][3];
  callback(exitError, Buffer.from('output\n'), Buffer.from('diagnostic\n'));
  stdin.destroy();

  return { result, kill };
}

it('preserves a synchronously thrown error and code while escaping its diagnostic', async () => {
  const error = Object.assign(new Error('invalid\u00a0argument\u2028marker'), {
    code: 'ERR_INVALID_ARG_VALUE',
  });
  execFile.mockImplementation(() => {
    throw error;
  });

  await expect(runCommand('fixture-command', [])).rejects.toBe(error);
  expect(error).toMatchObject({
    code: 'ERR_INVALID_ARG_VALUE',
    message: 'invalid\\u00a0argument\\u2028marker',
  });
  expect(onExit).not.toHaveBeenCalled();
});

describe('runCommand stdin errors', () => {
  it.each(['EOF', 'EPIPE', 'ERR_STREAM_DESTROYED'])(
    'keeps a successful child exit authoritative after %s on stdin',
    async (code) => {
      const { result, kill } = finishAfterStdinError(
        Object.assign(new Error('write failed'), { code }),
      );

      await expect(result).resolves.toEqual({ stdout: 'output', stderr: 'diagnostic' });
      expect(kill).not.toHaveBeenCalled();
      expect(removeExitHandler).toHaveBeenCalledOnce();
    },
  );

  it('preserves a nonzero child exit after Windows stdin EOF', async () => {
    const exitError = Object.assign(new Error('Command failed'), { code: 7 });
    const { result, kill } = finishAfterStdinError(
      Object.assign(new Error('write EOF'), { code: 'EOF' }),
      exitError,
    );

    await expect(result).rejects.toBe(exitError);
    expect(exitError).toMatchObject({ code: 7, stdout: 'output', stderr: 'diagnostic' });
    expect(kill).not.toHaveBeenCalled();
    expect(removeExitHandler).toHaveBeenCalledOnce();
  });

  it.each([
    { exit: 'successful exit', error: null },
    {
      exit: 'forced termination',
      error: Object.assign(new Error('Command failed'), {
        code: null,
        signal: 'SIGKILL',
        killed: true,
      }),
    },
  ])('preserves the unexpected stdin error after $exit', async ({ error }) => {
    const inputError = Object.assign(new Error('write \u001b[31mEIO\u001b[0m\u0001'), {
      code: 'EIO',
    });
    const { result, kill } = finishAfterStdinError(inputError, error);

    await expect(result).rejects.toBe(inputError);
    expect(inputError).toMatchObject({
      code: 'EIO',
      message: 'write EIO\\u0001',
      stdout: 'output',
      stderr: 'diagnostic',
    });
    expect(kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    expect(removeExitHandler).toHaveBeenCalledOnce();
  });
});
