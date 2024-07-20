import {
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  ALL_STRATEGIES as REDTEAM_ALL_STRATEGIES,
  COLLECTIONS,
} from '../../src/redteam/constants';
import { HARM_PLUGINS } from '../../src/redteam/plugins/harmful';
import {
  RedteamGenerateOptionsSchema,
  redteamConfigSchema,
  redteamPluginSchema,
} from '../../src/redteam/types';

describe('RedteamGenerateOptionsSchema', () => {
  it('should accept valid options for a redteam test', () => {
    const input = {
      cache: true,
      config: 'promptfooconfig.yaml',
      defaultConfig: { temperature: 0.7 },
      injectVar: 'query',
      numTests: 50,
      output: 'sample-results.json',
      plugins: [{ id: 'harmful:hate' }],
      provider: 'openai:gpt-4',
      purpose: 'You are an expert content moderator',
      write: true,
    };
    expect(RedteamGenerateOptionsSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        cache: true,
        config: 'promptfooconfig.yaml',
        defaultConfig: { temperature: 0.7 },
        injectVar: 'query',
        numTests: 50,
        output: 'sample-results.json',
        plugins: [{ id: 'harmful:hate' }],
        provider: 'openai:gpt-4',
        purpose: 'You are an expert content moderator',
        write: true,
      },
    });
  });

  it('should reject invalid plugin names', () => {
    const input = {
      plugins: ['harmful:medical'],
      numTests: 10,
    };
    expect(RedteamGenerateOptionsSchema.safeParse(input).success).toBe(false);
  });

  it('should require numTests to be a positive integer', () => {
    const input = {
      numTests: -5,
      plugins: ['harmful:hate'],
    };
    expect(RedteamGenerateOptionsSchema.safeParse(input).success).toBe(false);
  });
});

describe('redteamPluginSchema', () => {
  it('should accept a valid plugin name as a string', () => {
    expect(redteamPluginSchema.safeParse('hijacking').success).toBe(true);
  });

  it('should accept a valid plugin object', () => {
    const input = {
      id: 'harmful:hate',
      numTests: 30,
    };
    expect(redteamPluginSchema.safeParse(input).success).toBe(true);
  });

  it('should reject an invalid plugin name', () => {
    expect(redteamPluginSchema.safeParse('medical').success).toBe(false);
  });

  it('should reject a plugin object with negative numTests', () => {
    const input = {
      id: 'jailbreak',
      numTests: -10,
    };
    expect(redteamPluginSchema.safeParse(input).success).toBe(false);
  });

  it('should allow omitting numTests in a plugin object', () => {
    const input = {
      id: 'hijacking',
    };
    expect(redteamPluginSchema.safeParse(input).success).toBe(true);
  });
});

