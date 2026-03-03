import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules before importing the module under test
vi.mock('../../../src/envars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/envars')>();
  return {
    ...actual,
    getEnvBool: vi.fn((key: string) => {
      if (key === 'PROMPTFOO_ENABLE_INTERACTIVE_UI') {
        return process.env.PROMPTFOO_ENABLE_INTERACTIVE_UI === 'true';
      }
      return false;
    }),
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
  shouldUseInkUI: vi.fn(() => false), // Default to false (opt-in behavior)
  canUseInteractiveUI: vi.fn(() => true),
  isInteractiveUIEnabled: vi.fn(() => false),
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

vi.mock('../../../src/ui/list/ListApp', () => ({
  ListApp: vi.fn(() => null),
}));

describe('listRunner', () => {
  beforeEach(async () => {
    // Reset mocks with mockReset() for full test isolation (clears implementations too)
    const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
    const { renderInteractive } = await import('../../../src/ui/render');

    vi.mocked(shouldUseInkUI).mockReset().mockReturnValue(false); // Default opt-in: not enabled
    vi.mocked(renderInteractive)
      .mockReset()
      .mockResolvedValue({
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
    vi.resetAllMocks();
    delete process.env.PROMPTFOO_ENABLE_INTERACTIVE_UI;
  });

  describe('shouldUseInkList', () => {
    it('should return false by default (opt-in behavior)', async () => {
      const { shouldUseInkList } = await import('../../../src/ui/list/listRunner');
      expect(shouldUseInkList()).toBe(false);
    });

    it('should return true when shouldUseInkUI returns true (user opted in)', async () => {
      const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInkUI).mockReturnValue(true);
      const { shouldUseInkList } = await import('../../../src/ui/list/listRunner');
      expect(shouldUseInkList()).toBe(true);
    });

    it('should return false when not in TTY (shouldUseInkUI returns false)', async () => {
      const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInkUI).mockReturnValue(false); // TTY not available
      const { shouldUseInkList } = await import('../../../src/ui/list/listRunner');
      expect(shouldUseInkList()).toBe(false);
    });
  });

  describe('runInkList', () => {
    it('should render ListApp with correct props', async () => {
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

      const { runInkList } = await import('../../../src/ui/list/listRunner');

      const result = await runInkList({
        resourceType: 'evals',
        items: [],
      });

      // Verify renderInteractive was called
      expect(renderInteractive).toHaveBeenCalled();
      expect(result.cancelled).toBe(true);
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should return selected item when onSelect is called', async () => {
      const mockCleanup = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      const testItem = {
        id: 'test-id',
        description: 'Test eval',
        prompts: [],
        vars: [],
        createdAt: new Date(),
      };

      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        const props = element.props as any;
        // Simulate selecting the item
        setTimeout(() => props.onSelect?.(testItem), 0);
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

      const { runInkList } = await import('../../../src/ui/list/listRunner');

      const result = await runInkList({
        resourceType: 'evals',
        items: [testItem],
      });

      expect(result.cancelled).toBe(false);
      expect(result.selectedItem).toEqual(testItem);
    });
  });
});
