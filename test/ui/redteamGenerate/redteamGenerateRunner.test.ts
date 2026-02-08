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

// Mock RedteamGenerateApp to avoid loading ink/React
vi.mock('../../../src/ui/redteamGenerate/RedteamGenerateApp', () => ({
  RedteamGenerateApp: vi.fn(() => null),
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

describe('redteamGenerateRunner', () => {
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

  describe('shouldUseInkRedteamGenerate', () => {
    it('should return false by default (opt-in)', async () => {
      const { shouldUseInkRedteamGenerate } = await import(
        '../../../src/ui/redteamGenerate/redteamGenerateRunner'
      );
      expect(shouldUseInkRedteamGenerate()).toBe(false);
    });

    it('should return true when shouldUseInkUI returns true', async () => {
      const { shouldUseInkUI } = await import('../../../src/ui/interactiveCheck');
      vi.mocked(shouldUseInkUI).mockReturnValue(true);

      const { shouldUseInkRedteamGenerate } = await import(
        '../../../src/ui/redteamGenerate/redteamGenerateRunner'
      );
      expect(shouldUseInkRedteamGenerate()).toBe(true);
    });
  });
});
