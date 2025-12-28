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

describe('redteamGenerateRunner', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete process.env.PROMPTFOO_FORCE_INTERACTIVE_UI;
    delete process.env.PROMPTFOO_DISABLE_INTERACTIVE_UI;
  });

  describe('shouldUseInkRedteamGenerate', () => {
    it('should return true by default when in TTY and not in CI', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/render');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(true);

      const { shouldUseInkRedteamGenerate } = await import(
        '../../../src/ui/redteamGenerate/redteamGenerateRunner'
      );
      expect(shouldUseInkRedteamGenerate()).toBe(true);
    });

    it('should return false in CI environment', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);

      const { shouldUseInkRedteamGenerate } = await import(
        '../../../src/ui/redteamGenerate/redteamGenerateRunner'
      );
      expect(shouldUseInkRedteamGenerate()).toBe(false);
    });

    it('should return true when PROMPTFOO_FORCE_INTERACTIVE_UI is set even in CI', async () => {
      const { isCI } = await import('../../../src/envars');
      vi.mocked(isCI).mockReturnValue(true);
      process.env.PROMPTFOO_FORCE_INTERACTIVE_UI = 'true';

      const { shouldUseInkRedteamGenerate } = await import(
        '../../../src/ui/redteamGenerate/redteamGenerateRunner'
      );
      expect(shouldUseInkRedteamGenerate()).toBe(true);
    });

    it('should return false when shouldUseInteractiveUI returns false', async () => {
      const { shouldUseInteractiveUI } = await import('../../../src/ui/render');
      vi.mocked(shouldUseInteractiveUI).mockReturnValue(false);

      const { shouldUseInkRedteamGenerate } = await import(
        '../../../src/ui/redteamGenerate/redteamGenerateRunner'
      );
      expect(shouldUseInkRedteamGenerate()).toBe(false);
    });
  });
});
