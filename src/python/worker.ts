import fs from 'fs';
import os from 'os';
import path from 'path';

import { PythonShell } from 'python-shell';
import { getWrapperDir } from '../esm';
import logger from '../logger';
import { REQUEST_TIMEOUT_MS } from '../providers/shared';
import { safeJsonStringify } from '../util/json';
import { validatePythonPath } from './pythonUtils';

export class PythonWorker {
  private process: PythonShell | null = null;
  private ready: boolean = false;
  private busy: boolean = false;
  private shuttingDown: boolean = false;
  private crashCount: number = 0;
  private readonly maxCrashes: number = 3;
  private pendingRequest: {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  } | null = null;
  private requestTimeout: NodeJS.Timeout | null = null;

  constructor(
    private scriptPath: string,
    private functionName: string,
    private pythonPath?: string,
    private timeout: number = REQUEST_TIMEOUT_MS,
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
        } else if (message.startsWith('DONE')) {
          this.handleDone();
        }
      });

      this.process!.on('error', (err) => {
        clearTimeout(readyTimeout);
        reject(err);
      });

      this.process!.on('close', () => {
        if (!this.shuttingDown) {
          this.handleCrash();
        }
      });

      this.process!.stderr?.on('data', (data) => {
        logger.error(`Python worker stderr: ${data.toString()}`);
      });
    });
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
    const requestFile = path.join(
      os.tmpdir(),
      `promptfoo-worker-req-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    const responseFile = path.join(
      os.tmpdir(),
      `promptfoo-worker-resp-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );

    try {
      // Write request
      fs.writeFileSync(requestFile, safeJsonStringify(args) as string, 'utf-8');

      // Send CALL command with function name
      // Note: PythonShell.send() adds newline automatically in 'text' mode
      // Using pipe (|) delimiter to avoid conflicts with Windows drive letters (C:)
      const command = `CALL|${functionName}|${requestFile}|${responseFile}`;
      this.process!.send(command);

      // Wait for DONE
      await new Promise<unknown>((resolve, reject) => {
        this.pendingRequest = { resolve, reject };
      });

      // Read response with exponential backoff retry
      // Python verifies file readability before sending DONE, but OS-level delays may still occur
      let responseData: string;
      let lastError: unknown;

      // Exponential backoff: 1ms, 2ms, 4ms, 8ms, 16ms, 32ms, 64ms, 128ms, 256ms, 512ms, 1024ms, 2048ms, 4096ms, 5000ms (capped)...
      // Total max wait: ~18 seconds (handles severe filesystem delays)
      for (let attempt = 0, delay = 1; attempt < 16; attempt++, delay = Math.min(delay * 2, 5000)) {
        try {
          responseData = fs.readFileSync(responseFile, 'utf-8');
          if (attempt > 0) {
            logger.debug(`Response file read succeeded on attempt ${attempt + 1} after ${delay}ms`);
          }
          break;
        } catch (error: unknown) {
          lastError = error;
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            // File doesn't exist yet, wait and retry with exponential backoff
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          // Non-ENOENT error, don't retry
          throw error;
        }
      }

      // If we exhausted all retries, throw with debugging info
      if (!responseData!) {
        const tempDir = path.dirname(responseFile);
        try {
          const files = fs.readdirSync(tempDir).filter((f) => f.startsWith('promptfoo-worker-'));
          logger.error(
            `Failed to read response file after 16 attempts (~18s). Expected: ${path.basename(responseFile)}, Found in ${tempDir}: ${files.join(', ')}`,
          );
        } catch {
          logger.error(`Failed to read response file: ${responseFile}`);
        }
        throw lastError;
      }

      const response = JSON.parse(responseData!);

      if (response.type === 'error') {
        throw new Error(`Python error: ${response.error}\n${response.traceback || ''}`);
      }

      return response.data;
    } finally {
      // Cleanup temp files
      [requestFile, responseFile].forEach((file) => {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        } catch (error) {
          logger.error(`Error removing ${file}: ${error}`);
        }
      });
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

  private handleDone(): void {
    if (this.pendingRequest) {
      this.pendingRequest.resolve(undefined);
      this.pendingRequest = null;
    }
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
