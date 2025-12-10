/**
 * Non-interactive progress reporting utilities.
 *
 * Provides progress output for CI environments and non-TTY terminals
 * without any React/Ink dependencies.
 */

import { TextOutput } from './textOutput';

export interface ProgressUpdate {
  completed: number;
  total: number;
  currentItem?: string;
  errors?: number;
  phase?: string;
}

/**
 * Non-interactive progress reporter.
 * Outputs progress updates as plain text lines.
 */
export class NonInteractiveProgress {
  private output: TextOutput;
  private lastPercent: number = -1;
  private reportThreshold: number;
  private startTime: number;
  private label: string;

  /**
   * Create a new progress reporter.
   *
   * @param label - Label for the progress (e.g., "Evaluating")
   * @param reportThreshold - Only report when percent changes by this much (default 10)
   */
  constructor(label: string = 'Progress', reportThreshold: number = 10) {
    this.output = new TextOutput();
    this.reportThreshold = reportThreshold;
    this.startTime = Date.now();
    this.label = label;
  }

  /**
   * Start the progress tracking.
   */
  start(total: number): void {
    this.startTime = Date.now();
    this.lastPercent = -1;
    this.output.info(`${this.label}: 0/${total} (0%)`);
  }

  /**
   * Update progress.
   */
  update(update: ProgressUpdate): void {
    const { completed, total, currentItem, errors, phase } = update;
    const percent = Math.round((completed / total) * 100);

    // Only report significant changes to avoid spam
    if (percent - this.lastPercent >= this.reportThreshold || completed === total) {
      this.lastPercent = percent;

      let message = `${this.label}: ${completed}/${total} (${percent}%)`;

      if (phase) {
        message = `[${phase}] ${message}`;
      }

      if (currentItem) {
        message += ` - ${this.truncate(currentItem, 50)}`;
      }

      if (errors && errors > 0) {
        message += ` (${errors} error${errors > 1 ? 's' : ''})`;
      }

      this.output.info(message);
    }
  }

  /**
   * Complete the progress.
   */
  complete(summary?: { passed?: number; failed?: number; errors?: number }): void {
    const elapsed = Date.now() - this.startTime;
    const elapsedStr = this.formatDuration(elapsed);

    let message = `${this.label} complete in ${elapsedStr}`;

    if (summary) {
      const parts: string[] = [];
      if (summary.passed !== undefined) {
        parts.push(this.output.color(`${summary.passed} passed`, 'green'));
      }
      if (summary.failed !== undefined && summary.failed > 0) {
        parts.push(this.output.color(`${summary.failed} failed`, 'red'));
      }
      if (summary.errors !== undefined && summary.errors > 0) {
        parts.push(this.output.color(`${summary.errors} errors`, 'red'));
      }
      if (parts.length > 0) {
        message += `: ${parts.join(', ')}`;
      }
    }

    this.output.success(message);
  }

  /**
   * Report an error during progress.
   */
  error(message: string): void {
    this.output.error(message);
  }

  /**
   * Format duration in human-readable form.
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Truncate a string to a maximum length.
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str;
    }
    return str.slice(0, maxLength - 3) + '...';
  }
}

/**
 * Simple spinner replacement for non-interactive mode.
 * Just logs messages without animation.
 */
export class NonInteractiveSpinner {
  private output: TextOutput;
  private currentText: string = '';

  constructor() {
    this.output = new TextOutput();
  }

  start(text: string): void {
    this.currentText = text;
    this.output.info(text);
  }

  update(text: string): void {
    if (text !== this.currentText) {
      this.currentText = text;
      this.output.info(text);
    }
  }

  succeed(text?: string): void {
    this.output.success(text || this.currentText);
  }

  fail(text?: string): void {
    this.output.error(text || this.currentText);
  }

  stop(): void {
    // No-op in non-interactive mode
  }
}
