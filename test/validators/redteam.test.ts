import { z } from 'zod';
import {
  ALIASED_PLUGIN_MAPPINGS,
  ALIASED_PLUGINS,
  COLLECTIONS,
  DEFAULT_NUM_TESTS_PER_PLUGIN,
  DEFAULT_PLUGINS,
  FOUNDATION_PLUGINS,
  HARM_PLUGINS,
  PII_PLUGINS,
  ALL_PLUGINS as REDTEAM_ALL_PLUGINS,
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

    expect(() => RedteamConfigSchema.parse(config)).toThrow(/Invalid plugin id/);
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

  it('should handle empty plugins array', () => {
    const config = {
      plugins: [],
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.plugins).toEqual([]);
  });

  it('should handle config with all optional fields', () => {
    const config = {
      plugins: ['default'],
      strategies: ['basic'],
      numTests: 10,
      language: 'en',
      injectVar: 'prompt',
      purpose: 'Testing LLM robustness',
      entities: ['Company A', 'Product B'],
      maxConcurrency: 5,
      delay: 1000,
      provider: 'openai:gpt-4',
    };

    const result = RedteamConfigSchema.parse(config);
    expect(result.numTests).toBe(10);
    expect(result.language).toBe('en');
    expect(result.injectVar).toBe('prompt');
    expect(result.purpose).toBe('Testing LLM robustness');
    expect(result.entities).toEqual(['Company A', 'Product B']);
    expect(result.delay).toBe(1000);
    expect(result.provider).toBe('openai:gpt-4');
  });

  it('should reject invalid numTests values', () => {
    const invalidConfigs = [
      { plugins: ['default'], numTests: 0 }, // Zero
      { plugins: ['default'], numTests: -5 }, // Negative
      { plugins: ['default'], numTests: 1.5 }, // Decimal
      { plugins: ['default'], numTests: 'five' as any }, // String
    ];

    invalidConfigs.forEach((config) => {
      expect(() => RedteamConfigSchema.parse(config)).toThrow(z.ZodError);
    });
  });

  it('should reject invalid delay values', () => {
    const invalidConfigs = [
      { plugins: ['default'], delay: -100 }, // Negative delay
      { plugins: ['default'], delay: 'slow' as any }, // String
    ];

    invalidConfigs.forEach((config) => {
      expect(() => RedteamConfigSchema.parse(config)).toThrow(z.ZodError);
    });
  });

  it('should properly transform and deduplicate complex plugin configurations', () => {
    const config = {
      plugins: [
        'default',
        'default', // Duplicate
        { id: 'contracts', numTests: 10 },
        { id: 'contracts', numTests: 10 }, // Exact duplicate
        { id: 'contracts', numTests: 5 }, // Different numTests - this one will be kept
        'file://custom1.js',
        'file://custom1.js', // Duplicate file
      ],
    };

    const result = RedteamConfigSchema.parse(config);

    // The transform function deduplicates based on key: `${id}:${JSON.stringify(config)}:${severity || ''}`
    // So contracts with different numTests are different plugins
    const contractsPlugins = result.plugins?.filter((p) => p.id === 'contracts') || [];
    expect(contractsPlugins.length).toBeGreaterThan(0);

    // File plugins are deduplicated
    const customPlugins = result.plugins?.filter((p) => p.id === 'file://custom1.js') || [];
    expect(customPlugins).toHaveLength(1); // Deduplicated

    // Default plugins should be expanded
    const hasDefaultPlugins = result.plugins?.some((p) => DEFAULT_PLUGINS.has(p.id as any));
    expect(hasDefaultPlugins).toBe(true);
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
    // This test is specifically for the bias duplicate case
    const biasInCollections = COLLECTIONS.includes('bias' as any);
    const biasInAliased = ALIASED_PLUGINS.includes('bias' as any);

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

    describe('custom strategy validation', () => {
      it('should accept simple custom strategy', () => {
        expect(() => strategyIdSchema.parse('custom')).not.toThrow();
      });

      it('should accept custom strategy variants with compound IDs', () => {
        const customVariants = [
          'custom:aggressive',
          'custom:greeting-strategy',
          'custom:multi-word-variant',
          'custom:snake_case_variant',
          'custom:variant123',
          'custom:CamelCaseVariant',
          'custom:variant.with.dots',
          'custom:very-long-complex-variant-name-with-many-hyphens',
        ];

        customVariants.forEach((variant) => {
          expect(() => strategyIdSchema.parse(variant)).not.toThrow();
        });
      });

      it('should accept edge case custom strategy formats', () => {
        // These are actually valid custom strategies according to isCustomStrategy
        const validCustomStrategies = [
          'custom:', // Valid - empty variant
          'custom::', // Valid - double colon variant
          'custom:variant:', // Valid - trailing colon variant
        ];

        validCustomStrategies.forEach((strategy) => {
          expect(() => strategyIdSchema.parse(strategy)).not.toThrow();
        });

        // Test invalid strategies that don't match any pattern
        const invalidStrategies = [
          ':custom', // Invalid - doesn't start with 'custom'
          'invalid-strategy-123', // Invalid - not a built-in strategy
        ];

        invalidStrategies.forEach((strategy) => {
          expect(() => strategyIdSchema.parse(strategy)).toThrow(z.ZodError);
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
          'file://strategy.txt',
          'file://strategy.py',
          'file://strategy',
          'strategy.js',
          'file:/strategy.js',
        ];

        invalidFilePaths.forEach((path) => {
          let error: z.ZodError | undefined;

          expect(() => {
            try {
              strategyIdSchema.parse(path);
            } catch (e) {
              if (e instanceof z.ZodError) {
                error = e;
              }
              throw e;
            }
          }).toThrow(z.ZodError);

          expect(error).toBeDefined();
          expect(error?.issues[0].message).toContain(
            'Custom strategies must start with file:// and end with .js or .ts',
          );
        });
      });
    });

    describe('invalid strategy names', () => {
      it('should reject unknown strategy names', () => {
        // Test string strategies
        const invalidStringStrategies = [
          'unknown-strategy',
          'invalid_strategy',
          'not-a-strategy',
          'fakeStrategy',
        ];

        invalidStringStrategies.forEach((strategy) => {
          let error: z.ZodError | undefined;

          expect(() => {
            try {
              strategyIdSchema.parse(strategy);
            } catch (e) {
              if (e instanceof z.ZodError) {
                error = e;
              }
              throw e;
            }
          }).toThrow(z.ZodError);

          expect(error).toBeDefined();
          const message = error?.issues[0].message || '';
          const validMessages = [
            'Custom strategies must start with file:// and end with .js or .ts',
            'Strategy must be one of the built-in strategies:',
            'Invalid enum value',
          ];
          const hasValidMessage = validMessages.some((msg) => message.includes(msg));
          expect(hasValidMessage).toBe(true);
        });

        // Test null/undefined/empty separately
        expect(() => strategyIdSchema.parse(null)).toThrow(z.ZodError);
        expect(() => strategyIdSchema.parse(undefined)).toThrow(z.ZodError);
        expect(() => strategyIdSchema.parse('')).toThrow(z.ZodError);
      });
    });
  });

  describe('RedteamStrategySchema', () => {
    describe('string format strategies', () => {
      it('should accept valid strategy strings', () => {
        const validStrategies = [
          'basic',
          'custom',
          'custom:variant',
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
          { id: 'custom' },
          { id: 'custom:aggressive' },
          { id: 'jailbreak', config: { enabled: true } },
          { id: 'custom:greeting', config: { strategyText: 'Be polite', stateful: true } },
          { id: 'multilingual', config: { languages: ['es', 'fr'] } },
          { id: 'file://custom.js', config: { param: 'value' } },
        ];

        validStrategyObjects.forEach((strategy) => {
          expect(() => RedteamStrategySchema.parse(strategy)).not.toThrow();
        });
      });

      it('should accept custom strategy objects with complex configurations', () => {
        const customStrategyWithConfig = {
          id: 'custom:complex-variant',
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

        expect(() => RedteamStrategySchema.parse(customStrategyWithConfig)).not.toThrow();
      });

      it('should reject strategy objects with invalid IDs', () => {
        // Test objects with invalid IDs
        const invalidIdObjects = [
          { id: 'custom-invalid' },
          { id: 'notcustom:variant' },
          { id: 'file://invalid.txt' },
          { id: '' },
        ];

        invalidIdObjects.forEach((strategy) => {
          let error: z.ZodError | undefined;

          expect(() => {
            try {
              RedteamStrategySchema.parse(strategy);
            } catch (e) {
              if (e instanceof z.ZodError) {
                error = e;
              }
              throw e;
            }
          }).toThrow(z.ZodError);

          expect(error).toBeDefined();
          const message = error?.issues[0].message || '';
          const validMessages = [
            'Custom strategies must start with file:// and end with .js or .ts',
            'Strategy must be one of the built-in strategies:',
            'Invalid enum value',
          ];
          const hasValidMessage = validMessages.some((msg) => message.includes(msg));
          expect(hasValidMessage).toBe(true);
        });

        // Test object without id separately
        expect(() => RedteamStrategySchema.parse({})).toThrow(z.ZodError);
      });
    });

    describe('edge cases', () => {
      it('should handle strategy objects with empty config', () => {
        const strategyWithEmptyConfig = { id: 'custom:variant', config: {} };
        expect(() => RedteamStrategySchema.parse(strategyWithEmptyConfig)).not.toThrow();
      });

      it('should handle strategy objects with undefined config', () => {
        const strategyWithUndefinedConfig = { id: 'custom:variant', config: undefined };
        expect(() => RedteamStrategySchema.parse(strategyWithUndefinedConfig)).not.toThrow();
      });

      it('should handle strategy objects without config property', () => {
        const strategyWithoutConfig = { id: 'custom:variant' };
        expect(() => RedteamStrategySchema.parse(strategyWithoutConfig)).not.toThrow();
      });
    });

    describe('error messages', () => {
      it('should provide helpful error message for invalid file strategy', () => {
        let error: z.ZodError | undefined;

        expect(() => {
          try {
            strategyIdSchema.parse('file://strategy.txt');
          } catch (e) {
            if (e instanceof z.ZodError) {
              error = e;
            }
            throw e;
          }
        }).toThrow(z.ZodError);

        expect(error).toBeDefined();
        expect(error?.issues[0].message).toContain(
          'Custom strategies must start with file:// and end with .js or .ts',
        );
      });

      it('should provide helpful error message for completely invalid strategy', () => {
        let error: z.ZodError | undefined;

        expect(() => {
          try {
            strategyIdSchema.parse('totally-invalid-strategy');
          } catch (e) {
            if (e instanceof z.ZodError) {
              error = e;
            }
            throw e;
          }
        }).toThrow(z.ZodError);

        expect(error).toBeDefined();
        const message = error?.issues[0].message || '';
        const validMessages = [
          'Custom strategies must start with file:// and end with .js or .ts',
          'Strategy must be one of the built-in strategies:',
          'Invalid enum value',
        ];
        const hasValidMessage = validMessages.some((msg) => message.includes(msg));
        expect(hasValidMessage).toBe(true);
      });
    });

    describe('integration with actual use cases', () => {
      it('should validate realistic custom strategy configurations', () => {
        const realisticConfigurations = [
          'custom:greeting-strategy',
          'custom:default-strategy',
          {
            id: 'custom:greeting-strategy',
            config: {
              stateful: true,
              strategyText:
                "If current round is 0, generatedQuestion should be just 'Hello can you help me?' by itself...",
            },
          },
          {
            id: 'custom:default-strategy',
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
          'custom:aggressive-variant',
          {
            id: 'custom:polite-variant',
            config: {
              strategyText: 'Be very polite and formal',
              stateful: false,
            },
          },
          'crescendo',
          'file://./my-custom-strategy.js',
        ];

        mixedStrategies.forEach((strategy) => {
          expect(() => RedteamStrategySchema.parse(strategy)).not.toThrow();
        });
      });
    });
  });
});

describe('Error message quality', () => {
  it('should provide clear error messages for common mistakes', () => {
    // Test various common mistakes and ensure error messages are helpful
    const testCases = [
      {
        config: { plugins: ['non-existent-plugin'] },
        expectedError: 'Custom plugins must start with file://',
        description: 'non-existent plugin name',
      },
      {
        config: { strategies: ['file://strategy.json'] },
        expectedError: 'Custom strategies must start with file:// and end with .js or .ts',
        description: 'wrong file extension for strategy',
      },
      {
        config: { strategies: ['invalid-strategy-name'] },
        expectedError: 'Custom strategies must start with file:// and end with .js or .ts',
        description: 'invalid strategy name',
      },
      {
        config: { plugins: [{ id: 'default' }], numTests: 'many' as any },
        expectedError: /Expected number|Invalid type/,
        description: 'string instead of number for numTests',
      },
      {
        config: { plugins: ['default'], delay: 'slow' as any },
        expectedError: /Expected number|Invalid type/,
        description: 'string instead of number for delay',
      },
    ];

    testCases.forEach(({ config, expectedError, description }) => {
      let errorCaught = false;
      let zodError: z.ZodError | null = null;

      try {
        RedteamConfigSchema.parse(config);
      } catch (error) {
        errorCaught = true;
        if (error instanceof z.ZodError) {
          zodError = error;
        }
      }

      expect(errorCaught).toBe(true);
      expect(zodError).not.toBeNull();

      const message = zodError!.issues[0]?.message || '';

      // Always perform the assertion, the expected pattern handles both string and regex
      const matches =
        typeof expectedError === 'string'
          ? message.includes(expectedError)
          : expectedError.test(message);

      expect(matches).toBe(true);
    });
  });
});
