import { setTimeout as sleep } from 'node:timers/promises';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

import { PythonShell } from 'python-shell';
import { getProcessEnv } from '../envars';
import { getWrapperDir } from '../esm';
import logger from '../logger';
import { getRequestTimeoutMs } from '../providers/shared';
import { safeJsonStringify } from '../util/json';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../util/secureTempFiles';
import { validatePythonPath } from './pythonUtils';
import { PythonStderrLogger } from './stderr';

export { MAX_STDERR_BUFFER_LENGTH } from './stderr';

/** How long a stopped Python process gets to exit after SIGINT before it is killed. */
const STOP_GRACE_MS = 2000;

/**
 * How long to wait for stdout and stderr to end after the Python process exits. A
 * subprocess started by the script can inherit them and keep them open indefinitely.
 */
const STDIO_DRAIN_MS = 1000;

function hasExited(pythonProcess: PythonShell): boolean {
  const { exitCode, signalCode } = pythonProcess.childProcess;
  return exitCode !== null || signalCode !== null;
}

function describeExit(pythonProcess: PythonShell): string {
  return pythonProcess.exitSignal
    ? `signal ${pythonProcess.exitSignal}`
    : `exit code ${pythonProcess.exitCode ?? 'unknown'}`;
}

export class PythonWorker {
  private process: PythonShell | null = null;
  private ready: boolean = false;
  private busy: boolean = false;
  private dead: boolean = false;
  /** Set by shutdown() and never cleared, so nothing can restart a shut-down worker. */
  private shuttingDown: boolean = false;
  /** Crashes and failed restarts since the last completed request. */
  private crashCount: number = 0;
  private stderrLogger = new PythonStderrLogger('Python worker stderr: ');
  private readonly maxCrashes: number = 3;
  /** Settles once a process has exited and its output has been handled. */
  private readonly processClosed = new WeakMap<PythonShell, Promise<void>>();
  /** Stops still in progress, including a timed-out process being replaced. */
  private readonly pendingStops = new Set<Promise<void>>();
  private pendingRequest: {
    responseFile: string;
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  } | null = null;
  private requestTimeout: NodeJS.Timeout | null = null;
  private shutdownPromise: Promise<void> | null = null;

  /**
   * @param onStateChange Called when the worker becomes ready or permanently dead, so a
   * pool can dispatch queued requests or fail them instead of waiting forever.
   */
  constructor(
    private scriptPath: string,
    private functionName: string,
    private pythonPath?: string,
    private timeout: number = getRequestTimeoutMs(),
    private onStateChange?: () => void,
  ) {}

  async initialize(validatedPythonPath?: string): Promise<void> {
    return this.startWorker(validatedPythonPath);
  }

