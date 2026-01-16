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
    getEnvString: vi.fn(() => undefined),
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

vi.mock('../../../src/ui/init/InitWizard', () => ({
  InitWizard: vi.fn(() => null),
}));

describe('initRunner', () => {
  beforeEach(async () => {
    // Reset mocks with mockReset() for full test isolation
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

  describe('shouldUseInkInit', () => {
    it('should return false by default (opt-in behavior)', async () => {
      const { shouldUseInkInit } = await import('../../../src/ui/init/initRunner');
      expect(shouldUseInkInit()).toBe(false);
    });

    it('should return true when shouldUseInkUI returns true (user opted in)', async () => {
      const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInkUI).mockReturnValue(true);
      const { shouldUseInkInit } = await import('../../../src/ui/init/initRunner');
      expect(shouldUseInkInit()).toBe(true);
    });

    it('should return false when not in TTY (shouldUseInkUI returns false)', async () => {
      const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInkUI).mockReturnValue(false);
      const { shouldUseInkInit } = await import('../../../src/ui/init/initRunner');
      expect(shouldUseInkInit()).toBe(false);
    });
  });

  describe('runInkInit', () => {
    it('should render InitWizard with correct props', async () => {
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

      const { runInkInit } = await import('../../../src/ui/init/initRunner');

      const result = await runInkInit({
        directory: '.',
      });

      // Verify renderInteractive was called
      expect(renderInteractive).toHaveBeenCalled();
      expect(result.cancelled).toBe(true);
      expect(mockCleanup).toHaveBeenCalled();
    });

    it('should return result when wizard completes', async () => {
      const mockCleanup = vi.fn();
      const { renderInteractive } = await import('../../../src/ui/render');

      const testResult = {
        numPrompts: 1,
        providerPrefixes: ['openai'],
        action: 'compare',
        language: 'not_sure',
        cancelled: false,
      };

      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        const props = element.props as any;
        // Simulate completion
        setTimeout(() => props.onComplete?.(testResult), 0);
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

      const { runInkInit } = await import('../../../src/ui/init/initRunner');

      const result = await runInkInit({
        directory: 'test-dir',
      });

      expect(result.cancelled).toBe(false);
      expect(result.action).toBe('compare');
      expect(result.providerPrefixes).toEqual(['openai']);
    });

    it('should pass directory prop to InitWizard', async () => {
      const { renderInteractive } = await import('../../../src/ui/render');

      let capturedProps: any = null;
      vi.mocked(renderInteractive).mockImplementation(async (element) => {
        capturedProps = element.props;
        // Simulate exit immediately
        setTimeout(() => capturedProps.onExit?.(), 0);
        return {
          cleanup: vi.fn(),
          clear: vi.fn(),
          unmount: vi.fn(),
          rerender: vi.fn(),
          waitUntilExit: vi.fn().mockResolvedValue(undefined),
          frames: [],
          lastFrame: vi.fn(),
          instance: {},
        } as any;
      });

      const { runInkInit } = await import('../../../src/ui/init/initRunner');

      await runInkInit({
        directory: 'my-project',
      });

      expect(capturedProps?.directory).toBe('my-project');
    });
  });
});
