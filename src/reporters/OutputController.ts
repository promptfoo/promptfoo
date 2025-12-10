/**
 * OutputController - Controls console output (stdout/stderr) to prevent interference with reporter display.
 *
 * IMPORTANT: This only affects console output. File logging (Winston file transports) writes
 * directly to files, bypassing stdout/stderr entirely, and is NOT affected by this controller.
 *
 * Based on Jest's DefaultReporter __wrapStdio() pattern:
 * @see https://github.com/jestjs/jest/blob/main/packages/jest-reporters/src/DefaultReporter.ts
 */
export class OutputController {
  private originalStdoutWrite: typeof process.stdout.write | null = null;
  private originalStderrWrite: typeof process.stderr.write | null = null;
  private stdoutBuffer: string[] = [];
  private stderrBuffer: string[] = [];
  private isCapturing: boolean = false;
  private flushTimeout: NodeJS.Timeout | null = null;
  private readonly FLUSH_DEBOUNCE_MS = 100;

  // When true, suppresses auto-flush - output is only flushed on demand
  private suppressAutoFlush: boolean = false;

  // Callbacks for clearing/reprinting status during flush
  private clearStatusCallback: (() => void) | null = null;
  private reprintStatusCallback: (() => void) | null = null;

  /**
   * Set callbacks for status management during flush
   */
  setStatusCallbacks(clearStatus: (() => void) | null, reprintStatus: (() => void) | null): void {
    this.clearStatusCallback = clearStatus;
    this.reprintStatusCallback = reprintStatus;
  }

  /**
   * Set whether to suppress auto-flush.
   * When true, buffered output will only be flushed on demand via getBufferedOutput() or forceFlush().
   */
  setSuppressAutoFlush(suppress: boolean): void {
    this.suppressAutoFlush = suppress;
  }

  /**
   * Start capturing stdout/stderr (console output only).
   * File transports continue writing immediately to files.
   */
  startCapture(): void {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;
    this.stdoutBuffer = [];
    this.stderrBuffer = [];

    // Save original write methods
    this.originalStdoutWrite = process.stdout.write.bind(process.stdout);
    this.originalStderrWrite = process.stderr.write.bind(process.stderr);

    // Replace stdout.write with buffering version
    process.stdout.write = ((
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
      callback?: (err?: Error) => void,
    ): boolean => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      this.stdoutBuffer.push(str);
      this.scheduleFlush();

      // Handle callback
      const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      if (cb) {
        cb();
      }
      return true;
    }) as typeof process.stdout.write;

    // Replace stderr.write - flush immediately unless suppressed
    process.stderr.write = ((
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
      callback?: (err?: Error) => void,
    ): boolean => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString();
      this.stderrBuffer.push(str);
      // Flush stderr immediately unless auto-flush is suppressed
      if (!this.suppressAutoFlush) {
        this.flushStderr();
      }

      // Handle callback
      const cb = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
      if (cb) {
        cb();
      }
      return true;
    }) as typeof process.stderr.write;
  }

  /**
   * Stop capturing and restore original streams.
   */
  stopCapture(): void {
    if (!this.isCapturing) {
      return;
    }

    // Force flush any remaining buffered output
    this.forceFlush();

    // Clear any pending flush timeout
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    // Restore original write methods
    if (this.originalStdoutWrite) {
      process.stdout.write = this.originalStdoutWrite;
      this.originalStdoutWrite = null;
    }
    if (this.originalStderrWrite) {
      process.stderr.write = this.originalStderrWrite;
      this.originalStderrWrite = null;
    }

    this.isCapturing = false;
  }

  /**
   * Schedule a debounced flush of stdout buffer.
   */
  private scheduleFlush(): void {
    if (this.suppressAutoFlush) {
      return; // Auto-flush is suppressed
    }

    if (this.flushTimeout) {
      return; // Already scheduled
    }

    this.flushTimeout = setTimeout(() => {
      this.flushTimeout = null;
      this.flushStdout();
    }, this.FLUSH_DEBOUNCE_MS);
  }

  /**
   * Flush buffered stdout output.
   */
  private flushStdout(): void {
    if (this.stdoutBuffer.length === 0 || !this.originalStdoutWrite) {
      return;
    }

    // Clear status before writing buffered content
    this.clearStatusCallback?.();

    // Write buffered content
    const content = this.stdoutBuffer.join('');
    this.stdoutBuffer = [];
    this.originalStdoutWrite(content);

    // Reprint status after writing
    this.reprintStatusCallback?.();
  }

  /**
   * Flush buffered stderr output immediately.
   */
  private flushStderr(): void {
    if (this.stderrBuffer.length === 0 || !this.originalStderrWrite) {
      return;
    }

    // Clear status before writing buffered content
    this.clearStatusCallback?.();

    // Write buffered content
    const content = this.stderrBuffer.join('');
    this.stderrBuffer = [];
    this.originalStderrWrite(content);

    // Reprint status after writing
    this.reprintStatusCallback?.();
  }

  /**
   * Force immediate flush of all buffered output.
   */
  forceFlush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    this.flushStdout();
    this.flushStderr();
  }

  /**
   * Write directly to stdout (bypasses buffer).
   * Used by reporter for its own output.
   */
  writeToStdout(data: string): void {
    if (this.originalStdoutWrite) {
      this.originalStdoutWrite(data);
    } else {
      process.stdout.write(data);
    }
  }

  /**
   * Write directly to stderr (bypasses buffer).
   */
  writeToStderr(data: string): void {
    if (this.originalStderrWrite) {
      this.originalStderrWrite(data);
    } else {
      process.stderr.write(data);
    }
  }

  /**
   * Get and clear buffered output.
   * Returns combined stdout and stderr content, then clears the buffers.
   */
  getBufferedOutput(): string {
    const stdout = this.stdoutBuffer.join('');
    const stderr = this.stderrBuffer.join('');
    this.stdoutBuffer = [];
    this.stderrBuffer = [];

    // Combine stderr and stdout, with stderr taking precedence for visibility
    const combined = stderr + stdout;
    return combined.trim();
  }

  /**
   * Check if there is any buffered output.
   */
  hasBufferedOutput(): boolean {
    return this.stdoutBuffer.length > 0 || this.stderrBuffer.length > 0;
  }

  /**
   * Check if currently capturing output.
   */
  isActive(): boolean {
    return this.isCapturing;
  }
}