  private async startWorker(validatedPythonPath?: string): Promise<void> {
    if (this.shuttingDown || this.dead) {
      throw new Error(this.shuttingDown ? 'Worker shutting down' : 'Worker has failed');
    }
    const wrapperPath = path.join(getWrapperDir('python'), 'persistent_wrapper.py');

    // Validate and resolve Python path using smart detection (tries python3, then python)
    const resolvedPythonPath =
      validatedPythonPath ??
      (await validatePythonPath(this.pythonPath || 'python', typeof this.pythonPath === 'string'));

    // shutdown() may have run while the Python path was being validated.
    if (this.shuttingDown) {
      throw new Error('Worker shutting down');
    }

    const pythonProcess = new PythonShell(wrapperPath, {
      mode: 'text',
      pythonPath: resolvedPythonPath,
      env: getProcessEnv(),
      args: [this.scriptPath, this.functionName],
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = pythonProcess;
    let markClosed: () => void = () => {};
    this.processClosed.set(
      pythonProcess,
      new Promise<void>((resolve) => {
        markClosed = resolve;
      }),
    );

    // Writing to a process that has already exited fails with EPIPE on stdin. Its exit is
    // handled by the close event, so don't let the stream error escape as uncaught.
    const onStdinError = (err: Error) => {
      logger.debug(`Python worker stdin error: ${err}`);
      if (this.shuttingDown) {
        void this.stopProcess(pythonProcess);
      }
    };
    pythonProcess.stdin?.on('error', onStdinError);

    // Listen for READY signal
    return new Promise((resolve, reject) => {
      let becameReady = false;
      let closed = false;
      let startupError: Error | undefined;
      let drainTimer: NodeJS.Timeout | undefined;

      const readyTimeout = setTimeout(() => {
        startupError = new Error('Worker failed to become ready within timeout');
        // Stop the process so it isn't orphaned, and fail this start only once it has
        // exited so a retry doesn't overlap with it. stopProcess detaches it first, so
        // its close is not treated as a crash.
        void this.stopProcess(pythonProcess).then(() =>
          reject(new Error('Worker failed to become ready within timeout')),
        );
      }, 30000);

      pythonProcess.on('message', (message: string) => {
        if (message.trim() === 'READY') {
          if (this.process !== pythonProcess) {
            return; // Stopped before it finished starting
          }
          clearTimeout(readyTimeout);
          becameReady = true;
          this.ready = true;
          logger.debug(`Python worker ready for ${this.scriptPath}`);
          // Notify pool that worker is ready (triggers queue processing)
          this.onStateChange?.();
          resolve();
        } else if (message.startsWith('DONE|')) {
          this.handleDone(message.slice('DONE|'.length));
        }
      });

      pythonProcess.on('error', (err) => {
        if (startupError) {
          return;
        }
        clearTimeout(readyTimeout);
        if (becameReady) {
          logger.error(`Python worker process error: ${err}`);
          return;
        }
        startupError = err;
        if (pythonProcess.childProcess.pid === undefined) {
          if (this.process === pythonProcess) {
            this.process = null;
          }
          closed = true;
          markClosed();
          reject(err);
        } else {
          void this.stopProcess(pythonProcess).then(() => reject(err));
        }
      });

      const handleClose = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearTimeout(readyTimeout);
        clearTimeout(drainTimer);
        pythonProcess.stdin?.off('error', onStdinError);
        this.flushStderr();
        markClosed();
        // stopProcess() and shutdown() detach a process before ending it, so only the
        // current process closing on its own is a crash.
        const crashed = this.process === pythonProcess;
        if (crashed) {
          this.process = null;
        }

        if (!becameReady) {
          if (startupError) {
            reject(startupError);
            return;
          }
          // The script exited before signalling READY, typically an import error. Fail
          // this start now rather than at the ready timeout. The Python traceback has
          // already been logged from stderr. A process stopped on purpose is failed by
          // whoever stopped it.
          if (crashed) {
            reject(
              new Error(
                `Python worker exited before becoming ready (${describeExit(pythonProcess)})`,
              ),
            );
          } else if (this.shuttingDown) {
            reject(new Error('Worker shutting down'));
          }
          return;
        }

        if (crashed) {
          this.handleCrash(pythonProcess);
        }
      };

      pythonProcess.on('close', handleClose);
      // python-shell emits 'close' only after stdout and stderr end. A subprocess started by
      // the script can inherit them and keep them open after Python exits, which would
      // otherwise hide a crash or stall a restart indefinitely.
      pythonProcess.childProcess.once('exit', () => {
        // Stop dispatching to a process that has already exited, even while its output
        // streams drain; requests queue for the restarted process instead.
        if (this.process === pythonProcess) {
          this.ready = false;
        }
        drainTimer = setTimeout(() => {
          if (!closed) {
            pythonProcess.stdout?.destroy();
            pythonProcess.stderr?.destroy();
            handleClose();
          }
        }, STDIO_DRAIN_MS).unref();
      });

      pythonProcess.stderr?.on('data', (data) => {
        this.handleStderr(data);
      });
    });
  }

  private handleStderr(data: Buffer | string): void {
    this.stderrLogger.handleData(data);
  }

  private flushStderr(): void {
    this.stderrLogger.flush();
  }

  async call(functionName: string, args: unknown[]): Promise<unknown> {
    if (this.shuttingDown) {
      throw new Error('Worker shutting down');
    }

    if (!this.ready || !this.process) {
      throw new Error('Worker not ready');
    }

    if (this.busy) {
      throw new Error('Worker is busy');
    }

    this.busy = true;
    const pythonProcess = this.process;
    const request = new AbortController();
    const execution = this.executeCall(functionName, args, pythonProcess, request.signal);
    try {
      return await Promise.race([execution, this.createTimeout(pythonProcess)]);
    } finally {
      request.abort();
      const pending = this.pendingRequest;
      const replace =
        pending !== null && this.process === pythonProcess && !hasExited(pythonProcess);
      if (replace) {
        // Keep the request's files until the process can no longer write them.
        this.pendingRequest = null;
        await this.stopProcess(pythonProcess);
        if (!this.shuttingDown && !this.dead) {
          this.restart();
        }
        pending.reject(request.signal.reason);
      }
      await Promise.all(this.pendingStops);
      if (pending) {
        await execution.catch(() => {});
      } else {
        void execution.catch(() => {});
      }
      this.busy = false;
      if (this.requestTimeout) {
        clearTimeout(this.requestTimeout);
        this.requestTimeout = null;
      }
    }
  }

  private async executeCall(
    functionName: string,
    args: unknown[],
    pythonProcess: PythonShell,
    signal: AbortSignal,
  ): Promise<unknown> {
    let tempDirectory: string | undefined;

    try {
      tempDirectory = await createSecureTempDirectory('promptfoo-worker-');
      const requestFile = await writeSecureTempFile(
        tempDirectory,
        'request.json',
        safeJsonStringify(args) as string,
      );
      const responseFile = await writeSecureTempFile(tempDirectory, 'response.json', '');

      // The process may have crashed, timed out, or been shut down while the request
      // files were being written.
      signal.throwIfAborted();
      if (this.process !== pythonProcess || !this.ready || hasExited(pythonProcess)) {
        if (this.shuttingDown) {
          throw new Error('Worker shutting down');
        }
        throw new Error(
          hasExited(pythonProcess)
            ? `Worker crashed (${describeExit(pythonProcess)})`
            : 'Worker changed while preparing request',
        );
      }

      // Send CALL command with function name
      // Note: PythonShell.send() adds newline automatically in 'text' mode
      // Using pipe (|) delimiter to avoid conflicts with Windows drive letters (C:)
      const command = `CALL|${functionName}|${requestFile}|${responseFile}`;
      await new Promise<unknown>((resolve, reject) => {
        this.pendingRequest = { responseFile, resolve, reject };
        pythonProcess.send(command);
      });

      // Read response with exponential backoff retry.
      // Python verifies file readability before sending DONE, but OS-level delays may still occur.
      let responseData: string | undefined;
      let lastError: unknown;

      // Exponential backoff: 1ms, 2ms, 4ms, 8ms, 16ms, 32ms, 64ms, 128ms, 256ms, 512ms, 1024ms, 2048ms, 4096ms, 5000ms (capped)...
      // Total max wait: ~18 seconds (handles severe filesystem delays)
      for (let attempt = 0, delay = 1; attempt < 16; attempt++, delay = Math.min(delay * 2, 5000)) {
        try {
          responseData = await fs.readFile(responseFile, { encoding: 'utf-8', signal });
          if (attempt > 0) {
            logger.debug(`Response file read succeeded on attempt ${attempt + 1}`);
          }
          break;
        } catch (error: unknown) {
          lastError = error;
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            // File doesn't exist yet, wait and retry with exponential backoff.
            await sleep(delay, undefined, { signal });
            continue;
          }
          // Non-ENOENT error, don't retry.
          throw error;
        }
      }

      // If we exhausted all retries, throw with debugging info
      if (!responseData) {
        try {
          const files = await fs.readdir(tempDirectory);
          logger.error(
            `Failed to read response file after 16 attempts (~18s). Expected: ${path.basename(responseFile)}, Found in temporary directory: ${files.join(', ')}`,
          );
        } catch {
          logger.error(
            `Failed to read Python worker response file: ${path.basename(responseFile)}`,
          );
        }
        throw lastError instanceof Error
          ? lastError
          : new Error('Python worker response file was empty after completion signal');
      }

      const response = JSON.parse(responseData);

      if (response.type === 'error') {
        throw new Error(`Python error: ${response.error}\n${response.traceback || ''}`);
      }

      return response.data;
    } finally {
      if (tempDirectory) {
        try {
          await removeSecureTempDirectory(tempDirectory);
        } catch (error) {
          logger.error(`Error removing temporary Python worker directory: ${error}`);
        }
      }
    }
  }

