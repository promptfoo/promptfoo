import { mkdtemp, realpath, rm } from 'node:fs/promises';
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
      expect(JSON.parse(result.stdout)).toEqual({ args, cwd: await realpath(cwd) });
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

  it('rejects a missing executable and removes its exit handler', async () => {
    onExit.mockReturnValue(removeExitHandler);
    await expect(runCommand('promptfoo-missing-command-for-test', [])).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(removeExitHandler).toHaveBeenCalledOnce();
  });

  it('tolerates a command exiting without reading large stdin', async () => {
    await expect(
      runNode('process.exit(0)', { input: Buffer.alloc(2 * 1024 * 1024) }),
    ).resolves.toMatchObject({ stdout: '' });
  });

  it('terminates an active child when the parent exit handler runs', async () => {
    const result = runNode('setInterval(() => {}, 1000)');
    const rejected = expect(result).rejects.toMatchObject({ signal: 'SIGTERM' });
    onExit.mock.calls[0][0]();
    await rejected;
    expect(removeExitHandler).toHaveBeenCalledOnce();
  });
});
