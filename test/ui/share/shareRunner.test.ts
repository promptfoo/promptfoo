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

// Mock ShareApp to avoid loading ink/React
vi.mock('../../../src/ui/share/ShareApp', () => ({
  ShareApp: vi.fn(() => null),
  createShareController: vi.fn(() => ({
    setPhase: vi.fn(),
    setProgress: vi.fn(),
    complete: vi.fn(),
    error: vi.fn(),
  })),
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

describe('shareRunner', () => {
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

  describe('shouldUseInkShare', () => {
    it('should return true by default when in TTY and not in CI', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(true);

      const { shouldUseInkShare } = await import('../../../src/ui/share/shareRunner');
      expect(shouldUseInkShare()).toBe(true);
    });

    it('should return false in CI environment', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);

      const { shouldUseInkShare } = await import('../../../src/ui/share/shareRunner');
      expect(shouldUseInkShare()).toBe(false);
    });

    it('should return true when PROMPTFOO_FORCE_INTERACTIVE_UI is set even in CI', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);
      process.env.PROMPTFOO_FORCE_INTERACTIVE_UI = 'true';

      const { shouldUseInkShare } = await import('../../../src/ui/share/shareRunner');
      expect(shouldUseInkShare()).toBe(true);
    });

    it('should return false when shouldUseInteractiveUI returns false', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(false);

      const { shouldUseInkShare } = await import('../../../src/ui/share/shareRunner');
      expect(shouldUseInkShare()).toBe(false);
    });
  });

  describe('initInkShare', () => {
    it('should render ShareApp with correct props', async () => {
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

      const { initInkShare } = await import('../../../src/ui/share/shareRunner');

      const result = await initInkShare({
        evalId: 'test-eval-id',
        description: 'Test eval description',
        resultCount: 10,
        skipConfirmation: false,
      });

      // Verify renderInteractive was called
      expect(renderInteractive).toHaveBeenCalled();

      // Verify result structure
      expect(result.controller).toBeDefined();
      expect(result.cleanup).toBeDefined();
      expect(result.confirmation).toBeDefined();
      expect(result.result).toBeDefined();

      // Clean up
      result.cleanup();
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should resolve confirmation when onConfirm is called', async () => {
      const { renderInteractive } = await import('../../../src/ui/render');

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

      const { initInkShare } = await import('../../../src/ui/share/shareRunner');

      const shareUI = await initInkShare({
        evalId: 'test-eval-id',
      });

      // Get the rendered element props
      const call = vi.mocked(renderInteractive).mock.calls[0];
      const element = call[0];
      const props = element.props as any;

      // Simulate confirm callback
      props.onConfirm?.();

      const confirmed = await shareUI.confirmation;
      expect(confirmed).toBe(true);

      shareUI.cleanup();
    });

    it('should resolve confirmation=false when onCancel is called', async () => {
      const { renderInteractive } = await import('../../../src/ui/render');

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

      const { initInkShare } = await import('../../../src/ui/share/shareRunner');

      const shareUI = await initInkShare({
        evalId: 'test-eval-id',
      });

      // Get the rendered element props
      const call = vi.mocked(renderInteractive).mock.calls[0];
      const element = call[0];
      const props = element.props as any;

      // Simulate cancel callback
      props.onCancel?.();

      const confirmed = await shareUI.confirmation;
      expect(confirmed).toBe(false);

      const result = await shareUI.result;
      expect(result).toBeUndefined();

      shareUI.cleanup();
    });

    it('should resolve result with shareUrl when onComplete is called', async () => {
      const { renderInteractive } = await import('../../../src/ui/render');

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

      const { initInkShare } = await import('../../../src/ui/share/shareRunner');

      const shareUI = await initInkShare({
        evalId: 'test-eval-id',
        skipConfirmation: true,
      });

      // Get the rendered element props
      const call = vi.mocked(renderInteractive).mock.calls[0];
      const element = call[0];
      const props = element.props as any;

      // Simulate confirm and complete callbacks
      props.onConfirm?.();
      const shareUrl = 'https://promptfoo.dev/eval/123';
      props.onComplete?.(shareUrl);

      const result = await shareUI.result;
      expect(result).toBe(shareUrl);

      shareUI.cleanup();
    });
  });

  describe('createShareController', () => {
    it('should create a controller with all required methods', async () => {
      const { createShareController } = await import('../../../src/ui/share/ShareApp');

      const controller = createShareController();

      expect(controller.setPhase).toBeDefined();
      expect(controller.setProgress).toBeDefined();
      expect(controller.complete).toBeDefined();
      expect(controller.error).toBeDefined();
    });
  });
});
