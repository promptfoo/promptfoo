import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// Preserve the caller's heap limit without forwarding loaders or other injected code.
const heapLimit = [
  ...(process.env.NODE_OPTIONS ?? '').matchAll(
    /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)([1-9]\d*)(?=\s|$)/g,
  ),
].at(-1)?.[1];
if (heapLimit) {
  platformEnv.NODE_OPTIONS = `--max-old-space-size=${heapLimit}`;
}

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
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), '--fixture-child', fixturePath, stateDir, ...args],
    {
      cwd: path.dirname(fixturePath),
      env: { ...isolatedEnv(stateDir), ...(typeof env === 'function' ? env(stateDir) : env) },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      detached: process.platform !== 'win32',
    },
  );
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  let failure;
  let termination;
  let timer;
  const onSignal = (signal) => stop(new CancellationError(label, signal));
  let stop;
  try {
    await new Promise((resolve, reject) => {
      child.once('error', (error) => (child.pid ? stop(error) : reject(error)));
      child.once('exit', (code, signal) => {
        if (!termination) {
          // An unannounced exit can reparent detached descendants before we can
          // discover them. Retain state rather than claim their cleanup succeeded.
          reject(
            new TerminationError(
              child.pid,
              new Error(`Fixture exited without completion (${signal ?? code})`),
            ),
          );
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
        }
      });
      child.once('close', async () => {
        await termination;
        if (failure) {
          reject(failure);
        } else {
          resolve();
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
      child.on('message', (message) => {
        if (message?.type === 'fixture-complete' && Number.isInteger(message.code)) {
          stop(
            message.code === 0
              ? undefined
              : new Error(`Installed ${label} check failed (${message.code})`),
          );
        }
      });
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

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--fixture-child') {
  const fixturePath = process.argv[3];
  process.argv.splice(1, 3, fixturePath, '--child');
  const keepAlive = setInterval(() => {}, 1_000);
  const complete = (code) => {
    keepAlive.ref();
    process.send({ type: 'fixture-complete', code });
  };
  // Do not await here: fixtures import this module themselves. Hold the leader
  // through errors and natural completion until the supervisor kills its tree.
  import(pathToFileURL(fixturePath).href).then(
    () => {
      process.once('beforeExit', () => complete(Number(process.exitCode ?? 0)));
      keepAlive.unref();
    },
    (error) => {
      console.error(error);
      complete(1);
    },
  );
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
      // A pending Promise alone cannot keep Node alive until signal delivery.
      await new Promise(() => {
        setInterval(() => {}, 1_000);
      });
    }
  }
}
