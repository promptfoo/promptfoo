import { FOUNDATION_PLUGINS } from '../../src/redteam/constants';
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
      id: 'pii:direct',
      numTests: 5,
      config: { key: 'value' },
    };

    const result = RedteamPluginObjectSchema.safeParse(validPlugin);
    expect(result.success).toBe(true);
  });

  it('should reject invalid plugin id', () => {
    const invalidPlugin = {
      id: 'invalid-plugin',
      numTests: 5,
    };

    const result = RedteamPluginObjectSchema.safeParse(invalidPlugin);
    expect(result.success).toBe(false);
  });

  it('should allow custom plugin paths starting with file://', () => {
    const customPlugin = {
      id: 'file:///path/to/plugin.js',
      numTests: 5,
    };

    const result = RedteamPluginObjectSchema.safeParse(customPlugin);
    expect(result.success).toBe(true);
  });
});

describe('RedteamPluginSchema', () => {
  it('should validate string plugin id', () => {
    const result = RedteamPluginSchema.safeParse('pii:direct');
    expect(result.success).toBe(true);
  });

  it('should validate plugin object', () => {
    const plugin = {
      id: 'pii:direct',
      numTests: 5,
    };

    const result = RedteamPluginSchema.safeParse(plugin);
    expect(result.success).toBe(true);
  });
});

describe('RedteamStrategySchema', () => {
  it('should validate string strategy id', () => {
    const result = RedteamStrategySchema.safeParse('basic');
    expect(result.success).toBe(true);
  });

  it('should validate strategy object', () => {
    const strategy = {
      id: 'basic',
      config: { enabled: true },
    };

    const result = RedteamStrategySchema.safeParse(strategy);
    expect(result.success).toBe(true);
  });

  it('should allow custom strategy paths', () => {
    const customStrategy = {
      id: 'file:///path/to/strategy.js',
      config: { enabled: true },
    };

    const result = RedteamStrategySchema.safeParse(customStrategy);
    expect(result.success).toBe(true);
  });
});

describe('RedteamGenerateOptionsSchema', () => {
  it('should validate valid generate options', () => {
    const options = {
      cache: true,
      defaultConfig: {},
      force: false,
      write: true,
      burpEscapeJson: true,
      progressBar: true,
    };

    const result = RedteamGenerateOptionsSchema.safeParse(options);
    expect(result.success).toBe(true);
  });

  it('should validate optional fields', () => {
    const options = {
      cache: true,
      defaultConfig: {},
      write: true,
      plugins: [{ id: 'pii:direct', numTests: 5 }],
      strategies: ['basic'],
      maxConcurrency: 5,
      delay: 1000,
    };

    const result = RedteamGenerateOptionsSchema.safeParse(options);
    expect(result.success).toBe(true);
  });
});

describe('RedteamConfigSchema', () => {
  it('should validate basic config', () => {
    const config = {
      plugins: ['default'],
      strategies: ['default'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should expand foundation collection', () => {
    const config = {
      plugins: ['foundation'],
      strategies: ['default'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);

    // Assert plugins are expanded correctly
    const parsedResult = result as { success: true; data: { plugins: Array<{ id: string }> } };
    const plugins = parsedResult.data.plugins.map((p) => p.id);
    FOUNDATION_PLUGINS.forEach((plugin) => {
      expect(plugins).toContain(plugin);
    });
  });

  it('should handle plugin aliases and collections', () => {
    const config = {
      plugins: ['harmful', 'pii'],
      strategies: ['basic'],
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate full config with all options', () => {
    const config = {
      injectVar: 'test',
      purpose: 'Testing',
      provider: 'openai:gpt-4',
      numTests: 10,
      language: 'en',
      entities: ['TestOrg'],
      plugins: ['pii:direct'],
      strategies: ['basic'],
      maxConcurrency: 5,
      delay: 1000,
    };

    const result = RedteamConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
