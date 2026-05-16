import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/envars', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/envars')>()),
  isCI: vi.fn(() => false),
}));

describe('verboseToggle', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export initVerboseToggle function', async () => {
    const { initVerboseToggle } = await import('../../src/util/verboseToggle');
    expect(typeof initVerboseToggle).toBe('function');
  });

  it('should export disableVerboseToggle function', async () => {
    const { disableVerboseToggle } = await import('../../src/util/verboseToggle');
    expect(typeof disableVerboseToggle).toBe('function');
  });

  it('should export isVerboseToggleActive function', async () => {
    const { isVerboseToggleActive } = await import('../../src/util/verboseToggle');
    expect(typeof isVerboseToggleActive).toBe('function');
  });

  it('should return null when not in TTY mode', async () => {
    // Save original values
    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;

    // Mock non-TTY mode
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    const { initVerboseToggle } = await import('../../src/util/verboseToggle');
    const result = initVerboseToggle({ onInterrupt: vi.fn() });

    expect(result).toBeNull();

    // Restore original values
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinIsTTY,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutIsTTY,
      configurable: true,
    });
  });

  it('should initially report toggle as inactive', async () => {
    const { isVerboseToggleActive } = await import('../../src/util/verboseToggle');
    // In non-TTY test environment, toggle won't be enabled
    expect(isVerboseToggleActive()).toBe(false);
  });

  it('disableVerboseToggle should not throw when not initialized', async () => {
    const { disableVerboseToggle } = await import('../../src/util/verboseToggle');
    expect(() => disableVerboseToggle()).not.toThrow();
  });

  it('should fall back to process.exit(130) when onInterrupt throws so Ctrl+C is never broken', async () => {
    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;
    const originalSetRawMode = process.stdin.setRawMode;
    const onInterrupt = vi.fn(() => {
      throw new Error('caller-decided shutdown failed');
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdin, 'setRawMode', { value: vi.fn(), configurable: true });

    try {
      const { initVerboseToggle, isVerboseToggleActive } = await import(
        '../../src/util/verboseToggle'
      );

      initVerboseToggle({ onInterrupt });
      expect(() => process.stdin.emit('data', '\u0003')).not.toThrow();

      expect(onInterrupt).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(130);
      expect(isVerboseToggleActive()).toBe(false);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalStdinIsTTY,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalStdoutIsTTY,
        configurable: true,
      });
      Object.defineProperty(process.stdin, 'setRawMode', {
        value: originalSetRawMode,
        configurable: true,
      });
      stderrWriteSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it('should remove its exit listener during cleanup so init/teardown cycles do not leak', async () => {
    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;
    const originalSetRawMode = process.stdin.setRawMode;
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdin, 'setRawMode', { value: vi.fn(), configurable: true });

    try {
      const { initVerboseToggle, disableVerboseToggle } = await import(
        '../../src/util/verboseToggle'
      );

      const before = process.listenerCount('exit');
      const cleanup = initVerboseToggle({ onInterrupt: vi.fn() });
      expect(cleanup).not.toBeNull();
      expect(process.listenerCount('exit')).toBe(before + 1);

      disableVerboseToggle();
      expect(process.listenerCount('exit')).toBe(before);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalStdinIsTTY,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalStdoutIsTTY,
        configurable: true,
      });
      Object.defineProperty(process.stdin, 'setRawMode', {
        value: originalSetRawMode,
        configurable: true,
      });
      stderrWriteSpy.mockRestore();
    }
  });

  it('should delegate Ctrl+C to the caller without exiting the process', async () => {
    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;
    const originalSetRawMode = process.stdin.setRawMode;
    const onInterrupt = vi.fn();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdin, 'setRawMode', {
      value: vi.fn(),
      configurable: true,
    });

    try {
      const { initVerboseToggle, isVerboseToggleActive } = await import(
        '../../src/util/verboseToggle'
      );

      initVerboseToggle({ onInterrupt });
      process.stdin.emit('data', '\u0003');

      expect(onInterrupt).toHaveBeenCalledTimes(1);
      expect(exitSpy).not.toHaveBeenCalled();
      expect(isVerboseToggleActive()).toBe(false);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalStdinIsTTY,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalStdoutIsTTY,
        configurable: true,
      });
      Object.defineProperty(process.stdin, 'setRawMode', {
        value: originalSetRawMode,
        configurable: true,
      });
      stderrWriteSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
