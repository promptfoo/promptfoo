import readline from 'readline';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('initializes cli-progress on stderr explicitly', async () => {
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

  it('clears the progress-bar stream and re-renders around log output', async () => {
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
});
