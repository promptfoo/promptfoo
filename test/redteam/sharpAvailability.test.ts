import { describe, expect, it } from 'vitest';
import { validateSharpDependency } from '../../src/redteam/sharpAvailability';

describe('validateSharpDependency', () => {
  // Dependency-injected checkers for deterministic tests
  const sharpAvailable = async () => true;
  const sharpUnavailable = async () => false;

  describe('when sharp is available', () => {
    it('should not throw when image strategy is used', async () => {
      const strategies = [{ id: 'image' }];
      const plugins = [{ id: 'harmful', numTests: 5 }];

      await expect(
        validateSharpDependency(strategies, plugins, sharpAvailable),
      ).resolves.not.toThrow();
    });

    it('should not throw when unsafebench plugin is used', async () => {
      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'unsafebench', numTests: 5 }];

      await expect(
        validateSharpDependency(strategies, plugins, sharpAvailable),
      ).resolves.not.toThrow();
    });

    it('should not throw when both image strategy and unsafebench plugin are used', async () => {
      const strategies = [{ id: 'image' }];
      const plugins = [{ id: 'unsafebench', numTests: 5 }];

      await expect(
        validateSharpDependency(strategies, plugins, sharpAvailable),
      ).resolves.not.toThrow();
    });
  });

  describe('when sharp is not required', () => {
    it('should not throw when no sharp-dependent features are used', async () => {
      const strategies = [{ id: 'base64' }, { id: 'jailbreak' }];
      const plugins = [
        { id: 'harmful', numTests: 5 },
        { id: 'pii', numTests: 3 },
      ];

      await expect(
        validateSharpDependency(strategies, plugins, sharpUnavailable),
      ).resolves.not.toThrow();
    });

    it('should not throw with empty strategies and plugins', async () => {
      await expect(validateSharpDependency([], [], sharpUnavailable)).resolves.not.toThrow();
    });
  });

  describe('when sharp is unavailable', () => {
    it('should throw error when image strategy is used', async () => {
      const strategies = [{ id: 'image' }];
      const plugins = [{ id: 'harmful', numTests: 5 }];

      await expect(validateSharpDependency(strategies, plugins, sharpUnavailable)).rejects.toThrow(
        "The sharp library is required for strategy 'image'",
      );
      await expect(validateSharpDependency(strategies, plugins, sharpUnavailable)).rejects.toThrow(
        'npm install sharp',
      );
    });

    it('should throw error when unsafebench plugin is used', async () => {
      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'unsafebench', numTests: 5 }];

      await expect(validateSharpDependency(strategies, plugins, sharpUnavailable)).rejects.toThrow(
        "The sharp library is required for plugin 'unsafebench'",
      );
      await expect(validateSharpDependency(strategies, plugins, sharpUnavailable)).rejects.toThrow(
        'npm install sharp',
      );
    });

    it('should list multiple features in error message when both are used', async () => {
      const strategies = [{ id: 'image' }];
      const plugins = [{ id: 'unsafebench', numTests: 5 }];

      await expect(validateSharpDependency(strategies, plugins, sharpUnavailable)).rejects.toThrow(
        "strategy 'image'",
      );
      await expect(validateSharpDependency(strategies, plugins, sharpUnavailable)).rejects.toThrow(
        "plugin 'unsafebench'",
      );
    });

    it('should not throw when sharp is unavailable but not needed', async () => {
      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'harmful', numTests: 5 }];

      await expect(
        validateSharpDependency(strategies, plugins, sharpUnavailable),
      ).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle strategies with config objects', async () => {
      const strategies = [{ id: 'image', config: { someOption: true } }];
      const plugins = [{ id: 'harmful', numTests: 5 }];

      await expect(
        validateSharpDependency(strategies, plugins, sharpAvailable),
      ).resolves.not.toThrow();
    });

    it('should handle plugins with config objects', async () => {
      const strategies = [{ id: 'base64' }];
      const plugins = [{ id: 'unsafebench', numTests: 5, config: { categories: ['Violence'] } }];

      await expect(
        validateSharpDependency(strategies, plugins, sharpAvailable),
      ).resolves.not.toThrow();
    });
  });
});
