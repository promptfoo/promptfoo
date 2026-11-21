import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderProgressReporter } from '../../src/evaluator/providerProgress';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('live provider progress', () => {
  it('handles rejected asynchronous observers without unhandled rejections', async () => {
    const callback = vi.fn(async () => {
      throw new Error('Async observer failed');
    });
    const reporter = createProviderProgressReporter({
      provider: 'scanner',
      testIdx: 0,
      promptIdx: 0,
      callback,
      silent: true,
    });
    reporter.update({ phase: 'discovery' });
    reporter.close();
    reporter.close();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it('bounds repeated updates, emits phase changes, closes once and ignores late callbacks', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const reporter = createProviderProgressReporter({
      provider: 'scanner',
      testIdx: 2,
      promptIdx: 1,
      callback,
      silent: true,
    });
    reporter.update({ phase: 'discovery', elapsedMs: 1 });
    for (let i = 2; i < 100; i++) {
      reporter.update({ phase: 'discovery', elapsedMs: i });
    }
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    reporter.update({ phase: 'discovery', elapsedMs: 500 });
    reporter.update({ phase: 'reporting', elapsedMs: 501 });
    reporter.close();
    reporter.update({ phase: 'late' });
    expect(callback).toHaveBeenCalledTimes(4);
    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'reporting', elapsedMs: 501 }),
      true,
    );
  });

  it('drops invalid updates and prevents consumer errors from changing execution', () => {
    const callback = vi.fn(() => {
      throw new Error('Broken UI observer');
    });
    const reporter = createProviderProgressReporter({
      provider: 'scanner',
      testIdx: 0,
      promptIdx: 0,
      callback,
      silent: true,
    });
    reporter.update({ phase: 'discovery', estimatedCostUsd: Number.NaN });
    expect(callback).not.toHaveBeenCalled();
    expect(() => reporter.update({ phase: 'discovery', warningCount: 2 })).not.toThrow();
    expect(() => reporter.close()).not.toThrow();
  });
});