  private createTimeout(pythonProcess: PythonShell): Promise<never> {
    return new Promise((_, reject) => {
      this.requestTimeout = setTimeout(() => {
        this.requestTimeout = null;
        if (this.process === pythonProcess && hasExited(pythonProcess)) {
          // The process exited without answering: a crash whose close handling hasn't run
          // yet, for example while a subprocess holds its output streams open. Report it as
          // a crash and leave it to that handling, which counts it toward maxCrashes.
          reject(new Error(`Worker crashed (${describeExit(pythonProcess)})`));
          return;
        }
        const error = new Error(`Python worker timed out after ${this.timeout}ms`);
        reject(error);
      }, this.timeout);
      // Prevent timeout from keeping Node.js event loop alive
      this.requestTimeout.unref();
    });
  }

  /**
   * Detaches a process from this worker and ends it.
   *
   * On POSIX, closing stdin lets an idle wrapper exit and SIGINT interrupts a running call by
   * raising KeyboardInterrupt, so the script's `finally` blocks and context managers still run
   * and can clean up anything it started, such as subprocesses. SIGKILL follows if it still
   * hasn't exited. Windows has no equivalent interrupt: `ChildProcess.kill()` terminates the
   * process outright whatever signal is named, so the script can't clean up. Kill the process
   * tree there instead, otherwise its children are orphaned.
   *
   * Resolves once the process has exited and its output has been handled.
   */
  private stopProcess(pythonProcess: PythonShell): Promise<void> {
    const stop = this.endProcess(pythonProcess).finally(() => this.pendingStops.delete(stop));
    this.pendingStops.add(stop);
    return stop;
  }

