import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as envars from '../../src/envars';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { ProgressBarManager } from '../../src/node/evaluatorProgress';
import { nodeEvaluatorRuntime } from '../../src/node/evaluatorRuntime';
import { CIProgressReporter } from '../../src/progress/ciProgressReporter';
import { createMockProvider } from '../factories/provider';
import { mockProcessEnv } from '../util/utils';

import type { EvaluatorRuntime } from '../../src/evaluator/runtime';
import type EvalResult from '../../src/models/evalResult';

vi.mock('../../src/progress/ciProgressReporter', () => ({
  CIProgressReporter: vi.fn(
    class {
      start = vi.fn();
      update = vi.fn();
      updateTotalTests = vi.fn();
      error = vi.fn();
      finish = vi.fn();
    },
  ),
}));

describe('CLI progress policy', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    vi.mocked(CIProgressReporter).mockReset();
    restoreEnv = mockProcessEnv({ CI: 'true' });
  });
  afterEach(() => {
    restoreEnv();
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  const suite = () => ({
    providers: [createMockProvider()],
    prompts: [{ raw: 'fixture', label: 'fixture' }],
    tests: [{}],
  });

  it.each(['library', 'web', 'mcp', 'default'] as const)(
    'keeps %s calls noninteractive in CI while reporting progress to the caller',
    async (eventSource) => {
      const progressCallback = vi.fn();
      await evaluate(suite(), new Eval({}), {
        eventSource,
        showProgressBar: true,
        progressCallback,
      });
      expect(CIProgressReporter).not.toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalled();
    },
  );

  it.each([
    { eventSource: 'cli' as const, showProgressBar: true, isTTY: true, expected: 1 },
    { eventSource: 'cli' as const, showProgressBar: true, isTTY: false, expected: 0 },
    { eventSource: 'cli' as const, showProgressBar: false, isTTY: true, expected: 0 },
    { eventSource: 'library' as const, showProgressBar: true, isTTY: true, expected: 0 },
  ])(
    'selects terminal progress only when requested by a CLI on a TTY: %j',
    async ({ eventSource, showProgressBar, isTTY, expected }) => {
      vi.spyOn(envars, 'isCI').mockReturnValue(false);
      const initialize = vi
        .spyOn(ProgressBarManager.prototype, 'initialize')
        .mockResolvedValue(undefined);
      const stop = vi.spyOn(ProgressBarManager.prototype, 'stop');
      const descriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
      Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: isTTY });
      try {
        await evaluate(suite(), new Eval({}), { eventSource, showProgressBar });
        expect(initialize).toHaveBeenCalledTimes(expected);
        expect(stop).toHaveBeenCalledTimes(expected);
        expect(CIProgressReporter).not.toHaveBeenCalled();
      } finally {
        if (descriptor) {
          Object.defineProperty(process.stderr, 'isTTY', descriptor);
        } else {
          Reflect.deleteProperty(process.stderr, 'isTTY');
        }
      }
    },
  );

  it('rejects simultaneous runtime reporters before starting either one', async () => {
    const start = vi.fn();
    const initialize = vi.fn();
    const runtime = {
      ...nodeEvaluatorRuntime,
      createProgressReporters: () => ({
        progressBarManager: { initialize },
        ciProgressReporter: { start },
      }),
    } as unknown as EvaluatorRuntime<Eval, EvalResult>;
    await expect(evaluate(suite(), new Eval({}), {}, runtime)).rejects.toThrow(
      'Evaluator runtime must supply at most one progress reporter',
    );
    expect(start).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('starts, updates and finishes the CLI reporter', async () => {
    await evaluate(suite(), new Eval({}), { eventSource: 'cli' });
    expect(CIProgressReporter).toHaveBeenCalledWith(1);
    const reporter = vi.mocked(CIProgressReporter).mock.results[0].value;
    expect(reporter.start).toHaveBeenCalledOnce();
    expect(reporter.update).toHaveBeenCalledWith(1);
    expect(reporter.finish).toHaveBeenCalledOnce();
  });

  it('cleans up the CLI reporter when finalization fails', async () => {
    const evalRecord = new Eval({});
    vi.spyOn(evalRecord, 'setDurationMs').mockImplementation(() => {
      throw new Error('finalization failed');
    });

    await expect(evaluate(suite(), evalRecord, { eventSource: 'cli' })).rejects.toThrow(
      'finalization failed',
    );
    expect(vi.mocked(CIProgressReporter).mock.results[0].value.error).toHaveBeenCalledWith(
      'Evaluation failed: Error: finalization failed',
    );
  });
});
