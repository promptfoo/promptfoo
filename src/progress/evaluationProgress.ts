import readline from 'readline';

import cliProgress from 'cli-progress';
import logger, { globalLogCallback, setLogCallback } from '../logger';
import type { SingleBar } from 'cli-progress';

import type { CIProgressReporter } from './ciProgressReporter';

type ProgressStep = {
  provider: { id(): string; label?: string };
  prompt: { raw: string };
  test: { vars?: Record<string, unknown> };
};

export class ProgressBarManager {
  private progressBar: SingleBar | undefined;
  private isWebUI: boolean;
  private originalLogCallback: ((message: string) => void) | null = null;
  private installedLogCallback: ((message: string) => void) | null = null;
  private pendingRender: ReturnType<typeof setImmediate> | null = null;

  private totalCount: number = 0;

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

  async initialize(
    runEvalOptions: readonly unknown[],
    _concurrency: number,
    compareRowsCount: number,
  ): Promise<void> {
    if (this.isWebUI) {
      return;
    }

    this.totalCount = runEvalOptions.length + compareRowsCount;

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

    this.progressBar.start(this.totalCount, 0, {
      provider: '',
      prompt: '',
      vars: '',
      errors: 0,
    });
  }

  updateProgress(
    _index: number,
    evalStep: ProgressStep | undefined,
    _phase: 'serial' | 'concurrent' = 'concurrent',
    metrics?: { testErrorCount: number },
  ): void {
    if (this.isWebUI || !evalStep || !this.progressBar) {
      return;
    }

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

  updateComparisonProgress(prompt: string): void {
    if (this.isWebUI || !this.progressBar) {
      return;
    }

    this.progressBar.increment({
      provider: 'Grading',
      prompt: `"${prompt.slice(0, 10).replace(/\n/g, ' ')}"`,
      vars: '',
      errors: 0,
    });
  }

  updateTotalCount(additionalCount: number): void {
    if (this.isWebUI || !this.progressBar || additionalCount <= 0) {
      return;
    }

    this.totalCount += additionalCount;
    this.progressBar.setTotal(this.totalCount);
  }

  complete(): void {
    if (this.isWebUI || !this.progressBar) {
      return;
    }

    // Just ensure we're at 100% - the bar will be stopped in stop()
    this.progressBar.update(this.totalCount);
  }

  stop(): void {
    if (this.progressBar) {
      this.progressBar.stop();
    }
  }
}

/** Limit variable previews and tolerate values that cannot be converted to strings. */
export function formatVarsForDisplay(
  vars: Record<string, unknown> | undefined,
  maxLength: number,
): string {
  if (!vars || Object.keys(vars).length === 0) {
    return '';
  }

  try {
    const formatted = Object.entries(vars)
      .map(([key, value]) => {
        // Prevent memory issues by limiting individual values first
        const valueStr = String(value).slice(0, 100);
        return `${key}=${valueStr}`;
      })
      .join(' ')
      .replace(/\n/g, ' ')
      .slice(0, maxLength);

    return formatted;
  } catch {
    return '[vars unavailable]';
  }
}

export function updateComparisonReporterTotals({
  ciProgressReporter,
  compareRowsCount,
  progressBarManager,
  runEvalOptions,
}: {
  ciProgressReporter: CIProgressReporter | null;
  compareRowsCount: number;
  progressBarManager: ProgressBarManager | null;
  runEvalOptions: readonly unknown[];
}) {
  if (progressBarManager && compareRowsCount > 0) {
    progressBarManager.updateTotalCount(compareRowsCount);
  } else if (ciProgressReporter && compareRowsCount > 0) {
    ciProgressReporter.updateTotalTests(runEvalOptions.length + compareRowsCount);
  }
}

export function updateComparisonReporterProgress({
  ciProgressReporter,
  compareCount,
  isWebUI,
  label,
  progressBarManager,
  promptRaw,
  runEvalOptions,
}: {
  ciProgressReporter: CIProgressReporter | null;
  compareCount: number;
  isWebUI: boolean;
  label: string;
  progressBarManager: ProgressBarManager | null;
  promptRaw: string;
  runEvalOptions: readonly unknown[];
}) {
  if (progressBarManager) {
    progressBarManager.updateComparisonProgress(promptRaw);
  } else if (ciProgressReporter) {
    ciProgressReporter.update(runEvalOptions.length + compareCount);
  } else if (!isWebUI) {
    logger.debug(`${label} complete`);
  }
}

export function cleanupProgressAfterError(
  progressBarManager: ProgressBarManager | null,
  ciProgressReporter: CIProgressReporter | null,
  error: unknown,
) {
  progressBarManager?.removeLogInterceptor();
  progressBarManager?.stop();
  ciProgressReporter?.error(`Evaluation failed: ${String(error)}`);
}

export function logWebUiEvalStepStart(
  isWebUI: boolean,
  processingContext: { numComplete: number; runEvalOptionsLength: number },
  evalStep: ProgressStep,
) {
  if (!isWebUI) {
    return;
  }
  const provider = evalStep.provider.label || evalStep.provider.id();
  const vars = formatVarsForDisplay(evalStep.test.vars || {}, 50);
  logger.info(
    `[${processingContext.numComplete}/${processingContext.runEvalOptionsLength}] Running ${provider} with vars: ${vars}`,
  );
}

export function cleanupProgressReporters(
  progressBarManager: ProgressBarManager | null,
  ciProgressReporter: CIProgressReporter | null,
) {
  try {
    if (progressBarManager) {
      progressBarManager.removeLogInterceptor();
      progressBarManager.complete();
      progressBarManager.stop();
    } else if (ciProgressReporter) {
      ciProgressReporter.finish();
    }
  } catch (cleanupErr) {
    logger.warn(`Error during progress reporter cleanup: ${cleanupErr}`);
  }
}