  private async endProcess(pythonProcess: PythonShell): Promise<void> {
    if (this.process === pythonProcess) {
      this.process = null;
      this.ready = false;
    }
    const closed = this.processClosed.get(pythonProcess) ?? Promise.resolve();

    if (!hasExited(pythonProcess)) {
      const forceKill = setTimeout(() => {
        if (!hasExited(pythonProcess)) {
          logger.warn(`Python worker did not exit after SIGINT, killing ${this.scriptPath}`);
          pythonProcess.kill('SIGKILL');
        }
      }, STOP_GRACE_MS);
      forceKill.unref();
      void closed.then(() => clearTimeout(forceKill));

      pythonProcess.stdin?.end();
      if (process.platform === 'win32') {
        clearTimeout(forceKill);
        this.killProcessTree(pythonProcess);
      } else {
        pythonProcess.kill('SIGINT');
      }
    }

    await closed;
    pythonProcess.stdin?.destroy();
  }

  /**
   * Windows only: terminates the process and its descendants, which is the closest available
   * equivalent to letting a script stop what it started.
   */
  private killProcessTree(pythonProcess: PythonShell): void {
    const pid = pythonProcess.childProcess.pid;
    if (pid === undefined) {
      pythonProcess.kill('SIGKILL');
      return;
    }

    execFile('taskkill', ['/pid', String(pid), '/t', '/f'], { timeout: STOP_GRACE_MS }, (error) => {
      if (error && !hasExited(pythonProcess)) {
        logger.warn(`Python worker taskkill failed for ${this.scriptPath}: ${error}`);
        pythonProcess.kill('SIGKILL');
      }
    });
  }