describe('redteamConfigSchema', () => {
  it('should accept a valid configuration with all fields', () => {
    const input = {
      purpose: 'You are a travel agent',
      numTests: 3,
      plugins: [{ id: 'harmful:non-violent-crime', numTests: 5 }, { id: 'hijacking' }],
      strategies: ['prompt-injection'],
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        purpose: 'You are a travel agent',
        plugins: [
          { id: 'harmful:non-violent-crime', numTests: 5 },
          { id: 'hijacking', numTests: 3 },
        ],
        strategies: [{ id: 'prompt-injection' }],
      },
    });
  });

  it('should use default values when fields are omitted', () => {
    const input = {};
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: [],
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should allow omitting the purpose field', () => {
    const input = { numTests: 10 };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        purpose: undefined,
        plugins: [],
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should transform string plugins to objects', () => {
    const input = {
      plugins: ['hijacking', 'overreliance'],
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: [
          { id: 'hijacking', numTests: 5 },
          { id: 'overreliance', numTests: 5 },
        ],
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should use global numTests for plugins without specified numTests', () => {
    const input = {
      numTests: 7,
      plugins: [
        { id: 'hijacking', numTests: 3 },
        { id: 'overreliance' },
        'harmful:non-violent-crime',
      ],
      strategies: ['jailbreak'],
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: [
          { id: 'harmful:non-violent-crime', numTests: 7 },
          { id: 'hijacking', numTests: 3 },
          { id: 'overreliance', numTests: 7 },
        ],
        strategies: [{ id: 'jailbreak' }],
      },
    });
  });

  it('should reject invalid plugin names', () => {
    const input = {
      plugins: ['invalid-plugin-name'],
    };
    expect(redteamConfigSchema.safeParse(input).success).toBe(false);
  });

  it('should reject negative numTests', () => {
    const input = {
      numTests: -1,
    };
    expect(redteamConfigSchema.safeParse(input).success).toBe(false);
  });

  it('should reject non-integer numTests', () => {
    const input = {
      numTests: 3.5,
    };
    expect(redteamConfigSchema.safeParse(input).success).toBe(false);
  });

  it('should allow all valid plugin and strategy names', () => {
    const input = {
      plugins: REDTEAM_ALL_PLUGINS,
      strategies: REDTEAM_ALL_STRATEGIES,
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: REDTEAM_ALL_PLUGINS.filter((id) => !COLLECTIONS.includes(id)).map((id) => ({
          id,
          numTests: 5,
        })),
        strategies: REDTEAM_ALL_STRATEGIES.map((id) => ({ id })),
      },
    });
  });

  it('should expand harmful plugin to all harm categories', () => {
    const input = {
      plugins: ['harmful'],
      numTests: 3,
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: Object.keys(HARM_PLUGINS)
          .sort()
          .map((category) => ({
            id: category,
            numTests: 3,
          })),
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should allow overriding specific harm categories', () => {
    const input = {
      plugins: [
        { id: 'harmful:hate', numTests: 10 },
        'harmful',
        { id: 'harmful:violent-crime', numTests: 5 },
      ],
      numTests: 3,
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: [
          { id: 'harmful:hate', numTests: 10 },
          { id: 'harmful:violent-crime', numTests: 5 },
          ...Object.keys(HARM_PLUGINS)
            .filter((category) => !['harmful:hate', 'harmful:violent-crime'].includes(category))
            .map((category) => ({ id: category, numTests: 3 })),
        ].sort((a, b) => a.id.localeCompare(b.id)),
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
    expect(redteamConfigSchema.safeParse(input)?.data?.plugins).toHaveLength(
      Object.keys(HARM_PLUGINS).length,
    );
  });

  it('should not duplicate harm categories when specified individually', () => {
    const input = {
      plugins: ['harmful', 'harmful:hate', { id: 'harmful:violent-crime', numTests: 5 }],
      numTests: 3,
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: expect.arrayContaining([
          { id: 'harmful:hate', numTests: 3 },
          { id: 'harmful:violent-crime', numTests: 5 },
          ...Object.keys(HARM_PLUGINS)
            .filter((category) => !['harmful:hate', 'harmful:violent-crime'].includes(category))
            .map((category) => ({ id: category, numTests: 3 })),
        ]),
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should handle harmful categories without specifying harmful plugin', () => {
    const input = {
      plugins: [{ id: 'harmful:hate', numTests: 10 }, 'harmful:violent-crime'],
      numTests: 3,
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: expect.arrayContaining([
          { id: 'harmful:hate', numTests: 10 },
          { id: 'harmful:violent-crime', numTests: 3 },
        ]),
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should reject invalid harm categories', () => {
    const input = {
      plugins: ['harmful:invalid-category'],
    };
    expect(redteamConfigSchema.safeParse(input).success).toBe(false);
  });

  it('should accept an array of injectVar strings', () => {
    const input = {
      injectVar: 'system',
      plugins: ['harmful:insults'],
      strategies: ['jailbreak'],
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        injectVar: 'system',
        plugins: [{ id: 'harmful:insults', numTests: 5 }],
        strategies: [{ id: 'jailbreak' }],
      },
    });
  });

  it('should accept a provider string', () => {
    const input = {
      provider: 'openai:gpt-3.5-turbo',
      plugins: ['overreliance'],
      strategies: ['jailbreak'],
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        provider: 'openai:gpt-3.5-turbo',
        plugins: [{ id: 'overreliance', numTests: 5 }],
        strategies: [{ id: 'jailbreak' }],
      },
    });
  });

  it('should include injectVar, provider, and purpose when all are provided', () => {
    const input = {
      injectVar: 'system',
      provider: 'openai:gpt-4',
      purpose: 'Test adversarial inputs',
      plugins: ['overreliance', 'politics'],
    };
    expect(redteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        injectVar: 'system',
        provider: 'openai:gpt-4',
        purpose: 'Test adversarial inputs',
        plugins: [
          { id: 'overreliance', numTests: 5 },
          { id: 'politics', numTests: 5 },
        ],
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });
});
