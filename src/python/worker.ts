import { setTimeout as sleep } from 'node:timers/promises';
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

export class PythonWorker {
  private process: PythonShell | null = null;
  private timedOutProcess: PythonShell | null = null;
  private ready: boolean = false;
  private busy: boolean = false;
  private failed: boolean = false;
  private shuttingDown: boolean = false;
  private crashCount: number = 0;
  private stderrLogger = new PythonStderrLogger('Python worker stderr: ');
  private readonly maxCrashes: number = 3;
  private pendingRequest: {
    responseFile: string;
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  } | null = null;
  private requestTimeout: NodeJS.Timeout | null = null;

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
    if (this.shuttingDown) {
      throw new Error('Worker shutting down');
    }
    if (this.failed) {
      throw new Error('Worker has failed');
    }
    const wrapperPath = path.join(getWrapperDir('python'), 'persistent_wrapper.py');

    // Validate and resolve Python path using smart detection (tries python3, then python)
    const resolvedPythonPath =
      validatedPythonPath ??
      (await validatePythonPath(this.pythonPath || 'python', typeof this.pythonPath === 'string'));

    if (this.shuttingDown) {
      throw new Error('Worker shutting down');
    }

    const workerProcess = new PythonShell(wrapperPath, {
      mode: 'text',
      pythonPath: resolvedPythonPath,
      env: getProcessEnv(),
      args: [this.scriptPath, this.functionName],
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process = workerProcess;

    // Listen for READY signal
    return new Promise((resolve, reject) => {
      let becameReady = false;
      let startupError: Error | undefined;
      const readyTimeout = setTimeout(() => {
        startupError = new Error('Worker failed to become ready within timeout');
        // Retain ownership until close, including children that ignore SIGTERM.
        this.closeStreamsAfterExit(workerProcess);
        workerProcess.kill('SIGKILL');
      }, 30000);

      workerProcess.on('message', (message: string) => {
        if (message.trim() === 'READY') {
          clearTimeout(readyTimeout);
          if (startupError) {
            return;
          }
          if (this.shuttingDown || this.process !== workerProcess) {
            reject(new Error('Worker shutting down'));
            return;
          }
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

      workerProcess.on('error', (err) => {
        clearTimeout(readyTimeout);
        if (!becameReady && !startupError) {
          startupError = err;
          this.closeStreamsAfterExit(workerProcess);
          workerProcess.kill('SIGKILL');
        }
      });

      workerProcess.childProcess.once('close', () => {
        clearTimeout(readyTimeout);
        this.flushStderr();
        if (this.process !== workerProcess) {
          return;
        }
        this.process = null;
        const timedOut = this.timedOutProcess === workerProcess;
        this.timedOutProcess = null;
        if (startupError) {
          reject(startupError);
        } else if (this.shuttingDown) {
          reject(new Error('Worker shutting down'));
        } else if (becameReady) {
          this.handleExit(timedOut);
        } else {
          reject(new Error('Worker exited before becoming ready'));
        }
      });

      workerProcess.stderr?.on('data', (data) => {
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

  private closeStreamsAfterExit(workerProcess: PythonShell): void {
    const child = workerProcess.childProcess;
    const closeStreams = () => {
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
    };
    // A provider subprocess can retain inherited pipes after the wrapper exits.
    // Wait for the wrapper's actual termination, then release our pipe endpoints
    // so its close event cannot depend on that subprocess's lifetime.
    if (child.exitCode !== null || child.signalCode !== null) {
      closeStreams();
    } else {
      child.once('exit', closeStreams);
      child.once('close', () => child.off('exit', closeStreams));
    }
  }

  async call(functionName: string, args: unknown[]): Promise<unknown> {
    if (!this.ready) {
      throw new Error('Worker not ready');
    }

    if (this.busy) {
      throw new Error('Worker is busy');
    }

    this.busy = true;
    const request = new AbortController();

    const execution = this.executeCall(functionName, args, request.signal);
    try {
      return await Promise.race([execution, this.createTimeout()]);
    } finally {
      request.abort();
      const pending = this.pendingRequest;
      const workerProcess = this.process;
      if (pending && workerProcess) {
        // A timed-out call still owns its child and temp files until close.
        this.pendingRequest = null;
        this.ready = false;
        this.timedOutProcess = workerProcess;
        const closed = new Promise<void>((resolve) =>
          workerProcess.childProcess.once('close', resolve),
        );
        this.closeStreamsAfterExit(workerProcess);
        workerProcess.kill('SIGKILL');
        await closed;
        pending.reject(request.signal.reason);
        await execution.catch(() => {});
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
    signal: AbortSignal,
  ): Promise<unknown> {
    const workerProcess = this.process;
    let tempDirectory: string | undefined;

    try {
      tempDirectory = await createSecureTempDirectory('promptfoo-worker-');
      const requestFile = await writeSecureTempFile(
        tempDirectory,
        'request.json',
        safeJsonStringify(args) as string,
      );
      const responseFile = await writeSecureTempFile(tempDirectory, 'response.json', '');

      // Send CALL command with function name
      // Note: PythonShell.send() adds newline automatically in 'text' mode
      // Using pipe (|) delimiter to avoid conflicts with Windows drive letters (C:)
      const command = `CALL|${functionName}|${requestFile}|${responseFile}`;
      signal.throwIfAborted();
      if (this.shuttingDown) {
        throw new Error('Worker shutting down');
      }
      if (!workerProcess || this.process !== workerProcess || !this.ready) {
        throw new Error('Worker changed while preparing request');
      }
      await new Promise<unknown>((resolve, reject) => {
        this.pendingRequest = { responseFile, resolve, reject };
        workerProcess.send(command);
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

  private createTimeout(): Promise<never> {
    return new Promise((_, reject) => {
      this.requestTimeout = setTimeout(() => {
        reject(new Error(`Python worker timed out after ${this.timeout}ms`));
      }, this.timeout);
      // Prevent timeout from keeping Node.js event loop alive
      this.requestTimeout.unref();
    });
  }

  private handleDone(responseFile: string): void {
    const normalizedResponseFile = responseFile.replace(/[\r\n]+$/, '');
    if (this.pendingRequest?.responseFile === normalizedResponseFile) {
      this.pendingRequest.resolve(undefined);
      this.pendingRequest = null;
      return;
    }
    // Either no request is in flight, or the path does not match the one we
    // dispatched. Do not record either path: the received marker is
    // provider-controlled and the pending path belongs to a private temp dir.
    logger.debug('Python worker ignored DONE marker that did not match the in-flight request', {
      hasPendingRequest: this.pendingRequest !== null,
    });
  }

  private handleExit(timedOut: boolean): void {
    this.ready = false;
    if (!timedOut) {
      this.crashCount++;
    }

    if (this.pendingRequest) {
      this.pendingRequest.reject(new Error('Worker crashed'));
      this.pendingRequest = null;
    }

    if (timedOut || this.crashCount < this.maxCrashes) {
      logger.warn(
        timedOut
          ? 'Python worker timed out, replacing worker...'
          : `Python worker crashed (${this.crashCount}/${this.maxCrashes}), restarting...`,
      );
      this.startWorker().catch((err) => {
        if (!this.shuttingDown) {
          this.markFailed(err);
        }
      });
    } else {
      this.markFailed(new Error(`Python worker crashed ${this.maxCrashes} times`));
    }
  }

  private markFailed(error: unknown): void {
    this.failed = true;
    this.ready = false;
    logger.error(`Python worker cannot restart: ${error}`);
    this.onStateChange?.();
  }

  hasFailed(): boolean {
    return this.failed;
  }

  isReady(): boolean {
    return this.ready;
  }

  isBusy(): boolean {
    return this.busy;
  }

  async shutdown(): Promise<void> {
    const needsForce = !this.ready || this.busy;
    this.shuttingDown = true;
    this.ready = false;
    if (!this.process) {
      return;
    }

    const workerProcess = this.process;
    const closed = new Promise<void>((resolve) =>
      workerProcess.childProcess.once('close', resolve),
    );
    this.closeStreamsAfterExit(workerProcess);
    const killTimeout = setTimeout(() => workerProcess.kill('SIGKILL'), 5000).unref();
    const handleShutdownError = (error: unknown) => {
      logger.error(`Error during worker shutdown: ${error}`);
      workerProcess.kill('SIGKILL');
    };
    // A startup peer can close stdin before its child close event. Stream errors
    // from send() arrive asynchronously and cannot be caught by the try/catch.
    workerProcess.childProcess.stdin?.on('error', handleShutdownError);
    try {
      if (this.pendingRequest) {
        this.pendingRequest.reject(new Error('Worker shutting down'));
        this.pendingRequest = null;
      }
      if (needsForce) {
        workerProcess.kill('SIGTERM');
      } else {
        workerProcess.send('SHUTDOWN');
      }
      await closed;
    } catch (error) {
      handleShutdownError(error);
      await closed;
    } finally {
      clearTimeout(killTimeout);
      workerProcess.childProcess.stdin?.off('error', handleShutdownError);
      if (this.process === workerProcess) {
        this.process = null;
      }
      this.busy = false;
    }
  }
}