  private rejectPendingRequest(error: Error): void {
    if (this.pendingRequest) {
      this.pendingRequest.reject(error);
      this.pendingRequest = null;
    }
  }

  private handleDone(responseFile: string): void {
    const normalizedResponseFile = responseFile.replace(/[\r\n]+$/, '');
    if (this.pendingRequest?.responseFile === normalizedResponseFile) {
      this.pendingRequest.resolve(undefined);
      this.pendingRequest = null;
      // A completed call resets the crash streak; its response-file read keeps the deadline.
      this.crashCount = 0;
      return;
    }
    // Either no request is in flight, or the path does not match the one we
    // dispatched. Do not record either path: the received marker is
    // provider-controlled and the pending path belongs to a private temp dir.
    logger.debug('Python worker ignored DONE marker that did not match the in-flight request', {
      hasPendingRequest: this.pendingRequest !== null,
    });
  }

  private handleCrash(pythonProcess: PythonShell): void {
    this.ready = false;
    this.crashCount++;
    const exit = describeExit(pythonProcess);
    this.rejectPendingRequest(new Error(`Worker crashed (${exit})`));

    if (this.crashCount < this.maxCrashes) {
      logger.warn(
        `Python worker crashed with ${exit} (${this.crashCount}/${this.maxCrashes}), restarting...`,
      );
      this.restart();
    } else {
      this.markDead(`Python worker crashed ${this.maxCrashes} times in a row, marking as dead`);
    }
  }

  private restart(): void {
    this.startWorker().catch((err) => {
      if (this.shuttingDown || this.dead) {
        return;
      }
      // A failed restart counts like a crash, so a transient startup failure is retried
      // instead of disabling the worker for the rest of the run.
      this.crashCount++;
      if (this.crashCount < this.maxCrashes) {
        logger.warn(
          `Python worker failed to restart (${this.crashCount}/${this.maxCrashes}), retrying: ${err}`,
        );
        this.restart();
      } else {
        this.markDead(
          `Python worker failed to restart ${this.maxCrashes} times in a row, marking as dead: ${err}`,
        );
      }
    });
  }

  private markDead(message: string): void {
    logger.error(message);
    this.dead = true;
    this.ready = false;
    this.rejectPendingRequest(new Error('Worker crashed and could not be restarted'));
    // Let the pool fail queued requests instead of waiting for a worker that won't return.
    this.onStateChange?.();
  }

  isReady(): boolean {
    return this.ready;
  }

  isBusy(): boolean {
    return this.busy;
  }

  /** True once the worker has given up restarting and will never serve requests again. */
  hasFailed(): boolean {
    return this.dead;
  }

  async shutdown(): Promise<void> {
    this.shutdownPromise ??= this.shutdownWorker();
    return this.shutdownPromise;
  }

  private async shutdownWorker(): Promise<void> {
    const wasBusy = this.busy;
    const wasReady = this.ready;
    this.shuttingDown = true;
    this.ready = false;
    const pythonProcess = this.process;
    this.process = null;
    if (pythonProcess) {
      try {
        if (!wasBusy && wasReady && !hasExited(pythonProcess)) {
          pythonProcess.send('SHUTDOWN');
          await Promise.race([
            this.processClosed.get(pythonProcess),
            new Promise<void>((resolve) => setTimeout(resolve, 5000).unref()),
          ]);
        }
      } catch (error) {
        logger.error(`Error during worker shutdown: ${error}`);
      } finally {
        await this.stopProcess(pythonProcess);
      }
    }
    await Promise.all(this.pendingStops);
    // Only release request temp files after Python can no longer write them.
    this.rejectPendingRequest(new Error('Worker shutting down'));
    this.busy = false;
  }
}
