import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressBarReporter } from '../../src/reporters/ProgressBarReporter';
import { SummaryReporter } from '../../src/reporters/SummaryReporter';
import { ResultFailureReason } from '../../src/types/index';

import type { EvalSummaryContext, TestResultContext } from '../../src/reporters/types';

const barMethods = vi.hoisted(() => ({
  increment: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

const singleBarConstructor = vi.hoisted(() => vi.fn());

vi.mock('cli-progress', () => {
  class MockSingleBar {
    increment = barMethods.increment;
    start = barMethods.start;
    stop = barMethods.stop;

    constructor(options: unknown, preset: unknown) {
      singleBarConstructor(options, preset);
    }
  }

  return {
    default: {
      Presets: {
        shades_classic: {},
      },
      SingleBar: MockSingleBar,
    },
  };
});

function makeResultContext(
  success: boolean,
  failureReason: ResultFailureReason,
): TestResultContext {
  return {
    completed: 1,
    evalStep: {} as TestResultContext['evalStep'],
    index: 0,
    metrics: {} as TestResultContext['metrics'],
    result: {
      failureReason,
      success,
    } as TestResultContext['result'],
    total: 3,
  };
}

function makeSummary(overrides: Partial<EvalSummaryContext> = {}): EvalSummaryContext {
  return {
    durationMs: 65_000,
    errors: 1,
    failures: 1,
    isRedteam: false,
    passRate: 33.3,
    successes: 1,
    ...overrides,
  };
}

describe('ProgressBarReporter', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('tracks counts without rendering a progress bar when disabled', () => {
    const reporter = new ProgressBarReporter({ showProgressBar: false });

    reporter.onRunStart({ concurrency: 1, isRedteam: false, totalTests: 3 });
    reporter.onTestResult(makeResultContext(true, ResultFailureReason.NONE));
    reporter.onTestResult(makeResultContext(false, ResultFailureReason.ASSERT));
    reporter.onTestResult(makeResultContext(false, ResultFailureReason.ERROR));
    reporter.onRunComplete(makeSummary());

    expect(singleBarConstructor).not.toHaveBeenCalled();
    expect(barMethods.increment).not.toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalled();
  });

  it('renders and updates a cli-progress bar when enabled', () => {
    const reporter = new ProgressBarReporter({ showProgressBar: true });

    reporter.onRunStart({ concurrency: 2, isRedteam: true, totalTests: 3 });
    reporter.onTestResult(makeResultContext(true, ResultFailureReason.NONE));
    reporter.onTestResult(makeResultContext(false, ResultFailureReason.ASSERT));
    reporter.onTestResult(makeResultContext(false, ResultFailureReason.ERROR));
    reporter.onRunComplete(makeSummary({ errors: 2, failures: 0, successes: 1 }));

    expect(singleBarConstructor).toHaveBeenCalledTimes(1);
    expect(barMethods.start).toHaveBeenCalledWith(3, 0, {
      error: 0,
      fail: 0,
      pass: 0,
    });
    expect(barMethods.increment).toHaveBeenNthCalledWith(1, {
      error: 0,
      fail: 0,
      pass: 1,
    });
    expect(barMethods.increment).toHaveBeenNthCalledWith(2, {
      error: 0,
      fail: 1,
      pass: 1,
    });
    expect(barMethods.increment).toHaveBeenNthCalledWith(3, {
      error: 1,
      fail: 1,
      pass: 1,
    });
    expect(barMethods.stop).toHaveBeenCalledTimes(1);
  });
});

describe('SummaryReporter', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the full minute-based summary when errors exist', () => {
    const reporter = new SummaryReporter();

    reporter.onRunStart({ concurrency: 1, isRedteam: false, totalTests: 3 });
    reporter.onRunComplete(makeSummary());

    const output = consoleLog.mock.calls.flat().join('\n');
    expect(output).toContain('Test Summary');
    expect(output).toContain('Errors:');
    expect(output).toContain('1m 5s');
  });

  it('prints a seconds-based summary without an error row when none occurred', () => {
    const reporter = new SummaryReporter();

    reporter.onRunStart({ concurrency: 1, isRedteam: false, totalTests: 2 });
    reporter.onRunComplete(
      makeSummary({
        durationMs: 5_000,
        errors: 0,
        failures: 0,
        passRate: 100,
        successes: 2,
      }),
    );

    const output = consoleLog.mock.calls.flat().join('\n');
    expect(output).not.toContain('Errors:');
    expect(output).toContain('5s');
  });
});
