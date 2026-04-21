import readline from 'readline';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockProvider } from './factories/provider';

import type { RunEvalOptions } from '../src/types/index';

const barMethods = vi.hoisted(() => ({
  increment: vi.fn(),
  render: vi.fn(),
  setTotal: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  update: vi.fn(),
}));

const singleBarConstructor = vi.hoisted(() => vi.fn());
const cursorToMock = vi.hoisted(() => vi.fn());
const clearLineMock = vi.hoisted(() => vi.fn());

vi.mock('cli-progress', () => {
  class MockSingleBar {
    increment = barMethods.increment;
    render = barMethods.render;
    setTotal = barMethods.setTotal;
    start = barMethods.start;
    stop = barMethods.stop;
    update = barMethods.update;

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

vi.mock('readline', () => ({
  clearLine: clearLineMock,
  cursorTo: cursorToMock,
  default: {
    clearLine: clearLineMock,
    cursorTo: cursorToMock,
  },
}));

import { ProgressBarManager } from '../src/evaluator';
import { globalLogCallback, setLogCallback } from '../src/logger';

describe('ProgressBarManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setLogCallback(null);
  });

  afterEach(() => {
    setLogCallback(null);
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('creates cli-progress SingleBar on stderr', async () => {
      const manager = new ProgressBarManager(false);

      await manager.initialize([], 2, 0);

      expect(singleBarConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          gracefulExit: true,
          hideCursor: true,
          stream: process.stderr,
        }),
        expect.anything(),
      );
      expect(barMethods.start).toHaveBeenCalledWith(0, 0, {
        errors: 0,
        prompt: '',
        provider: '',
        vars: '',
      });
    });

    it('starts with correct total including compareRowsCount', async () => {
      const runEvalOptions = [{}, {}, {}] as RunEvalOptions[];
      const manager = new ProgressBarManager(false);

      await manager.initialize(runEvalOptions, 2, 5);

      expect(barMethods.start).toHaveBeenCalledWith(8, 0, expect.any(Object));
    });

    it('skips initialization for webUI', async () => {
      const manager = new ProgressBarManager(true);

      await manager.initialize([], 2, 0);

      expect(singleBarConstructor).not.toHaveBeenCalled();
      expect(barMethods.start).not.toHaveBeenCalled();
    });
  });

  describe('updateProgress', () => {
    it('increments the bar with provider/prompt/vars info', async () => {
      const manager = new ProgressBarManager(false);
      await manager.initialize([], 1, 0);

      const evalStep = {
        provider: createMockProvider({ id: 'openai:gpt-4', label: 'gpt-4' }),
        prompt: { raw: 'Hello world prompt' },
        test: { vars: { name: 'Alice' } },
      } as unknown as RunEvalOptions;

      manager.updateProgress(0, evalStep, 'concurrent', { testErrorCount: 2 } as any);

      expect(barMethods.increment).toHaveBeenCalledWith({
        provider: 'gpt-4',
        prompt: '"Hello worl"',
        vars: expect.any(String),
        errors: 2,
      });
    });

    it('uses provider id when label is absent', async () => {
      const manager = new ProgressBarManager(false);
      await manager.initialize([], 1, 0);

      const evalStep = {
        provider: createMockProvider({ id: 'openai:gpt-4o', label: '' }),
        prompt: { raw: 'Test' },
        test: { vars: {} },
      } as unknown as RunEvalOptions;

      manager.updateProgress(0, evalStep);

      expect(barMethods.increment).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'openai:gpt-4o' }),
      );
    });

    it('is a no-op for webUI', async () => {
      const manager = new ProgressBarManager(true);
      await manager.initialize([], 1, 0);

      const evalStep = {
        provider: createMockProvider({ id: 'test', label: 'test' }),
        prompt: { raw: 'test' },
        test: { vars: {} },
      } as unknown as RunEvalOptions;

      manager.updateProgress(0, evalStep);

      expect(barMethods.increment).not.toHaveBeenCalled();
    });
  });

  describe('updateTotalCount', () => {
    it('increases the bar total', async () => {
      const manager = new ProgressBarManager(false);
      await manager.initialize([{}, {}] as RunEvalOptions[], 1, 0);

      manager.updateTotalCount(5);

      expect(barMethods.setTotal).toHaveBeenCalledWith(7);
    });

    it('ignores non-positive counts', async () => {
      const manager = new ProgressBarManager(false);
      await manager.initialize([], 1, 0);

      manager.updateTotalCount(0);
      manager.updateTotalCount(-1);

      expect(barMethods.setTotal).not.toHaveBeenCalled();
    });
  });

  describe('complete and stop', () => {
    it('updates bar to total and stops it', async () => {
      const runEvalOptions = [{}, {}, {}] as RunEvalOptions[];
      const manager = new ProgressBarManager(false);
      await manager.initialize(runEvalOptions, 1, 0);

      manager.complete();
      manager.stop();

      expect(barMethods.update).toHaveBeenCalledWith(3);
      expect(barMethods.stop).toHaveBeenCalled();
    });
  });

  describe('log interceptor', () => {
    it('clears the progress-bar line and re-renders around log output', async () => {
      const previousCallback = vi.fn();
      setLogCallback(previousCallback);

      const manager = new ProgressBarManager(false);
      await manager.initialize([], 1, 0);
      manager.installLogInterceptor();

      expect(globalLogCallback).not.toBe(previousCallback);

      globalLogCallback?.('provider failed');
      globalLogCallback?.('provider failed again');

      expect(previousCallback).toHaveBeenCalledTimes(2);
      expect(previousCallback).toHaveBeenNthCalledWith(1, 'provider failed');
      expect(previousCallback).toHaveBeenNthCalledWith(2, 'provider failed again');
      expect(readline.cursorTo).toHaveBeenCalledTimes(2);
      expect(readline.cursorTo).toHaveBeenCalledWith(process.stderr, 0);
      expect(readline.clearLine).toHaveBeenCalledTimes(2);
      expect(readline.clearLine).toHaveBeenCalledWith(process.stderr, 0);
      expect(barMethods.render).not.toHaveBeenCalled();

      vi.runAllTimers();

      // Multiple log messages in the same tick coalesce into one re-render
      expect(barMethods.render).toHaveBeenCalledTimes(1);
    });

    it('restores the previous log callback and cancels pending renders on cleanup', async () => {
      const previousCallback = vi.fn();
      setLogCallback(previousCallback);

      const manager = new ProgressBarManager(false);
      await manager.initialize([], 1, 0);
      manager.installLogInterceptor();

      globalLogCallback?.('transient error');
      manager.removeLogInterceptor();

      expect(globalLogCallback).toBe(previousCallback);

      vi.runAllTimers();

      expect(barMethods.render).not.toHaveBeenCalled();

      globalLogCallback?.('after cleanup');

      expect(previousCallback).toHaveBeenCalledTimes(2);
      expect(readline.cursorTo).toHaveBeenCalledTimes(1);
      expect(readline.clearLine).toHaveBeenCalledTimes(1);
    });

    it('does not install when progress bar is not initialized', async () => {
      const manager = new ProgressBarManager(false);
      // Don't call initialize()
      manager.installLogInterceptor();

      expect(globalLogCallback).toBeNull();
    });

    it('does not install for webUI', async () => {
      const manager = new ProgressBarManager(true);
      await manager.initialize([], 1, 0);
      manager.installLogInterceptor();

      expect(globalLogCallback).toBeNull();
    });

    it('does not double-install the interceptor', async () => {
      const manager = new ProgressBarManager(false);
      await manager.initialize([], 1, 0);
      manager.installLogInterceptor();

      const firstCallback = globalLogCallback;
      manager.installLogInterceptor();

      expect(globalLogCallback).toBe(firstCallback);
    });

    it('removeLogInterceptor is safe to call when not installed', () => {
      const manager = new ProgressBarManager(false);
      // Should not throw
      manager.removeLogInterceptor();
    });

    it('does not restore callback if globalLogCallback was changed externally', async () => {
      const manager = new ProgressBarManager(false);
      await manager.initialize([], 1, 0);
      manager.installLogInterceptor();

      // External code replaces the callback
      const externalCallback = vi.fn();
      setLogCallback(externalCallback);

      manager.removeLogInterceptor();

      // Should NOT clobber the externally set callback
      expect(globalLogCallback).toBe(externalCallback);
    });
  });
});

