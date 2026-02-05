import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock process properties before importing the module
const mockProcess: {
  stdout: {
    isTTY: boolean;
    columns: number;
    rows: number;
    hasColors: () => boolean;
  };
  env: Record<string, string | undefined>;
} = {
  stdout: {
    isTTY: true,
    columns: 80,
    rows: 24,
    hasColors: () => true,
  },
  env: {},
};

describe('render utilities', () => {
  beforeAll(() => {
    vi.stubGlobal('process', {
      ...process,
      stdout: mockProcess.stdout,
      env: mockProcess.env,
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  beforeEach(() => {
    vi.resetModules();
    // Reset environment
    delete mockProcess.env.PROMPTFOO_ENABLE_INTERACTIVE_UI;
    delete mockProcess.env.NO_COLOR;
    delete mockProcess.env.FORCE_COLOR;
    mockProcess.stdout.isTTY = true;
  });

  describe('canUseInteractiveUI', () => {
    it('should return true in a TTY environment', async () => {
      const { canUseInteractiveUI } = await import('../../src/ui/render');
      expect(canUseInteractiveUI()).toBe(true);
    });

    it('should return false when stdout is not a TTY', async () => {
      mockProcess.stdout.isTTY = false;
      const { canUseInteractiveUI } = await import('../../src/ui/render');
      expect(canUseInteractiveUI()).toBe(false);
    });
  });

  describe('isInteractiveUIEnabled (opt-in check)', () => {
    it('should return false by default (opt-in behavior)', async () => {
      const { isInteractiveUIEnabled } = await import('../../src/ui/interactiveCheck');
      expect(isInteractiveUIEnabled()).toBe(false);
    });

    it('should return true when PROMPTFOO_ENABLE_INTERACTIVE_UI is set', async () => {
      mockProcess.env.PROMPTFOO_ENABLE_INTERACTIVE_UI = 'true';
      const { isInteractiveUIEnabled } = await import('../../src/ui/interactiveCheck');
      expect(isInteractiveUIEnabled()).toBe(true);
    });
  });

  describe('shouldUseInkUI (main entry point)', () => {
    it('should return false by default (opt-in behavior)', async () => {
      const { shouldUseInkUI } = await import('../../src/ui/interactiveCheck');
      expect(shouldUseInkUI()).toBe(false);
    });

    it('should return true when explicitly enabled and in TTY', async () => {
      mockProcess.env.PROMPTFOO_ENABLE_INTERACTIVE_UI = 'true';
      const { shouldUseInkUI } = await import('../../src/ui/interactiveCheck');
      expect(shouldUseInkUI()).toBe(true);
    });

    it('should return false when enabled but not in TTY', async () => {
      mockProcess.env.PROMPTFOO_ENABLE_INTERACTIVE_UI = 'true';
      mockProcess.stdout.isTTY = false;
      const { shouldUseInkUI } = await import('../../src/ui/interactiveCheck');
      expect(shouldUseInkUI()).toBe(false);
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
