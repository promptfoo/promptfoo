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

  it('should handle aliased plugins', () => {
    const config = {
      plugins: ['harmful'],
      strategies: ['audio'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    expect(result.success && result.data.plugins?.length).toBeGreaterThan(0);
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

  it('should handle custom strategy paths', () => {
    const config = {
      plugins: ['ascii-smuggling'],
      strategies: ['file:///path/to/strategy.js'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject invalid strategy paths', () => {
    const config = {
      plugins: ['ascii-smuggling'],
      strategies: ['file:///path/to/strategy.txt'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
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
});
