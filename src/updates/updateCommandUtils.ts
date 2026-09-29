import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import semver from 'semver';

const UPDATE_ENV_KEYS = [
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NPM_CONFIG_PREFIX',
  'npm_config_prefix',
  'NPM_CONFIG_USERCONFIG',
  'npm_config_userconfig',
  'NPM_CONFIG_GLOBALCONFIG',
  'npm_config_globalconfig',
] as const;

/** Use launch settings and a private cwd; npm global mode ignores project .npmrc files. */
export function createUpdateContext(sourceEnvironment: NodeJS.ProcessEnv, projectRoot: string) {
  const env: NodeJS.ProcessEnv = {};
  for (const key of UPDATE_ENV_KEYS) {
    const value = sourceEnvironment[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env.PATH =
    (env.PATH ?? '/usr/bin:/bin')
      .split(path.delimiter)
      .filter((entry) => path.isAbsolute(entry))
      .map((entry) => path.normalize(entry))
      .filter(
        (entry) =>
          !entry.includes('/node_modules/.bin') &&
          entry !== projectRoot &&
          !entry.startsWith(`${projectRoot}/`),
      )
      .join(path.delimiter) || '/usr/bin:/bin';
  for (const key of [
    'HOME',
    'NODE_EXTRA_CA_CERTS',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NPM_CONFIG_PREFIX',
    'npm_config_prefix',
    'NPM_CONFIG_USERCONFIG',
    'npm_config_userconfig',
    'NPM_CONFIG_GLOBALCONFIG',
    'npm_config_globalconfig',
  ] as const) {
    if (env[key]) {
      env[key] = path.resolve(projectRoot, env[key]);
    }
  }
  const configuredTemp =
    sourceEnvironment.TMPDIR || sourceEnvironment.TMP || sourceEnvironment.TEMP;
  const tempRoot = configuredTemp && path.isAbsolute(configuredTemp) ? configuredTemp : '/tmp';
  const cwd = mkdtempSync(path.join(tempRoot, 'promptfoo-update-'));
  return { cwd, env, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

export async function runNpmUpdate(
  version: string,
  sourceEnvironment: NodeJS.ProcessEnv,
  projectRoot: string,
  backgroundAfterMs?: number,
): Promise<'complete' | 'background'> {
  if (version !== 'latest' && !semver.valid(version)) {
    throw new Error('Invalid update version');
  }
  const context = createUpdateContext(sourceEnvironment, projectRoot);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn('npm', ['install', '--global', `promptfoo@${version}`], {
        cwd: context.cwd,
        env: context.env,
        stdio: backgroundAfterMs === undefined ? 'inherit' : 'ignore',
        shell: false,
        detached: backgroundAfterMs !== undefined,
      });
      let settled = false;
      let finished = false;
      const timeout =
        backgroundAfterMs === undefined
          ? undefined
          : setTimeout(() => {
              settled = true;
              child.unref();
              // Keep the cwd while npm is running. A parent exit can leave this empty directory behind.
              resolve('background');
            }, backgroundAfterMs);
      const finish = (error?: Error) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeout);
        try {
          context.cleanup();
        } catch (cleanupError) {
          error ??= cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError));
        }
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
        } else {
          resolve('complete');
        }
      };
      child.once('error', finish);
      child.once('close', (code, signal) =>
        finish(
          code === 0
            ? undefined
            : new Error(
                signal
                  ? `Update stopped by ${signal}`
                  : `Update exited with code ${code ?? 'unknown'}`,
              ),
        ),
      );
    });
  } catch (error) {
    context.cleanup();
    throw error;
  }
}
