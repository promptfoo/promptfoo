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

vi.mock('../../../src/ui/render', () => ({
  shouldUseInteractiveUI: vi.fn(() => true),
  renderInteractive: vi.fn(),
}));

describe('cacheRunner', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete process.env.PROMPTFOO_FORCE_INTERACTIVE_UI;
    delete process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI;
  });

  describe('shouldUseInkCache', () => {
    it('should return true by default when in TTY and not in CI', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/render');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(true);

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
      const { shouldUseInteractiveUI } = await import('../../../src/ui/render');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(false);

      const { shouldUseInkCache } = await import('../../../src/ui/cache/cacheRunner');
      expect(shouldUseInkCache()).toBe(false);
    });
  });

  describe('runInkCache', () => {
    it('should render CacheApp with correct props', async () => {
      const mockCleanup = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(renderInteractive).mockResolvedValue({
        cleanup: mockCleanup,
        clear: vi.fn(),
        unmount: vi.fn(),
        rerender: vi.fn(),
        waitUntilExit: vi.fn().mockResolvedValue(undefined),
        frames: [],
        lastFrame: vi.fn(),
        instance: {},
      } as any);

      const { runInkCache } = await import('../../../src/ui/cache/cacheRunner');

      const mockGetStats = vi.fn().mockResolvedValue({
        totalSize: 1024,
        itemCount: 10,
        cachePath: '/test/cache',
        enabled: true,
      });
      const mockClearCache = vi.fn().mockResolvedValue(undefined);

      const resultPromise = runInkCache({
        getStats: mockGetStats,
        clearCache: mockClearCache,
      });

      // Verify renderInteractive was called
      expect(renderInteractive).toHaveBeenCalled();

      // Get the rendered element props
      const call = vi.mocked(renderInteractive).mock.calls[0];
      expect(call).toBeDefined();

      // Simulate exit callback
      const element = call[0];
      const props = element.props as any;
      props.onExit?.();

      const result = await resultPromise;
      expect(result.cleared).toBe(false);
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should return cleared=true when cache is cleared', async () => {
      const mockCleanup = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(renderInteractive).mockResolvedValue({
        cleanup: mockCleanup,
        clear: vi.fn(),
        unmount: vi.fn(),
        rerender: vi.fn(),
        waitUntilExit: vi.fn().mockResolvedValue(undefined),
        frames: [],
        lastFrame: vi.fn(),
        instance: {},
      } as any);

      const { runInkCache } = await import('../../../src/ui/cache/cacheRunner');

      const mockGetStats = vi.fn().mockResolvedValue({
        totalSize: 0,
        itemCount: 0,
        cachePath: '/test/cache',
        enabled: true,
      });
      const mockClearCache = vi.fn().mockResolvedValue(undefined);

      const resultPromise = runInkCache({
        getStats: mockGetStats,
        clearCache: mockClearCache,
      });

      // Get the rendered element props
      const call = vi.mocked(renderInteractive).mock.calls[0];
      const element = call[0];
      const props = element.props as any;

      // Simulate clear callback
      await props.onClear?.();

      // Then exit
      props.onExit?.();

      const result = await resultPromise;
      expect(result.cleared).toBe(true);
      expect(mockClearCache).toHaveBeenCalled();
    });
  });
});
