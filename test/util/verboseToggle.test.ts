import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    const result = initVerboseToggle();

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
});
