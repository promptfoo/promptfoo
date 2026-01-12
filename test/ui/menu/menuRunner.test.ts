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

vi.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn(() => null),
  setUserEmail: vi.fn(),
}));

vi.mock('../../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    getApiKey: vi.fn(() => null),
    getApiHost: vi.fn(() => 'https://api.promptfoo.dev'),
    getAppUrl: vi.fn(() => 'https://promptfoo.dev'),
    isEnabled: vi.fn(() => false),
  },
}));

vi.mock('../../../src/util/cloud', () => ({
  resolveTeamId: vi.fn(),
}));

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../../../src/version', () => ({
  VERSION: '1.0.0-test',
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

vi.mock('../../../src/ui/menu/MenuApp', () => ({
  MenuApp: vi.fn(() => null),
}));

describe('menuRunner', () => {
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

  describe('shouldUseInkMenu', () => {
    it('should return true by default when in TTY and not in CI', async () => {
      const { shouldUseInkMenu } = await import('../../../src/ui/menu/menuRunner');
      expect(shouldUseInkMenu()).toBe(true);
    });

    it('should return false in CI environment', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);
      const { shouldUseInkMenu } = await import('../../../src/ui/menu/menuRunner');
      expect(shouldUseInkMenu()).toBe(false);
    });

    it('should return true when PROMPTFOO_FORCE_INTERACTIVE_UI is set even in CI', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);
      process.env.PROMPTFOO_FORCE_INTERACTIVE_UI = 'true';
      const { shouldUseInkMenu } = await import('../../../src/ui/menu/menuRunner');
      expect(shouldUseInkMenu()).toBe(true);
    });

    it('should return false when shouldUseInteractiveUI returns false', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(false);
      const { shouldUseInkMenu } = await import('../../../src/ui/menu/menuRunner');
      expect(shouldUseInkMenu()).toBe(false);
    });
  });

  describe('runInkMenu', () => {
    it('should render MenuApp with correct props', async () => {
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

      const { runInkMenu } = await import('../../../src/ui/menu/menuRunner');

      const result = await runInkMenu({ skipAuthCheck: true });

      // Verify renderInteractive was called
      expect(renderInteractive).toHaveBeenCalled();
      expect(result.cancelled).toBe(true);
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should return selected item when onSelect is called', async () => {
      const mockCleanup = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      const testItem = {
        id: 'eval',
        label: 'Run Evaluation',
        description: 'Run prompts against test cases',
        category: 'quick' as const,
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

      const { runInkMenu } = await import('../../../src/ui/menu/menuRunner');

      const result = await runInkMenu({ skipAuthCheck: true });

      expect(result.cancelled).toBe(false);
      expect(result.selectedItem).toEqual(testItem);
    });

    it('should pass version to MenuApp', async () => {
      const mockCleanup = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        const props = element.props as any;
        // Check version prop
        expect(props.version).toBe('1.0.0-test');
        // Simulate exit
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

      const { runInkMenu } = await import('../../../src/ui/menu/menuRunner');

      await runInkMenu({ skipAuthCheck: true });

      // Verification happens inside the mock implementation
    });
  });
});
