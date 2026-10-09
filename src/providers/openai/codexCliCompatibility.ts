import { type ChildProcess, execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import semver from 'semver';

const CODEX_SDK_PACKAGE = '@openai/codex-sdk';
const CODEX_CLI_PACKAGE = '@openai/codex';
const CODEX_SDK_DOCS_URL = 'https://www.promptfoo.dev/docs/providers/openai-codex-sdk/';
const CODEX_VERSION_PATTERN =
  /\bcodex-cli(?:-exec)?\s+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)/;
const VERSION_PROBE_TIMEOUT_MS = 10_000;
const VERSION_PROBE_MAX_OUTPUT_BYTES = 1024 * 1024;
const VERSION_PROBE_MAX_STATUS_BYTES = 8 * 1024;

// Keep this program self-contained: both bundled library formats execute the
// same text without relying on a separately emitted file or serialized closure.
// Its private stdin/status pipes are never inherited by the requested CLI.
const VERSION_PROBE_SUPERVISOR = `
const { writeSync } = require('node:fs');
let stopping = false;
const finish = (result) => {
  if (stopping) return;
  stopping = true;
  try {
    writeSync(3, JSON.stringify(result));
  } catch {
    // The owning process may already have closed its end of the status pipe.
  } finally {
    process.kill(-process.pid, 'SIGKILL');
  }
};
process.stdin.once('end', () => finish({ error: 'Codex CLI version check owner disconnected' }));
process.stdin.once('error', () => finish({ error: 'Codex CLI version check owner channel failed' }));
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const timeout = () => finish({ error: 'Codex CLI version check timed out after ${VERSION_PROBE_TIMEOUT_MS}ms' });
let deadline = setTimeout(timeout, ${VERSION_PROBE_TIMEOUT_MS});
createInterface({ input: process.stdin }).once('line', (line) => {
  let options;
  try {
    options = JSON.parse(line);
  } catch {
    return finish({ error: 'Codex CLI version check initialization failed' });
  }
  // process.ppid is a startup snapshot, so check the known owner as well as EOF.
  try {
    process.kill(options.ownerPid, 0);
  } catch {
    return finish({ error: 'Codex CLI version check owner exited before initialization' });
  }
  if (Date.now() >= options.deadlineAt) return timeout();
  clearTimeout(deadline);
  deadline = setTimeout(timeout, options.deadlineAt - Date.now());
  try {
    const { NODE_CHANNEL_FD, NODE_CHANNEL_SERIALIZATION_MODE, ...env } = options.env;
    const child = spawn(options.command, ['exec', '--experimental-json', '--version'], {
      env,
      stdio: ['ignore', 1, 2],
    });
    child.once('error', () => finish({ error: 'Could not start Codex CLI version command' }));
    child.once('exit', (code, signal) => finish({ code, signal }));
  } catch {
    // Spawn/JSON diagnostics can include environment values. Keep these private.
    finish({ error: 'Could not start Codex CLI version command' });
  }
});
`;

export class CodexCliCompatibilityError extends Error {
  override name = 'CodexCliCompatibilityError';
}

interface CodexSdkManifest {
  name?: string;
  dependencies?: Record<string, string>;
}

function getSupportedCliVersion(sdkEntryPoint: string): string {
  let directory = path.dirname(sdkEntryPoint);

  while (true) {
    const manifestPath = path.join(directory, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CodexSdkManifest;
      if (manifest.name === CODEX_SDK_PACKAGE) {
        const version = manifest.dependencies?.[CODEX_CLI_PACKAGE];
        if (!version || !semver.valid(version)) {
          throw new Error(
            `${CODEX_SDK_PACKAGE} does not declare an exact ${CODEX_CLI_PACKAGE} version`,
          );
        }
        return version;
      }
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(`Could not find ${CODEX_SDK_PACKAGE}/package.json for ${sdkEntryPoint}`);
    }
    directory = parent;
  }
}

interface CompatibilityOptions {
  sdkEntryPoint: string;
  codexPathOverride: string;
  env: Record<string, string>;
  signal?: AbortSignal;
}

