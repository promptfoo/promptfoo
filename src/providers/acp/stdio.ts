import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Readable, Writable } from 'node:stream';

import { ndJsonStream, type Stream } from '@agentclientprotocol/sdk';
import { onExit } from 'signal-exit';
import { providerRegistry } from '../providerRegistry';

interface LaunchOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

/** Own one agent process (and its POSIX process group) for the duration of a turn. */
export async function withAcpStdio<T>(
  options: LaunchOptions,
  use: (stream: Stream) => Promise<T>,
): Promise<T> {
  providerRegistry.throwIfResourceUseAborted();
  const group = process.platform !== 'win32';
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    detached: group,
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  const terminate = () => {
    // Launchers can leave workers holding the stdio pipes after the parent exits.
    if (group && child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Sandboxed processes may only have permission to signal a direct child.
        child.kill('SIGKILL');
      }
    } else {
      child.kill('SIGKILL');
    }
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
    return await use(stream);
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
