import { execFile } from 'node:child_process';

import { onExit } from 'signal-exit';

interface CommandOptions {
  cwd?: string;
  input?: string | Buffer;
  maxBuffer?: number;
  encoding?: 'utf8' | 'buffer';
}

interface CommandResult<T> {
  stdout: T;
  stderr: T;
}

function stripFinalNewline(output: Buffer): Buffer {
  if (output[output.length - 1] !== 10) {
    return output;
  }
  return output.subarray(0, output.length - (output[output.length - 2] === 13 ? 2 : 1));
}

export function runCommand(
  file: string,
  args: string[],
  options: CommandOptions & { encoding: 'buffer' },
): Promise<CommandResult<Buffer>>;
export function runCommand(
  file: string,
  args: string[],
  options?: CommandOptions & { encoding?: 'utf8' },
): Promise<CommandResult<string>>;
/** Run a native executable without a shell, with bounded output and exit cleanup. */
export function runCommand(
  file: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult<string | Buffer>> {
  return new Promise((resolve, reject) => {
    let inputError: Error | undefined;
    const child = execFile(
      file,
      args,
      {
        cwd: options.cwd,
        encoding: 'buffer',
        // Keep the previous allowance for repository-wide Git metadata and FFmpeg logs.
        maxBuffer: options.maxBuffer ?? 100_000_000,
        // Overflow must terminate even a child that ignores SIGTERM.
        killSignal: 'SIGKILL',
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        removeExitHandler();
        const output = {
          stdout: stripFinalNewline(stdout),
          stderr: stripFinalNewline(stderr),
        };
        const result =
          options.encoding === 'buffer'
            ? output
            : { stdout: output.stdout.toString('utf8'), stderr: output.stderr.toString('utf8') };
        const failure = error ?? inputError;
        if (failure) {
          reject(Object.assign(failure, result));
        } else {
          resolve(result);
        }
      },
    );

    const removeExitHandler = onExit(() => {
      child.kill();
    });
    child.stdin?.on('error', (error: NodeJS.ErrnoException) => {
      // A process may exit without consuming all input. Its exit status remains authoritative.
      if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') {
        inputError = error;
        child.kill();
      }
    });
    // Always close stdin: cat-file --batch-check waits for EOF before exiting.
    child.stdin?.end(options.input);
  });
}
