import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

/** npm global mode ignores project .npmrc; retain launch cwd and settings for user config. */
export function createUpdateContext(sourceEnvironment: NodeJS.ProcessEnv, projectRoot: string) {
  const runtimeBin = path.dirname(realpathSync(process.execPath));
  // Reuse the active Node installation, even in a checkout without a
  // package.json or .git marker. Never discover npm on the launch PATH.
  const env: NodeJS.ProcessEnv = {
    ...sourceEnvironment,
    PATH: [...new Set([runtimeBin, '/usr/bin', '/bin'])].join(path.delimiter),
  };
  for (const name of Object.keys(env)) {
    if (/^(?:LD_|DYLD_|NODE_OPTIONS$|NODE_PATH$|BASH_ENV$|ENV$)/i.test(name)) {
      delete env[name];
    }
  }
  return { npm: path.join(runtimeBin, 'npm'), cwd: projectRoot, env };
}

export async function runNpmUpdate(context: ReturnType<typeof createUpdateContext>): Promise<void> {
  const child = spawn(process.execPath, [context.npm, 'install', '--global', 'promptfoo@latest'], {
    cwd: context.cwd,
    env: context.env,
    // Own the process group so terminal Ctrl-C reaches npm only through forwarding.
    // Closed stdin also prevents background terminal reads from stopping the group.
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: false,
    detached: true,
  });
  let terminationSignal: NodeJS.Signals | undefined;
  const forwardSignal = (signal: NodeJS.Signals, exitCode: number) => {
    if (terminationSignal) {
      return;
    }
    terminationSignal = signal;
    process.exitCode = exitCode;
    if (child.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // The installer may have exited before signal delivery.
      }
    }
  };
  const forwardInterrupt = () => forwardSignal('SIGINT', 130);
  const forwardTermination = () => forwardSignal('SIGTERM', 143);
  process.on('SIGINT', forwardInterrupt);
  process.on('SIGTERM', forwardTermination);
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        const stoppedBy = terminationSignal ?? signal;
        if (code === 0 && !stoppedBy) {
          resolve();
        } else {
          reject(
            new Error(
              stoppedBy
                ? `Update stopped by ${stoppedBy}`
                : `Update exited with code ${code ?? 'unknown'}`,
            ),
          );
        }
      });
    });
  } finally {
    process.removeListener('SIGINT', forwardInterrupt);
    process.removeListener('SIGTERM', forwardTermination);
  }
}
