import { afterEach, describe, expect, it, vi } from 'vitest';
import { type UnifiedConfig } from '../../../src/types/index';
import { dereferenceConfig } from '../../../src/util/config/load';

function statusSchema() {
  return {
    $defs: {
      Status: { enum: ['active', 'inactive'], type: 'string' },
    },
    properties: {
      status: { $ref: '#/$defs/Status' },
    },
    type: 'object',
  };
}

describe('dereferenceConfig JSON Schema isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves nested response_format schemas while dereferencing config references', async () => {
    const result = (await dereferenceConfig({
      prompts: [{ $ref: '#/definitions/prompt' }],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'status',
                schema: statusSchema(),
              },
            },
          },
        },
      ],
      definitions: { prompt: 'hello world' },
    } as unknown as UnifiedConfig)) as unknown as {
      prompts: string[];
      providers: Array<{
        config: {
          response_format: {
            json_schema: { schema: { properties: { status: { $ref: string } } } };
          };
        };
      }>;
    };

    expect(result.prompts).toEqual(['hello world']);
    expect(result.providers[0].config.response_format.json_schema.schema.properties.status).toEqual(
      { $ref: '#/$defs/Status' },
    );
  });

  it('preserves direct response_format schemas in redteam targets', async () => {
    const result = (await dereferenceConfig({
      prompts: [{ $ref: '#/definitions/prompt' }],
      targets: [
        {
          id: 'http',
          config: {
            response_format: {
              type: 'json_schema',
              name: 'status',
              schema: statusSchema(),
            },
          },
        },
      ],
      definitions: { prompt: 'hello world' },
    } as unknown as UnifiedConfig)) as unknown as {
      prompts: string[];
      targets: Array<{
        config: {
          response_format: { schema: { properties: { status: { $ref: string } } } };
        };
      }>;
    };

    expect(result.prompts).toEqual(['hello world']);
    expect(result.targets[0].config.response_format.schema.properties.status).toEqual({
      $ref: '#/$defs/Status',
    });
  });

  it('preserves schemas in nested test and assertion provider overrides', async () => {
    const result = (await dereferenceConfig({
      prompts: ['hello world'],
      providers: ['openai:chat:gpt-4o'],
      tests: [
        {
          provider: {
            id: 'http',
            config: {
              response_format: {
                type: 'json_schema',
                name: 'test-status',
                schema: statusSchema(),
              },
            },
          },
          assert: [
            {
              type: 'llm-rubric',
              provider: {
                id: 'openai:chat:gpt-4o',
                config: {
                  functions: [{ name: 'status', parameters: statusSchema() }],
                },
              },
            },
          ],
        },
      ],
    } as unknown as UnifiedConfig)) as unknown as {
      tests: Array<{
        provider: {
          config: { response_format: { schema: { properties: { status: { $ref: string } } } } };
        };
        assert: Array<{
          provider: {
            config: {
              functions: Array<{ parameters: { properties: { status: { $ref: string } } } }>;
            };
          };
        }>;
      }>;
    };

    expect(result.tests[0].provider.config.response_format.schema.properties.status).toEqual({
      $ref: '#/$defs/Status',
    });
    expect(
      result.tests[0].assert[0].provider.config.functions[0].parameters.properties.status,
    ).toEqual({ $ref: '#/$defs/Status' });
  });

  it('preserves response_format schemas in prompt config and test options', async () => {
    const result = (await dereferenceConfig({
      prompts: [
        {
          raw: 'hello world',
          config: {
            response_format: {
              type: 'json_schema',
              schema: statusSchema(),
            },
          },
        },
      ],
      providers: ['openai:chat:gpt-4o'],
      tests: [
        {
          options: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'status',
                schema: statusSchema(),
              },
            },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as unknown as {
      prompts: Array<{
        config: { response_format: { schema: { properties: { status: { $ref: string } } } } };
      }>;
      tests: Array<{
        options: {
          response_format: {
            json_schema: { schema: { properties: { status: { $ref: string } } } };
          };
        };
      }>;
    };

    expect(result.prompts[0].config.response_format.schema.properties.status).toEqual({
      $ref: '#/$defs/Status',
    });
    expect(result.tests[0].options.response_format.json_schema.schema.properties.status).toEqual({
      $ref: '#/$defs/Status',
    });
  });

  it('resolves config-level schema refs while preserving refs inside the selected schema', async () => {
    const sharedSchema = statusSchema();
    const result = (await dereferenceConfig({
      definitions: { sharedSchema },
      prompts: ['hello world'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'status',
                schema: { $ref: '#/definitions/sharedSchema' },
              },
            },
            tools: [
              {
                type: 'function',
                function: {
                  name: 'status',
                  parameters: { $ref: '#/definitions/sharedSchema' },
                },
              },
            ],
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.json_schema.schema).toEqual(sharedSchema);
    expect(result.providers[0].config.tools[0].function.parameters).toEqual(sharedSchema);
    expect(result.definitions.sharedSchema).toEqual(sharedSchema);
  });

  it('resolves a referenced response_format wrapper before preserving its schema refs', async () => {
    const responseFormat = {
      type: 'json_schema',
      json_schema: { name: 'status', schema: statusSchema() },
    };
    const result = (await dereferenceConfig({
      definitions: { responseFormat },
      prompts: ['hello world'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { $ref: '#/definitions/responseFormat' } },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format).toEqual(responseFormat);
  });

  it('does not treat schema-shaped values in test vars as provider schemas', async () => {
    const result = (await dereferenceConfig({
      definitions: { value: { type: 'string' } },
      prompts: ['hello world'],
      providers: ['echo'],
      tests: [
        {
          vars: {
            response_format: {
              schema: { $ref: '#/definitions/value' },
            },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars.response_format.schema).toEqual({ type: 'string' });
  });

  it('isolates a provider schema that is also exposed through a YAML-style alias', async () => {
    const sharedSchema = statusSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG_ROOT' } },
      prompts: ['hello world'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'status', schema: sharedSchema },
            },
          },
        },
      ],
      reusableSchema: sharedSchema,
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.json_schema.schema).toEqual(sharedSchema);
    expect(result.reusableSchema.properties.status).toEqual({ const: 'CONFIG_ROOT' });
  });

  it('preserves root and composed schema refs without resolving files or URLs', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ type: 'string' })));
    const schema = {
      $ref: '#/$defs/Node',
      $defs: {
        Node: {
          properties: {
            child: { $ref: '#/$defs/Node' },
            missing: { $ref: '#/$defs/Missing' },
            relative: { $ref: './missing-schema.json#/$defs/Child' },
            remote: { $ref: 'https://example.com/schema.json#/$defs/Remote' },
          },
          type: 'object',
        },
      },
      allOf: [{ $ref: '#/$defs/Node' }],
      anyOf: [{ type: 'null' }, { $ref: '#/$defs/Node' }],
      properties: {
        nodes: {
          items: { $ref: '#/$defs/Node' },
          prefixItems: [{ $ref: '#/$defs/Node' }],
          type: 'array',
        },
      },
    };

    const result = (await dereferenceConfig({
      prompts: ['hello world'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            functions: [
              {
                name: 'remote',
                parameters: { $ref: 'https://example.com/function-schema.json' },
              },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'nodes', schema },
            },
            tools: [
              {
                type: 'function',
                function: {
                  name: 'relative',
                  parameters: { $ref: './missing-tool-schema.json' },
                },
              },
            ],
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.json_schema.schema).toEqual(schema);
    expect(result.providers[0].config.functions[0].parameters).toEqual({
      $ref: 'https://example.com/function-schema.json',
    });
    expect(result.providers[0].config.tools[0].function.parameters).toEqual({
      $ref: './missing-tool-schema.json',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves schemas across map, default, scenario, and assertion provider contexts', async () => {
    const schema = statusSchema();
    const result = (await dereferenceConfig({
      prompts: ['hello world'],
      targets: [{ 'openai:chat:gpt-4o': { config: { response_format: { schema } } } }],
      defaultTest: {
        options: {
          provider: {
            id: 'openai:chat:gpt-4o',
            config: { functions: [{ name: 'status', parameters: schema }] },
          },
          response_format: { schema },
        },
      },
      scenarios: [
        {
          config: [{ vars: {} }],
          tests: [
            {
              assert: [
                {
                  type: 'llm-rubric',
                  provider: {
                    id: 'openai:chat:gpt-4o',
                    config: { response_format: { schema } },
                  },
                },
              ],
            },
          ],
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.targets[0]['openai:chat:gpt-4o'].config.response_format.schema).toEqual(schema);
    expect(result.defaultTest.options.provider.config.functions[0].parameters).toEqual(schema);
    expect(result.defaultTest.options.response_format.schema).toEqual(schema);
    expect(result.scenarios[0].tests[0].assert[0].provider.config.response_format.schema).toEqual(
      schema,
    );
  });

  it('keeps masking state isolated across concurrent config loads', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ type: 'string' })));
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        dereferenceConfig({
          prompts: [{ $ref: '#/definitions/prompt' }],
          providers: [
            {
              id: 'openai:chat:gpt-4o',
              config: {
                response_format: {
                  schema: { $ref: `https://example.com/schema-${index}.json` },
                },
              },
            },
          ],
          definitions: { prompt: `prompt ${index}` },
        } as unknown as UnifiedConfig),
      ),
    );

    expect(results.map((result) => result.prompts?.[0])).toEqual(
      Array.from({ length: 8 }, (_, index) => `prompt ${index}`),
    );
    expect(
      results.map(
        (result) => (result.providers?.[0] as any).config.response_format.schema.$ref as string,
      ),
    ).toEqual(Array.from({ length: 8 }, (_, index) => `https://example.com/schema-${index}.json`));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('restores standalone schemas when an unrelated config ref fails', async () => {
    const schema = statusSchema();
    const rawConfig = {
      prompts: [{ $ref: '/definitely/missing/promptfoo-pr-5256.json' }],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'status', schema },
            },
          },
        },
      ],
    } as unknown as UnifiedConfig;
    const originalConfig = structuredClone(rawConfig);

    await expect(dereferenceConfig(rawConfig)).rejects.toThrow();
    expect(rawConfig).toEqual(originalConfig);
  });
});
