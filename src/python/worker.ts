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

export class PythonWorker {
  private process: PythonShell | null = null;
  private ready: boolean = false;
  private busy: boolean = false;
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
    private onReady?: () => void,
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

    this.process = new PythonShell(wrapperPath, {
      mode: 'text',
      pythonPath: resolvedPythonPath,
      args: [this.scriptPath, this.functionName],
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Listen for READY signal
    return new Promise((resolve, reject) => {
      const readyTimeout = setTimeout(() => {
        // Kill the process to prevent orphaned Python processes
        // and avoid triggering handleCrash() which would retry
        this.shuttingDown = true;
        if (this.process) {
          this.process.kill('SIGTERM');
          this.process = null;
        }
        reject(new Error('Worker failed to become ready within timeout'));
      }, 30000);

      this.process!.on('message', (message: string) => {
        if (message.trim() === 'READY') {
          clearTimeout(readyTimeout);
          this.ready = true;
          logger.debug(`Python worker ready for ${this.scriptPath}`);
          // Notify pool that worker is ready (triggers queue processing)
          if (this.onReady) {
            this.onReady();
          }
          resolve();
        } else if (message.startsWith('DONE|')) {
          this.handleDone(message.slice('DONE|'.length));
        }
      });

      this.process!.on('error', (err) => {
        clearTimeout(readyTimeout);
        reject(err);
      });

      this.process!.on('close', () => {
        this.flushStderr();
        if (!this.shuttingDown) {
          this.handleCrash();
        }
      });

      this.process!.stderr?.on('data', (data) => {
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
    if (!this.ready) {
      throw new Error('Worker not ready');
    }

    if (this.busy) {
      throw new Error('Worker is busy');
    }

    this.busy = true;

    try {
      return await Promise.race([this.executeCall(functionName, args), this.createTimeout()]);
    } finally {
      this.busy = false;
      if (this.requestTimeout) {
        clearTimeout(this.requestTimeout);
        this.requestTimeout = null;
      }
    }
  }

  private async executeCall(functionName: string, args: unknown[]): Promise<unknown> {
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
      this.process!.send(command);

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

  private handleCrash(): void {
    this.ready = false;
    this.crashCount++;

    if (this.pendingRequest) {
      this.pendingRequest.reject(new Error('Worker crashed'));
      this.pendingRequest = null;
    }

    if (this.crashCount < this.maxCrashes) {
      logger.warn(`Python worker crashed (${this.crashCount}/${this.maxCrashes}), restarting...`);
      this.startWorker().catch((err) => {
        logger.error(`Failed to restart worker: ${err}`);
      });
    } else {
      logger.error(`Python worker crashed ${this.maxCrashes} times, marking as dead`);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  isBusy(): boolean {
    return this.busy;
  }

  async shutdown(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      this.shuttingDown = true;

      // Reject any in-flight request promptly
      if (this.pendingRequest) {
        this.pendingRequest.reject(new Error('Worker shutting down'));
        this.pendingRequest = null;
      }

      // Note: PythonShell.send() adds newline automatically in 'text' mode
      this.process.send('SHUTDOWN');

      // Wait for exit (5s timeout)
      await Promise.race([
        new Promise<void>((resolve) => {
          this.process!.on('close', () => resolve());
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 5000).unref()),
      ]);
    } catch (error) {
      logger.error(`Error during worker shutdown: ${error}`);
    } finally {
      if (this.process) {
        this.process.kill('SIGTERM');
        this.process = null;
      }
      this.ready = false;
      this.busy = false;
      this.shuttingDown = false;
    }
  }
}
