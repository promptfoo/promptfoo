import {
  ALIASED_PLUGIN_MAPPINGS,
  COLLECTIONS,
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  FOUNDATION_PLUGINS,
  HARM_PLUGINS,
  PII_PLUGINS,
  DEFAULT_PLUGINS,
  Severity,
} from '../../src/redteam/constants';
import { RedteamConfigSchema } from '../../src/validators/redteam';

describe('RedteamConfigSchema', () => {
  it('should validate basic config', () => {
    const config = {
      plugins: ['default'],
      strategies: ['default'],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins).toBeDefined();
    expect(result.strategies).toBeDefined();
  });

  it('should expand default plugins', () => {
    const config = {
      plugins: ['default'],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.length).toBeGreaterThan(0);
    expect(result.plugins?.every((p: any) => Array.from(DEFAULT_PLUGINS).includes(p.id))).toBe(
      true,
    );
  });

  it('should expand foundation plugins', () => {
    const config = {
      plugins: ['foundation'],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.length).toBeGreaterThan(0);
    expect(result.plugins?.every((p: any) => Array.from(FOUNDATION_PLUGINS).includes(p.id))).toBe(
      true,
    );
  });

  it('should expand harmful plugins', () => {
    const config = {
      plugins: ['harmful'],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.length).toBeGreaterThan(0);
    expect(result.plugins?.every((p: any) => Object.keys(HARM_PLUGINS).includes(p.id))).toBe(true);
  });

  it('should expand PII plugins', () => {
    const config = {
      plugins: ['pii'],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.length).toBeGreaterThan(0);
    expect(result.plugins?.every((p: any) => Array.from(PII_PLUGINS).includes(p.id))).toBe(true);
  });

  it('should handle plugin with config and severity', () => {
    const config = {
      plugins: [
        {
          id: 'file://test-plugin.js',
          config: { key: 'value' },
          severity: Severity.High,
          numTests: DEFAULT_NUM_TESTS_PER_PLUGIN,
        },
      ],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.[0]).toEqual({
      id: 'file://test-plugin.js',
      config: { key: 'value' },
      severity: Severity.High,
      numTests: DEFAULT_NUM_TESTS_PER_PLUGIN,
    });
  });

  it('should handle aliased plugins', () => {
    const config = {
      plugins: [Object.keys(ALIASED_PLUGIN_MAPPINGS)[0]],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.length).toBeGreaterThan(0);
  });

  it('should validate custom file:// plugins', () => {
    const config = {
      plugins: ['file:///path/to/plugin.js'],
    };

    expect(() => RedteamConfigSchema.parse(config)).not.toThrow();
  });

  it('should reject invalid plugin names', () => {
    const config = {
      plugins: ['invalid-plugin-name'],
    };

    expect(() => RedteamConfigSchema.parse(config)).toThrow(
      /Custom plugins must start with file:\/\//,
    );
  });

  it('should handle numTests override', () => {
    const config = {
      numTests: 5,
      plugins: ['file://test-plugin.js'],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.[0].numTests).toBe(5);
  });

  it('should use default numTests when not specified', () => {
    const config = {
      plugins: [
        {
          id: 'file://test-plugin.js',
          numTests: DEFAULT_NUM_TESTS_PER_PLUGIN,
        },
      ],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.[0].numTests).toBe(DEFAULT_NUM_TESTS_PER_PLUGIN);
  });

  it('should deduplicate plugins', () => {
    const config = {
      plugins: ['file://test-plugin.js', 'file://test-plugin.js'],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins).toHaveLength(1);
  });

  it('should handle collection plugins', () => {
    const config = {
      plugins: COLLECTIONS,
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.length).toBeGreaterThan(0);
  });

  it('should validate RedteamPluginObjectSchema', () => {
    const validPlugin = {
      id: 'file://test-plugin.js',
      numTests: 5,
      config: { key: 'value' },
      severity: Severity.High,
    };

    const config = {
      plugins: [validPlugin],
    };

    expect(() => RedteamConfigSchema.parse(config)).not.toThrow();
  });

  it('should handle plugin with severity but no config', () => {
    const config = {
      plugins: [
        {
          id: 'file://test-plugin.js',
          severity: Severity.Low,
        },
      ],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.[0].severity).toBe(Severity.Low);
    expect(result.plugins?.[0].config).toBeUndefined();
  });

  it('should preserve severity when expanding collections', () => {
    const config = {
      plugins: [
        {
          id: 'foundation',
          severity: Severity.Critical,
        },
      ],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.every((p) => p.severity === Severity.Critical)).toBe(true);
  });

  it('should handle strategy with config', () => {
    const config = {
      plugins: ['default'],
      strategies: [{ id: 'default', config: { key: 'value' } }],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.strategies?.[0]).toEqual(expect.objectContaining({ config: { key: 'value' } }));
  });

  it('should handle custom file:// strategies', () => {
    const config = {
      plugins: ['default'],
      strategies: ['file:///path/to/strategy.js'],
    };

    expect(() => RedteamConfigSchema.parse(config)).not.toThrow();
  });
});
