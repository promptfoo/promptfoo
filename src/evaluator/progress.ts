import logger from '../logger';
import type {
  EvaluatorCiProgressReporter as CIProgressReporter,
  EvaluatorProgressBar as ProgressBarManager,
} from './runtime';

type ProgressStep = {
  provider: { id(): string; label?: string };
  prompt: { raw: string };
  test: { vars?: Record<string, unknown> };
};

/**
 * Safely formats variables for display in progress bars and logs.
 * Handles extremely large variables that could cause RangeError crashes.
 *
 * @param vars - Variables to format
 * @param maxLength - Maximum length of the final formatted string
 * @returns Formatted variables string or fallback message
 */
export function formatVarsForDisplay(
  vars: Record<string, unknown> | undefined,
  maxLength: number,
): string {
  if (!vars || Object.keys(vars).length === 0) {
    return '';
  }

  try {
    // Simple approach: limit individual values, then truncate the whole result
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
    // Any error - return safe fallback
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
