import logger from '../logger';
import { sanitizeProviderIdForLog } from '../util/provider';

import type {
  EvaluatorCiProgressReporter as CIProgressReporter,
  EvaluatorProgressBar as ProgressBarManager,
} from './runtime';

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
) {
  progressBarManager?.removeLogInterceptor();
  progressBarManager?.stop();
  ciProgressReporter?.error('Evaluation failed');
}

export function logWebUiEvalStepStart(
  isWebUI: boolean,
  processingContext: { numComplete: number; runEvalOptionsLength: number },
  evalStep: { provider: { id(): string; label?: string } },
) {
  if (!isWebUI) {
    return;
  }
  const provider = sanitizeProviderIdForLog(evalStep.provider.label || evalStep.provider.id());
  logger.info(
    `[${processingContext.numComplete}/${processingContext.runEvalOptionsLength}] Running ${provider}`,
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
