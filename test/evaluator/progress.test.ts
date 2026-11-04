import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanupProgressAfterError,
  cleanupProgressReporters,
  logWebUiEvalStepStart,
  updateComparisonReporterProgress,
  updateComparisonReporterTotals,
} from '../../src/evaluator/progress';
import logger from '../../src/logger';

afterEach(() => vi.restoreAllMocks());

it('counts comparison rows exactly once in CI progress', () => {
  const ciProgressReporter = {
    start: vi.fn(),
    update: vi.fn(),
    updateTotalTests: vi.fn(),
    error: vi.fn(),
    finish: vi.fn(),
  };
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
