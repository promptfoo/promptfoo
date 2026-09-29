import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

import semver from 'semver';

/** npm global mode ignores project .npmrc; retain launch cwd and settings for user config. */
export function createUpdateContext(sourceEnvironment: NodeJS.ProcessEnv, projectRoot: string) {
  const root = realpathSync(projectRoot);
  const runtimeBin = realpathSync(path.dirname(process.execPath));
  const entries = (sourceEnvironment.PATH ?? '/usr/bin:/bin').split(path.delimiter);
  const trustedPaths = entries.flatMap((entry) => {
    if (!path.isAbsolute(entry) || entry.includes('/node_modules/.bin')) {
      return [];
    }
    try {
      const canonical = realpathSync(entry);
      if (canonical.includes('/node_modules/.bin')) {
        return [];
      }
      const insideProject =
        canonical === root ||
        canonical.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
      return canonical === runtimeBin || !insideProject ? [canonical] : [];
    } catch {
      return [];
    }
  });
  if (!trustedPaths.length) {
    throw new Error('No trusted npm executable directory found in the launch PATH.');
  }
  return {
    cwd: projectRoot,
    env: { ...sourceEnvironment, PATH: [...new Set(trustedPaths)].join(path.delimiter) },
  };
}

export async function runNpmUpdate(
  version: string,
  sourceEnvironment: NodeJS.ProcessEnv,
  projectRoot: string,
): Promise<void> {
  if (version !== 'latest' && !semver.valid(version)) {
    throw new Error('Invalid update version');
  }
  const context = createUpdateContext(sourceEnvironment, projectRoot);
  const child = spawn('npm', ['install', '--global', `promptfoo@${version}`], {
    ...context,
    stdio: 'inherit',
    shell: false,
    detached: false,
  });
  let terminationSignal: NodeJS.Signals | undefined;
  const forwardInterrupt = () => {
    terminationSignal = 'SIGINT';
    process.exitCode = 130;
    child.kill('SIGINT');
  };
  const forwardTermination = () => {
    terminationSignal = 'SIGTERM';
    process.exitCode = 143;
    child.kill('SIGTERM');
  };
  process.once('SIGINT', forwardInterrupt);
  process.once('SIGTERM', forwardTermination);
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
