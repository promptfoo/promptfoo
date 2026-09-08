import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

function existingNpmCli(candidate: string | undefined): candidate is string {
  return (
    !!candidate &&
    path.win32.basename(candidate).toLowerCase() === 'npm-cli.js' &&
    fs.existsSync(candidate)
  );
}

/** Invoke npm's JavaScript CLI on Windows without executing a .cmd file or using a shell. */
export function npmInvocation(
  options: { platform?: NodeJS.Platform; nodePath?: string; npmExecPath?: string } = {},
): { command: string; prefix: string[] } {
  if ((options.platform ?? process.platform) !== 'win32') {
    return { command: 'npm', prefix: [] };
  }

  const nodePath = options.nodePath ?? process.execPath;
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  if (existingNpmCli(npmExecPath)) {
    return { command: nodePath, prefix: [npmExecPath] };
  }

  let npmPaths: string[] = [];
  try {
    npmPaths = childProcess
      .execFileSync('where.exe', ['npm'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10000,
      })
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter((entry) => ['npm', 'npm.cmd'].includes(path.win32.basename(entry).toLowerCase()));
  } catch {
    // A Node installation may include npm even when its wrappers are absent from PATH.
  }

  const directories = [
    ...npmPaths.map((entry) => path.win32.dirname(entry)),
    path.win32.dirname(nodePath),
  ];
  for (const directory of directories) {
    const candidate = path.win32.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (existingNpmCli(candidate)) {
      return { command: nodePath, prefix: [candidate] };
    }
  }

  throw new Error(
    'Cannot locate the npm JavaScript CLI. Install npm alongside Node.js or run this script with npm.',
  );
}
