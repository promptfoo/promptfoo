import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../../src/util/debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce function calls', () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn('arg1');
    debouncedFn('arg2');
    debouncedFn('arg3');

    expect(mockFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('arg3');
  });

  it('should reset timer on subsequent calls', () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn('arg1');
    vi.advanceTimersByTime(50);

    debouncedFn('arg2');
    vi.advanceTimersByTime(50);

    expect(mockFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('arg2');
  });

  it('cancels pending work and can be reused after cancellation', () => {
    const callback = vi.fn();
    const run = debounce(callback, 100);
    run('cancelled');
    run.clear();
    run.clear();
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    run('next');
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledExactlyOnceWith('next');
  });

  it('uses the final call receiver and arguments', () => {
    const values: string[] = [];
    const run = debounce(function (this: { name: string }, value: string) {
      values.push(`${this.name}:${value}`);
    }, 100);
    run.call({ name: 'first' }, 'before');
    run.call({ name: 'last' }, 'after');
    vi.runAllTimers();
    expect(values).toEqual(['last:after']);
  });

  it('allows a callback to schedule a later call', () => {
    const callback = vi.fn((value: number) => {
      if (value === 1) {
        run(2);
      }
    });
    const run = debounce(callback, 100);
    run(1);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledExactlyOnceWith(1);
    vi.advanceTimersByTime(100);
    expect(callback.mock.calls).toEqual([[1], [2]]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
