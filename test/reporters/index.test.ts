import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importModuleMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../src/esm', () => ({
  importModule: importModuleMock,
}));

vi.mock('../../src/logger', () => ({
  default: loggerMock,
}));

import {
  DefaultReporter,
  loadReporter,
  ReporterManager,
  SummaryReporter,
} from '../../src/reporters';

import type { Reporter } from '../../src/reporters/types';
import type { RunEvalOptions } from '../../src/types/index';

describe('reporter loading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads built-in reporters and rejects unknown names', async () => {
    await expect(loadReporter('summary')).resolves.toBeInstanceOf(SummaryReporter);
    await expect(loadReporter(['default', { showErrors: false }])).resolves.toBeInstanceOf(
      DefaultReporter,
    );
    await expect(loadReporter('totally-unknown')).rejects.toThrow('Unknown reporter');
  });

  it('loads file-based class, factory, and instance reporters', async () => {
    class CustomReporter implements Reporter {
      onRunStart(): void {}
    }

    const factoryReporter = { onRunComplete: vi.fn() };
    const instanceReporter = { onTestResult: vi.fn() };
    const reporterFactory = vi.fn(() => factoryReporter);

    importModuleMock.mockResolvedValueOnce(CustomReporter);
    importModuleMock.mockResolvedValueOnce(reporterFactory);
    importModuleMock.mockResolvedValueOnce(instanceReporter);

    await expect(loadReporter('file://./reporter.ts:CustomReporter')).resolves.toBeInstanceOf(
      CustomReporter,
    );
    await expect(loadReporter(['file://./factory.ts', { compact: true }])).resolves.toBe(
      factoryReporter,
    );
    await expect(loadReporter('file://./instance.ts')).resolves.toBe(instanceReporter);

    expect(importModuleMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('reporter.ts'),
      'CustomReporter',
    );
    expect(importModuleMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('factory.ts'),
      undefined,
    );
    expect(reporterFactory).toHaveBeenCalledWith({ compact: true });
  });
});

describe('ReporterManager', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches lifecycle hooks, logs reporter hook failures, and returns the first reporter error', async () => {
    const manager = new ReporterManager();
    const expectedError = new Error('reporter state');
    const goodReporter: Reporter = {
      getLastError: vi.fn(() => undefined),
      onIterationProgress: vi.fn(),
      onRunComplete: vi.fn(),
      onRunStart: vi.fn(),
      onTestResult: vi.fn(),
      onTestStart: vi.fn(),
    };
    const failingReporter: Reporter = {
      getLastError: vi.fn(() => expectedError),
      onIterationProgress: vi.fn(() => {
        throw new Error('iteration failed');
      }),
      onRunComplete: vi.fn(() => {
        throw new Error('complete failed');
      }),
      onRunStart: vi.fn(() => {
        throw new Error('start failed');
      }),
      onTestResult: vi.fn(() => {
        throw new Error('result failed');
      }),
      onTestStart: vi.fn(() => {
        throw new Error('test start failed');
      }),
    };

    (manager as unknown as { reporters: Reporter[] }).reporters.push(goodReporter, failingReporter);

    await manager.onRunStart({ concurrency: 1, isRedteam: false, totalTests: 1 });
    await manager.onTestStart({} as RunEvalOptions, 0);
    await manager.onIterationProgress({
      currentIteration: 1,
      testIndex: 0,
      totalIterations: 2,
    });
    await manager.onTestResult({
      completed: 1,
      evalStep: {} as RunEvalOptions,
      index: 0,
      metrics: {} as never,
      result: {} as never,
      total: 1,
    });
    await manager.onRunComplete({
      durationMs: 10,
      errors: 0,
      failures: 0,
      isRedteam: false,
      passRate: 100,
      successes: 1,
    });

    expect(goodReporter.onRunStart).toHaveBeenCalled();
    expect(goodReporter.onTestStart).toHaveBeenCalled();
    expect(goodReporter.onIterationProgress).toHaveBeenCalled();
    expect(goodReporter.onTestResult).toHaveBeenCalled();
    expect(goodReporter.onRunComplete).toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledTimes(5);
    expect(manager.getLastError()).toBe(expectedError);
    expect(manager.count).toBe(2);
  });

  it('adds reporters, surfaces load failures, and returns undefined when no reporter has an error', async () => {
    const manager = new ReporterManager();

    await manager.addReporter('summary');
    expect(manager.count).toBe(1);
    expect(manager.getLastError()).toBeUndefined();

    importModuleMock.mockRejectedValueOnce(new Error('missing reporter'));
    await expect(manager.addReporter('file://./missing.ts')).rejects.toThrow('missing reporter');
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load reporter: Error: missing reporter'),
    );
  });
});
