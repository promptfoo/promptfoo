import {
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  ALL_STRATEGIES as REDTEAM_ALL_STRATEGIES,
  DEFAULT_PLUGINS as REDTEAM_DEFAULT_PLUGINS,
  COLLECTIONS,
  HARM_PLUGINS,
  PII_PLUGINS,
} from '../../src/redteam/constants';
import {
  RedteamGenerateOptionsSchema,
  RedteamConfigSchema,
  RedteamPluginSchema,
} from '../../src/validators/redteam';

describe('redteamGenerateOptionsSchema', () => {
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
        force: false,
        injectVar: 'query',
        numTests: 50,
        output: 'sample-results.json',
        plugins: [{ id: 'harmful:hate', numTests: 5 }],
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
    expect(RedteamPluginSchema.safeParse('hijacking').success).toBe(true);
  });

  it('should accept a valid plugin object', () => {
    const input = {
      id: 'harmful:hate',
      numTests: 30,
    };
    expect(RedteamPluginSchema.safeParse(input).success).toBe(true);
  });

  it('should reject an invalid plugin name', () => {
    expect(RedteamPluginSchema.safeParse('medical').success).toBe(false);
  });

  it('should reject a plugin object with negative numTests', () => {
    const input = {
      id: 'jailbreak',
      numTests: -10,
    };
    expect(RedteamPluginSchema.safeParse(input).success).toBe(false);
  });

  it('should allow omitting numTests in a plugin object', () => {
    const input = {
      id: 'hijacking',
    };
    expect(RedteamPluginSchema.safeParse(input).success).toBe(true);
  });
});

