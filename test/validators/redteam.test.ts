import {
  RedteamPluginObjectSchema,
  RedteamPluginSchema,
  RedteamStrategySchema,
  RedteamGenerateOptionsSchema,
  RedteamConfigSchema,
} from '../../src/validators/redteam';

describe('RedteamPluginObjectSchema', () => {
  it('should validate valid plugin object', () => {
    const validPlugin = {
      id: 'contracts',
      numTests: 5,
      config: { foo: 'bar' },
    };
    expect(() => RedteamPluginObjectSchema.parse(validPlugin)).not.toThrow();
  });

  it('should reject invalid plugin id', () => {
    const invalidPlugin = {
      id: 'invalid-plugin',
      numTests: 5,
    };
    expect(() => RedteamPluginObjectSchema.parse(invalidPlugin)).toThrow(
      /Custom plugins must start with file:\/\//,
    );
  });

  it('should accept file:// plugin paths', () => {
    const filePlugin = {
      id: 'file:///path/to/plugin.js',
      numTests: 5,
    };
    expect(() => RedteamPluginObjectSchema.parse(filePlugin)).not.toThrow();
  });
});

describe('RedteamPluginSchema', () => {
  it('should validate plugin string', () => {
    expect(() => RedteamPluginSchema.parse('contracts')).not.toThrow();
  });

  it('should validate plugin object', () => {
    const plugin = {
      id: 'contracts',
      numTests: 5,
    };
    expect(() => RedteamPluginSchema.parse(plugin)).not.toThrow();
  });

  it('should reject invalid plugin string', () => {
    expect(() => RedteamPluginSchema.parse('invalid-plugin')).toThrow(
      /Custom plugins must start with file:\/\//,
    );
  });
});

describe('RedteamStrategySchema', () => {
  it('should validate strategy string', () => {
    expect(() => RedteamStrategySchema.parse('basic')).not.toThrow();
  });

  it('should validate strategy object', () => {
    const strategy = {
      id: 'basic',
      config: { enabled: true },
    };
    expect(() => RedteamStrategySchema.parse(strategy)).not.toThrow();
  });

  it('should accept file:// strategy paths', () => {
    const strategy = {
      id: 'file:///path/to/strategy.js',
      config: {},
    };
    expect(() => RedteamStrategySchema.parse(strategy)).not.toThrow();
  });

  it('should reject invalid strategy', () => {
    expect(() => RedteamStrategySchema.parse('invalid-strategy')).toThrow(
      /Custom strategies must start with file:\/\//,
    );
  });
});

describe('RedteamGenerateOptionsSchema', () => {
  it('should validate minimal options', () => {
    const options = {
      cache: true,
      defaultConfig: {},
      write: false,
      burpEscapeJson: false,
    };
    expect(() => RedteamGenerateOptionsSchema.parse(options)).not.toThrow();
  });

  it('should validate full options', () => {
    const options = {
      cache: true,
      config: 'config.yaml',
      defaultConfig: {},
      defaultConfigPath: 'default-config.yaml',
      delay: 1000,
      envFile: '.env',
      force: true,
      injectVar: 'prompt',
      language: 'en',
      maxConcurrency: 5,
      numTests: 10,
      output: 'output.json',
      plugins: [{ id: 'contracts', numTests: 5 }],
      provider: 'openai',
      purpose: 'test',
      strategies: ['basic'],
      write: true,
      burpEscapeJson: true,
    };
    expect(() => RedteamGenerateOptionsSchema.parse(options)).not.toThrow();
  });

  it('should reject negative delay', () => {
    const options = {
      cache: true,
      defaultConfig: {},
      write: true,
      delay: -1,
      burpEscapeJson: false,
    };
    expect(() => RedteamGenerateOptionsSchema.parse(options)).toThrow(
      /Number must be greater than or equal to 0/,
    );
  });
});

describe('RedteamConfigSchema', () => {
  it('should validate minimal config', () => {
    const config = {};
    expect(() => RedteamConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate full config', () => {
    const config = {
      injectVar: 'prompt',
      purpose: 'test',
      provider: 'openai',
      numTests: 10,
      language: 'en',
      entities: ['entity1', 'entity2'],
      plugins: ['contracts'],
      strategies: ['basic'],
      maxConcurrency: 5,
      delay: 1000,
    };
    expect(() => RedteamConfigSchema.parse(config)).not.toThrow();
  });

  it('should expand plugin collections', () => {
    const config = {
      plugins: ['harmful'],
    };
    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins!.length).toBeGreaterThan(1);
    expect(result.plugins![0]).toHaveProperty('id');
  });

  it('should deduplicate strategies', () => {
    const config = {
      strategies: ['basic', 'basic', 'jailbreak'],
    };
    const result = RedteamConfigSchema.parse(config);
    expect(result.strategies![0]).toEqual({ id: 'jailbreak' });
  });

  it('should handle default strategy expansion', () => {
    const config = {
      strategies: ['default'],
    };
    const result = RedteamConfigSchema.parse(config);
    expect(result.strategies!.length).toBeGreaterThan(1);
  });

  it('should reject invalid plugin', () => {
    const config = {
      plugins: ['invalid-plugin'],
    };
    expect(() => RedteamConfigSchema.parse(config)).toThrow(
      /Custom plugins must start with file:\/\//,
    );
  });

  it('should reject invalid strategy', () => {
    const config = {
      strategies: ['invalid-strategy'],
    };
    expect(() => RedteamConfigSchema.parse(config)).toThrow(
      /Custom strategies must start with file:\/\//,
    );
  });
});
