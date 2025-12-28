import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the dependencies
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

// Mock RedteamInitApp to avoid loading ink/React
vi.mock('../../../src/ui/init/RedteamInitApp', () => ({
  RedteamInitApp: vi.fn(() => null),
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

describe('redteamInitRunner', () => {
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
    delete process.env.PROMPTFOO_FORCE_INTERACTIVE_INIT;
    delete process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI;
  });

  describe('shouldUseInkRedteamInit', () => {
    it('returns true by default when in TTY and not in CI', async () => {
      const { shouldUseInkRedteamInit } = await import('../../../src/ui/init/redteamInitRunner');
      expect(shouldUseInkRedteamInit()).toBe(true);
    });

    it('returns false when in CI environment', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);

      const { shouldUseInkRedteamInit } = await import('../../../src/ui/init/redteamInitRunner');
      expect(shouldUseInkRedteamInit()).toBe(false);
    });

    it('returns true when PROMPTFOO_FORCE_INTERACTIVE_INIT is true even in CI', async () => {
      process.env.PROMPTFOO_FORCE_INTERACTIVE_INIT = 'true';

      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);

      const { shouldUseInkRedteamInit } = await import('../../../src/ui/init/redteamInitRunner');
      expect(shouldUseInkRedteamInit()).toBe(true);
    });

    it('returns false when shouldUseInteractiveUI returns false', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(false);

      const { shouldUseInkRedteamInit } = await import('../../../src/ui/init/redteamInitRunner');
      expect(shouldUseInkRedteamInit()).toBe(false);
    });
  });

  describe('runInkRedteamInit', () => {
    it('returns success result when initialization completes', async () => {
      const { renderInteractive } = await import('../../../src/ui/render');
      vi.mocked(renderInteractive).mockImplementation(async (element, _options) => {
        // Simulate the onComplete callback being called
        const props = (element as any).props;
        setTimeout(() => {
          props.onComplete({
            directory: '/test/dir',
            filesWritten: ['promptfooconfig.yaml'],
          });
        }, 10);

        return {
          instance: {} as any,
          cleanup: vi.fn(),
          clear: vi.fn(),
          unmount: vi.fn(),
          rerender: vi.fn(),
          waitUntilExit: vi.fn().mockResolvedValue(undefined),
          frames: [],
          lastFrame: vi.fn(),
        };
      });

      const { runInkRedteamInit } = await import('../../../src/ui/init/redteamInitRunner');
      const result = await runInkRedteamInit({ directory: '/test/dir' });

      expect(result.success).toBe(true);
      expect(result.outputDirectory).toBe('/test/dir');
      expect(result.configPath).toBe('/test/dir/promptfooconfig.yaml');
      expect(result.filesWritten).toEqual(['promptfooconfig.yaml']);
    });

    it('returns cancelled result when user cancels', async () => {
      const { renderInteractive } = await import('../../../src/ui/render');
      vi.mocked(renderInteractive).mockImplementation(async (element, _options) => {
        // Simulate the onCancel callback being called
        const props = (element as any).props;
        setTimeout(() => {
          props.onCancel();
        }, 10);

        return {
          instance: {} as any,
          cleanup: vi.fn(),
          clear: vi.fn(),
          unmount: vi.fn(),
          rerender: vi.fn(),
          waitUntilExit: vi.fn().mockResolvedValue(undefined),
          frames: [],
          lastFrame: vi.fn(),
        };
      });

      const { runInkRedteamInit } = await import('../../../src/ui/init/redteamInitRunner');
      const result = await runInkRedteamInit({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cancelled by user');
    });
  });
});