describe('redteamConfigSchema', () => {
  it('should accept a valid configuration with all fields', () => {
    const input = {
      purpose: 'You are a travel agent',
      numTests: 3,
      plugins: [
        { id: 'harmful:non-violent-crime', numTests: 5 },
        { id: 'hijacking', numTests: 3 },
      ],
      strategies: ['prompt-injection'],
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        purpose: 'You are a travel agent',
        numTests: 3,
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
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        plugins: expect.arrayContaining(
          Array(REDTEAM_DEFAULT_PLUGINS.size).fill(expect.any(Object)),
        ),
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should allow omitting the purpose field', () => {
    const input = { numTests: 10 };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        numTests: 10,
        plugins: expect.arrayContaining(
          Array(REDTEAM_DEFAULT_PLUGINS.size).fill(expect.any(Object)),
        ),
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should transform string plugins to objects', () => {
    const input = {
      plugins: ['hijacking', 'overreliance'],
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        numTests: undefined,
        plugins: [
          { id: 'hijacking', numTests: undefined },
          { id: 'overreliance', numTests: undefined },
        ],
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should use global numTests for plugins without specified numTests', () => {
    const input = {
      numTests: 7,
      plugins: [
        { id: 'harmful:non-violent-crime', numTests: 7 },
        { id: 'hijacking', numTests: 3 },
        { id: 'overreliance', numTests: 7 },
      ],
      strategies: ['jailbreak'],
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        numTests: 7,
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
    expect(RedteamConfigSchema.safeParse(input).success).toBe(false);
  });

  it('should reject negative numTests', () => {
    const input = {
      numTests: -1,
    };
    expect(RedteamConfigSchema.safeParse(input).success).toBe(false);
  });

  it('should reject non-integer numTests', () => {
    const input = {
      numTests: 3.5,
    };
    expect(RedteamConfigSchema.safeParse(input).success).toBe(false);
  });

  it('should allow all valid plugin and strategy names', () => {
    const strategiesExceptDefault = REDTEAM_ALL_STRATEGIES.filter(
      (id) => id !== 'default' && id !== 'basic',
    );
    const input = {
      plugins: REDTEAM_ALL_PLUGINS,
      strategies: strategiesExceptDefault,
    };
    const result = RedteamConfigSchema.safeParse(input);
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        numTests: undefined,
        plugins: expect.arrayContaining(
          REDTEAM_ALL_PLUGINS.filter((id) => !COLLECTIONS.includes(id as any)).map((id) => ({
            id,
          })),
        ),
        strategies: expect.arrayContaining(strategiesExceptDefault.map((id) => ({ id }))),
      }),
    });

    expect(result.data?.plugins).toHaveLength(
      REDTEAM_ALL_PLUGINS.filter((id) => !COLLECTIONS.includes(id as any)).length,
    );
    expect(result.data?.strategies).toHaveLength(strategiesExceptDefault.length);
  });

  it('should expand harmful plugin to all harm categories', () => {
    const input = {
      plugins: ['harmful'],
      numTests: 3,
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        numTests: 3,
        plugins: Object.keys(HARM_PLUGINS)
          .map((category) => ({
            id: category,
            numTests: 3,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
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
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        numTests: 3,
        plugins: [
          { id: 'harmful:hate', numTests: 10 },
          { id: 'harmful:violent-crime', numTests: 5 },
          ...Object.keys(HARM_PLUGINS)
            .filter((category) => !['harmful:hate', 'harmful:violent-crime'].includes(category))
            .map((category) => ({
              id: category,
              numTests: 3,
            })),
        ].sort((a, b) => a.id.localeCompare(b.id)),
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
    expect(RedteamConfigSchema.safeParse(input)?.data?.plugins).toHaveLength(
      Object.keys(HARM_PLUGINS).length,
    );
  });

  it('should not duplicate harm categories when specified individually', () => {
    const input = {
      plugins: ['harmful', 'harmful:hate', { id: 'harmful:violent-crime', numTests: 5 }],
      numTests: 3,
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        numTests: 3,
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
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        numTests: 3,
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
    expect(RedteamConfigSchema.safeParse(input).success).toBe(false);
  });

  it('should accept an array of injectVar strings', () => {
    const input = {
      injectVar: 'system',
      plugins: ['harmful:insults'],
      strategies: ['jailbreak'],
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        injectVar: 'system',
        plugins: [{ id: 'harmful:insults', numTests: undefined }],
        strategies: [{ id: 'jailbreak' }],
      },
    });
  });

  it('should accept a provider string', () => {
    const input = {
      provider: 'openai:gpt-4o-mini',
      plugins: ['overreliance'],
      strategies: ['jailbreak'],
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        provider: 'openai:gpt-4o-mini',
        plugins: [{ id: 'overreliance', numTests: undefined }],
        strategies: [{ id: 'jailbreak' }],
      },
    });
  });

  it('should accept a language string', () => {
    const input = {
      language: 'German',
      plugins: ['overreliance'],
      strategies: ['jailbreak'],
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        language: 'German',
        plugins: [{ id: 'overreliance', config: undefined, numTests: undefined }],
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
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        injectVar: 'system',
        provider: 'openai:gpt-4',
        purpose: 'Test adversarial inputs',
        plugins: [
          { id: 'overreliance', numTests: undefined },
          { id: 'politics', numTests: undefined },
        ],
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
  });

  it('should accept a provider object with id and config', () => {
    const input = {
      provider: {
        id: 'openai:gpt-4',
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      },
      plugins: ['overreliance'],
      strategies: ['jailbreak'],
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        provider: {
          id: 'openai:gpt-4',
          config: {
            temperature: 0.7,
            max_tokens: 100,
          },
        },
        plugins: [{ id: 'overreliance', numTests: undefined }],
        strategies: [{ id: 'jailbreak' }],
      },
    });
  });

  it('should accept a provider object with callApi function', () => {
    const mockCallApi = jest.fn();
    const input = {
      provider: {
        id: () => 'custom-provider',
        callApi: mockCallApi,
        label: 'Custom Provider',
      },
      plugins: ['overreliance'],
      strategies: ['jailbreak'],
    };
    const result = RedteamConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data?.provider).toHaveProperty('id');
    expect(result.data?.provider).toHaveProperty('callApi');
    expect(result.data?.provider).toHaveProperty('label', 'Custom Provider');
    expect(result.data?.plugins).toEqual([{ id: 'overreliance', numTests: undefined }]);
    expect(result.data?.strategies).toEqual([{ id: 'jailbreak' }]);
  });

  it('should reject an invalid provider', () => {
    const input = {
      provider: 123, // Invalid provider
      plugins: ['overreliance'],
      strategies: ['jailbreak'],
    };
    const result = RedteamConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should handle plugins with config attributes', () => {
    const input = {
      plugins: [
        { id: 'policy', config: { policy: 'Policy 1' }, numTests: 5 },
        { id: 'policy', config: { policy: 'Policy 2' }, numTests: 3 },
        { id: 'harmful:hate', numTests: 10 },
        'harmful',
      ],
      numTests: 2,
    };
    expect(RedteamConfigSchema.safeParse(input)).toEqual({
      success: true,
      data: {
        numTests: 2,
        plugins: [
          { id: 'harmful:hate', numTests: 10 },
          { id: 'policy', config: { policy: 'Policy 1' }, numTests: 5 },
          { id: 'policy', config: { policy: 'Policy 2' }, numTests: 3 },
          ...Object.keys(HARM_PLUGINS)
            .filter((category) => category !== 'harmful:hate')
            .map((category) => ({ id: category, numTests: 2 })),
        ].sort((a, b) => a.id.localeCompare(b.id)),
        strategies: [{ id: 'jailbreak' }, { id: 'prompt-injection' }],
      },
    });
    expect(RedteamConfigSchema.safeParse(input)?.data?.plugins).toHaveLength(
      Object.keys(HARM_PLUGINS).length + 2, // +2 for the two policy plugins
    );
  });

  it('should handle PII plugins with default numTests', () => {
    const input = {
      plugins: [
        { id: 'pii', numTests: 7 },
        { id: 'pii:session', numTests: 3 },
      ],
      numTests: 5,
    };
    const result = RedteamConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const piiPlugins = result.data?.plugins?.filter((p) => p.id.startsWith('pii:'));
    expect(piiPlugins).toEqual(
      expect.arrayContaining([
        { id: 'pii:session', numTests: 3 },
        ...PII_PLUGINS.filter((id) => id !== 'pii:session').map((id) => ({ id, numTests: 7 })),
      ]),
    );
    expect(piiPlugins).toHaveLength(PII_PLUGINS.length);
  });

  it('should sort plugins with different configurations correctly', () => {
    const input = {
      plugins: [
        { id: 'policy', config: { policy: 'Policy B' }, numTests: 3 },
        { id: 'policy', config: { policy: 'Policy A' }, numTests: 5 },
        { id: 'hijacking', numTests: 2 },
      ],
    };
    const result = RedteamConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data?.plugins).toEqual([
      { id: 'hijacking', numTests: 2 },
      { id: 'policy', config: { policy: 'Policy A' }, numTests: 5 },
      { id: 'policy', config: { policy: 'Policy B' }, numTests: 3 },
    ]);
  });

  describe('aliases', () => {
    it('should expand high-level aliased plugin names', () => {
      const input = {
        plugins: ['owasp:llm'],
        numTests: 3,
      };
      const result = RedteamConfigSchema.safeParse(input);
      expect(result.success).toBe(true);

      const expectedPlugins = [
        'harmful:violent-crime',
        'harmful:non-violent-crime',
        'harmful:sex-crime',
        'harmful:child-exploitation',
        'harmful:indiscriminate-weapons',
        'harmful:hate',
        'harmful:self-harm',
        'harmful:sexual-content',
        'harmful:cybercrime',
        'harmful:chemical-biological-weapons',
        'harmful:illegal-drugs',
        'harmful:copyright-violations',
        'harmful:harassment-bullying',
        'harmful:illegal-activities',
        'harmful:graphic-content',
        'harmful:unsafe-practices',
        'harmful:radicalization',
        'harmful:profanity',
        'harmful:insults',
        'harmful:privacy',
        'harmful:intellectual-property',
        'harmful:misinformation-disinformation',
        'harmful:specialized-advice',
        'pii:api-db',
        'pii:direct',
        'pii:session',
        'pii:social',
        'overreliance',
        'hallucination',
      ];

      expect(result.data?.plugins).toEqual(
        expect.arrayContaining(
          expectedPlugins.map((id) => expect.objectContaining({ id, numTests: 3 })),
        ),
      );
    });

    it('should expand granular aliased plugin names', () => {
      const input = {
        plugins: ['owasp:llm:01'],
        numTests: 3,
      };
      const result = RedteamConfigSchema.safeParse(input);
      expect(result.success).toBe(true);

      const expectedPlugins = [
        'harmful:violent-crime',
        'harmful:non-violent-crime',
        'harmful:sex-crime',
        'harmful:child-exploitation',
        'harmful:indiscriminate-weapons',
        'harmful:hate',
        'harmful:self-harm',
        'harmful:sexual-content',
        'harmful:cybercrime',
        'harmful:chemical-biological-weapons',
        'harmful:illegal-drugs',
        'harmful:copyright-violations',
        'harmful:harassment-bullying',
        'harmful:illegal-activities',
        'harmful:graphic-content',
        'harmful:unsafe-practices',
        'harmful:radicalization',
        'harmful:profanity',
        'harmful:insults',
        'harmful:privacy',
        'harmful:intellectual-property',
        'harmful:misinformation-disinformation',
        'harmful:specialized-advice',
      ];

      expect(result.data?.plugins).toEqual(
        expect.arrayContaining(
          expectedPlugins.map((id) => expect.objectContaining({ id, numTests: 3 })),
        ),
      );
    });

    it('should expand collections within aliased plugin names', () => {
      const input = {
        plugins: ['nist:ai:measure:2.1'],
        numTests: 3,
      };
      const result = RedteamConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      const expectedPlugins = [
        'harmful:privacy',
        'pii:api-db',
        'pii:direct',
        'pii:session',
        'pii:social',
      ];
      expect(result.data?.plugins).toEqual(
        expect.arrayContaining(
          expectedPlugins.map((id) => expect.objectContaining({ id, numTests: 3 })),
        ),
      );
    });

    it('should not duplicate plugins when using multiple aliased names', () => {
      const input = {
        plugins: ['owasp:llm:01', 'owasp:llm:02'],
        numTests: 3,
      };
      const result = RedteamConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      const expectedPlugins = [
        'harmful:violent-crime',
        'harmful:non-violent-crime',
        'harmful:sex-crime',
        'harmful:child-exploitation',
        'harmful:indiscriminate-weapons',
        'harmful:hate',
        'harmful:self-harm',
        'harmful:sexual-content',
        'harmful:cybercrime',
        'harmful:chemical-biological-weapons',
        'harmful:illegal-drugs',
        'harmful:copyright-violations',
        'harmful:harassment-bullying',
        'harmful:illegal-activities',
        'harmful:graphic-content',
        'harmful:unsafe-practices',
        'harmful:radicalization',
        'harmful:profanity',
        'harmful:insults',
        'harmful:privacy',
        'harmful:intellectual-property',
        'harmful:misinformation-disinformation',
        'harmful:specialized-advice',
        'overreliance',
      ];
      expect(result.data?.plugins).toHaveLength(expectedPlugins.length);
      expect(result.data?.plugins).toEqual(
        expect.arrayContaining(
          expectedPlugins.map((id) => expect.objectContaining({ id, numTests: 3 })),
        ),
      );
    });

    it('should expand strategies for "owasp:llm" alias', () => {
      const input = {
        plugins: ['owasp:llm'],
        numTests: 3,
      };
      const result = RedteamConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      expect(result.data?.strategies).toEqual(
        expect.arrayContaining([{ id: 'prompt-injection' }, { id: 'jailbreak' }]),
      );
    });

    it('should expand strategies for "owasp:llm:01" alias', () => {
      const input = {
        plugins: ['owasp:llm:01'],
        numTests: 3,
      };
      const result = RedteamConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      expect(result.data?.strategies).toEqual(
        expect.arrayContaining([{ id: 'prompt-injection' }, { id: 'jailbreak' }]),
      );
    });

    it('should not duplicate strategies when using multiple aliased names', () => {
      const input = {
        plugins: ['owasp:llm', 'owasp:llm:01', 'owasp:llm:02'],
        numTests: 3,
      };
      const result = RedteamConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
      expect(result.data?.strategies).toEqual(
        expect.arrayContaining([{ id: 'prompt-injection' }, { id: 'jailbreak' }]),
      );
    });
  });
});
