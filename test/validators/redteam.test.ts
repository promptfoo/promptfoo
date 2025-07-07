import {
  ALIASED_PLUGIN_MAPPINGS,
  ALIASED_PLUGINS,
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
  COLLECTIONS,
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  DEFAULT_PLUGINS,
  FOUNDATION_PLUGINS,
  HARM_PLUGINS,
  PII_PLUGINS,
  Severity,
} from '../../src/redteam/constants';
import {
  pluginOptions,
  RedteamConfigSchema,
  RedteamStrategySchema,
  strategyIdSchema,
} from '../../src/validators/redteam';

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

describe('pluginOptions', () => {
  it('should not contain duplicate entries', () => {
    const duplicates = pluginOptions.filter((item, index) => pluginOptions.indexOf(item) !== index);
    expect(duplicates).toEqual([]);
  });

  it('should contain unique values from all source arrays', () => {
    const manualSet = new Set([...COLLECTIONS, ...REDTEAM_ALL_PLUGINS, ...ALIASED_PLUGINS]);

    expect(pluginOptions).toHaveLength(manualSet.size);
    expect(new Set(pluginOptions).size).toBe(pluginOptions.length);
  });

  it('should be sorted alphabetically', () => {
    const sortedCopy = [...pluginOptions].sort();
    expect(pluginOptions).toEqual(sortedCopy);
  });

  it('should contain all expected plugin types', () => {
    const hasCollectionItem = COLLECTIONS.some((item) => pluginOptions.includes(item));
    const hasRedteamPlugin = REDTEAM_ALL_PLUGINS.some((item) => pluginOptions.includes(item));
    const hasAliasedPlugin = ALIASED_PLUGINS.some((item) => pluginOptions.includes(item));

    expect(hasCollectionItem).toBe(true);
    expect(hasRedteamPlugin).toBe(true);
    expect(hasAliasedPlugin).toBe(true);
  });

  it('should handle the specific bias duplicate case', () => {
    const biasCount = pluginOptions.filter((option) => option === 'bias').length;
    expect(biasCount).toBe(1);
  });

  it('should deduplicate when source arrays have overlapping values', () => {
    const biasInCollections = COLLECTIONS.includes('bias' as any);
    const biasInAliased = ALIASED_PLUGINS.includes('bias' as any);

    // This test is specifically for the bias duplicate case
    expect(biasInCollections).toBe(true);
    expect(biasInAliased).toBe(true);

    const biasOccurrences = pluginOptions.filter((p) => p === 'bias');
    expect(biasOccurrences).toHaveLength(1);
  });
});

