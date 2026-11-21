import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';

import { ndJsonStream } from '@agentclientprotocol/sdk';
import { onExit } from 'signal-exit';
import { isInside } from '../agentWorkspace';
import { providerRegistry } from '../providerRegistry';
import { runAcpTurn, type TurnOptions } from './session';

interface LaunchOptions extends TurnOptions {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

// libuv searches the child's cwd for bare commands on Windows. On all platforms,
// omit relative PATH entries and directories under the workspace, including symlinks.
function resolveExecutable({ command, cwd, env }: LaunchOptions): string {
  if (path.isAbsolute(command)) {
    return realpathSync(command);
  }
  const workspace = realpathSync(cwd);
  const names =
    process.platform === 'win32' && !path.extname(command)
      ? [command + '.exe', command + '.com']
      : [command];
  const directories = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter((dir) => {
    try {
      return (
        path.isAbsolute(dir) && !isInside(workspace, dir) && !isInside(workspace, realpathSync(dir))
      );
    } catch {
      return false;
    }
  });
  // Launchers with an /usr/bin/env shebang must also find a trusted interpreter.
  env.PATH = directories.join(path.delimiter);
  for (const directory of directories) {
    for (const name of names) {
      try {
        const file = realpathSync(path.join(directory, name));
        if (!isInside(workspace, file) && statSync(file).isFile()) {
          accessSync(file, constants.X_OK);
          return file;
        }
      } catch {
        // Keep searching past missing or non-executable files.
      }
    }
  }
  throw new Error(`Could not start ${command}. Install the agent on PATH or set config.command.`);
}

/** Own one agent process (and its POSIX process group) for the duration of a turn. */
export async function runAcpAgent(options: LaunchOptions) {
  providerRegistry.throwIfResourceUseAborted(options.signal);
  const group = process.platform !== 'win32';
  const child = spawn(resolveExecutable(options), options.args, {
    cwd: options.cwd,
    env: options.env,
    detached: group,
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  let groupPid = group ? child.pid : undefined;
  const killGroup = () => {
    if (groupPid) {
      try {
        process.kill(-groupPid, 'SIGKILL');
      } catch {
        // The group may be empty or inaccessible in a sandbox.
      }
      groupPid = undefined;
    }
  };
  // Workers with independent stdio can outlive a launcher that exits normally.
  child.once('exit', killGroup);
  const terminate = () => {
    killGroup();
    child.kill('SIGKILL');
    child.stdout.destroy();
  };
  const unregister = onExit(terminate);
  const resource = {
    shutdown() {
      terminate();
      return closed;
    },
  };
  providerRegistry.register(resource);
  try {
    await once(child, 'spawn');
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    return await runAcpTurn(stream, options);
  } finally {
    child.stdin.end();
    const timer = setTimeout(terminate, 500);
    try {
      await closed;
    } finally {
      clearTimeout(timer);
      providerRegistry.unregister(resource);
      unregister();
    }
  }
}
