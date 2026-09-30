import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const platformEnv = Object.fromEntries(
  [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'LANG',
    'LC_ALL',
    'LD_LIBRARY_PATH',
  ]
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

class CancellationError extends Error {
  constructor(label, signal) {
    super(`Installed ${label} check cancelled (${signal})`);
    this.signal = signal;
  }
}

function processTable() {
  return execFileSync('ps', ['-A', '-o', 'pid=', '-o', 'ppid=', '-o', 'stat='], {
    encoding: 'utf8',
    env: platformEnv,
    timeout: 1_000,
  })
    .trim()
    .split('\n')
    .map((line) => {
      const [pid, parent, state] = line.trim().split(/\s+/);
      return { pid: Number(pid), parent: Number(parent), state };
    });
}

function ownedProcesses(pid) {
  const table = processTable();
  const owned = [pid];
  for (const parent of owned) {
    owned.push(...table.filter((entry) => entry.parent === parent).map((entry) => entry.pid));
  }
  return owned;
}

function killNativeTree(pid, owned, fallback = false) {
  const options = { stdio: 'pipe', timeout: 5_000, env: platformEnv };
  const targets = owned.toReversed().flatMap((target) => [-target, target]);
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
      [
        '-e',
        `for (const pid of JSON.parse(process.argv[1])) {
          try { process.kill(pid, 'SIGKILL'); }
          catch (error) { if (error.code !== 'ESRCH') throw error; }
        }`,
        JSON.stringify(targets),
      ],
      options,
    );
  } else {
    // Browsers may create their own process groups. Record descendants before
    // killing their parent so reparenting cannot hide them from this cleanup.
    for (const target of targets) {
      try {
        process.kill(target, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') {
          throw error;
        }
      }
    }
  }
}

async function terminateTree(pid) {
  let owned;
  try {
    owned = process.platform === 'win32' ? [] : ownedProcesses(pid);
    killNativeTree(pid, owned);
  } catch (firstError) {
    try {
      owned ??= process.platform === 'win32' ? [] : ownedProcesses(pid);
      killNativeTree(pid, owned, true);
    } catch (secondError) {
      throw new TerminationError(
        pid,
        new AggregateError([firstError, secondError], 'Fixture tree termination failed'),
      );
    }
  }
  if (process.platform !== 'win32') {
    const deadline = Date.now() + 2_000;
    try {
      while (
        processTable().some((entry) => owned.includes(entry.pid) && !entry.state.startsWith('Z'))
      ) {
        if (Date.now() >= deadline) {
          throw new Error('Fixture descendants did not exit after termination');
        }
        await delay(20);
      }
    } catch (error) {
      throw new TerminationError(pid, error);
    }
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
  let failure;
  let termination;
  let timer;
  const onSignal = (signal) => stop(new CancellationError(label, signal));
  let stop;
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', async (code, signal) => {
        await termination;
        if (failure) {
          reject(failure);
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Installed ${label} check failed (${signal ?? code})`));
        }
      });
      stop = (error) => {
        if (termination) {
          return;
        }
        failure = error;
        termination = terminateTree(child.pid).catch((error) => {
          // If the OS refuses both attempts, do not unlink a database that may still
          // be open. Report the PID and retain state for diagnosis instead of hiding it.
          // Settle first: the best-effort kill can synchronously emit an error event.
          reject(error);
          try {
            child.kill('SIGKILL');
          } catch {
            /* Best effort direct-child fallback. */
          }
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
        });
      };
      for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, onSignal);
      }
      timer = setTimeout(
        () => stop(new Error(`Installed ${label} check timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
  } finally {
    clearTimeout(timer);
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.removeListener(signal, onSignal);
    }
  }
}

export async function runIsolated(
  fixtureUrl,
  { label, args = [], env = {}, directories = [], timeoutMs = 45_000 },
) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), `promptfoo-artifact-${label}-`));
  let safeToRemove = true;
  let cancellationSignal;
  try {
    for (const directory of ['config', 'cache', 'tmp', ...directories]) {
      fs.mkdirSync(path.join(stateDir, directory), { recursive: true });
    }
    await runChild(fileURLToPath(fixtureUrl), stateDir, { label, timeoutMs, args, env });
  } catch (error) {
    if (error instanceof CancellationError) {
      cancellationSignal = error.signal;
    }
    if (error instanceof TerminationError) {
      safeToRemove = false;
      console.error(`Retained ${label} state after termination failure: ${stateDir}`);
    }
    throw error;
  } finally {
    if (safeToRemove) {
      fs.rmSync(stateDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
    if (cancellationSignal) {
      // Preserve cancellation only after owned processes and state are gone.
      process.kill(process.pid, cancellationSignal);
      await new Promise(() => {});
    }
  }
}