/** Stop the trusted supervisor, or the direct Windows CLI process tree. */
async function terminateProbe(child: ChildProcess): Promise<void> {
  if (process.platform !== 'win32') {
    // EOF also reaches the supervisor when an embedding worker is killed. It
    // remains the sole group-signal sender during ordinary probe termination.
    child.stdin?.end();
    return;
  }
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    execFile(
      'taskkill',
      ['/pid', String(pid), '/t', '/f'],
      { windowsHide: true, timeout: 1_000, killSignal: 'SIGKILL' },
      (error) => {
        if (error && child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          reject(error);
        } else {
          resolve();
        }
      },
    );
  });
}

interface ProbeExit {
  code: number | null;
  signal: string | null;
}

function parseProbeStatus(status: string): ProbeExit | { error: string } {
  const result: unknown = JSON.parse(status);
  if (result && typeof result === 'object') {
    const keys = Object.keys(result);
    if (
      keys.length === 1 &&
      'error' in result &&
      typeof result.error === 'string' &&
      result.error.length > 0
    ) {
      return { error: result.error };
    }
    if (
      keys.length === 2 &&
      'code' in result &&
      'signal' in result &&
      ((typeof result.code === 'number' &&
        Number.isInteger(result.code) &&
        result.code >= 0 &&
        result.code <= 255 &&
        result.signal === null) ||
        (result.code === null && typeof result.signal === 'string' && result.signal.length > 0))
    ) {
      return { code: result.code as number | null, signal: result.signal as string | null };
    }
  }
  throw new Error('Invalid Codex CLI version check status');
}

