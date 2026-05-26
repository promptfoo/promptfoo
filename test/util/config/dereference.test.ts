import { describe, expect, it } from 'vitest';
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
});