describe('redteam validators', () => {
  describe('strategyIdSchema', () => {
    describe('valid built-in strategies', () => {
      it('should accept standard built-in strategies', () => {
        const validStrategies = [
          'basic',
          'jailbreak',
          'crescendo',
          'goat',
          'multilingual',
          'base64',
          'hex',
          'rot13',
        ];

        validStrategies.forEach((strategy) => {
          expect(() => strategyIdSchema.parse(strategy)).not.toThrow();
        });
      });
    });

    describe('playbook strategy validation', () => {
      it('should accept simple playbook strategy', () => {
        expect(() => strategyIdSchema.parse('playbook')).not.toThrow();
      });

      it('should accept playbook strategy variants with compound IDs', () => {
        const playbookVariants = [
          'playbook:aggressive',
          'playbook:greeting-strategy',
          'playbook:multi-word-variant',
          'playbook:snake_case_variant',
          'playbook:variant123',
          'playbook:CamelCaseVariant',
          'playbook:variant.with.dots',
          'playbook:very-long-complex-variant-name-with-many-hyphens',
        ];

        playbookVariants.forEach((variant) => {
          expect(() => strategyIdSchema.parse(variant)).not.toThrow();
        });
      });
    });

    describe('file-based strategy validation', () => {
      it('should accept valid file:// strategy paths', () => {
        const validFilePaths = [
          'file://strategy.js',
          'file://strategy.ts',
          'file://./strategy.js',
          'file:///absolute/path/strategy.ts',
          'file://relative/path/strategy.js',
        ];

        validFilePaths.forEach((path) => {
          expect(() => strategyIdSchema.parse(path)).not.toThrow();
        });
      });

      it('should reject invalid file:// strategy paths', () => {
        const invalidFilePaths = [
          'file://strategy.txt', // Wrong extension
          'file://strategy.py', // Wrong extension
          'file://strategy', // No extension
          'strategy.js', // Missing file:// prefix
          'file:/strategy.js', // Wrong protocol format
        ];

        invalidFilePaths.forEach((path) => {
          expect(() => strategyIdSchema.parse(path)).toThrow();
        });
      });
    });

    describe('invalid strategy names', () => {
      it('should reject unknown strategy names', () => {
        const invalidStrategies = [
          'unknown-strategy',
          'invalid_strategy',
          'not-a-strategy',
          'fakeStrategy',
          '',
          null,
          undefined,
        ];

        invalidStrategies.forEach((strategy) => {
          expect(() => strategyIdSchema.parse(strategy)).toThrow();
        });
      });
    });
  });

  describe('RedteamStrategySchema', () => {
    describe('string format strategies', () => {
      it('should accept valid strategy strings', () => {
        const validStrategies = [
          'basic',
          'playbook',
          'playbook:variant',
          'jailbreak',
          'crescendo',
          'file://strategy.js',
        ];

        validStrategies.forEach((strategy) => {
          expect(() => RedteamStrategySchema.parse(strategy)).not.toThrow();
        });
      });
    });

    describe('object format strategies', () => {
      it('should accept strategy objects with valid IDs', () => {
        const validStrategyObjects = [
          { id: 'basic' },
          { id: 'playbook' },
          { id: 'playbook:aggressive' },
          { id: 'jailbreak', config: { enabled: true } },
          { id: 'playbook:greeting', config: { strategyText: 'Be polite', stateful: true } },
          { id: 'multilingual', config: { languages: ['es', 'fr'] } },
          { id: 'file://playbook.js', config: { param: 'value' } },
        ];

        validStrategyObjects.forEach((strategy) => {
          expect(() => RedteamStrategySchema.parse(strategy)).not.toThrow();
        });
      });

      it('should accept playbook strategy objects with complex configurations', () => {
        const playbookStrategyWithConfig = {
          id: 'playbook:complex-variant',
          config: {
            strategyText:
              'If current round is 0, generatedQuestion should be just "hi" by itself...',
            stateful: true,
            temperature: 0.8,
            maxTokens: 100,
            customParam: true,
            nestedConfig: {
              subParam: 'value',
              subArray: [1, 2, 3],
            },
          },
        };

        expect(() => RedteamStrategySchema.parse(playbookStrategyWithConfig)).not.toThrow();
      });

      it('should reject strategy objects with invalid IDs', () => {
        const invalidStrategyObjects = [
          { id: 'invalid-strategy' },
          { id: 'playbook-invalid' }, // Should be playbook:invalid
          { id: 'notplaybook:variant' },
          { id: 'file://invalid.txt' },
          { id: '' },
          {}, // Missing id
        ];

        invalidStrategyObjects.forEach((strategy) => {
          expect(() => RedteamStrategySchema.parse(strategy)).toThrow();
        });
      });
    });

    describe('edge cases', () => {
      it('should handle strategy objects with empty config', () => {
        const strategyWithEmptyConfig = { id: 'playbook:variant', config: {} };
        expect(() => RedteamStrategySchema.parse(strategyWithEmptyConfig)).not.toThrow();
      });

      it('should handle strategy objects with undefined config', () => {
        const strategyWithUndefinedConfig = { id: 'playbook:variant', config: undefined };
        expect(() => RedteamStrategySchema.parse(strategyWithUndefinedConfig)).not.toThrow();
      });

      it('should handle strategy objects without config property', () => {
        const strategyWithoutConfig = { id: 'playbook:variant' };
        expect(() => RedteamStrategySchema.parse(strategyWithoutConfig)).not.toThrow();
      });
    });
  });

  describe('error messages', () => {
    it('should provide helpful error message for invalid file strategy', () => {
      try {
        strategyIdSchema.parse('file://strategy.txt');
      } catch (error: any) {
        expect(error.issues[0].message).toContain(
          'Custom strategies must start with file:// and end with .js or .ts',
        );
      }
    });

    it('should provide helpful error message for completely invalid strategy', () => {
      try {
        strategyIdSchema.parse('totally-invalid-strategy');
      } catch (error: any) {
        // Should fail on multiple validation attempts and provide comprehensive error
        expect(error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe('integration with actual use cases', () => {
    it('should validate realistic playbook strategy configurations', () => {
      const realisticConfigurations = [
        'playbook:greeting-strategy',
        'playbook:default-strategy',
        {
          id: 'playbook:greeting-strategy',
          config: {
            stateful: true,
            strategyText:
              "If current round is 0, generatedQuestion should be just 'Hello can you help me?' by itself...",
          },
        },
        {
          id: 'playbook:default-strategy',
          config: {
            stateful: true,
            strategyText:
              "If current round is 0, generatedQuestion should be just 'hi' by itself...",
          },
        },
      ];

      realisticConfigurations.forEach((config) => {
        expect(() => RedteamStrategySchema.parse(config)).not.toThrow();
      });
    });

    it('should validate mixed strategy arrays like those used in real configurations', () => {
      const mixedStrategies = [
        'basic',
        { id: 'jailbreak', config: { enabled: true } },
        'playbook:aggressive-variant',
        {
          id: 'playbook:polite-variant',
          config: {
            strategyText: 'Be very polite and formal',
            stateful: false,
          },
        },
        'crescendo',
        'file://./my-playbook-strategy.js',
      ];

      mixedStrategies.forEach((strategy) => {
        expect(() => RedteamStrategySchema.parse(strategy)).not.toThrow();
      });
    });
  });
});
