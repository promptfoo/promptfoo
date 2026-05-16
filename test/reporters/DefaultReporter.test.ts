import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultReporter } from '../../src/reporters/DefaultReporter';
import { ResultFailureReason } from '../../src/types/index';
import { createMockProvider } from '../factories/provider';

import type {
  EvalSummaryContext,
  RunStartContext,
  TestResultContext,
} from '../../src/reporters/types';
import type { EvaluateResult, RunEvalOptions } from '../../src/types/index';

function makeEvalStep(overrides: Partial<RunEvalOptions> = {}): RunEvalOptions {
  return {
    provider: createMockProvider({ id: 'provider:default', label: 'default-provider' }),
    test: {
      description: 'plain test',
      metadata: {},
      vars: { prompt: 'hello' },
    },
    ...overrides,
  } as unknown as RunEvalOptions;
}

function makeResult(overrides: Partial<EvaluateResult> = {}): EvaluateResult {
  return {
    failureReason: ResultFailureReason.NONE,
    latencyMs: 25,
    namedScores: {},
    prompt: { raw: 'prompt' } as EvaluateResult['prompt'],
    promptId: 'prompt-id',
    promptIdx: 0,
    provider: { id: 'provider', label: 'Provider' },
    score: 1,
    success: true,
    testCase: {
      description: 'result description',
      metadata: {},
      vars: { prompt: 'hello' },
    } as EvaluateResult['testCase'],
    testIdx: 0,
    vars: { prompt: 'hello' },
    ...overrides,
  };
}

