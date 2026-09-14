import fs from 'fs/promises';
import path from 'path';

import { PythonShell } from 'python-shell';
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
  private pendingRequest: {
    responseFile: string;
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  } | null = null;
  private requestTimeout: NodeJS.Timeout | null = null;

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

  async initialize(): Promise<void> {
    return this.startWorker();
  }

  private async startWorker(): Promise<void> {
    const wrapperPath = path.join(getWrapperDir('python'), 'persistent_wrapper.py');

    // Validate and resolve Python path using smart detection (tries python3, then python)
    const resolvedPythonPath = await validatePythonPath(
      this.pythonPath || 'python',
      typeof this.pythonPath === 'string',
    );

    // shutdown() may have run while the Python path was being validated.
    if (this.shuttingDown) {
      throw new Error('Worker shutting down');
    }

    const pythonProcess = new PythonShell(wrapperPath, {
      mode: 'text',
      pythonPath: resolvedPythonPath,
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
    pythonProcess.stdin?.on('error', (err) => {
      logger.debug(`Python worker stdin error: ${err}`);
    });

    // Listen for READY signal
    return new Promise((resolve, reject) => {
      let becameReady = false;
      let closed = false;

      const readyTimeout = setTimeout(() => {
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
        clearTimeout(readyTimeout);
        if (becameReady) {
          logger.error(`Python worker process error: ${err}`);
          return;
        }
        // A spawn failure (for example a missing interpreter) emits 'error' without 'close'.
        if (this.process === pythonProcess) {
          this.process = null;
        }
        closed = true;
        markClosed();
        reject(err);
      });

      const handleClose = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearTimeout(readyTimeout);
        this.flushStderr();
        markClosed();
        // stopProcess() and shutdown() detach a process before ending it, so only the
        // current process closing on its own is a crash.
        const crashed = this.process === pythonProcess;
        if (crashed) {
          this.process = null;
        }

        if (!becameReady) {
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
        setTimeout(() => {
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
    // Bind the request to this process: if it crashes, times out, or is shut down, the
    // request must never be sent to a replacement.
    const pythonProcess = this.process;

    try {
      return await Promise.race([
        this.executeCall(functionName, args, pythonProcess),
        this.createTimeout(pythonProcess),
      ]);
    } finally {
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
      if (this.process !== pythonProcess) {
        if (this.shuttingDown) {
          throw new Error('Worker shutting down');
        }
        throw new Error(
          hasExited(pythonProcess)
            ? `Worker crashed (${describeExit(pythonProcess)})`
            : 'Worker crashed',
        );
      }

      // Send CALL command with function name
      // Note: PythonShell.send() adds newline automatically in 'text' mode
      // Using pipe (|) delimiter to avoid conflicts with Windows drive letters (C:)
      const command = `CALL|${functionName}|${requestFile}|${responseFile}`;
      pythonProcess.send(command);

      // Wait for DONE
      await new Promise<unknown>((resolve, reject) => {
        this.pendingRequest = { responseFile, resolve, reject };
      });

      // Read response with exponential backoff retry.
      // Python verifies file readability before sending DONE, but OS-level delays may still occur.
      let responseData: string | undefined;
      let lastError: unknown;

      // Exponential backoff: 1ms, 2ms, 4ms, 8ms, 16ms, 32ms, 64ms, 128ms, 256ms, 512ms, 1024ms, 2048ms, 4096ms, 5000ms (capped)...
      // Total max wait: ~18 seconds (handles severe filesystem delays)
      for (let attempt = 0, delay = 1; attempt < 16; attempt++, delay = Math.min(delay * 2, 5000)) {
        try {
          responseData = await fs.readFile(responseFile, 'utf-8');
          if (attempt > 0) {
            logger.debug(`Response file read succeeded on attempt ${attempt + 1}`);
          }
          break;
        } catch (error: unknown) {
          lastError = error;
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            // File doesn't exist yet, wait and retry with exponential backoff.
            await new Promise((resolve) => setTimeout(resolve, delay));
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
        const error = new Error(`Python worker timed out after ${this.timeout}ms`);
        reject(error);
        // The Python function is still running, so the next request would wait behind it.
        // Replace the process this request was sent to, unless a crash already replaced it
        // or the worker is shutting down or dead.
        if (this.process === pythonProcess && !this.shuttingDown && !this.dead) {
          this.rejectPendingRequest(error);
          this.replaceTimedOutProcess(pythonProcess);
        }
      }, this.timeout);
      // Prevent timeout from keeping Node.js event loop alive
      this.requestTimeout.unref();
    });
  }

  /** A timeout is not a crash, so it does not count toward maxCrashes. */
  private replaceTimedOutProcess(pythonProcess: PythonShell): void {
    logger.warn(`Python worker timed out after ${this.timeout}ms, restarting ${this.scriptPath}`);
    // Wait for the old process to exit before starting its replacement, so both don't
    // hold resources such as a loaded model at the same time.
    void this.stopProcess(pythonProcess).then(() => {
      if (!this.shuttingDown && !this.dead) {
        this.restart();
      }
    });
  }

  /**
   * Detaches a process from this worker and ends it. Closing stdin lets an idle wrapper
   * exit. SIGINT interrupts a running call by raising KeyboardInterrupt, so the script's
   * `finally` blocks and context managers still run and can clean up anything it started,
   * such as subprocesses. SIGKILL follows if it still hasn't exited.
   * Resolves once the process has exited and its output has been handled.
   */
  private async stopProcess(pythonProcess: PythonShell): Promise<void> {
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
      pythonProcess.kill('SIGINT');
    }

    await closed;
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
      // Python finished the call, so the timeout no longer applies (reading the response
      // file has its own bounded retry) and earlier crashes were not a crash loop.
      if (this.requestTimeout) {
        clearTimeout(this.requestTimeout);
        this.requestTimeout = null;
      }
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
  isDead(): boolean {
    return this.dead;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.ready = false;
    const callInFlight = this.busy;
    // Reject any in-flight request promptly
    this.rejectPendingRequest(new Error('Worker shutting down'));

    // Detach the process so its close event is not treated as a crash.
    const pythonProcess = this.process;
    this.process = null;
    if (!pythonProcess) {
      this.busy = false;
      return;
    }

    try {
      // An idle wrapper exits on SHUTDOWN. One running a call won't read it until the call
      // finishes, so stop that process straight away instead.
      if (!callInFlight) {
        // Note: PythonShell.send() adds newline automatically in 'text' mode
        pythonProcess.send('SHUTDOWN');

        // Wait for exit (5s timeout)
        await Promise.race([
          this.processClosed.get(pythonProcess),
          new Promise<void>((resolve) => setTimeout(resolve, 5000).unref()),
        ]);
      }
    } catch (error) {
      logger.error(`Error during worker shutdown: ${error}`);
    } finally {
      // Force-stops the process if it is still running; resolves at once if it already exited.
      await this.stopProcess(pythonProcess);
      this.busy = false;
    }
  }
}
