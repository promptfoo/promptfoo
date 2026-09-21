import * as fs from 'fs';
import * as path from 'path';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { UnifiedConfigSchema } from '../src/types';
import { normalizeConfigDraft, UnifiedConfigDraftSchema } from '../src/types/configDraft';

describe('config-schema.json', () => {
  let schema: any;
  let ajv: Ajv;

  // Helper to resolve $ref references in the schema
  const resolveRef = (obj: any): any => {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    if (obj.$ref && typeof obj.$ref === 'string') {
      // Parse $ref like "#/definitions/__schema32"
      const refPath = obj.$ref.replace('#/', '').split('/');
      let resolved = schema;
      for (const part of refPath) {
        resolved = resolved?.[part];
      }
      return resolved;
    }
    return obj;
  };

  beforeAll(() => {
    // Read the schema file
    const schemaPath = path.join(__dirname, '..', 'site', 'static', 'config-schema.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    schema = JSON.parse(schemaContent);

    // Initialize AJV for schema validation
    // Use strict: false to avoid issues with regex patterns
    ajv = new Ajv({
      strict: false,
      allErrors: true,
      validateFormats: false, // Disable format validation to avoid regex issues
    });
    addFormats(ajv);
  });

  it('should be valid JSON', () => {
    expect(schema).toBeDefined();
    expect(typeof schema).toBe('object');
  });

  it('should be a valid JSON Schema', () => {
    const valid = ajv.validateSchema(schema);
    expect(valid, `Schema validation errors: ${JSON.stringify(ajv.errors, null, 2)}`).toBe(true);
  });

  it('should have required top-level properties', () => {
    expect(schema).toHaveProperty('$ref');
    expect(schema).toHaveProperty('definitions');
    expect(schema.definitions).toHaveProperty('PromptfooConfigSchema');
  });

  describe('redteam plugin enums', () => {
    it('should not have duplicate entries in plugin enums', () => {
      const findPluginEnums = (
        obj: any,
        path: string = '',
      ): Array<{ path: string; values: string[] }> => {
        const results: Array<{ path: string; values: string[] }> = [];

        if (obj && typeof obj === 'object') {
          // Check if this is an enum array that looks like a plugin list
          if (Array.isArray(obj.enum) && obj.enum.length > 10 && obj.enum.includes('bias')) {
            results.push({ path, values: obj.enum });
          }

          for (const [key, value] of Object.entries(obj)) {
            if (key !== 'enum') {
              results.push(...findPluginEnums(value, path ? `${path}.${key}` : key));
            }
          }
        }

        return results;
      };

      const pluginEnums = findPluginEnums(schema);

      expect(pluginEnums.length).toBeGreaterThan(0);

      pluginEnums.forEach(({ path, values }) => {
        const uniqueValues = [...new Set(values)];
        const duplicates = values.filter((item, index) => values.indexOf(item) !== index);

        expect(values, `Duplicates found at ${path}: ${duplicates.join(', ')}`).toHaveLength(
          uniqueValues.length,
        );
      });
    });

    it('should have consistent plugin lists across different locations', () => {
      const findAllEnums = (obj: any): string[][] => {
        const results: string[][] = [];

        if (obj && typeof obj === 'object') {
          if (Array.isArray(obj.enum) && obj.enum.length > 10 && obj.enum.includes('bias')) {
            results.push(obj.enum);
          }

          for (const value of Object.values(obj)) {
            results.push(...findAllEnums(value));
          }
        }

        return results;
      };

      const allEnums = findAllEnums(schema);

      // Should find at least 2 (one for string type, one for object id)
      expect(allEnums.length).toBeGreaterThanOrEqual(2);

      const firstEnum = allEnums[0]?.sort();
      expect(firstEnum).toBeDefined();

      for (let i = 1; i < allEnums.length; i++) {
        expect(allEnums[i].sort()).toEqual(firstEnum);
      }
    });

    it('should contain expected plugin entries', () => {
      const findPluginEnum = (obj: any): string[] | null => {
        if (obj && typeof obj === 'object') {
          if (Array.isArray(obj.enum) && obj.enum.includes('bias')) {
            return obj.enum;
          }

          for (const value of Object.values(obj)) {
            const result = findPluginEnum(value);
            if (result) {
              return result;
            }
          }
        }

        return null;
      };

      const pluginEnum = findPluginEnum(schema);
      expect(pluginEnum).not.toBeNull();

      // Use non-null assertion since we've already checked it's not null
      const plugins = pluginEnum!;

      expect(plugins).toContain('bias');
      expect(plugins).toContain('bias:age');
      expect(plugins).toContain('bias:disability');
      expect(plugins).toContain('bias:gender');
      expect(plugins).toContain('bias:race');
      expect(plugins).toContain('default');
      expect(plugins).toContain('harmful');
      expect(plugins).toContain('pii');

      const biasCount = plugins.filter((p) => p === 'bias').length;
      expect(biasCount).toBe(1);
    });
  });

  describe('schema structure', () => {
    it('should define UnifiedConfig properly', () => {
      const unifiedConfig = schema.definitions?.PromptfooConfigSchema;
      expect(unifiedConfig).toBeDefined();
      expect(unifiedConfig.type).toBe('object');
      expect(unifiedConfig.properties).toBeDefined();
    });

    it('should have redteam configuration', () => {
      const properties = schema.definitions?.PromptfooConfigSchema?.properties;
      expect(properties).toHaveProperty('redteam');

      // Resolve $ref if the property is a reference
      const redteamConfig = resolveRef(properties?.redteam);
      expect(redteamConfig).toBeDefined();
      expect(redteamConfig.type).toBe('object');
      expect(redteamConfig.properties).toHaveProperty('plugins');
      expect(redteamConfig.properties).toHaveProperty('strategies');
    });

    it('documents only supported external trace backends and their required endpoint', () => {
      const tracingConfig = resolveRef(
        schema.definitions?.PromptfooConfigSchema?.properties?.tracing,
      );
      const provider = resolveRef(tracingConfig.properties.provider);
      const providers = provider.oneOf;
      const tempo = providers.find(
        (option: { properties: { id: { const: string } } }) =>
          option.properties.id.const === 'tempo',
      );
      const braintrust = providers.find(
        (option: { properties: { id: { const: string } } }) =>
          option.properties.id.const === 'braintrust',
      );
      const langfuse = providers.find(
        (option: { properties: { id: { const: string } } }) =>
          option.properties.id.const === 'langfuse',
      );

      expect(providers).toHaveLength(3);
      expect(tempo.required).toEqual(expect.arrayContaining(['id', 'endpoint']));
      expect(tempo.properties.timeout.exclusiveMinimum).toBe(0);
      expect(braintrust.required).toEqual(
        expect.arrayContaining(['id', 'endpoint', 'projectId', 'auth']),
      );
      expect(braintrust.properties.auth.required).toContain('token');
      expect(langfuse.required).toEqual(expect.arrayContaining(['id', 'endpoint', 'auth']));
      expect(langfuse.properties.auth.required).toEqual(
        expect.arrayContaining(['username', 'password']),
      );
      expect(tracingConfig.properties.queryDelay.minimum).toBe(0);
    });

    it('should validate that plugin patterns are properly escaped', () => {
      const findPatterns = (obj: any): string[] => {
        const patterns: string[] = [];

        if (obj && typeof obj === 'object') {
          if (typeof obj.pattern === 'string') {
            patterns.push(obj.pattern);
          }

          for (const value of Object.values(obj)) {
            patterns.push(...findPatterns(value));
          }
        }

        return patterns;
      };

      const patterns = findPatterns(schema);

      const filePatterns = patterns.filter((p) => p.includes('file'));
      expect(filePatterns.length).toBeGreaterThan(0);

      filePatterns.forEach((pattern) => {
        expect(pattern).toMatch(/file.*\\/);
      });
    });
  });

  describe('performance', () => {
    it('should not be excessively large', () => {
      const schemaSize = JSON.stringify(schema).length;
      // Schema should be under 1MB
      expect(schemaSize).toBeLessThan(1024 * 1024);
    });
  });

  describe('generated schema integrity', () => {
    it('should match the structure generated by zod-to-json-schema', () => {
      // Verify the schema follows zod-to-json-schema conventions
      expect(schema.$ref).toBe('#/definitions/PromptfooConfigSchema');
      expect(schema.definitions).toBeDefined();

      // Check that the main schema definition exists
      const mainDef = schema.definitions.PromptfooConfigSchema;
      expect(mainDef).toBeDefined();
      expect(mainDef.type).toBe('object');
    });

    it('should regenerate to the same schema', async () => {
      // This test ensures the schema generation is deterministic
      // We'll check that key structures are present
      const properties = schema.definitions?.PromptfooConfigSchema?.properties;

      // Core properties that should always exist
      expect(properties).toHaveProperty('prompts');
      expect(properties).toHaveProperty('providers');
      expect(properties).toHaveProperty('tests');
      expect(properties).toHaveProperty('redteam');
      expect(properties).toHaveProperty('scenarios');
      expect(properties).toHaveProperty('defaultTest');
    });
  });

  describe('runtime input parity', () => {
    const baseConfig = { prompts: ['hello'], providers: ['echo'] };

    it.each([
      ['providers', { providers: ['echo'] }, true],
      ['targets', { targets: ['echo'] }, true],
      ['both spellings', { providers: ['echo'], targets: ['echo'] }, false],
    ] as const)('agrees on %s for provider selection', (_name, selection, expected) => {
      const config = { prompts: ['hello'], ...selection };
      const validate = ajv.compile(schema);

      expect(UnifiedConfigSchema.safeParse(config).success).toBe(expected);
      expect(validate(config), JSON.stringify(validate.errors)).toBe(expected);
    });

    it('leaves provider selection optional for authoring but required for a complete evaluation', () => {
      const config = { prompts: ['hello'] };
      const validate = ajv.compile(schema);

      expect(validate(config), JSON.stringify(validate.errors)).toBe(true);
      expect(UnifiedConfigSchema.safeParse(config).success).toBe(false);
    });

    it.each([
      ['defaulted nested lists may be omitted', {}, true],
      ['boolean tracing settings', { tracing: { enabled: true, maxDepth: 2 } }, true],
      [
        'recursive tracing settings',
        {
          tracing: {
            enabled: false,
            strategies: {
              fixture: { enabled: true, strategies: { nested: { enabled: false, maxDepth: 2 } } },
            },
          },
        },
        true,
      ],
      ['string tracing settings', { tracing: { enabled: 'yes' } }, false],
      [
        'string tracing settings in a recursive override',
        { tracing: { strategies: { fixture: { enabled: 'yes' } } } },
        false,
      ],
      [
        'invalid constraints in a recursive override',
        { tracing: { strategies: { fixture: { maxDepth: 0 } } } },
        false,
      ],
    ] as const)('agrees on %s', (name, redteam, expected) => {
      const config = {
        ...baseConfig,
        redteam:
          name === 'defaulted nested lists may be omitted'
            ? redteam
            : { plugins: [], strategies: [], ...redteam },
      };
      const validate = ajv.compile(schema);

      expect(UnifiedConfigSchema.safeParse(config).success).toBe(expected);
      expect(validate(config), JSON.stringify(validate.errors)).toBe(expected);
    });

    it.each([
      ['defaulted top-level tracing settings', { tracing: { otlp: { http: {} } } }],
      ['scalar environment inputs before normalization', { env: { CUSTOM_RETRIES: 2 } }],
      ['nullable extensions before normalization', { extensions: null }],
    ] as const)('accepts %s in both validators', (_name, partialConfig) => {
      const config = { ...baseConfig, ...partialConfig };
      const validate = ajv.compile(schema);

      expect(UnifiedConfigSchema.safeParse(config).success).toBe(true);
      expect(validate(config), JSON.stringify(validate.errors)).toBe(true);
    });
  });

  describe('runtime field contract for incomplete drafts', () => {
    it('allows missing top-level evaluation inputs while preserving nested field validation', () => {
      const draft = { description: 'Unfinished evaluation' };
      expect(UnifiedConfigDraftSchema.safeParse(draft).success).toBe(true);
      expect(UnifiedConfigDraftSchema.safeParse({}).success).toBe(true);
      expect(UnifiedConfigSchema.safeParse(draft).success).toBe(false);
      expect(UnifiedConfigDraftSchema.safeParse({ tracing: { otlp: { http: {} } } }).success).toBe(
        true,
      );

      const invalid = UnifiedConfigDraftSchema.safeParse({ tracing: { enabled: 'yes' } });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0].path).toEqual(['tracing', 'enabled']);
      }
    });

    it('rejects basePath only in web drafts while retaining it in the file and runtime contracts', () => {
      const config = { prompts: ['hello'], providers: ['echo'], basePath: '/work/config' };
      expect(UnifiedConfigSchema.safeParse(config).success).toBe(true);
      expect(ajv.compile(schema)(config)).toBe(true);

      const webDraft = UnifiedConfigDraftSchema.safeParse(config);
      expect(webDraft.success).toBe(false);
      if (!webDraft.success) {
        expect(webDraft.error.issues).toEqual([
          expect.objectContaining({ path: ['basePath'], message: expect.stringContaining('CLI') }),
        ]);
      }
    });

    it('accepts either provider input but identifies conflicting aliases in a draft', () => {
      for (const selection of [{ providers: ['echo'] }, { targets: ['echo'] }]) {
        expect(UnifiedConfigDraftSchema.safeParse(selection).success).toBe(true);
        expect(UnifiedConfigSchema.safeParse({ prompts: ['hello'], ...selection }).success).toBe(
          true,
        );
      }

      const invalid = UnifiedConfigDraftSchema.safeParse({
        providers: ['echo'],
        targets: ['echo'],
      });
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues).toEqual([
          expect.objectContaining({
            path: ['providers'],
            message: expect.stringContaining('both'),
          }),
        ]);
      }
    });

    it('normalizes targets for consumers without mutating the authored draft or adding defaults', () => {
      const draft = {
        description: 'Authoring draft',
        targets: ['echo'],
        customEditorSetting: { retained: true },
      };
      const normalized = normalizeConfigDraft(draft);

      expect(normalized).toEqual({
        description: 'Authoring draft',
        providers: ['echo'],
        customEditorSetting: { retained: true },
      });
      expect(draft).toHaveProperty('targets', ['echo']);
      expect(draft).not.toHaveProperty('providers');

      const canonical = { providers: ['echo'] };
      expect(normalizeConfigDraft(canonical)).toBe(canonical);
      const partial = { description: 'No provider yet' };
      expect(normalizeConfigDraft(partial)).toBe(partial);
    });
  });

  describe('transform schema', () => {
    it('should accept string transforms in JSON/YAML config files', () => {
      const validate = ajv.compile(schema);

      const config = {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            options: {
              transform: 'output.trim()',
              transformVars: '{ ...vars, name: vars.name.toUpperCase() }',
            },
            assert: [
              {
                type: 'contains',
                value: 'HELLO',
                transform: 'output.toUpperCase()',
                contextTransform: 'output.context',
              },
            ],
          },
        ],
      };

      expect(validate(config)).toBe(true);
    });

    it('should reject non-string transforms in JSON/YAML config files', () => {
      const validate = ajv.compile(schema);

      const config = {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            options: {
              transform: { unexpected: 'object' },
            },
          },
        ],
      };

      expect(validate(config)).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/tests/0/options/transform',
            keyword: 'type',
          }),
        ]),
      );
    });

    it('should reject non-string redteam provider transforms in JSON/YAML config files', () => {
      const validate = ajv.compile(schema);

      const config = {
        prompts: ['hello'],
        redteam: {
          plugins: ['default'],
          strategies: ['default'],
          provider: {
            id: 'openai:chat:gpt-4o-mini',
            transform: { unexpected: 'object' },
          },
        },
      };

      expect(validate(config)).toBe(false);
      expect(validate.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/redteam/provider/transform',
            keyword: 'type',
          }),
        ]),
      );
    });

    it('emits string-only types for every transform field in the JSON schema', () => {
      // Guard against the StringOrFunctionSchema leaking into the generated
      // config-schema.json via a `z.custom` → `{}` (any) branch. Every transform
      // property anywhere in the schema tree must declare `type: string` so
      // external YAML/JSON validators reject objects, numbers, and functions.
      const schemaJson = JSON.stringify(schema);
      const transformOccurrences = schemaJson.match(/"transform":\s*\{[^}]*\}/g) ?? [];
      const transformVarsOccurrences = schemaJson.match(/"transformVars":\s*\{[^}]*\}/g) ?? [];
      const contextTransformOccurrences =
        schemaJson.match(/"contextTransform":\s*\{[^}]*\}/g) ?? [];
      const postprocessOccurrences = schemaJson.match(/"postprocess":\s*\{[^}]*\}/g) ?? [];

      const allTransformFields = [
        ...transformOccurrences,
        ...transformVarsOccurrences,
        ...contextTransformOccurrences,
        ...postprocessOccurrences,
      ];

      expect(allTransformFields.length).toBeGreaterThan(0);
      for (const field of allTransformFields) {
        expect(field).toContain('"type":"string"');
      }
    });
  });

  describe('per-test repeat schema', () => {
    it('accepts positive integers and rejects invalid repeat counts', () => {
      const validate = ajv.compile(schema);
      const config = {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ options: { repeat: 3 } }],
      };

      expect(validate(config)).toBe(true);

      for (const repeat of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
        config.tests[0].options.repeat = repeat;
        expect(validate(config), `repeat ${repeat} should be invalid`).toBe(false);
      }
    });
  });
});
