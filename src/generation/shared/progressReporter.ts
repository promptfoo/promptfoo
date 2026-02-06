import logger from '../../logger';
import { emitAssertion, emitTestCase, updateJobProgress } from './jobManager';
import type { SingleBar } from 'cli-progress';

import type { Assertion, VarMapping } from '../../types';
import type { ProgressCallback, ProgressReporterOptions } from '../types';

/**
 * Progress reporter that handles CLI progress bars, callbacks, and job updates.
 * Provides a unified interface for tracking progress across different contexts.
 */
export class ProgressReporter {
  private callback?: ProgressCallback;
  private showCli: boolean;
  private jobId?: string;
  private progressBar?: SingleBar;
  private total: number = 0;
  private current: number = 0;
  private phase: string = '';
  private initialized: boolean = false;
  private enableStreaming: boolean;
  private testCaseIndex: number = 0;
  private assertionIndex: number = 0;

  constructor(options: ProgressReporterOptions = {}) {
    this.callback = options.callback;
    this.showCli = options.showCli ?? false;
    this.jobId = options.jobId;
    this.enableStreaming = options.enableStreaming ?? true;
  }

  /**
   * Returns the job ID if set.
   */
  getJobId(): string | undefined {
    return this.jobId;
  }

  /**
   * Sets the job ID for streaming.
   */
  setJobId(jobId: string): void {
    this.jobId = jobId;
  }

  /**
   * Starts progress tracking.
   *
   * @param total - Total number of steps
   * @param phase - Description of the current phase
   */
  async start(total: number, phase: string): Promise<void> {
    this.total = total;
    this.current = 0;
    this.phase = phase;
    this.initialized = true;

    // Initialize CLI progress bar if enabled and not in debug mode
    if (this.showCli && logger.level !== 'debug') {
      const cliProgress = await import('cli-progress');
      this.progressBar = new cliProgress.SingleBar(
        {
          gracefulExit: true,
          format: `${phase} | {bar} | {percentage}% | {value}/{total}`,
        },
        cliProgress.Presets.shades_classic,
      );
      this.progressBar.start(total, 0);
    }

    // Update job progress
    if (this.jobId) {
      updateJobProgress(this.jobId, 0, total, phase);
    }

    // Call user callback
    if (this.callback) {
      this.callback(0, total, phase);
    }

    logger.debug(`Progress started: ${phase} (total: ${total})`);
  }

  /**
   * Updates progress to a specific value.
   *
   * @param current - Current progress value
   * @param phase - Optional new phase description
   */
  update(current: number, phase?: string): void {
    if (!this.initialized) {
      logger.warn('ProgressReporter.update called before start()');
      return;
    }

    this.current = current;
    if (phase) {
      this.phase = phase;
    }

    // Update CLI progress bar
    if (this.progressBar) {
      this.progressBar.update(current);
    }

    // Update job progress
    if (this.jobId) {
      updateJobProgress(this.jobId, current, this.total, this.phase);
    }

    // Call user callback
    if (this.callback) {
      this.callback(current, this.total, this.phase);
    }
  }

  /**
   * Increments progress by one.
   */
  increment(): void {
    this.update(this.current + 1);
  }

  /**
   * Increments progress by a specific amount.
   *
   * @param amount - Amount to increment by
   */
  incrementBy(amount: number): void {
    this.update(this.current + amount);
  }

  /**
   * Changes the current phase without changing progress.
   *
   * @param phase - New phase description
   */
  setPhase(phase: string): void {
    this.phase = phase;

    // Update job progress with new phase
    if (this.jobId) {
      updateJobProgress(this.jobId, this.current, this.total, phase);
    }

    // Call user callback
    if (this.callback) {
      this.callback(this.current, this.total, phase);
    }

    logger.debug(`Progress phase changed: ${phase}`);
  }

  /**
   * Stops progress tracking and cleans up.
   */
  stop(): void {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = undefined;
    }

    this.initialized = false;
    logger.debug(`Progress stopped: ${this.phase}`);
  }

  /**
   * Returns current progress info.
   */
  getProgress(): { current: number; total: number; phase: string; percentage: number } {
    return {
      current: this.current,
      total: this.total,
      phase: this.phase,
      percentage: this.total > 0 ? Math.round((this.current / this.total) * 100) : 0,
    };
  }

  /**
   * Emits a test case for SSE streaming.
   * Call this when a new test case is generated.
   *
   * @param testCase - The generated test case
   */
  emitTestCase(testCase: VarMapping): void {
    if (this.enableStreaming && this.jobId) {
      emitTestCase(this.jobId, testCase, this.testCaseIndex);
      this.testCaseIndex++;
    }
  }

  /**
   * Emits multiple test cases for SSE streaming.
   *
   * @param testCases - Array of generated test cases
   */
  emitTestCases(testCases: VarMapping[]): void {
    for (const testCase of testCases) {
      this.emitTestCase(testCase);
    }
  }

  /**
   * Emits an assertion for SSE streaming.
   * Call this when a new assertion is generated.
   *
   * @param assertion - The generated assertion
   */
  emitAssertion(assertion: Assertion): void {
    if (this.enableStreaming && this.jobId) {
      emitAssertion(this.jobId, assertion, this.assertionIndex);
      this.assertionIndex++;
    }
  }

  /**
   * Emits multiple assertions for SSE streaming.
   *
   * @param assertions - Array of generated assertions
   */
  emitAssertions(assertions: Assertion[]): void {
    for (const assertion of assertions) {
      this.emitAssertion(assertion);
    }
  }
}

/**
 * Creates a no-op progress reporter that does nothing.
 * Useful when progress tracking is not needed.
 */
export function createNoOpProgressReporter(): ProgressReporter {
  return new ProgressReporter({});
}

/**
 * Creates a progress reporter with just a callback.
 *
 * @param callback - Progress callback function
 */
export function createCallbackProgressReporter(callback: ProgressCallback): ProgressReporter {
  return new ProgressReporter({ callback });
}

/**
 * Creates a progress reporter for CLI usage.
 *
 * @param showCli - Whether to show CLI progress bar
 */
export function createCliProgressReporter(showCli: boolean = true): ProgressReporter {
  return new ProgressReporter({ showCli });
}

/**
 * Creates a progress reporter linked to a job.
 *
 * @param jobId - Job ID to update
 * @param callback - Optional additional callback
 */
export function createJobProgressReporter(
  jobId: string,
  callback?: ProgressCallback,
): ProgressReporter {
  return new ProgressReporter({ jobId, callback });
}