function runVersionProbe(options: CompatibilityOptions): Promise<string> {
  options.signal?.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const deadlineAt = Date.now() + VERSION_PROBE_TIMEOUT_MS;
    const supervised = process.platform !== 'win32';
    let initialization: string | undefined;
    if (supervised) {
      try {
        initialization = `${JSON.stringify({
          command: options.codexPathOverride,
          env: options.env,
          ownerPid: process.pid,
          deadlineAt,
        })}\n`;
      } catch {
        throw new Error('Codex CLI version check initialization failed');
      }
    }
    const child = supervised
      ? spawn(process.execPath, ['--input-type=commonjs', '--eval', VERSION_PROBE_SUPERVISOR], {
          // Caller-provided runtime/preload hooks belong only to the CLI.
          env: {},
          detached: true,
          stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
        })
      : spawn(options.codexPathOverride, ['exec', '--experimental-json', '--version'], {
          env: options.env,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failure: Error | undefined;
    let termination: Promise<void> | undefined;
    let commandExit: ProbeExit | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      termination ??= terminateProbe(child)
        .catch((cleanupError: unknown) => {
          failure = cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError));
        })
        .finally(() => {
          child.stdout?.destroy();
          child.stderr?.destroy();
        });
    };
    const timeout = setTimeout(
      () => {
        stop(new Error(`Codex CLI version check timed out after ${VERSION_PROBE_TIMEOUT_MS}ms`));
      },
      Math.max(0, deadlineAt - Date.now()),
    );
    const onAbort = () => stop(new DOMException('Codex compatibility check aborted', 'AbortError'));
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > VERSION_PROBE_MAX_OUTPUT_BYTES) {
        stop(new Error('Codex CLI version stdout exceeded the maximum buffer length'));
      } else if (!failure) {
        stdout.push(chunk);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > VERSION_PROBE_MAX_OUTPUT_BYTES) {
        stop(new Error('Codex CLI version stderr exceeded the maximum buffer length'));
      } else if (!failure) {
        stderr.push(chunk);
      }
    });
    child.once('error', stop);
    child.stdin?.on('error', () => stop(new Error('Codex CLI version check owner channel failed')));
    if (supervised) {
      const statusPipe = child.stdio[3];
      const status: Buffer[] = [];
      let statusBytes = 0;
      let statusRead = false;
      const invalidStatus = () => {
        if (statusRead) {
          return;
        }
        statusRead = true;
        failure ??= new Error('Codex CLI version supervisor exited without a valid command status');
        // A missing status means the supervisor died before its own cleanup.
        // Kill only this still-owned group before waiting on descendant-held pipes.
        termination = Promise.resolve()
          .then(() => {
            if (child.pid !== undefined) {
              try {
                process.kill(-child.pid, 'SIGKILL');
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
                  throw error;
                }
              }
            }
          })
          .catch((error: unknown) => {
            failure =
              error instanceof Error ? error : new Error('Codex version probe cleanup failed');
          })
          .finally(() => {
            child.stdout?.destroy();
            child.stderr?.destroy();
          });
      };
      statusPipe?.on('data', (chunk: Buffer) => {
        statusBytes += chunk.length;
        if (statusBytes > VERSION_PROBE_MAX_STATUS_BYTES) {
          stop(new Error('Codex CLI version check status exceeded the maximum buffer length'));
        } else {
          status.push(chunk);
        }
      });
      statusPipe?.once('error', invalidStatus);
      statusPipe?.once('end', () => {
        if (statusRead) {
          return;
        }
        try {
          if (statusBytes > VERSION_PROBE_MAX_STATUS_BYTES) {
            throw new Error('Oversized status');
          }
          const result = parseProbeStatus(Buffer.concat(status).toString('utf8'));
          statusRead = true;
          if ('error' in result) {
            failure ??= new Error(result.error);
          } else {
            commandExit = result;
          }
        } catch {
          // Never reflect a malformed frame or its JSON parser diagnostic.
          invalidStatus();
        }
      });
      child.stdin?.write(initialization!);
    }
    child.once('close', async (code, signal) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      try {
        await (termination ?? (supervised ? undefined : terminateProbe(child)));
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
      const exit = supervised ? commandExit : { code, signal };
      if (failure) {
        reject(failure);
      } else if (exit?.code === 0) {
        resolve(
          `${Buffer.concat(stdout).toString('utf8')}\n${Buffer.concat(stderr).toString('utf8')}`,
        );
      } else {
        reject(
          new Error(
            `Codex CLI version check exited with ${exit?.signal ?? exit?.code ?? 'no command status'}: ${Buffer.concat(stderr).toString('utf8')}`,
          ),
        );
      }
    });
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
    }
  });
}

async function runCompatibilityCheck(options: CompatibilityOptions): Promise<void> {
  let supportedVersion: string;
  try {
    supportedVersion = getSupportedCliVersion(options.sdkEntryPoint);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CodexCliCompatibilityError(
      `Could not verify Codex CLI compatibility for ${options.codexPathOverride}: ${message}. For more information, see: ${CODEX_SDK_DOCS_URL}`,
    );
  }
  let output: string;

  try {
    output = await runVersionProbe(options);
  } catch (error) {
    if (options.signal?.aborted) {
      throw new DOMException('Codex compatibility check aborted', 'AbortError');
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CodexCliCompatibilityError(
      `Could not verify Codex CLI compatibility for ${options.codexPathOverride}: ${message}. For more information, see: ${CODEX_SDK_DOCS_URL}`,
    );
  }

  const version = CODEX_VERSION_PATTERN.exec(output)?.[1];
  if (!version || !semver.valid(version) || semver.compareBuild(version, supportedVersion) !== 0) {
    throw new CodexCliCompatibilityError(
      `${CODEX_SDK_PACKAGE} supports Codex CLI/event schema ${supportedVersion}, but ${options.codexPathOverride} reports ${version ?? 'an unknown version'}. For more information, see: ${CODEX_SDK_DOCS_URL}`,
    );
  }
}

export function checkCodexCliCompatibility(options: CompatibilityOptions): Promise<void> {
  // The environment may contain arbitrary credentials. Do not derive a
  // process-lifetime cache key from it; probing each turn also detects PATH
  // replacements and wrapper changes reliably.
  return runCompatibilityCheck(options);
}
