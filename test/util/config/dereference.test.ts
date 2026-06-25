import { Agent, tool } from '@openai/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type UnifiedConfig } from '../../../src/types/index';
import { dereferenceWithStandaloneSchemas } from '../../../src/util/config/jsonSchema';
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

  it('preserves response_format schemas in the redteam generation provider', async () => {
    const schema = statusSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG_ROOT' } },
      prompts: ['hello world'],
      providers: ['echo'],
      redteam: {
        provider: {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema } },
        },
      },
    } as unknown as UnifiedConfig)) as any;

    expect(result.redteam.provider.config.response_format.schema).toEqual(schema);
  });

  it('preserves schemas in nested test and assertion provider overrides', async () => {
    const result = (await dereferenceConfig({
      definitions: { prompt: 'hello world' },
      prompts: [{ $ref: '#/definitions/prompt' }],
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

  it('preserves every supported provider-owned schema surface', async () => {
    const schema = {
      ...statusSchema(),
      allOf: [{ $ref: '#/$defs/Status' }],
      properties: {
        items: {
          items: { $ref: '#/$defs/Status' },
          type: 'array',
        },
        missing: { $ref: './missing-schema.json#/$defs/Missing' },
        remote: { $ref: 'https://example.com/status.json#/$defs/Status' },
        status: { $ref: '#/$defs/Status' },
      },
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ type: 'string' })));
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG_ROOT' } },
      prompts: ['hello world'],
      providers: [
        { id: 'openai:codex-sdk', config: { output_schema: schema } },
        {
          id: 'anthropic:claude-agent-sdk',
          config: { output_format: { type: 'json_schema', schema } },
        },
        { id: 'opencode:chat', config: { format: { type: 'json_schema', schema } } },
        { id: 'gateway:vercel-ai-gateway:openai/gpt-5', config: { responseSchema: schema } },
        {
          id: 'anthropic:messages:claude',
          config: { tools: [{ name: 'a', input_schema: schema }] },
        },
        { id: 'bedrock:converse:claude', config: { tools: [{ name: 'b', parameters: schema }] } },
        {
          id: 'bedrock:converse:claude',
          config: {
            tools: [{ toolSpec: { name: 'c', inputSchema: { json: schema } } }],
          },
        },
        {
          id: 'google:gemini-2.5-pro',
          config: {
            generationConfig: { response_schema: schema },
            tools: [
              {
                functionDeclarations: [{ name: 'd', parameters: schema, response: schema }],
              },
            ],
          },
        },
        {
          id: 'bedrock:amazon.nova-pro-v1:0',
          config: {
            toolConfig: {
              tools: [{ toolSpec: { name: 'e', inputSchema: { json: schema } } }],
            },
          },
        },
        {
          id: 'openai:agents:gpt-5-mini',
          config: {
            agent: {
              outputType: { name: 'agent', schema, strict: true, type: 'json_schema' },
              tools: [{ parameters: schema }],
              handoffs: [
                {
                  agent: {
                    outputType: { name: 'handoff', schema, strict: true, type: 'json_schema' },
                    tools: [{ parameters: schema }],
                  },
                },
              ],
            },
            handoffs: [
              {
                agent: {
                  outputType: { name: 'root-handoff', schema, strict: true, type: 'json_schema' },
                },
              },
            ],
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.output_schema).toEqual(schema);
    expect(result.providers[1].config.output_format.schema).toEqual(schema);
    expect(result.providers[2].config.format.schema).toEqual(schema);
    expect(result.providers[3].config.responseSchema).toEqual(schema);
    expect(result.providers[4].config.tools[0].input_schema).toEqual(schema);
    expect(result.providers[5].config.tools[0].parameters).toEqual(schema);
    expect(result.providers[6].config.tools[0].toolSpec.inputSchema.json).toEqual(schema);
    expect(result.providers[7].config.generationConfig.response_schema).toEqual(schema);
    expect(result.providers[7].config.tools[0].functionDeclarations[0].parameters).toEqual(schema);
    expect(result.providers[7].config.tools[0].functionDeclarations[0].response).toEqual(schema);
    expect(result.providers[8].config.toolConfig.tools[0].toolSpec.inputSchema.json).toEqual(
      schema,
    );
    expect(result.providers[9].config.agent.outputType.schema).toEqual(schema);
    expect(result.providers[9].config.agent.tools[0].parameters).toEqual(schema);
    expect(result.providers[9].config.agent.handoffs[0].agent.outputType.schema).toEqual(schema);
    expect(result.providers[9].config.agent.handoffs[0].agent.tools[0].parameters).toEqual(schema);
    expect(result.providers[9].config.handoffs[0].agent.outputType.schema).toEqual(schema);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves config-level refs selecting Codex and Claude schemas', async () => {
    const schema = statusSchema();
    const outputFormat = { type: 'json_schema', schema };
    const result = (await dereferenceConfig({
      definitions: { outputFormat, schema },
      prompts: ['hello world'],
      providers: [
        {
          id: 'openai:codex-sdk',
          config: { output_schema: { $ref: '#/definitions/schema' } },
        },
        {
          id: 'anthropic:claude-agent-sdk',
          config: { output_format: { $ref: '#/definitions/outputFormat' } },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.output_schema).toEqual(schema);
    expect(result.providers[1].config.output_format).toEqual(outputFormat);
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
            output_schema: { $ref: '#/definitions/value' },
            output_format: { schema: { $ref: '#/definitions/value' } },
            response_format: {
              schema: { $ref: '#/definitions/value' },
            },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars.output_schema).toEqual({ type: 'string' });
    expect(result.tests[0].vars.output_format.schema).toEqual({ type: 'string' });
    expect(result.tests[0].vars.response_format.schema).toEqual({ type: 'string' });
  });

  it('honors the ref-parser opt-out for direct standalone test callers', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ type: 'string' })));
    const tests = [
      {
        vars: {
          cyclic: { $ref: '#/0/vars/cyclic' },
          file: { $ref: 'file:///definitely/missing/promptfoo-pr-5256.json' },
          malformed: { $ref: '#/%ZZ' },
          missing: { $ref: '#/missing' },
          relative: { $ref: './missing.json' },
          remote: { $ref: 'https://example.com/missing.json' },
        },
      },
    ];

    const result = await dereferenceWithStandaloneSchemas(tests, 'tests', { disabled: true });

    expect(result).toBe(tests);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves supported programmatic config instances as opaque values', async () => {
    let getterReads = 0;
    class CustomProvider {
      readonly #value = 'provider-result';

      constructor() {
        Object.defineProperty(this, 'dangerous', {
          enumerable: true,
          get() {
            getterReads += 1;
            throw new Error('opaque getter was evaluated');
          },
        });
      }

      async callApi() {
        return { output: this.#value };
      }

      id() {
        return this.#value;
      }
    }

    const provider = new CustomProvider();
    const agent = new Agent({ instructions: 'Help the user.', name: 'Programmatic Agent' });
    const transformResponse = () => ({ output: 'transformed' });
    const agentTool = tool({
      description: 'Return a result.',
      execute: async () => 'tool-result',
      name: 'programmatic_tool',
      parameters: {
        additionalProperties: false,
        properties: {},
        required: [],
        type: 'object',
      },
    });
    const result = (await dereferenceConfig({
      definitions: { body: { ok: true }, prompt: 'hello world' },
      prompts: [{ $ref: '#/definitions/prompt' }],
      providers: [
        provider,
        {
          id: 'openai:agents:gpt-5-mini',
          config: { agent, tools: [agentTool] },
        },
        {
          id: 'http',
          config: {
            body: { $ref: '#/definitions/body' },
            transformResponse,
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0]).toBe(provider);
    expect(result.providers[0]).toBeInstanceOf(CustomProvider);
    await expect(result.providers[0].callApi()).resolves.toEqual({ output: 'provider-result' });
    expect(result.providers[1].config.agent).toBe(agent);
    expect(result.providers[1].config.agent).toBeInstanceOf(Agent);
    expect(result.providers[1].config.tools[0].invoke).toBe(agentTool.invoke);
    expect(result.providers[2].config.body).toEqual({ ok: true });
    expect(result.providers[2].config.transformResponse).toBe(transformResponse);
    expect(result.prompts).toEqual(['hello world']);
    expect(getterReads).toBe(0);
  });

  it('keeps exotic arrays opaque while resolving refs in frozen JSON values', async () => {
    let getterReads = 0;
    class CustomArray extends Array<unknown> {}
    const customArray = new CustomArray();
    const marker = Symbol('marker');
    Object.defineProperty(customArray, marker, { value: 'preserved' });
    Object.defineProperty(customArray, 'dangerous', {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error('array getter was evaluated');
      },
    });
    const frozen = Object.freeze({ $ref: '#/definitions/frozen' });

    const result = (await dereferenceConfig({
      definitions: { frozen: { value: 'resolved' } },
      prompts: ['hello world'],
      providers: [
        {
          id: 'http',
          config: { customArray, frozen },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.customArray).toBe(customArray);
    expect(result.providers[0].config.customArray[marker]).toBe('preserved');
    expect(result.providers[0].config.frozen).toEqual({ value: 'resolved' });
    expect(getterReads).toBe(0);
  });

  it('preserves JSON assertion schemas while resolving ordinary assertion values', async () => {
    const schema = statusSchema();
    const result = (await dereferenceConfig({
      definitions: {
        assertionSchema: schema,
        expected: { answer: 42 },
      },
      prompts: ['hello world'],
      providers: ['echo'],
      tests: [
        {
          assert: [
            { type: 'is-json', value: { $ref: '#/definitions/assertionSchema' } },
            { type: 'contains-json', value: schema },
            { type: 'not-is-json', value: schema },
            { type: 'not-contains-json', value: schema },
            { type: 'equals', value: { $ref: '#/definitions/expected' } },
          ],
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].assert.slice(0, 4).map((assertion: any) => assertion.value)).toEqual([
      schema,
      schema,
      schema,
      schema,
    ]);
    expect(result.tests[0].assert[4].value).toEqual({ answer: 42 });
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

  it('terminates on cyclic config values while preserving aliased provider schemas', async () => {
    const metadata: Record<string, unknown> = {};
    metadata.self = metadata;
    const sharedSchema = statusSchema();

    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG_ROOT' } },
      metadata,
      prompts: ['hello world'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: sharedSchema } },
        },
      ],
      reusableSchema: sharedSchema,
    } as unknown as UnifiedConfig)) as any;

    expect(result.metadata.self).toBe(result.metadata);
    expect(result.providers[0].config.response_format.schema).toEqual(sharedSchema);
    expect(result.reusableSchema.properties.status).toEqual({ const: 'CONFIG_ROOT' });
  });

  it('preserves own __proto__ data properties without changing the object prototype', async () => {
    const rawConfig = JSON.parse(`{
      "prompts": ["hello world"],
      "providers": [{
        "id": "openai:chat:gpt-4o",
        "config": {
          "response_format": { "schema": { "$ref": "#/__proto__" } }
        }
      }],
      "__proto__": {
        "$defs": { "Status": { "const": "ready" } },
        "polluted": "yes",
        "properties": { "status": { "$ref": "#/$defs/Status" } }
      }
    }`) as UnifiedConfig;

    const result = (await dereferenceConfig(rawConfig)) as UnifiedConfig & {
      __proto__: {
        polluted: string;
        properties: { status: { $ref: string } };
      };
      polluted?: string;
    };

    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect((result.providers as any)?.[0].config.response_format.schema).toEqual(result.__proto__);
    expect(result.__proto__.properties.status).toEqual({ $ref: '#/$defs/Status' });
    expect(result.polluted).toBeUndefined();
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
          config: [
            {
              options: {
                provider: {
                  id: 'openai:chat:gpt-4o',
                  config: { response_format: { schema } },
                },
                response_format: { schema },
              },
              vars: {},
            },
          ],
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
    expect(result.scenarios[0].config[0].options.response_format.schema).toEqual(schema);
    expect(result.scenarios[0].config[0].options.provider.config.response_format.schema).toEqual(
      schema,
    );
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

    expect(results.map((result) => (result as any).prompts?.[0])).toEqual(
      Array.from({ length: 8 }, (_, index) => `prompt ${index}`),
    );
    expect(
      results.map(
        (result) => (result as any).providers?.[0].config.response_format.schema.$ref as string,
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
