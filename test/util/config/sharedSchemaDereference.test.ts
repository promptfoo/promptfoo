import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { type UnifiedConfig } from '../../../src/types/index';
import { dereferenceConfig } from '../../../src/util/config/load';

function sharedSchema() {
  return {
    properties: { status: { $ref: '#/$defs/Status' } },
    type: 'object',
  };
}

describe('selective schema source isolation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('detaches a provider consumer while an ordinary direct consumer uses raw RefParser', async () => {
    const schema = sharedSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: { schema },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: { $ref: '#/definitions/schema' } } },
        },
      ],
      tests: [
        {
          vars: {
            definitions: { $ref: '#/definitions' },
            payload: { $ref: '#/definitions/schema' },
            whole: { $ref: '#' },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.schema).toEqual(schema);
    expect(result.providers[0].config.response_format.schema).not.toBe(result.definitions.schema);
    expect(result.definitions.schema.properties.status).toEqual({ const: 'CONFIG' });
    expect(result.tests[0].vars.payload).toBe(result.definitions.schema);
    expect(result.tests[0].vars.definitions).toBe(result.definitions);
    expect(result.tests[0].vars.whole).toBe(result);
  });

  it('detaches an inline provider schema from direct, descendant, and ancestor consumers', async () => {
    const schema = sharedSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema } },
        },
      ],
      tests: [
        {
          vars: {
            ancestor: { $ref: '#/providers/0/config' },
            direct: { $ref: '#/providers/0/config/response_format/schema' },
            status: {
              $ref: '#/providers/0/config/response_format/schema/properties/status',
            },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.schema).toEqual(schema);
    expect(result.tests[0].vars.direct.properties.status).toEqual({ const: 'CONFIG' });
    expect(result.tests[0].vars.status).toEqual({ const: 'CONFIG' });
    expect(result.tests[0].vars.ancestor.response_format.schema.properties.status).toEqual({
      const: 'CONFIG',
    });
    expect(result.tests[0].vars.ancestor).not.toBe(result.providers[0].config);
  });

  it('detaches schemas reached through referenced provider wrappers', async () => {
    const schema = sharedSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        format: { schema: { $ref: '#/definitions/schema' }, type: 'json_schema' },
        schema,
      },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { $ref: '#/definitions/format', provider: true } },
        },
      ],
      tests: [{ vars: { format: { $ref: '#/definitions/format' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format).toMatchObject({
      provider: true,
      schema,
      type: 'json_schema',
    });
    expect(result.tests[0].vars.format.schema.properties.status).toEqual({ const: 'CONFIG' });
  });

  it('detaches a pure provider wrapper ref from an ordinary wrapper alias', async () => {
    const schema = sharedSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        format: { schema: { $ref: '#/definitions/schema' }, type: 'json_schema' },
        schema,
      },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { $ref: '#/definitions/format' } },
        },
      ],
      tests: [{ vars: { format: { $ref: '#/definitions/format' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.schema).toEqual(schema);
    expect(result.providers[0].config.response_format).not.toBe(result.definitions.format);
    expect(result.tests[0].vars.format).toBe(result.definitions.format);
    expect(result.tests[0].vars.format.schema.properties.status).toEqual({ const: 'CONFIG' });
  });

  it('detaches a referenced provider from its ordinary definition', async () => {
    const schema = sharedSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        provider: {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: { $ref: '#/definitions/schema' } } },
        },
        schema,
      },
      prompts: ['hello'],
      providers: [{ $ref: '#/definitions/provider' }],
      tests: [{ vars: { provider: { $ref: '#/definitions/provider' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0]).not.toBe(result.definitions.provider);
    expect(result.providers[0].config.response_format.schema).toEqual(schema);
    expect(result.tests[0].vars.provider).toBe(result.definitions.provider);
    expect(result.definitions.provider.config.response_format.schema.properties.status).toEqual({
      const: 'CONFIG',
    });
  });

  it('keeps schema-only missing, malformed, and remote refs inert', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const schema = {
      properties: {
        malformed: { $ref: '#/%ZZ' },
        missing: { $ref: 'file:///definitely/missing/pr-5256-selective.json' },
        remote: { $ref: 'https://example.com/pr-5256-selective.json' },
      },
      type: 'object',
    };
    const result = (await dereferenceConfig({
      definitions: { schema },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:codex-sdk',
          config: { output_schema: { $ref: '#/definitions/schema' } },
        },
        {
          id: 'anthropic:claude-agent-sdk',
          config: {
            output_format: {
              schema: { $ref: '#/definitions/schema' },
              type: 'json_schema',
            },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.output_schema).toEqual(schema);
    expect(result.providers[1].config.output_format.schema).toEqual(schema);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('loads a pure schema-root file ref without dereferencing refs inside the file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-schema-root-'));
    const schemaPath = join(directory, 'schema.json');
    const schema = {
      $defs: { Status: { type: 'string' } },
      properties: {
        missing: { $ref: './missing.json' },
        remote: { $ref: 'https://example.com/schema.json' },
        status: { $ref: '#/$defs/Status' },
      },
      type: 'object',
    };
    await writeFile(schemaPath, JSON.stringify(schema));
    const schemaRef = { $ref: pathToFileURL(schemaPath).href };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const result = (await dereferenceConfig({
        definitions: { schema: schemaRef },
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: { response_format: { schema: schemaRef } },
          },
          {
            id: 'openai:codex-sdk',
            config: { output_schema: { $ref: '#/definitions/schema' } },
          },
        ],
      } as unknown as UnifiedConfig)) as any;

      expect(result.providers[0].config.response_format.schema).toEqual(schema);
      expect(result.providers[1].config.output_schema).toEqual(schema);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('keeps a missing pure local schema-root ref on the native error path', async () => {
    await expect(
      dereferenceConfig({
        definitions: { schema: { $ref: '#/definitions/missing' } },
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: { response_format: { schema: { $ref: '#/definitions/schema' } } },
          },
        ],
      } as unknown as UnifiedConfig),
    ).rejects.toThrow('Token "missing" does not exist');
  });

  it('uses baseline missing-ref errors once a schema source is ordinary', async () => {
    await expect(
      dereferenceConfig({
        definitions: {
          schema: { properties: { missing: { $ref: '#/missing' } }, type: 'object' },
        },
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: { response_format: { schema: { $ref: '#/definitions/schema' } } },
          },
        ],
        tests: [{ vars: { payload: { $ref: '#/definitions/schema/properties/missing' } } }],
      } as unknown as UnifiedConfig),
    ).rejects.toThrow('Token "missing" does not exist');
  });

  it('uses baseline remote resolution once a schema source is ordinary', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ const: 'REMOTE' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const schema = {
      properties: { remote: { $ref: 'https://example.com/pr-5256-selective.json' } },
      type: 'object',
    };
    const result = (await dereferenceConfig({
      definitions: { schema },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: { $ref: '#/definitions/schema' } } },
        },
      ],
      tests: [{ vars: { payload: { $ref: '#/definitions/schema' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.tests[0].vars.payload.properties.remote).toEqual({ const: 'REMOTE' });
    expect(result.providers[0].config.response_format.schema).toEqual(schema);
  });

  it('leaves sibling-bearing schema root refs to raw RefParser for ordinary consumers', async () => {
    const schema = { $ref: '#/$defs/Status', note: 'schema sibling' };
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: { schema },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: { $ref: '#/definitions/schema' } } },
        },
      ],
      tests: [{ vars: { payload: { $ref: '#/definitions/schema' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars.payload).toEqual({ const: 'CONFIG', note: 'schema sibling' });
    expect(result.providers[0].config.response_format.schema).toEqual(schema);
  });

  it('leaves pure source cycles to raw RefParser while keeping the provider detached', async () => {
    const result = (await dereferenceConfig({
      definitions: {
        first: { $ref: '#/definitions/second' },
        second: { $ref: '#/definitions/first' },
      },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: { $ref: '#/definitions/first' } } },
        },
      ],
      tests: [{ vars: { payload: { $ref: '#/definitions/first' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars.payload).toBe(result.definitions.first);
    expect(result.definitions.first).toBe(result.definitions.second);
    expect(result.providers[0].config.response_format.schema).toHaveProperty('$ref');
    expect(result.providers[0].config.response_format.schema).not.toBe(result.definitions.first);
  });

  it('detaches a YAML-style alias and preserves opaque instances', async () => {
    class Opaque {
      readonly marker = 'opaque';
      get dangerous(): never {
        throw new Error('opaque getter was evaluated');
      }
    }
    const alias = sharedSchema();
    const opaque = new Opaque();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: { schema: alias },
      prompts: ['hello'],
      providers: [
        opaque,
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: alias } },
        },
      ],
      tests: [{ vars: { payload: { $ref: '#/definitions/schema' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0]).toBe(opaque);
    expect(result.providers[1].config.response_format.schema).toEqual(alias);
    expect(result.definitions.schema.properties.status).toEqual({ const: 'CONFIG' });
  });

  it('preserves opaque instances nested inside a detached inline schema', async () => {
    class OpaqueDefault {
      readonly marker = 'opaque-default';
      get dangerous(): never {
        throw new Error('opaque schema default getter was evaluated');
      }
    }
    const opaqueDefault = new OpaqueDefault();
    const result = (await dereferenceConfig({
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: {
              schema: {
                properties: { value: { default: opaqueDefault, type: 'object' } },
                type: 'object',
              },
            },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.schema.properties.value.default).toBe(
      opaqueDefault,
    );
  });

  it('matches RefParser fragment and token decoding for percent-encoded pointers', async () => {
    const schema = sharedSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: { '%2F': { const: 'PERCENT_KEY' }, '/': schema },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: { $ref: '#/definitions/%252F' } } },
        },
      ],
      tests: [
        {
          vars: {
            encoded: { $ref: '#/definitions/%252F' },
            percent: { $ref: '#/definitions/%25252F' },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.schema).toEqual(schema);
    expect(result.tests[0].vars.encoded.properties.status).toEqual({ const: 'CONFIG' });
    expect(result.tests[0].vars.percent).toEqual({ const: 'PERCENT_KEY' });
  });

  it('classifies 3,200 shared schema sources without quadratic overlap scans', async () => {
    const sourceCount = 3_200;
    const schemas = Object.fromEntries(
      Array.from({ length: sourceCount }, (_, index) => [
        `schema${index}`,
        { const: index, title: `schema-${index}` },
      ]),
    );
    const providers = Array.from({ length: sourceCount }, (_, index) => ({
      id: 'openai:chat:gpt-4o',
      config: {
        response_format: {
          schema: { $ref: `#/definitions/schemas/schema${index}` },
        },
      },
    }));

    const result = (await dereferenceConfig({
      definitions: { schemas },
      prompts: ['hello'],
      providers,
      tests: [{ vars: { schemas: { $ref: '#/definitions/schemas' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars.schemas.schema0).toEqual({ const: 0, title: 'schema-0' });
    expect(result.tests[0].vars.schemas.schema3199).toEqual({
      const: 3199,
      title: 'schema-3199',
    });
    expect(result.providers[0].config.response_format.schema).toEqual(schemas.schema0);
    expect(result.providers[3199].config.response_format.schema).toEqual(schemas.schema3199);
    expect(result.providers[0].config.response_format.schema).not.toBe(
      result.definitions.schemas.schema0,
    );
  });
});
