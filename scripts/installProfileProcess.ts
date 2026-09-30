import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';

export type CommandResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  elapsedMs: number;
  stdout: string;
  stderr: string;
};
export async function runInstallProfileCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  logPrefix: string,
  timeoutMs = 60_000,
): Promise<CommandResult> {
  const stdout = `${logPrefix}.stdout.log`;
  const stderr = `${logPrefix}.stderr.log`;
  const out = fs.openSync(stdout, 'w');
  const err = fs.openSync(stderr, 'w');
  const started = performance.now();
  let timedOut = false;
  let terminationError: unknown;
  try {
    return await new Promise((resolve, reject) => {
      const child = childProcess.spawn(command, args, {
        cwd,
        env,
        stdio: ['ignore', out, err],
        detached: process.platform !== 'win32',
      });
      let interrupted: NodeJS.Signals | undefined;
      const terminate = () => {
        try {
          assert(child.pid, 'Missing process ID for command');
          terminateProcessTree(child.pid);
        } catch (error) {
          terminationError = error;
          child.kill('SIGKILL');
        }
      };
      const interrupt = (signal: NodeJS.Signals) => {
        if (!interrupted) {
          interrupted = signal;
          terminate();
        }
      };
      const onInterrupt = () => interrupt('SIGINT');
      const onTerminate = () => interrupt('SIGTERM');
      process.once('SIGINT', onInterrupt);
      process.once('SIGTERM', onTerminate);
      const timer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        process.off('SIGINT', onInterrupt);
        process.off('SIGTERM', onTerminate);
      };
      child.once('error', (error) => {
        cleanup();
        reject(error);
      });
      child.once('close', (code, signal) => {
        cleanup();
        if (process.platform !== 'win32' && child.pid && !timedOut && !interrupted) {
          terminate();
        }
        if (terminationError) {
          reject(
            new Error('Unable to terminate command process tree; measurement stopped', {
              cause: terminationError,
            }),
          );
          return;
        }
        if (interrupted) {
          reject(new Error(`Measurement interrupted by ${interrupted}`));
          return;
        }
        resolve({ code, signal, timedOut, elapsedMs: performance.now() - started, stdout, stderr });
      });
    });
  } finally {
    fs.closeSync(out);
    fs.closeSync(err);
  }
}

/** Kill a detached POSIX process group or a Windows process and its descendants. */
export function terminateProcessTree(pid: number, platform = process.platform): void {
  assert(Number.isInteger(pid) && pid > 0, 'Expected a positive integer process id');
  if (platform === 'win32') {
    childProcess.execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      timeout: 10000,
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ESRCH') {
      return;
    }
    throw error;
  }
}
