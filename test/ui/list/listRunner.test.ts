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

describe('listRunner', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete process.env.PROMPTFOO_FORCE_INTERACTIVE_UI;
    delete process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI;
  });

  describe('shouldUseInkList', () => {
    it('should return true by default when in TTY and not in CI', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/render');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(true);

      const { shouldUseInkList } = await import('../../../src/ui/list/listRunner');
      expect(shouldUseInkList()).toBe(true);
    });

    it('should return false in CI environment', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);

      const { shouldUseInkList } = await import('../../../src/ui/list/listRunner');
      expect(shouldUseInkList()).toBe(false);
    });

    it('should return true when PROMPTFOO_FORCE_INTERACTIVE_UI is set even in CI', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);
      process.env.PROMPTFOO_FORCE_INTERACTIVE_UI = 'true';

      const { shouldUseInkList } = await import('../../../src/ui/list/listRunner');
      expect(shouldUseInkList()).toBe(true);
    });

    it('should return false when shouldUseInteractiveUI returns false', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/render');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(false);

      const { shouldUseInkList } = await import('../../../src/ui/list/listRunner');
      expect(shouldUseInkList()).toBe(false);
    });
  });

  describe('runInkList', () => {
    it('should render ListApp with correct props', async () => {
      const mockCleanup = vi.fn();
      const mockWaitUntilExit = vi.fn().mockResolvedValue(undefined);
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(renderInteractive).mockResolvedValue({
        cleanup: mockCleanup,
        clear: vi.fn(),
        unmount: vi.fn(),
        rerender: vi.fn(),
        waitUntilExit: mockWaitUntilExit,
        frames: [],
        lastFrame: vi.fn(),
        instance: {},
      } as any);

      const { runInkList } = await import('../../../src/ui/list/listRunner');

      // Start the run but don't await - it will wait for user interaction
      const resultPromise = runInkList({
        resourceType: 'evals',
        items: [],
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

      // Now we can await the result
      const result = await resultPromise;
      expect(result.cancelled).toBe(true);
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should return selected item when onSelect is called', async () => {
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

      const { runInkList } = await import('../../../src/ui/list/listRunner');

      const testItem = {
        id: 'test-id',
        description: 'Test eval',
        prompts: [],
        vars: [],
        createdAt: new Date(),
      };

      const resultPromise = runInkList({
        resourceType: 'evals',
        items: [testItem],
      });

      // Simulate select callback
      const call = vi.mocked(renderInteractive).mock.calls[0];
      const element = call[0];
      const props = element.props as any;
      props.onSelect?.(testItem);

      const result = await resultPromise;
      expect(result.cancelled).toBe(false);
      expect(result.selectedItem).toEqual(testItem);
    });
  });
});
