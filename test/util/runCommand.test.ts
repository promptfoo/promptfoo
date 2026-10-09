import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../../src/util/runCommand';

const { onExit, removeExitHandler } = vi.hoisted(() => ({
  onExit: vi.fn(),
  removeExitHandler: vi.fn(),
}));

vi.mock('signal-exit', () => ({ onExit }));

afterEach(() => {
  vi.resetAllMocks();
});

describe('runCommand', () => {
  function runNode(script: string, options: Parameters<typeof runCommand>[2] = {}) {
    onExit.mockReturnValue(removeExitHandler);
    return runCommand(process.execPath, ['-e', script], options);
  }

  it('passes literal arguments, uses cwd, and strips only one final newline', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'promptfoo-command with spaces-'));
    const args = ['with spaces', 'semi;colon', 'double"quote', "single'quote", 'back\\slash'];
    onExit.mockReturnValue(removeExitHandler);
    try {
      const result = await runCommand(
        process.execPath,
        [
          '-e',
          'process.stdout.write(JSON.stringify({ args: process.argv.slice(1), cwd: process.cwd() }) + "\\n\\n")',
          ...args,
        ],
        { cwd },
      );
      const actual = JSON.parse(result.stdout);
      expect(actual.args).toEqual(args);
      // Windows may report the same directory using its short (8.3) path name.
      expect(await realpath(actual.cwd)).toBe(await realpath(cwd));
      expect(result.stdout.endsWith('\n')).toBe(true);
      expect(result.stdout.endsWith('\n\n')).toBe(false);
      expect(removeExitHandler).toHaveBeenCalledOnce();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('writes input and closes stdin for a command that waits for EOF', async () => {
    const result = await runNode('process.stdin.pipe(process.stdout)', { input: 'first\nsecond' });
    expect(result.stdout).toBe('first\nsecond');
  });

  it.each([
    ['\r', '\r'],
    ['\r\n', ''],
    ['\n', ''],
    ['\n\n', '\n'],
  ])('preserves final-newline compatibility for %j', async (suffix, expected) => {
    const script = `process.stdout.write(${JSON.stringify(`output${suffix}`)}); process.stderr.write(${JSON.stringify(`error${suffix}`)})`;
    const text = await runNode(script);
    expect(text).toEqual({ stdout: `output${expected}`, stderr: `error${expected}` });

    const buffers = await runCommand(process.execPath, ['-e', script], { encoding: 'buffer' });
    expect(buffers).toEqual({
      stdout: Buffer.from(`output${expected}`),
      stderr: Buffer.from(`error${expected}`),
    });
  });

  it('preserves non-UTF8 binary data', async () => {
    onExit.mockReturnValue(removeExitHandler);
    const input = Buffer.from([0, 255, 128, 10, 42]);
    const result = await runCommand(
      process.execPath,
      ['-e', 'process.stdin.pipe(process.stdout)'],
      {
        input,
        encoding: 'buffer',
      },
    );
    expect(result.stdout).toEqual(input);
  });

  it('allows output above the native execFile default of 1 MiB', async () => {
    const result = await runNode('process.stdout.write("x".repeat(2 * 1024 * 1024))');
    expect(result.stdout.length).toBe(2 * 1024 * 1024);
  });

  it.each(['stdout', 'stderr'])(
    'rejects and terminates a child that exceeds %s maxBuffer',
    async (stream) => {
      await expect(
        runNode(
          `process.on('SIGTERM', () => {}); process.${stream}.write("x".repeat(4096)); setInterval(() => {}, 1000)`,
          {
            maxBuffer: 1024,
          },
        ),
      ).rejects.toMatchObject({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
      expect(removeExitHandler).toHaveBeenCalledOnce();
    },
  );

  it('preserves the exit code and captured output on a command failure', async () => {
    await expect(
      runNode(
        'process.stdout.write("partial\\n"); process.stderr.write("failed\\n"); process.exitCode = 7',
      ),
    ).rejects.toMatchObject({ code: 7, stdout: 'partial', stderr: 'failed' });
    expect(removeExitHandler).toHaveBeenCalledOnce();
  });

  it.each(['utf8', 'buffer'] as const)(
    'escapes failure messages while preserving raw %s output',
    async (encoding) => {
      const argument = '\u001b[31mcolored\u001b[0m\targument\r\u0001';
      const stdout = '\u001b[32moutput\u001b[0m\u0002';
      const stderr = 'first line\nsecond\tline\r\u0003\u0085\u202e\u2028';
      const script = `process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write(${JSON.stringify(stderr)}); process.exitCode = 7`;
      onExit.mockReturnValue(removeExitHandler);
      const args = ['-e', script, argument];
      const result =
        encoding === 'buffer'
          ? runCommand(process.execPath, args, { encoding })
          : runCommand(process.execPath, args);
      const failure = await result.catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).toMatchObject({
        code: 7,
        stdout: encoding === 'buffer' ? Buffer.from(stdout) : stdout,
        stderr: encoding === 'buffer' ? Buffer.from(stderr) : stderr,
        message: expect.stringContaining('colored\\targument\\r\\u0001'),
      });
      expect(failure).toHaveProperty(
        'message',
        expect.stringContaining('first line\nsecond\\tline\\r\\u0003\\u0085\\u202e\\u2028'),
      );
      expect(failure).toHaveProperty('message', expect.not.stringContaining('\u001b'));
      expect(removeExitHandler).toHaveBeenCalledOnce();
    },
  );

  it('rejects a missing executable and removes its exit handler', async () => {
    onExit.mockReturnValue(removeExitHandler);
    await expect(runCommand('promptfoo-missing-command-for-test', [])).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(removeExitHandler).toHaveBeenCalledOnce();
  });

  it('escapes synchronous argument-validation diagnostics before rejecting', async () => {
    const failure = await runCommand(process.execPath, ['\u0000invalid\u00a0argument']).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({
      code: 'ERR_INVALID_ARG_VALUE',
      message: expect.stringContaining('invalid\\u00a0argument'),
    });
    expect(failure).toHaveProperty('message', expect.not.stringContaining('\u00a0'));
    expect(onExit).not.toHaveBeenCalled();
  });

  it('tolerates a command exiting without reading large stdin', async () => {
    await expect(
      runNode('process.exit(0)', { input: Buffer.alloc(2 * 1024 * 1024) }),
    ).resolves.toMatchObject({ stdout: '' });
  });

  it('terminates a child that ignores SIGTERM when the parent exit handler runs', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-command-exit-'));
    const readyPath = path.join(directory, 'ready');
    try {
      const result = runNode(`
        process.on('SIGTERM', () => {});
        // End the fixture if cleanup regresses, so a failed test cannot leave an orphan.
        setTimeout(() => process.exit(0), 1000);
        require('node:fs').writeFileSync(${JSON.stringify(readyPath)}, 'ready');
      `);
      // Wait until the handler is installed; killing during startup misses this regression.
      await vi.waitFor(async () => expect(await readFile(readyPath, 'utf8')).toBe('ready'));
      const rejected = expect(result).rejects.toMatchObject({ signal: 'SIGKILL' });
      onExit.mock.calls[0][0]();
      await rejected;
      expect(removeExitHandler).toHaveBeenCalledOnce();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
