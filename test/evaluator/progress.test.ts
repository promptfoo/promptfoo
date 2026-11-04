import { afterEach, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { CIProgressReporter } from '../../src/progress/ciProgressReporter';
import {
  cleanupProgressAfterError,
  cleanupProgressReporters,
  logWebUiEvalStepStart,
  ProgressBarManager,
  updateComparisonReporterProgress,
  updateComparisonReporterTotals,
} from '../../src/progress/evaluationProgress';

afterEach(() => vi.restoreAllMocks());

it('counts comparison rows exactly once in CI progress', () => {
  const ciProgressReporter = new CIProgressReporter(2);
  vi.spyOn(ciProgressReporter, 'update');
  vi.spyOn(ciProgressReporter, 'updateTotalTests');
  vi.spyOn(ciProgressReporter, 'error').mockImplementation(() => {});
  vi.spyOn(ciProgressReporter, 'finish').mockImplementation(() => {});
  const reporters = { ciProgressReporter, progressBarManager: null, runEvalOptions: [{}, {}] };
  updateComparisonReporterTotals({ ...reporters, compareRowsCount: 0 });
  expect(ciProgressReporter.updateTotalTests).not.toHaveBeenCalled();
  updateComparisonReporterTotals({ ...reporters, compareRowsCount: 3 });
  updateComparisonReporterProgress({
    ...reporters,
    compareCount: 1,
    isWebUI: false,
    label: 'comparison',
    promptRaw: 'sample',
  });
  expect(ciProgressReporter.updateTotalTests).toHaveBeenCalledWith(5);
  expect(ciProgressReporter.update).toHaveBeenCalledWith(3);
  cleanupProgressReporters(null, ciProgressReporter);
  expect(ciProgressReporter.finish).toHaveBeenCalledOnce();
  cleanupProgressAfterError(null, ciProgressReporter, new Error('stopped'));
  expect(ciProgressReporter.error).toHaveBeenCalledWith('Evaluation failed: Error: stopped');
});

it('logs web progress using the provider label or the provider ID', () => {
  const info = vi.spyOn(logger, 'info').mockImplementation(() => logger);
  const row = { provider: { id: () => 'fixture' }, prompt: { raw: 'sample' }, test: {} };
  const progress = { numComplete: 1, runEvalOptionsLength: 2 };
  logWebUiEvalStepStart(false, progress, row);
  expect(info).not.toHaveBeenCalled();
  logWebUiEvalStepStart(true, progress, row);
  expect(info).toHaveBeenLastCalledWith('[1/2] Running fixture with vars: ');
  logWebUiEvalStepStart(true, progress, {
    ...row,
    provider: { ...row.provider, label: 'labeled' },
    test: { vars: { count: 3 } },
  });
  expect(info).toHaveBeenLastCalledWith('[1/2] Running labeled with vars: count=3');
});

it('routes comparison progress to the terminal bar and flushes it before stopping', () => {
  const progressBarManager = new ProgressBarManager(false);
  const total = vi.spyOn(progressBarManager, 'updateTotalCount');
  const comparison = vi.spyOn(progressBarManager, 'updateComparisonProgress');
  const remove = vi.spyOn(progressBarManager, 'removeLogInterceptor');
  const complete = vi.spyOn(progressBarManager, 'complete');
  const stop = vi.spyOn(progressBarManager, 'stop');
  const reporters = { progressBarManager, ciProgressReporter: null, runEvalOptions: [{}] };

  updateComparisonReporterTotals({ ...reporters, compareRowsCount: 2 });
  updateComparisonReporterProgress({
    ...reporters,
    compareCount: 1,
    isWebUI: false,
    label: 'comparison',
    promptRaw: 'sample',
  });
  expect(total).toHaveBeenCalledWith(2);
  expect(comparison).toHaveBeenCalledWith('sample');
  cleanupProgressReporters(progressBarManager, null);
  expect(remove).toHaveBeenCalledBefore(complete);
  expect(complete).toHaveBeenCalledBefore(stop);
});
