import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock process properties before importing the module
const mockProcess = {
  stdout: {
    isTTY: true,
    columns: 80,
    rows: 24,
    hasColors: () => true,
  },
  env: {},
};

vi.stubGlobal('process', {
  ...process,
  stdout: mockProcess.stdout,
  env: mockProcess.env,
});

describe('render utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset environment
    delete mockProcess.env.PROMPTFOO_DISABLE_INTERACTIVE_UI;
    delete mockProcess.env.PROMPTFOO_FORCE_INTERACTIVE_UI;
    delete mockProcess.env.CI;
    delete mockProcess.env.GITHUB_ACTIONS;
    delete mockProcess.env.NO_COLOR;
    delete mockProcess.env.FORCE_COLOR;
    mockProcess.stdout.isTTY = true;
  });

  describe('shouldUseInteractiveUI', () => {
    it('should return true in a TTY environment', async () => {
      const { shouldUseInteractiveUI } = await import('../../src/ui/render');
      expect(shouldUseInteractiveUI()).toBe(true);
    });

    it('should return false when PROMPTFOO_DISABLE_INTERACTIVE_UI is set', async () => {
      mockProcess.env.PROMPTFOO_DISABLE_INTERACTIVE_UI = 'true';
      const { shouldUseInteractiveUI } = await import('../../src/ui/render');
      expect(shouldUseInteractiveUI()).toBe(false);
    });

    it('should return false when stdout is not a TTY', async () => {
      mockProcess.stdout.isTTY = false;
      const { shouldUseInteractiveUI } = await import('../../src/ui/render');
      expect(shouldUseInteractiveUI()).toBe(false);
    });

    it('should return false in CI environments', async () => {
      mockProcess.env.CI = 'true';
      const { shouldUseInteractiveUI } = await import('../../src/ui/render');
      expect(shouldUseInteractiveUI()).toBe(false);
    });

    it('should return false when GITHUB_ACTIONS is set', async () => {
      mockProcess.env.GITHUB_ACTIONS = 'true';
      const { shouldUseInteractiveUI } = await import('../../src/ui/render');
      expect(shouldUseInteractiveUI()).toBe(false);
    });
  });

  describe('isInteractiveUIForced', () => {
    it('should return true when PROMPTFOO_FORCE_INTERACTIVE_UI is set', async () => {
      mockProcess.env.PROMPTFOO_FORCE_INTERACTIVE_UI = 'true';
      const { isInteractiveUIForced } = await import('../../src/ui/render');
      expect(isInteractiveUIForced()).toBe(true);
    });

    it('should return false when PROMPTFOO_FORCE_INTERACTIVE_UI is not set', async () => {
      const { isInteractiveUIForced } = await import('../../src/ui/render');
      expect(isInteractiveUIForced()).toBe(false);
    });
  });

  describe('getTerminalSize', () => {
    it('should return terminal dimensions', async () => {
      const { getTerminalSize } = await import('../../src/ui/render');
      const size = getTerminalSize();
      expect(size.columns).toBe(80);
      expect(size.rows).toBe(24);
    });
  });

  describe('supportsColor', () => {
    it('should return true in a TTY with colors', async () => {
      const { supportsColor } = await import('../../src/ui/render');
      expect(supportsColor()).toBe(true);
    });

    it('should return false when NO_COLOR is set', async () => {
      mockProcess.env.NO_COLOR = '1';
      const { supportsColor } = await import('../../src/ui/render');
      expect(supportsColor()).toBe(false);
    });

    it('should return true when FORCE_COLOR is set', async () => {
      mockProcess.env.FORCE_COLOR = '1';
      const { supportsColor } = await import('../../src/ui/render');
      expect(supportsColor()).toBe(true);
    });
  });
});
