import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platformEnv = Object.fromEntries(
  ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL']
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);

export function isolatedEnv(stateDir) {
  return {
    ...platformEnv,
    NODE_PATH: '',
    IS_TESTING: 'false',
    PROMPTFOO_CONFIG_DIR: path.join(stateDir, 'config'),
    PROMPTFOO_CACHE_PATH: path.join(stateDir, 'cache'),
    PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: 'true',
    PROMPTFOO_TRACING_ENABLED: 'false',
    PROMPTFOO_ENABLE_OTEL: 'false',
    TMPDIR: path.join(stateDir, 'tmp'),
    TEMP: path.join(stateDir, 'tmp'),
    TMP: path.join(stateDir, 'tmp'),
  };
}

class TerminationError extends Error {
  constructor(pid, cause) {
    super(`Could not confirm termination of fixture process tree ${pid}`, { cause });
  }
}

function killNativeTree(pid, fallback = false) {
  const options = { stdio: 'pipe', timeout: 5_000, env: platformEnv };
  if (process.platform === 'win32') {
    execFileSync(
      path.join(process.env.SystemRoot || process.env.WINDIR, 'System32', 'taskkill.exe'),
      ['/pid', String(pid), '/t', '/f'],
      options,
    );
  } else if (fallback) {
    // Retry from a separate process if the first signal attempt failed.
    execFileSync(
      process.execPath,
      ['-e', 'process.kill(-Number(process.argv[1]), "SIGKILL")', String(pid)],
      options,
    );
  } else {
    process.kill(-pid, 'SIGKILL');
  }
}

async function runChild(fixturePath, stateDir, { label, timeoutMs, args, env }) {
  const child = spawn(process.execPath, [fixturePath, '--child', stateDir, ...args], {
    cwd: path.dirname(fixturePath),
    env: { ...isolatedEnv(stateDir), ...(typeof env === 'function' ? env(stateDir) : env) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  let timedOut = false;
  let timer;
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (timedOut) {
          reject(new Error(`Installed ${label} check timed out after ${timeoutMs}ms`));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Installed ${label} check failed (${signal ?? code})`));
        }
      });
      timer = setTimeout(() => {
        timedOut = true;
        try {
          // Terminate the complete owned tree, including any stalled evaluation process.
          killNativeTree(child.pid);
        } catch (firstError) {
          if (firstError.code === 'ESRCH') {
            return;
          }
          try {
            killNativeTree(child.pid, true);
          } catch (secondError) {
            // If the OS refuses both attempts, do not unlink a database that may still
            // be open. Report the PID and retain state for diagnosis instead of hiding it.
            // Settle first: the best-effort kill can synchronously emit an error event.
            reject(
              new TerminationError(
                child.pid,
                new AggregateError([firstError, secondError], 'Fixture tree termination failed'),
              ),
            );
            try {
              child.kill('SIGKILL');
            } catch {
              /* Best effort direct-child fallback. */
            }
            child.stdout.destroy();
            child.stderr.destroy();
            child.unref();
          }
        }
      }, timeoutMs);
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function runIsolated(
  fixtureUrl,
  { label, args = [], env = {}, directories = [], timeoutMs = 45_000 },
) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), `promptfoo-artifact-${label}-`));
  let safeToRemove = true;
  try {
    for (const directory of ['config', 'cache', 'tmp', ...directories]) {
      fs.mkdirSync(path.join(stateDir, directory), { recursive: true });
    }
    await runChild(fileURLToPath(fixtureUrl), stateDir, { label, timeoutMs, args, env });
  } catch (error) {
    if (error instanceof TerminationError) {
      safeToRemove = false;
      console.error(`Retained ${label} state after termination failure: ${stateDir}`);
    }
    throw error;
  } finally {
    if (safeToRemove) {
      fs.rmSync(stateDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}
