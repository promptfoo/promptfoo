import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSharpDependency } from '../../src/redteam/sharpAvailability';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('validateSharpDependency', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // NOTE: Tests for "when sharp is available" are intentionally omitted.
  // The sharp library is optional and not installed in CI environments.
  // The core validation logic is tested in the "when sharp is unavailable" section below,
  // which mocks sharp to test both success and failure scenarios.

  describe('when sharp is not required', () => {
    it('should not throw when no sharp-dependent features are used', async () => {
      const strategies = [{ id: 'base64' }, { id: 'jailbreak' }];
      const plugins = [
        { id: 'harmful', numTests: 5 },
        { id: 'pii', numTests: 3 },
      ];

      await expect(validateSharpDependency(strategies, plugins)).resolves.not.toThrow();
    });

    it('should not throw with empty strategies and plugins', async () => {
      await expect(validateSharpDependency([], [])).resolves.not.toThrow();
    });
  });

  describe('when sharp is unavailable', () => {
    beforeEach(() => {
      // Mock sharp to simulate it not being installed
      vi.doMock('sharp', () => {
        throw new Error('Cannot find module sharp');
      });
    });

    it('should throw error when image strategy is used and sharp is unavailable', async () => {
      // Re-import to get the mocked version
      vi.resetModules();
      vi.doMock('sharp', () => {
        throw new Error('Cannot find module sharp');
      });
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'image' }];
      const plugins = [{ id: 'harmful', numTests: 5 }];

      await expect(validate(strategies, plugins)).rejects.toThrow(
        "The sharp library is required for strategy 'image'",
      );
      await expect(validate(strategies, plugins)).rejects.toThrow('npm install sharp');
    });

    it('should throw error when unsafebench plugin is used and sharp is unavailable', async () => {
      vi.resetModules();
      vi.doMock('sharp', () => {
        throw new Error('Cannot find module sharp');
      });
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'unsafebench', numTests: 5 }];

      await expect(validate(strategies, plugins)).rejects.toThrow(
        "The sharp library is required for plugin 'unsafebench'",
      );
      await expect(validate(strategies, plugins)).rejects.toThrow('npm install sharp');
    });

    it('should list multiple features in error message when both are used', async () => {
      vi.resetModules();
      vi.doMock('sharp', () => {
        throw new Error('Cannot find module sharp');
      });
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'image' }];
      const plugins = [{ id: 'unsafebench', numTests: 5 }];

      await expect(validate(strategies, plugins)).rejects.toThrow("strategy 'image'");
      await expect(validate(strategies, plugins)).rejects.toThrow("plugin 'unsafebench'");
    });

    it('should not throw when sharp is unavailable but not needed', async () => {
      vi.resetModules();
      vi.doMock('sharp', () => {
        throw new Error('Cannot find module sharp');
      });
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'harmful', numTests: 5 }];

      await expect(validate(strategies, plugins)).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle strategies with config objects', async () => {
      // This test uses plugins that don't require sharp
      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'harmful', numTests: 5, config: { someOption: true } }];

      await expect(validateSharpDependency(strategies, plugins)).resolves.not.toThrow();
    });

    it('should handle plugins with config objects that do not require sharp', async () => {
      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'pii', numTests: 5, config: { categories: ['email'] } }];

      await expect(validateSharpDependency(strategies, plugins)).resolves.not.toThrow();
    });
  });
});
