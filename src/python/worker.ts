import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { StringDecoder } from 'string_decoder';

import { PythonShell } from 'python-shell';
import { getWrapperDir } from '../esm';
import logger from '../logger';
import { getRequestTimeoutMs } from '../providers/shared';
import { safeJsonStringify } from '../util/json';
import { validatePythonPath } from './pythonUtils';

const MAX_STDERR_BUFFER_LENGTH = 16_384;

export class PythonWorker {
  private process: PythonShell | null = null;
  private ready: boolean = false;
  private busy: boolean = false;
  private shuttingDown: boolean = false;
  private crashCount: number = 0;
  private stderrBuffer: string = '';
  private stderrDecoder = new StringDecoder('utf8');
  private inTraceback: boolean = false;
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
    private timeout: number = getRequestTimeoutMs(),
    private onReady?: () => void,
    private envOverrides?: Record<string, string>,
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

    // python-shell expects a plain object; keep only defined env vars and apply overrides.
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') {
        env[key] = value;
      }
    }
    if (this.envOverrides) {
      for (const [key, value] of Object.entries(this.envOverrides)) {
        env[key] = value;
      }
    }

    this.process = new PythonShell(wrapperPath, {
      mode: 'text',
      pythonPath: resolvedPythonPath,
      args: [this.scriptPath, this.functionName],
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
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
    const text = typeof data === 'string' ? data : this.stderrDecoder.write(data);
    this.stderrBuffer += text;

    // A trailing bare `\r` may be the first half of a `\r\n` pair split across
    // chunks, so hold it back until the next chunk (or flush) disambiguates it.
    const carry = this.stderrBuffer.endsWith('\r') ? '\r' : '';
    const normalized = (carry ? this.stderrBuffer.slice(0, -1) : this.stderrBuffer).replace(
      /\r\n?/g,
      '\n',
    );

    const lines = normalized.split('\n');
    this.stderrBuffer = (lines.pop() ?? '') + carry;

    for (const line of lines) {
      this.logStderrLine(line);
    }

    // Bound an unterminated line so a misbehaving provider cannot grow the
    // buffer without limit. The flushed fragment is best-effort: it may be the
    // middle of a longer line and is classified on its own.
    if (this.stderrBuffer.length >= MAX_STDERR_BUFFER_LENGTH) {
      this.logStderrLine(this.stderrBuffer);
      this.stderrBuffer = '';
    }
  }

  private flushStderr(): void {
    const remaining = this.stderrBuffer + this.stderrDecoder.end();
    this.stderrBuffer = '';

    if (remaining) {
      for (const line of remaining.split(/\r\n|[\r\n]/)) {
        this.logStderrLine(line);
      }
    }

    // Reset traceback state only after the buffered lines are logged, so a
    // buffered final traceback line is still classified as an error. Refresh
    // the decoder in case the worker restarts and reuses this instance.
    this.inTraceback = false;
    this.stderrDecoder = new StringDecoder('utf8');
  }

  private logStderrLine(line: string): void {
    // Blank lines terminate any in-progress traceback.
    if (!line.trim()) {
      this.inTraceback = false;
      return;
    }

    // Inside a traceback, indented lines are always continuation frames.
    // Classify them before prefix detection so a source line such as
    // `    info = get_info()` is not mistaken for an INFO log record.
    if (this.inTraceback && /^\s/.test(line)) {
      this.writeStderrLog('error', line);
      return;
    }

    const trimmedStart = line.trimStart();

    // The traceback header opens a new traceback block.
    if (/^Traceback \(most recent call last\):/i.test(trimmedStart)) {
      this.inTraceback = true;
      this.writeStderrLog('error', line);
      return;
    }

    // An explicit Python log-level prefix wins over everything else.
    const prefixMatch = /^(DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL)\b[: ]?/i.exec(
      trimmedStart,
    );
    if (prefixMatch) {
      this.inTraceback = false;
      this.writeStderrLog(this.normalizeStderrLevel(prefixMatch[1]), line);
      return;
    }

    // A non-indented line while inside a traceback is the exception summary
    // (e.g. `ValueError: boom`) that ends the traceback.
    if (this.inTraceback) {
      this.inTraceback = false;
      this.writeStderrLog('error', line);
      return;
    }

    // Connector lines bridge chained exceptions; keep them at error level so a
    // multi-exception report reads coherently in the logs.
    if (
      /^(During handling of the above exception|The above exception was the direct cause)/i.test(
        trimmedStart,
      )
    ) {
      this.writeStderrLog('error', line);
      return;
    }

    if (trimmedStart.startsWith('[PythonProvider] OpenTelemetry tracing enabled')) {
      this.writeStderrLog('debug', line);
      return;
    }

    if (
      trimmedStart.startsWith('[PythonProvider] OpenTelemetry packages not installed') ||
      trimmedStart.startsWith('[PythonProvider] Failed to initialize tracing') ||
      trimmedStart.startsWith('[PythonProvider] Tracing error')
    ) {
      this.writeStderrLog('warn', line);
      return;
    }

    if (isPythonWarningStderr(trimmedStart)) {
      this.writeStderrLog('warn', line);
      return;
    }

    // Unclassified stderr stays visible without being treated as a failure.
    this.writeStderrLog('warn', line);
  }

  private normalizeStderrLevel(level: string): 'debug' | 'info' | 'warn' | 'error' {
    switch (level.toUpperCase()) {
      case 'DEBUG':
        return 'debug';
      case 'INFO':
        return 'info';
      case 'WARN':
      case 'WARNING':
        return 'warn';
      case 'ERROR':
      case 'CRITICAL':
      case 'FATAL':
        return 'error';
      default:
        return 'warn';
    }
  }

  private writeStderrLog(level: 'debug' | 'info' | 'warn' | 'error', line: string): void {
    const message = `Python worker stderr: ${line}`;
    logger[level](message);
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
      await fs.writeFile(requestFile, safeJsonStringify(args) as string, 'utf-8');

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
          responseData = await fs.readFile(responseFile, 'utf-8');
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
          const files = (await fs.readdir(tempDir)).filter((f) =>
            f.startsWith('promptfoo-worker-'),
          );
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
      await Promise.all(
        [requestFile, responseFile].map(async (file) => {
          try {
            await fs.unlink(file);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              logger.error(`Error removing ${file}: ${error}`);
            }
          }
        }),
      );
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

function isPythonWarningStderr(message: string): boolean {
  return (
    /\b(?:\w+Warning|Warning):/.test(message) || message.trimStart().startsWith('warnings.warn(')
  );
}
