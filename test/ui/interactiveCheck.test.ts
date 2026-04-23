import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/envars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/envars')>();
  return {
    ...actual,
    getEnvBool: vi.fn((key: string) => {
      if (key === 'PROMPTFOO_ENABLE_INTERACTIVE_UI') {
        return process.env.PROMPTFOO_ENABLE_INTERACTIVE_UI === 'true';
      }
      if (key === 'PROMPTFOO_FORCE_INTERACTIVE_UI') {
        return process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true';
      }
      if (key === 'PROMPTFOO_FORCE_INTERACTIVE_INIT') {
        return process.env.PROMPTFOO_FORCE_INTERACTIVE_INIT === 'true';
      }
      if (key === 'PROMPTFOO_DISABLE_INTERACTIVE_UI') {
        return process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI === 'true';
      }
      return false;
    }),
  };
});

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('interactiveCheck', () => {
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('PROMPTFOO_ENABLE_INTERACTIVE_UI', undefined);
    vi.stubEnv('PROMPTFOO_FORCE_INTERACTIVE_UI', undefined);
    vi.stubEnv('PROMPTFOO_FORCE_INTERACTIVE_INIT', undefined);
    vi.stubEnv('PROMPTFOO_DISABLE_INTERACTIVE_UI', undefined);
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true });
    vi.unstubAllEnvs();
  });

  describe('canUseInteractiveUI', () => {
    it('should return true when stdout is a TTY', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      const { canUseInteractiveUI } = await import('../../src/ui/interactiveCheck');
      expect(canUseInteractiveUI()).toBe(true);
    });

    it('should return false when stdout is not a TTY', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
      const { canUseInteractiveUI } = await import('../../src/ui/interactiveCheck');
      expect(canUseInteractiveUI()).toBe(false);
    });
  });

  describe('isInteractiveUIEnabled', () => {
    it('should return false by default', async () => {
      const { isInteractiveUIEnabled } = await import('../../src/ui/interactiveCheck');
      expect(isInteractiveUIEnabled()).toBe(false);
    });

    it('should return true when PROMPTFOO_ENABLE_INTERACTIVE_UI=true', async () => {
      vi.stubEnv('PROMPTFOO_ENABLE_INTERACTIVE_UI', 'true');
      const { isInteractiveUIEnabled } = await import('../../src/ui/interactiveCheck');
      expect(isInteractiveUIEnabled()).toBe(true);
    });
  });

  describe('isInteractiveUIForced', () => {
    it('should return false by default', async () => {
      const { isInteractiveUIForced } = await import('../../src/ui/interactiveCheck');
      expect(isInteractiveUIForced()).toBe(false);
    });

    it('should return true when PROMPTFOO_FORCE_INTERACTIVE_UI=true', async () => {
      vi.stubEnv('PROMPTFOO_FORCE_INTERACTIVE_UI', 'true');
      const { isInteractiveUIForced } = await import('../../src/ui/interactiveCheck');
      expect(isInteractiveUIForced()).toBe(true);
    });
  });

  describe('shouldUseInkUI', () => {
    it('should return false by default (opt-in)', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      const { shouldUseInkUI } = await import('../../src/ui/interactiveCheck');
      expect(shouldUseInkUI()).toBe(false);
    });

    it('should return true when opted in and TTY available', async () => {
      vi.stubEnv('PROMPTFOO_ENABLE_INTERACTIVE_UI', 'true');
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      const { shouldUseInkUI } = await import('../../src/ui/interactiveCheck');
      expect(shouldUseInkUI()).toBe(true);
    });

    it('should return false when opted in but no TTY', async () => {
      vi.stubEnv('PROMPTFOO_ENABLE_INTERACTIVE_UI', 'true');
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
      const { shouldUseInkUI } = await import('../../src/ui/interactiveCheck');
      expect(shouldUseInkUI()).toBe(false);
    });

    it('should return true when FORCE is set (bypasses opt-in)', async () => {
      vi.stubEnv('PROMPTFOO_FORCE_INTERACTIVE_UI', 'true');
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      const { shouldUseInkUI } = await import('../../src/ui/interactiveCheck');
      expect(shouldUseInkUI()).toBe(true);
    });

    it('should return false when FORCE is set but no TTY available', async () => {
      vi.stubEnv('PROMPTFOO_FORCE_INTERACTIVE_UI', 'true');
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
      const { shouldUseInkUI } = await import('../../src/ui/interactiveCheck');
      expect(shouldUseInkUI()).toBe(false);
    });

    it('should return true when FORCE is set even without opt-in', async () => {
      vi.stubEnv('PROMPTFOO_FORCE_INTERACTIVE_UI', 'true');
      // ENABLE is not set
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      const { shouldUseInkUI } = await import('../../src/ui/interactiveCheck');
      expect(shouldUseInkUI()).toBe(true);
    });
  });

  describe('shouldUseInteractiveUI alias', () => {
    it('should be the same function as shouldUseInkUI', async () => {
      const { shouldUseInkUI, shouldUseInteractiveUI } = await import(
        '../../src/ui/interactiveCheck'
      );
      expect(shouldUseInteractiveUI).toBe(shouldUseInkUI);
    });
  });
});
