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
import {
  RedteamConfigSchema,
  RedteamGenerateOptionsSchema,
  RedteamPluginObjectSchema,
} from '../../src/validators/redteam';

describe('RedteamPluginObjectSchema', () => {
  it('should validate a valid plugin object', () => {
    const validPlugin = {
      id: 'ascii-smuggling',
      numTests: 5,
      config: { foo: 'bar' },
    };

    const result = RedteamPluginObjectSchema.safeParse(validPlugin);
    expect(result.success).toBe(true);
  });

  it('should validate a plugin object with only required fields', () => {
    const validPlugin = {
      id: 'beavertails',
      numTests: 1,
    };

    const result = RedteamPluginObjectSchema.safeParse(validPlugin);
    expect(result.success).toBe(true);
  });

  it('should validate a custom plugin path', () => {
    const validPlugin = {
      id: 'file:///path/to/plugin.js',
      numTests: 1,
    };

    const result = RedteamPluginObjectSchema.safeParse(validPlugin);
    expect(result.success).toBe(true);
  });

  it('should reject invalid plugin names', () => {
    const invalidPlugin = {
      id: 'invalid-plugin',
      numTests: 1,
    };

    const result = RedteamPluginObjectSchema.safeParse(invalidPlugin);
    expect(result.success).toBe(false);
  });
});

describe('RedteamGenerateOptionsSchema', () => {
  it('should validate valid generate options', () => {
    const validOptions = {
      addPlugins: ['ascii-smuggling'],
      addStrategies: ['audio'],
      cache: true,
      config: 'config.yaml',
      defaultConfig: {},
      defaultConfigPath: 'default-config.yaml',
      delay: 1000,
      envFile: '.env',
      force: false,
      injectVar: 'test',
      language: 'en',
      maxConcurrency: 5,
      numTests: 10,
      output: 'output.json',
      plugins: [{ id: 'ascii-smuggling', numTests: 5 }],
      provider: 'openai',
      purpose: 'testing',
      strategies: ['audio'],
      write: true,
      burpEscapeJson: true,
      progressBar: true,
      target: 'test-target',
    };

    const result = RedteamGenerateOptionsSchema.safeParse(validOptions);
    if (!result.success) {
      console.log(result.error);
    }
    expect(result.success).toBe(true);
  });

  it('should validate minimal required options', () => {
    const minimalOptions = {
      cache: false,
      defaultConfig: {},
      force: false,
      write: false,
    };

    const result = RedteamGenerateOptionsSchema.safeParse(minimalOptions);
    expect(result.success).toBe(true);
  });

  it('should reject invalid plugin names in addPlugins', () => {
    const invalidOptions = {
      addPlugins: ['invalid-plugin'],
      cache: true,
      defaultConfig: {},
      force: false,
      write: false,
    };

    const result = RedteamGenerateOptionsSchema.safeParse(invalidOptions);
    expect(result.success).toBe(false);
  });

  it('should reject invalid strategy names in addStrategies', () => {
    const invalidOptions = {
      addStrategies: ['invalid-strategy'],
      cache: true,
      defaultConfig: {},
      force: false,
      write: false,
    };

    const result = RedteamGenerateOptionsSchema.safeParse(invalidOptions);
    expect(result.success).toBe(false);
  });
});

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

  it('should validate and transform a valid config', () => {
    const validConfig = {
      plugins: ['ascii-smuggling', 'beavertails'],
      strategies: ['audio'],
      numTests: 5,
      language: 'en',
      provider: 'openai',
      purpose: 'testing',
      delay: 1000,
      entities: ['test'],
      injectVar: 'test',
      excludeTargetOutputFromAgenticAttackGeneration: true,
    };

    const result = RedteamConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    expect(result.success && result.data.plugins).toHaveLength(2);
    expect(result.success && result.data.strategies).toBeDefined();
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

  it('should transform plugin collections correctly', () => {
    const config = {
      plugins: ['default', 'foundation'],
      strategies: ['audio'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    expect(result.success && result.data.plugins?.length).toBeGreaterThan(0);
    expect(result.success && result.data.strategies?.length).toBeGreaterThan(0);
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

  it('should handle aliased plugins', () => {
    const config = {
      plugins: ['harmful'],
      strategies: ['audio'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    expect(result.success && result.data.plugins?.length).toBeGreaterThan(0);
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

  it('should validate plugin objects with configs', () => {
    const config = {
      plugins: [
        {
          id: 'ascii-smuggling',
          numTests: 5,
          config: { custom: true },
        },
      ],
      strategies: ['audio'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should handle aliased plugins from constants', () => {
    const config = {
      plugins: [Object.keys(ALIASED_PLUGIN_MAPPINGS)[0]],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins?.length).toBeGreaterThan(0);
  });

  it('should handle custom strategy paths', () => {
    const config = {
      plugins: ['ascii-smuggling'],
      strategies: ['file:///path/to/strategy.js'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate custom file:// plugins', () => {
    const config = {
      plugins: ['file:///path/to/plugin.js'],
    };

    expect(() => RedteamConfigSchema.parse(config)).not.toThrow();
  });

  it('should reject invalid strategy paths', () => {
    const config = {
      plugins: ['ascii-smuggling'],
      strategies: ['file:///path/to/strategy.txt'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid plugin names', () => {
    const config = {
      plugins: ['invalid-plugin-name'],
    };

    expect(() => RedteamConfigSchema.parse(config)).toThrow(
      /Custom plugins must start with file:\/\//,
    );
  });

  it('should handle multiple plugin collections', () => {
    const config = {
      plugins: ['foundation', 'harmful', 'pii'],
      strategies: ['audio'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    expect(result.success && result.data.plugins?.length).toBeGreaterThan(0);
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

  it('should validate delay in config', () => {
    const config = {
      plugins: ['ascii-smuggling'],
      strategies: ['audio'],
      delay: 1000,
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    expect(result.success && result.data.delay).toBe(1000);
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