function makeContext(
  result: EvaluateResult,
  evalStep: RunEvalOptions,
  overrides: Partial<TestResultContext> = {},
): TestResultContext {
  return {
    completed: 1,
    evalStep,
    index: 0,
    metrics: {} as TestResultContext['metrics'],
    result,
    total: 3,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<EvalSummaryContext> = {}): EvalSummaryContext {
  return {
    durationMs: 1_500,
    errors: 1,
    failures: 1,
    isRedteam: false,
    passRate: 33.3,
    successes: 1,
    ...overrides,
  };
}

function makeRunStart(overrides: Partial<RunStartContext> = {}): RunStartContext {
  return {
    concurrency: 2,
    isRedteam: false,
    totalTests: 12,
    ...overrides,
  };
}

describe('DefaultReporter', () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders standard progress, inline failures, captured logs, and buffered provider output', () => {
    const reporter = new DefaultReporter({
      captureOutput: true,
      showErrors: true,
      showStatus: true,
    });

    reporter.onRunStart(makeRunStart());

    for (let index = 0; index < 11; index += 1) {
      reporter.onTestStart(
        makeEvalStep({
          test: {
            description: `test ${index}`,
            metadata: {},
            vars: { prompt: `prompt ${index}` },
          },
        } as Partial<RunEvalOptions>),
        index,
      );
    }

    reporter.onIterationProgress({
      currentIteration: 2,
      testIndex: 0,
      totalIterations: 4,
    });

    process.stdout.write('captured stdout\n');
    process.stderr.write('captured stderr\n');

    reporter.onTestResult(
      makeContext(
        makeResult({
          logs: [
            { level: 'info', message: 'first info line\ncontinued info', timestamp: 1 },
            { level: 'warn', message: 'warning line\ncontinued warning', timestamp: 2 },
            { level: 'error', message: 'error line\ncontinued error', timestamp: 3 },
          ],
        }),
        makeEvalStep(),
      ),
    );
    reporter.onTestResult(
      makeContext(
        makeResult({
          error: 'assertion failed\nline two\nline three\nline four',
          failureReason: ResultFailureReason.ASSERT,
          latencyMs: 0,
          success: false,
        }),
        makeEvalStep(),
        { completed: 2, index: 1 },
      ),
    );
    reporter.onTestResult(
      makeContext(
        makeResult({
          error: 'provider exploded',
          failureReason: ResultFailureReason.ERROR,
          success: false,
        }),
        makeEvalStep(),
        { completed: 3, index: 2 },
      ),
    );
    reporter.onRunComplete(makeSummary());

    const stdout = stdoutWrite.mock.calls.flat().join('');
    expect(stdout).toContain('Running 12 tests');
    expect(stdout).toContain('Completed:');
    expect(stdout).toContain('Logs:');
    expect(stdout).toContain('Failure: assertion failed');
    expect(stdout).toContain('Error: provider exploded');
    expect(stdout).toContain('captured stderr');
    expect(stdout).toContain('captured stdout');
    expect(stdout).toContain('1 passed');
    expect(stderrWrite).not.toHaveBeenCalledWith(expect.stringContaining('captured stderr'));
  });

  it('formats redteam identities and fallback labels without captured output', () => {
    const reporter = new DefaultReporter({
      captureOutput: false,
      showErrors: false,
      showStatus: false,
    });

    reporter.onRunStart(makeRunStart({ isRedteam: true, totalTests: 4 }));
    reporter.onTestStart(
      makeEvalStep({
        test: {
          description: '',
          metadata: { pluginId: 'harmful:self-harm', strategyId: 'multi-turn' },
          vars: {},
        },
      } as Partial<RunEvalOptions>),
      0,
    );
    reporter.onTestStart(
      makeEvalStep({
        test: {
          description: '',
          metadata: { pluginId: 'policy-bypass' },
          vars: {},
        },
      } as Partial<RunEvalOptions>),
      1,
    );
    reporter.onTestStart(
      makeEvalStep({
        test: {
          description: '',
          metadata: { strategyId: 'iterative-jailbreak' },
          vars: {},
        },
      } as Partial<RunEvalOptions>),
      2,
    );
    reporter.onTestStart(
      makeEvalStep({
        test: {
          description: 'fallback test',
          metadata: {},
          vars: {},
        },
      } as Partial<RunEvalOptions>),
      3,
    );

    reporter.onTestResult(
      makeContext(
        makeResult({
          metadata: { pluginId: 'response:leak' },
          testCase: {
            description: '',
            metadata: { strategyId: 'crescendo' },
            vars: {},
          } as EvaluateResult['testCase'],
        }),
        makeEvalStep({
          test: {
            description: '',
            metadata: {},
            vars: {},
          },
        } as Partial<RunEvalOptions>),
      ),
    );
    reporter.onTestResult(
      makeContext(
        makeResult({
          testCase: {
            description: '',
            metadata: { pluginId: 'only-plugin' },
            vars: {},
          } as EvaluateResult['testCase'],
        }),
        makeEvalStep({
          test: {
            description: '',
            metadata: {},
            vars: {},
          },
        } as Partial<RunEvalOptions>),
        { completed: 2, index: 1 },
      ),
    );
    reporter.onTestResult(
      makeContext(
        makeResult({
          metadata: { strategyId: 'only-strategy' },
          testCase: {
            description: '',
            metadata: {},
            vars: {},
          } as EvaluateResult['testCase'],
        }),
        makeEvalStep({
          test: {
            description: '',
            metadata: {},
            vars: {},
          },
        } as Partial<RunEvalOptions>),
        { completed: 3, index: 2 },
      ),
    );
    reporter.onTestResult(
      makeContext(
        makeResult({
          latencyMs: 0,
          testCase: {
            description: 'plain fallback',
            metadata: {},
            vars: {},
          } as EvaluateResult['testCase'],
        }),
        makeEvalStep({
          test: {
            description: '',
            metadata: {},
            vars: {},
          },
        } as Partial<RunEvalOptions>),
        { completed: 4, index: 3 },
      ),
    );
    reporter.onRunComplete(
      makeSummary({ errors: 0, failures: 0, isRedteam: true, passRate: 100, successes: 4 }),
    );

    const stdout = stdoutWrite.mock.calls.flat().join('');
    expect(stdout).toContain('red team tests');
    expect(stdout).toContain('Plugin: Response Leak (Strategy: Crescendo)');
    expect(stdout).toContain('Plugin: Only Plugin');
    expect(stdout).toContain('Strategy: Only Strategy');
    expect(stdout).toContain('plain fallback');
  });

  it('keeps formatter helpers stable for empty, compact, and truncated var displays', () => {
    const reporter = new DefaultReporter();
    const reporterInternals = reporter as unknown as {
      formatVars(vars: Record<string, unknown> | undefined, maxLen?: number): string;
      getDisplayName(id: string): string;
    };

    expect(reporterInternals.formatVars(undefined)).toBe('');
    expect(reporterInternals.formatVars({})).toBe('');
    expect(reporterInternals.formatVars({ one: '1', two: '2' })).toContain('one=1');
    expect(
      reporterInternals.formatVars(
        {
          alpha: 'a'.repeat(40),
          beta: 'b'.repeat(40),
          gamma: 'c'.repeat(40),
        },
        12,
      ),
    ).toMatch(/\.\.\.$/);
    expect(reporterInternals.getDisplayName('multi-turn:self-harm')).toBe('Multi Turn Self Harm');
  });
});
