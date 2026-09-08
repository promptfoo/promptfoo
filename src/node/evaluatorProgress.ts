import readline from 'readline';

import cliProgress from 'cli-progress';
import { formatVarsForDisplay } from '../evaluator/progress';
import { globalLogCallback, setLogCallback } from '../logger';
import type { SingleBar } from 'cli-progress';

import type { PromptMetrics, RunEvalOptions } from '../types/index';

/**
 * Manages a single progress bar for the evaluation
 */
export class ProgressBarManager {
  private progressBar: SingleBar | undefined;
  private isWebUI: boolean;
  private originalLogCallback: ((message: string) => void) | null = null;
  private installedLogCallback: ((message: string) => void) | null = null;
  private pendingRender: ReturnType<typeof setImmediate> | null = null;

  // Track overall progress
  private totalCount: number = 0;
  private completedCount: number = 0;
  private concurrency: number = 1;

  constructor(isWebUI: boolean) {
    this.isWebUI = isWebUI;
  }

  private clearProgressBarLine(): void {
    readline.cursorTo(process.stderr, 0);
    readline.clearLine(process.stderr, 0);
  }

  private scheduleRender(): void {
    if (!this.progressBar || this.pendingRender) {
      return;
    }

    this.pendingRender = setImmediate(() => {
      this.pendingRender = null;
      // biome-ignore lint/suspicious/noExplicitAny: cli-progress SingleBar.render() is not in public typings
      (this.progressBar as any)?.render();
    });
  }

  private handleLogMessage(): void {
    if (!this.progressBar) {
      return;
    }

    // Clear the progress bar's stream before Winston writes to the terminal,
    // then re-render the bar after the log line has been emitted.
    this.clearProgressBarLine();
    this.scheduleRender();
  }

  /**
   * Coordinate console logging with the progress bar to prevent visual corruption.
   */
  installLogInterceptor(): void {
    if (!this.progressBar || this.isWebUI || this.installedLogCallback) {
      return;
    }

    this.originalLogCallback = globalLogCallback;
    this.installedLogCallback = (message: string) => {
      this.originalLogCallback?.(message);
      this.handleLogMessage();
    };
    setLogCallback(this.installedLogCallback);
  }

  /**
   * Remove the log interceptor and restore original logger callback behavior.
   */
  removeLogInterceptor(): void {
    if (this.pendingRender) {
      clearImmediate(this.pendingRender);
      this.pendingRender = null;
    }

    if (this.installedLogCallback && globalLogCallback === this.installedLogCallback) {
      setLogCallback(this.originalLogCallback);
    }

    this.installedLogCallback = null;
    this.originalLogCallback = null;
  }

  /**
   * Initialize progress bar
   */
  async initialize(
    runEvalOptions: RunEvalOptions[],
    concurrency: number,
    compareRowsCount: number,
  ): Promise<void> {
    if (this.isWebUI) {
      return;
    }

    this.totalCount = runEvalOptions.length + compareRowsCount;
    this.concurrency = concurrency;

    // Create single progress bar
    this.progressBar = new cliProgress.SingleBar(
      {
        format: (options, params, payload) => {
          const barsize = options.barsize ?? 40;
          const barCompleteString = options.barCompleteString ?? '=';
          const barIncompleteString = options.barIncompleteString ?? '-';

          const bar = barCompleteString.substring(0, Math.round(params.progress * barsize));
          const spaces = barIncompleteString.substring(0, barsize - bar.length);
          const percentage = Math.round(params.progress * 100);

          // Only show errors if count > 0
          const errorsText = payload.errors > 0 ? ` (errors: ${payload.errors})` : '';

          return `Evaluating [${bar}${spaces}] ${percentage}% | ${params.value}/${params.total}${errorsText} | ${payload.provider} ${payload.prompt} ${payload.vars}`;
        },
        hideCursor: true,
        gracefulExit: true,
        stream: process.stderr,
      },
      cliProgress.Presets.shades_classic,
    );

    // Start the progress bar
    this.progressBar.start(this.totalCount, 0, {
      provider: '',
      prompt: '',
      vars: '',
      errors: 0,
    });
  }

  /**
   * Update progress for a specific evaluation
   */
  updateProgress(
    _index: number,
    evalStep: RunEvalOptions | undefined,
    _phase: 'serial' | 'concurrent' = 'concurrent',
    metrics?: PromptMetrics,
  ): void {
    if (this.isWebUI || !evalStep || !this.progressBar) {
      return;
    }

    this.completedCount++;
    const provider = evalStep.provider.label || evalStep.provider.id();
    const prompt = `"${evalStep.prompt.raw.slice(0, 10).replace(/\n/g, ' ')}"`;
    const vars = formatVarsForDisplay(evalStep.test.vars, 40);

    this.progressBar.increment({
      provider,
      prompt: prompt || '""',
      vars: vars || '',
      errors: metrics?.testErrorCount ?? 0,
    });
  }

  /**
   * Update comparison progress
   */
  updateComparisonProgress(prompt: string): void {
    if (this.isWebUI || !this.progressBar) {
      return;
    }

    this.completedCount++;
    this.progressBar.increment({
      provider: 'Grading',
      prompt: `"${prompt.slice(0, 10).replace(/\n/g, ' ')}"`,
      vars: '',
      errors: 0,
    });
  }

  /**
   * Update total count when comparison count is determined
   */
  updateTotalCount(additionalCount: number): void {
    if (this.isWebUI || !this.progressBar || additionalCount <= 0) {
      return;
    }

    this.totalCount += additionalCount;
    this.progressBar.setTotal(this.totalCount);
  }

  /**
   * Mark evaluation as complete
   */
  complete(): void {
    if (this.isWebUI || !this.progressBar) {
      return;
    }

    // Just ensure we're at 100% - the bar will be stopped in stop()
    this.progressBar.update(this.totalCount);
  }

  /**
   * Stop the progress bar
   */
  stop(): void {
    if (this.progressBar) {
      this.progressBar.stop();
    }
  }
}
