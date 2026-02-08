import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules before importing the module under test
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/ui/interactiveCheck', () => ({
  shouldUseInkUI: vi.fn(() => false),
}));

// Mock AuthApp to avoid loading ink/React
vi.mock('../../../src/ui/auth/AuthApp', () => ({
  AuthApp: vi.fn(() => null),
  createAuthController: vi.fn(() => ({
    setPhase: vi.fn(),
    setStatusMessage: vi.fn(),
    showTeamSelector: vi.fn(),
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

describe('authRunner', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset mocks to default return values
    const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
    const { renderInteractive } = await import('../../../src/ui/render');
    vi.mocked(shouldUseInkUI).mockReturnValue(false);
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

  describe('shouldUseInkAuth', () => {
    it('should return false by default (opt-in)', async () => {
      const { shouldUseInkAuth } = await import('../../../src/ui/auth/authRunner');
      expect(shouldUseInkAuth()).toBe(false);
    });

    it('should return true when shouldUseInkUI returns true', async () => {
      const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInkUI).mockReturnValue(true);

      const { shouldUseInkAuth } = await import('../../../src/ui/auth/authRunner');
      expect(shouldUseInkAuth()).toBe(true);
    });
  });

  describe('initInkAuth', () => {
    it('should initialize and return controller and promises', async () => {
      const mockRenderResult = {
        cleanup: vi.fn(),
        clear: vi.fn(),
        unmount: vi.fn(),
        rerender: vi.fn(),
        waitUntilExit: vi.fn().mockResolvedValue(undefined),
        frames: [],
        lastFrame: vi.fn().mockReturnValue(''),
        instance: { stdin: {} },
      };

      const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(shouldUseInkUI).mockReturnValue(true);
      vi.mocked(renderInteractive).mockResolvedValue(mockRenderResult as any);

      const { initInkAuth } = await import('../../../src/ui/auth/authRunner');

      const result = await initInkAuth({ initialPhase: 'logging_in' });

      expect(result).toHaveProperty('controller');
      expect(result).toHaveProperty('cleanup');
      expect(result).toHaveProperty('teamSelection');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('renderResult');
      expect(typeof result.controller.setPhase).toBe('function');
      expect(typeof result.controller.setStatusMessage).toBe('function');
      expect(typeof result.controller.showTeamSelector).toBe('function');
      expect(typeof result.controller.complete).toBe('function');
      expect(typeof result.controller.error).toBe('function');
    });

    it('should call renderInteractive with AuthApp element', async () => {
      const mockRenderResult = {
        cleanup: vi.fn(),
        clear: vi.fn(),
        unmount: vi.fn(),
        rerender: vi.fn(),
        waitUntilExit: vi.fn().mockResolvedValue(undefined),
        frames: [],
        lastFrame: vi.fn().mockReturnValue(''),
        instance: { stdin: {} },
      };

      const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
      const { renderInteractive } = await import('../../../src/ui/render');

      vi.mocked(shouldUseInkUI).mockReturnValue(true);
      vi.mocked(renderInteractive).mockResolvedValue(mockRenderResult as any);

      const { initInkAuth } = await import('../../../src/ui/auth/authRunner');

      await initInkAuth({ initialPhase: 'logging_in' });

      expect(renderInteractive).toHaveBeenCalledTimes(1);
      const [element, options] = vi.mocked(renderInteractive).mock.calls[0];
      expect((element as any).props.children.props.initialPhase).toBe('logging_in');
      expect(options).toEqual(
        expect.objectContaining({
          exitOnCtrlC: false,
          patchConsole: true,
        }),
      );
    });
  });
});
