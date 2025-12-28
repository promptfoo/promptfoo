import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules before importing the module under test
vi.mock('../../../src/envars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/envars')>();
  return {
    ...actual,
    isCI: vi.fn(() => false),
  };
});

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/ui/interactiveCheck', () => ({
  shouldUseInteractiveUI: vi.fn(() => true),
  shouldUseInkUI: vi.fn(() => true),
  isInteractiveUIForced: vi.fn(() => false),
}));

vi.mock('../../../src/ui/render', () => ({
  renderInteractive: vi.fn().mockResolvedValue({
    cleanup: vi.fn(),
    clear: vi.fn(),
    unmount: vi.fn(),
    rerender: vi.fn(),
    waitUntilExit: vi.fn().mockResolvedValue(undefined),
    frames: [],
    lastFrame: vi.fn(),
    instance: {},
  }),
}));

vi.mock('../../../src/ui/cache/CacheApp', () => ({
  CacheApp: vi.fn(() => null),
}));

describe('cacheRunner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset mocks to default return values
    const { isCI } = await import('../../../src/envars');
    const { shouldUseInteractiveUI } = await import('../../../src/ui/interactiveCheck');
    const { renderInteractive } = await import('../../../src/ui/render');
    vi.mocked(isCI).mockReturnValue(false);
    vi.mocked(shouldUseInteractiveUI).mockReturnValue(true);
    vi.mocked(renderInteractive).mockResolvedValue({
      cleanup: vi.fn(),
      clear: vi.fn(),
      unmount: vi.fn(),
      rerender: vi.fn(),
      waitUntilExit: vi.fn().mockResolvedValue(undefined),
      frames: [],
      lastFrame: vi.fn(),
      instance: {},
    } as any);
  });

  afterEach(() => {
    delete process.env.PROMPTFOO_FORCE_INTERACTIVE_UI;
    delete process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI;
  });

  describe('shouldUseInkCache', () => {
    it('should return true by default when in TTY and not in CI', async () => {
      const { shouldUseInkCache } = await import('../../../src/ui/cache/cacheRunner');
      expect(shouldUseInkCache()).toBe(true);
    });

    it('should return false in CI environment', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);
      const { shouldUseInkCache } = await import('../../../src/ui/cache/cacheRunner');
      expect(shouldUseInkCache()).toBe(false);
    });

    it('should return true when PROMPTFOO_FORCE_INTERACTIVE_UI is set even in CI', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);
      process.env.PROMPTFOO_FORCE_INTERACTIVE_UI = 'true';
      const { shouldUseInkCache } = await import('../../../src/ui/cache/cacheRunner');
      expect(shouldUseInkCache()).toBe(true);
    });

    it('should return false when shouldUseInteractiveUI returns false', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(false);
      const { shouldUseInkCache } = await import('../../../src/ui/cache/cacheRunner');
      expect(shouldUseInkCache()).toBe(false);
    });
  });

  describe('runInkCache', () => {
    it('should render CacheApp with correct props', async () => {
      const mockCleanup = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        const props = element.props as any;
        // Simulate exit immediately
        setTimeout(() => props.onExit?.(), 0);
        return {
          cleanup: mockCleanup,
          clear: vi.fn(),
          unmount: vi.fn(),
          rerender: vi.fn(),
          waitUntilExit: vi.fn().mockResolvedValue(undefined),
          frames: [],
          lastFrame: vi.fn(),
          instance: {},
        } as any;
      });

      const { runInkCache } = await import('../../../src/ui/cache/cacheRunner');

      const mockGetStats = vi.fn().mockResolvedValue({
        totalSize: 1024,
        itemCount: 10,
        cachePath: '/test/cache',
        enabled: true,
      });
      const mockClearCache = vi.fn().mockResolvedValue(undefined);

      const result = await runInkCache({
        getStats: mockGetStats,
        clearCache: mockClearCache,
      });

      // Verify renderInteractive was called
      expect(renderInteractive).toHaveBeenCalled();
      expect(result.cleared).toBe(false);
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should return cleared=true when cache is cleared', async () => {
      const mockCleanup = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      const mockClearCache = vi.fn().mockResolvedValue(undefined);

      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        const props = element.props as any;
        // Simulate clearing cache then exit
        setTimeout(async () => {
          await props.onClear?.();
          props.onExit?.();
        }, 0);
        return {
          cleanup: mockCleanup,
          clear: vi.fn(),
          unmount: vi.fn(),
          rerender: vi.fn(),
          waitUntilExit: vi.fn().mockResolvedValue(undefined),
          frames: [],
          lastFrame: vi.fn(),
          instance: {},
        } as any;
      });

      const { runInkCache } = await import('../../../src/ui/cache/cacheRunner');

      const mockGetStats = vi.fn().mockResolvedValue({
        totalSize: 0,
        itemCount: 0,
        cachePath: '/test/cache',
        enabled: true,
      });

      const result = await runInkCache({
        getStats: mockGetStats,
        clearCache: mockClearCache,
      });

      expect(result.cleared).toBe(true);
      expect(mockClearCache).toHaveBeenCalled();
    });
  });
});