describe('Work Distribution Logic', () => {
  it('correctly separates serial and concurrent tasks', () => {
    const runEvalOptions: Partial<RunEvalOptions>[] = [
      { test: { options: { runSerially: true } } },
      { test: {} },
      { test: { options: { runSerially: true } } },
      { test: {} },
      { test: {} },
    ];

    let serialCount = 0;
    let groupCount = 0;

    for (const option of runEvalOptions) {
      if (option.test?.options?.runSerially) {
        serialCount++;
      } else {
        groupCount++;
      }
    }

    expect(serialCount).toBe(2);
    expect(groupCount).toBe(3);
  });

  it('maps indices correctly to execution contexts', () => {
    const indexToContext = new Map();
    const runEvalOptions: Partial<RunEvalOptions>[] = [
      { test: { options: { runSerially: true } } },
      { test: {} },
      { test: { options: { runSerially: true } } },
      { test: {} },
      { test: {} },
    ];

    let concurrentCount = 0;
    const concurrency = 3;
    const maxBars = Math.min(concurrency, 20);

    for (let i = 0; i < runEvalOptions.length; i++) {
      const option = runEvalOptions[i];
      if (option.test?.options?.runSerially) {
        indexToContext.set(i, { phase: 'serial', barIndex: 0 });
      } else {
        indexToContext.set(i, {
          phase: 'concurrent',
          barIndex: concurrentCount % maxBars,
        });
        concurrentCount++;
      }
    }

    expect(indexToContext.get(0)).toEqual({ phase: 'serial', barIndex: 0 });
    expect(indexToContext.get(1)).toEqual({ phase: 'concurrent', barIndex: 0 });
    expect(indexToContext.get(2)).toEqual({ phase: 'serial', barIndex: 0 });
    expect(indexToContext.get(3)).toEqual({ phase: 'concurrent', barIndex: 1 });
    expect(indexToContext.get(4)).toEqual({ phase: 'concurrent', barIndex: 2 });
  });

  it('calculates correct totals with remainder distribution', () => {
    const concurrentCount = 10;
    const numBars = 3;

    const perBar = Math.floor(concurrentCount / numBars);
    const remainder = concurrentCount % numBars;

    const barTotals = [];
    for (let i = 0; i < numBars; i++) {
      const total = i < remainder ? perBar + 1 : perBar;
      barTotals.push(total);
    }

    expect(barTotals).toEqual([4, 3, 3]);
    expect(barTotals.reduce((a, b) => a + b, 0)).toBe(concurrentCount);
  });
});
