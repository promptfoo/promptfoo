import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  describe('when sharp is available', () => {
    it('should not throw when image strategy is used', async () => {
      // Mock sharp to simulate it being installed
      vi.doMock('sharp', () => ({ default: {} }));
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'image' }];
      const plugins = [{ id: 'harmful', numTests: 5 }];

      await expect(validate(strategies, plugins)).resolves.not.toThrow();
    });

    it('should not throw when unsafebench plugin is used', async () => {
      vi.doMock('sharp', () => ({ default: {} }));
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'unsafebench', numTests: 5 }];

      await expect(validate(strategies, plugins)).resolves.not.toThrow();
    });

    it('should not throw when both image strategy and unsafebench plugin are used', async () => {
      vi.doMock('sharp', () => ({ default: {} }));
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'image' }];
      const plugins = [{ id: 'unsafebench', numTests: 5 }];

      await expect(validate(strategies, plugins)).resolves.not.toThrow();
    });
  });

  describe('when sharp is not required', () => {
    it('should not throw when no sharp-dependent features are used', async () => {
      // Mock sharp to throw - but it shouldn't matter since sharp isn't needed
      vi.doMock('sharp', () => {
        throw new Error('Cannot find module sharp');
      });
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'base64' }, { id: 'jailbreak' }];
      const plugins = [
        { id: 'harmful', numTests: 5 },
        { id: 'pii', numTests: 3 },
      ];

      await expect(validate(strategies, plugins)).resolves.not.toThrow();
    });

    it('should not throw with empty strategies and plugins', async () => {
      vi.doMock('sharp', () => {
        throw new Error('Cannot find module sharp');
      });
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      await expect(validate([], [])).resolves.not.toThrow();
    });
  });

  describe('when sharp is unavailable', () => {
    it('should throw error when image strategy is used and sharp is unavailable', async () => {
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
      vi.doMock('sharp', () => ({ default: {} }));
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'image', config: { someOption: true } }];
      const plugins = [{ id: 'harmful', numTests: 5 }];

      await expect(validate(strategies, plugins)).resolves.not.toThrow();
    });

    it('should handle plugins with config objects', async () => {
      vi.doMock('sharp', () => ({ default: {} }));
      const { validateSharpDependency: validate } = await import(
        '../../src/redteam/sharpAvailability'
      );

      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'unsafebench', numTests: 5, config: { categories: ['Violence'] } }];

      await expect(validate(strategies, plugins)).resolves.not.toThrow();
    });
  });
});
