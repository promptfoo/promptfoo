import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { createServer } from 'http';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type UnifiedConfig } from '../../../src/types/index';
import { dereferenceWithStandaloneSchemas } from '../../../src/util/config/jsonSchema';
import { dereferenceConfig, readConfig } from '../../../src/util/config/load';

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

  it('parses protected-source dependencies once the parent source is ordinary', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        schemaA: {
          properties: {
            nested: { $ref: '#/definitions/schemaB' },
            node: { $ref: '#/definitions/schemaB/properties/node' },
          },
        },
        schemaB: {
          back: { $ref: '#/definitions/schemaA' },
          properties: { node: { status: { $ref: '#/$defs/Status' } } },
        },
      },
      prompts: ['hello'],
      providers: [
        {
          id: 'first',
          config: { response_format: { schema: { $ref: '#/definitions/schemaA' } } },
        },
        {
          id: 'second',
          config: { response_format: { schema: { $ref: '#/definitions/schemaB' } } },
        },
      ],
      tests: [{ vars: { ordinary: { $ref: '#/definitions/schemaA' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.schema.properties.nested).toEqual({
      $ref: '#/definitions/schemaB',
    });
    expect(result.providers[1].config.response_format.schema.properties.node.status).toEqual({
      $ref: '#/$defs/Status',
    });
    const ordinary = result.tests[0].vars.ordinary;
    expect(ordinary.properties.nested.properties.node.status).toEqual({
      const: 'CONFIG',
    });
    expect(ordinary.properties.node.status).toEqual({ const: 'CONFIG' });
    expect(ordinary.properties.nested.back).toBe(ordinary);
    expect(result.definitions.schemaB.properties.node.status).toEqual({ const: 'CONFIG' });
  });

  it('detaches protected branches targeted from an ordinary schema source', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        schema: { properties: { nested: { $ref: '#/providers/1/config' } } },
      },
      prompts: ['hello'],
      providers: [
        {
          id: 'first',
          config: { response_format: { schema: { $ref: '#/definitions/schema' } } },
        },
        {
          id: 'second',
          config: { response_format: { schema: sharedSchema() } },
        },
      ],
      tests: [{ vars: { ordinary: { $ref: '#/definitions/schema' } } }],
    } as unknown as UnifiedConfig)) as any;

    const providerConfig = result.providers[1].config;
    const ordinaryConfig = result.tests[0].vars.ordinary.properties.nested;
    expect(providerConfig.response_format.schema).toEqual(sharedSchema());
    expect(ordinaryConfig.response_format.schema.properties.status).toEqual({ const: 'CONFIG' });
    expect(providerConfig).not.toBe(ordinaryConfig);
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
    const ordinarySchema = { const: 'ORDINARY' };
    await writeFile(join(directory, 'ordinary-schema.json'), JSON.stringify(ordinarySchema));
    const schemaRef = { $ref: pathToFileURL(schemaPath).href };
    const uppercaseSchemaRef = { $ref: pathToFileURL(schemaPath).href.replace('file:', 'FILE:') };
    const localhostSchemaRef = {
      $ref: pathToFileURL(schemaPath).href.replace('file:///', 'file://localhost/'),
    };
    const relativeSchemaRef = { $ref: 'file://schema.json' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const result = (await dereferenceConfig(
        {
          definitions: {
            ordinary: { $ref: 'file://ordinary-schema.json' },
            schema: schemaRef,
          },
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
            {
              id: 'openai:chat:gpt-4o',
              config: { response_format: { schema: relativeSchemaRef } },
            },
            {
              id: 'openai:chat:gpt-4o',
              config: { response_format: { schema: localhostSchemaRef } },
            },
            {
              id: 'openai:chat:gpt-4o',
              config: { response_format: { schema: uppercaseSchemaRef } },
            },
            {
              id: 'openai:codex-sdk',
              config: { output_schema: { $ref: '#/definitions/ordinary' } },
            },
          ],
          tests: [{ vars: { ordinary: { $ref: '#/definitions/ordinary' } } }],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.providers[0].config.response_format.schema).toEqual(schema);
      expect(result.providers[1].config.output_schema).toEqual(schema);
      expect(result.providers[2].config.response_format.schema).toEqual(schema);
      expect(result.providers[3].config.response_format.schema).toEqual(schema);
      expect(result.providers[4].config.response_format.schema).toEqual(schema);
      expect(result.providers[5].config.output_schema).toEqual(ordinarySchema);
      expect(result.tests[0].vars.ordinary).toEqual(ordinarySchema);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('discovers schema owners introduced by nested external config refs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-owner-'));
    const rootPath = join(directory, 'root.json');
    const ownerPath = join(directory, 'owner.json');
    await writeFile(rootPath, JSON.stringify({ $ref: 'file://owner.json' }));
    await writeFile(
      ownerPath,
      JSON.stringify({
        $defs: { Status: { const: 'EXTERNAL' } },
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:codex-sdk',
            config: { output_schema: sharedSchema() },
          },
        ],
        tests: [{ vars: { status: { $ref: '#/$defs/Status' } } }],
      }),
    );

    try {
      const result = (await dereferenceConfig(
        { $ref: pathToFileURL(rootPath).href } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.providers[0].config.output_schema).toEqual(sharedSchema());
      expect(result.tests[0].vars.status).toEqual({ const: 'EXTERNAL' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('discovers schema owners introduced by remote config refs', async () => {
    const schema = {
      properties: {
        remote: { $ref: 'https://example.com/schema.json' },
        status: { $ref: '#/$defs/Status' },
      },
      type: 'object',
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://example.com/root.json') {
        return new Response(
          JSON.stringify({
            $defs: { Status: { const: 'REMOTE_CONFIG' } },
            prompts: ['hello'],
            providers: { $ref: './owners.json#/providers' },
            tests: [{ vars: { status: { $ref: '#/$defs/Status' } } }],
          }),
          { status: 200 },
        );
      }
      if (url === 'https://example.com/owners.json') {
        return new Response(
          JSON.stringify({
            providers: [{ id: 'openai:codex-sdk', config: { output_schema: schema } }],
          }),
          { status: 200 },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const result = (await dereferenceConfig({
      $ref: 'https://example.com/root.json',
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.output_schema).toEqual(schema);
    expect(result.tests[0].vars.status).toEqual({ const: 'REMOTE_CONFIG' });
    expect(
      fetchSpy.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith('https://example.com/')),
    ).toEqual(['https://example.com/root.json', 'https://example.com/owners.json']);
  });

  it('does not replay selected fragments through external document chains', async () => {
    const documentCount = 150;
    const baseUrl = 'https://example.com/selected-fragment-chain';
    const documents = new Map<string, unknown>();
    for (let index = 0; index < documentCount; index++) {
      documents.set(
        `${baseUrl}/document-${index}.json`,
        index === documentCount - 1
          ? {
              provider: {
                config: { response_format: { schema: { type: 'object' } } },
                id: 'last',
              },
            }
          : {
              provider: {
                $ref: `${baseUrl}/document-${index + 1}.json#/provider`,
              },
              ...(index === 0 ? { sibling: { $ref: `${baseUrl}/sibling.json#/value` } } : {}),
            },
      );
    }
    documents.set(`${baseUrl}/sibling.json`, { value: { loaded: true } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const document = documents.get(String(input));
      return document
        ? new Response(JSON.stringify(document), {
            headers: { 'content-type': 'application/json' },
          })
        : new Response('Not found', { status: 404 });
    });
    const ref = `${baseUrl}/document-0.json#/provider`;

    const result = (await dereferenceConfig({
      prompts: ['hello'],
      providers: [{ $ref: ref }],
      tests: [{ vars: { ordinary: { $ref: ref } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].id).toBe('last');
    expect(result.tests[0].vars.ordinary.id).toBe('last');
    expect(fetchSpy).toHaveBeenCalledTimes(documentCount + 1);
    expect(fetchSpy.mock.calls.map(([input]) => String(input))).toContain(
      `${baseUrl}/sibling.json`,
    );
  });

  it('does not replay joined-key fragments through external document chains', async () => {
    const documentCount = 150;
    const baseUrl = 'https://example.com/joined-fragment-chain';
    const selectedKey = 'provider/selected';
    const documents = new Map<string, unknown>();
    for (let index = 0; index < documentCount; index++) {
      documents.set(`${baseUrl}/document-${index}.json`, {
        [selectedKey]:
          index === documentCount - 1
            ? {
                config: { response_format: { schema: { type: 'object' } } },
                id: 'last',
              }
            : { $ref: `${baseUrl}/document-${index + 1}.json#/provider/selected` },
      });
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const document = documents.get(String(input));
      return document
        ? new Response(JSON.stringify(document), {
            headers: { 'content-type': 'application/json' },
          })
        : new Response('Not found', { status: 404 });
    });
    const ref = `${baseUrl}/document-0.json#/provider/selected`;

    const result = (await dereferenceConfig({
      prompts: ['hello'],
      providers: [{ $ref: ref }],
      tests: [{ vars: { ordinary: { $ref: ref } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].id).toBe('last');
    expect(result.tests[0].vars.ordinary.id).toBe('last');
    expect(fetchSpy).toHaveBeenCalledTimes(documentCount);
  });

  it('isolates synthetic mounts from pure root external ref chains', async () => {
    const baseUrl = 'https://example.com/pure-root-chain';
    const documents = new Map<string, unknown>([
      [`${baseUrl}/first.json`, { selected: { $ref: `${baseUrl}/second.json#/selected` } }],
      [`${baseUrl}/second.json`, { selected: { $ref: `${baseUrl}/third.json#/selected` } }],
      [`${baseUrl}/third.json`, { selected: { prompts: ['hello'], providers: ['echo'] } }],
    ]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const document = documents.get(String(input));
      return document
        ? new Response(JSON.stringify(document), {
            headers: { 'content-type': 'application/json' },
          })
        : new Response('Not found', { status: 404 });
    });

    const result = (await dereferenceConfig({
      $ref: `${baseUrl}/first.json#/selected`,
    } as unknown as UnifiedConfig)) as any;

    expect(result).toEqual({ prompts: ['hello'], providers: ['echo'] });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('keeps the ref parser safe-URL policy for remote config refs', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.end(JSON.stringify({ prompts: ['hello'], providers: ['echo'] }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      await expect(
        dereferenceConfig({
          $ref: `http://127.0.0.1:${port}/config.json`,
        } as unknown as UnifiedConfig),
      ).rejects.toThrow();
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('keeps opaque programmatic objects inert during external mount cleanup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-opaque-mount-cleanup-'));
    await writeFile(join(directory, 'data.json'), JSON.stringify({ value: 'ready' }));
    let ownRefReads = 0;
    let prototypeRefReads = 0;
    const inheritedProvider = Object.create({
      callApi: () => undefined,
      get $ref() {
        prototypeRefReads++;
        throw new Error('PROTOTYPE_REF_EXECUTED');
      },
    });
    const ownProvider = Object.create({ callApi: () => undefined });
    Object.defineProperty(ownProvider, '$ref', {
      enumerable: true,
      get() {
        ownRefReads++;
        throw new Error('OWN_REF_EXECUTED');
      },
    });

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: [inheritedProvider, ownProvider],
          tests: [{ vars: { data: { $ref: 'file://data.json' } } }],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.providers[0]).toBe(inheritedProvider);
      expect(result.providers[1]).toBe(ownProvider);
      expect(result.tests[0].vars.data).toEqual({ value: 'ready' });
      expect(ownRefReads).toBe(0);
      expect(prototypeRefReads).toBe(0);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('loads primitive and empty external config documents like the ref parser', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-primitive-config-refs-'));
    await writeFile(join(directory, 'string.json'), JSON.stringify('friendly'));
    await writeFile(join(directory, 'number.json'), JSON.stringify(0.25));
    await writeFile(join(directory, 'null.json'), 'null');
    await writeFile(join(directory, 'empty.json'), '');

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: ['echo'],
          tests: [
            {
              vars: {
                empty: { $ref: 'file://empty.json' },
                null: { $ref: 'file://null.json' },
                number: { $ref: 'file://number.json' },
                string: { $ref: 'file://string.json' },
              },
            },
          ],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.tests[0].vars).toEqual({
        empty: undefined,
        null: null,
        number: 0.25,
        string: 'friendly',
      });
      expect(result.tests[0].vars).toHaveProperty('empty');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('uses RefParser dispatch for text, binary, and unknown external files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-parser-dispatch-'));
    const text = '{"looks":"json"}';
    const malformed = '{"unterminated":';
    const binary = Buffer.from([0, 255, 1, 254]);
    await writeFile(join(directory, 'data.txt'), text);
    await writeFile(join(directory, 'empty.txt'), '');
    await writeFile(join(directory, 'data.png'), binary);
    await writeFile(join(directory, 'data.unknown'), malformed);

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: ['echo'],
          tests: [
            {
              vars: {
                binary: { $ref: 'file://data.png' },
                binaryIndex: { $ref: 'file://data.png#/0' },
                binaryLength: { $ref: 'file://data.png#/length' },
                emptyText: { $ref: 'file://empty.txt' },
                malformed: { $ref: 'file://data.unknown' },
                text: { $ref: 'file://data.txt' },
                textIndex: { $ref: 'file://data.txt#/0' },
                textLength: { $ref: 'file://data.txt#/length' },
              },
            },
          ],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.tests[0].vars).toEqual({
        binary,
        binaryIndex: 0,
        binaryLength: 4,
        emptyText: '',
        malformed,
        text,
        textIndex: '{',
        textLength: text.length,
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves reserved path encodings and trailing pointer whitespace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-ref-spelling-'));
    const encodedPath = join(directory, 'data%3F.json');
    const pointerPath = join(directory, 'pointer.json');
    await writeFile(encodedPath, JSON.stringify({ value: 'ENCODED' }));
    await writeFile(pointerPath, JSON.stringify({ key: 'NO_SPACE', 'key ': 'SPACE' }));
    const directoryUrl = pathToFileURL(directory).href;

    try {
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            vars: {
              encoded: { $ref: `${directoryUrl}/data%3F.json#/value` },
              spaced: { $ref: `${pathToFileURL(pointerPath).href}#/key ` },
            },
          },
        ],
      } as unknown as UnifiedConfig)) as any;

      expect(result.tests[0].vars).toEqual({ encoded: 'ENCODED', spaced: 'SPACE' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves external document scope and trailing relative-ref whitespace', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-scope-'));
    const nested = join(directory, 'nested');
    await mkdir(nested, { recursive: true });
    const scopedPath = join(directory, 'scoped.json');
    const dynamicPath = join(directory, 'dynamic.json');
    const spacedPath = join(directory, 'spaced.json');
    await writeFile(
      scopedPath,
      JSON.stringify({ $id: 'nested/base.json', selected: { $ref: './target.json' } }),
    );
    await writeFile(
      dynamicPath,
      JSON.stringify({
        $id: 'nested/base.json',
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        selected: { $ref: './dynamic-target.json' },
      }),
    );
    await writeFile(join(directory, 'target.json'), JSON.stringify({ value: 'WRONG_BASE' }));
    await writeFile(join(nested, 'target.json'), JSON.stringify({ value: 'SCOPED' }));
    await writeFile(join(nested, 'dynamic-target.json'), JSON.stringify({ value: 'DYNAMIC' }));
    await writeFile(spacedPath, JSON.stringify({ selected: { $ref: './data.json ' } }));
    await writeFile(join(directory, 'data.json'), JSON.stringify({ value: 'NO_SPACE' }));
    await writeFile(join(directory, 'data.json '), JSON.stringify({ value: 'SPACE' }));

    try {
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            vars: {
              scoped: { $ref: `${pathToFileURL(scopedPath).href}#/selected` },
              spaced: { $ref: `${pathToFileURL(spacedPath).href}#/selected` },
            },
          },
        ],
      } as unknown as UnifiedConfig)) as any;

      expect(result.tests[0].vars).toEqual({
        scoped: { value: 'WRONG_BASE' },
        spaced: { value: 'SPACE' },
      });
      const dynamic = (await dereferenceConfig({
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ vars: { dynamic: { $ref: `${pathToFileURL(dynamicPath).href}#/selected` } } }],
      } as unknown as UnifiedConfig)) as any;
      expect(dynamic.tests[0].vars.dynamic).toEqual({ value: 'DYNAMIC' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('resolves selected fragments under ancestor $id scopes independent of key order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-fragment-id-order-'));
    await mkdir(join(directory, 'nested'), { recursive: true });
    await writeFile(join(directory, 'nested', 'leaf.json'), JSON.stringify({ value: 'SCOPED' }));

    try {
      for (const aliasFirst of [true, false]) {
        const common = {
          resources: {
            scope: {
              $id: 'nested/base.json',
              target: { $ref: './leaf.json' },
            },
          },
          selected: { $ref: '#/resources/scope/target' },
        };
        const document = aliasFirst
          ? {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              selected: common.selected,
              resources: common.resources,
            }
          : {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              resources: common.resources,
              selected: common.selected,
            };
        const documentPath = join(directory, `document-${aliasFirst}.json`);
        await writeFile(documentPath, JSON.stringify(document));

        for (const fragment of ['#/resources/scope/target', '#/selected']) {
          const result = (await dereferenceConfig(
            {
              prompts: ['hello'],
              providers: ['echo'],
              tests: [
                {
                  vars: {
                    picked: { $ref: `${pathToFileURL(documentPath).href}${fragment}` },
                  },
                },
              ],
            } as unknown as UnifiedConfig,
            directory,
          )) as any;

          expect(result.tests[0].vars.picked).toEqual({ value: 'SCOPED' });
        }
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('uses an ancestor $id scope when resolving siblings of a selected root ref', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-root-sibling-id-'));
    await mkdir(join(directory, 'nested'), { recursive: true });
    const documentPath = join(directory, 'document.json');
    await writeFile(
      documentPath,
      JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        resources: {
          scope: {
            $id: 'nested/base.json',
            target: { $ref: './config.json' },
          },
        },
      }),
    );
    await writeFile(
      join(directory, 'nested', 'config.json'),
      JSON.stringify({
        metadata: { source: 'scoped' },
        prompts: ['hello'],
        providers: ['echo'],
      }),
    );
    const config = {
      $ref: `${pathToFileURL(documentPath).href}#/resources/scope/target`,
      alias: { $ref: '#/metadata' },
      note: 'keep',
    } as unknown as UnifiedConfig;

    try {
      const direct = await $RefParser.dereference(structuredClone(config));
      const result = await dereferenceConfig(config, directory);
      expect(result).toEqual(direct);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('keeps literal percent keys canonical while applying ancestor $id scope', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-percent-id-scope-'));
    await mkdir(join(directory, 'nested'), { recursive: true });
    const documentPath = join(directory, 'document.json');
    await writeFile(
      documentPath,
      JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        resources: {
          '%2F': {
            $id: 'nested/base.json',
            target: { $ref: './config.json' },
          },
        },
      }),
    );
    await writeFile(
      join(directory, 'nested', 'config.json'),
      JSON.stringify({
        metadata: { source: 'percent-scoped' },
        prompts: ['hello'],
        providers: ['echo'],
      }),
    );
    const config = {
      $ref: `${pathToFileURL(documentPath).href}#/resources/%25252F/target`,
      alias: { $ref: '#/metadata' },
      note: 'keep',
    } as unknown as UnifiedConfig;

    try {
      const direct = await $RefParser.dereference(structuredClone(config));
      const result = await dereferenceConfig(config, directory);
      expect(result).toEqual(direct);
      expect((result as any).alias).toEqual({ source: 'percent-scoped' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves percent-bearing external fragment keys through the synthetic mount', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-percent-fragments-'));
    const documentPath = join(directory, 'document.json');
    const values = {
      '%': { value: 'percent' },
      '%2F': { value: 'encoded-slash' },
      '#': { value: 'hash' },
      '/': { value: 'slash' },
      '?': { value: 'query' },
      ' ': { value: 'space' },
      'name%20literal': { value: 'literal-percent-sequence' },
      '~': { value: 'tilde' },
      é: { value: 'unicode' },
    };
    await writeFile(documentPath, JSON.stringify(values));
    const fragmentFor = (key: string) => {
      const pointerToken = key.replace(/~/g, '~0').replace(/\//g, '~1');
      return `#/${encodeURIComponent(encodeURIComponent(pointerToken))}`;
    };
    const documentUrl = pathToFileURL(documentPath).href;
    const config = {
      prompts: ['hello'],
      providers: ['echo'],
      tests: [
        {
          vars: Object.fromEntries(
            Object.keys(values).map((key) => [key, { $ref: `${documentUrl}${fragmentFor(key)}` }]),
          ),
        },
      ],
    } as unknown as UnifiedConfig;

    try {
      const direct = (await $RefParser.dereference(structuredClone(config))) as any;
      const result = (await dereferenceConfig(config, directory)) as any;
      expect(result.tests[0].vars).toEqual(direct.tests[0].vars);

      const remoteUrl = 'https://example.com/percent-fragments.json';
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify(values), { status: 200 }));
      const remote = (await dereferenceConfig({
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            vars: { picked: { $ref: `${remoteUrl}${fragmentFor('%2F')}` } },
          },
        ],
      } as unknown as UnifiedConfig)) as any;
      expect(remote.tests[0].vars.picked).toEqual(values['%2F']);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('does not inspect unrelated lone-surrogate keys while mounting an external config', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-surrogate-external-config-'));
    const documentPath = join(directory, 'document.json');
    const selected = {
      metadata: { '\ud800': { value: 'opaque-key' } },
      prompts: ['hello'],
      providers: ['echo'],
    };
    await writeFile(documentPath, JSON.stringify({ selected }));
    const config = {
      $ref: `${pathToFileURL(documentPath).href}#/selected`,
    } as unknown as UnifiedConfig;

    try {
      const direct = await $RefParser.dereference(structuredClone(config));
      const result = await dereferenceConfig(config, directory);
      expect(result).toEqual(direct);
      expect((result as any).metadata['\ud800']).toEqual({ value: 'opaque-key' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('restores unresolved external cycles before removing the synthetic mount', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-cycles-'));
    const selfUrl = pathToFileURL(join(directory, 'self.json')).href;
    const firstUrl = pathToFileURL(join(directory, 'first.json')).href;
    const secondUrl = pathToFileURL(join(directory, 'second.json')).href;
    await writeFile(join(directory, 'self.json'), JSON.stringify({ $ref: selfUrl }));
    await writeFile(join(directory, 'first.json'), JSON.stringify({ $ref: secondUrl }));
    await writeFile(join(directory, 'second.json'), JSON.stringify({ $ref: firstUrl }));

    try {
      const rootConfig = { $ref: firstUrl } as unknown as UnifiedConfig;
      const directRoot = await $RefParser.dereference(structuredClone(rootConfig));
      const root = await dereferenceConfig(rootConfig, directory);
      expect(root).toEqual(directRoot);

      const nestedConfig = {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ vars: { cycle: { $ref: selfUrl } } }],
      } as unknown as UnifiedConfig;
      const directNested = (await $RefParser.dereference(structuredClone(nestedConfig))) as any;
      const nested = (await dereferenceConfig(nestedConfig, directory)) as any;
      expect(nested.tests[0].vars.cycle).toEqual(directNested.tests[0].vars.cycle);

      const repeatedSelfConfig = {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ vars: { first: { $ref: selfUrl }, second: { $ref: selfUrl } } }],
      } as unknown as UnifiedConfig;
      await expect($RefParser.dereference(structuredClone(repeatedSelfConfig))).rejects.toThrow(
        'Missing $ref pointer "#/tests/0/vars/first"',
      );
      await expect(dereferenceConfig(repeatedSelfConfig, directory)).rejects.toThrow(
        'Missing $ref pointer "#/tests/0/vars/first"',
      );

      const extendedFirstConfig = {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            vars: {
              extended: { $ref: selfUrl, note: 'keep' },
              pure: { $ref: selfUrl },
            },
          },
        ],
      } as unknown as UnifiedConfig;
      const directExtendedFirst = (await $RefParser.dereference(
        structuredClone(extendedFirstConfig),
      )) as any;
      const extendedFirst = (await dereferenceConfig(extendedFirstConfig, directory)) as any;
      expect(extendedFirst).toEqual(directExtendedFirst);

      const pureFirstConfig = {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            vars: {
              pure: { $ref: selfUrl },
              extended: { $ref: selfUrl, note: 'keep' },
            },
          },
        ],
      } as unknown as UnifiedConfig;
      await expect($RefParser.dereference(structuredClone(pureFirstConfig))).rejects.toThrow(
        'Missing $ref pointer "#/tests/0/vars/pure"',
      );
      await expect(dereferenceConfig(pureFirstConfig, directory)).rejects.toThrow(
        'Missing $ref pointer "#/tests/0/vars/pure"',
      );

      const nestedCrossDocumentConfig = {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ vars: { cycle: { $ref: firstUrl } } }],
      } as unknown as UnifiedConfig;
      const directNestedCrossDocument = (await $RefParser.dereference(
        structuredClone(nestedCrossDocumentConfig),
      )) as any;
      const nestedCrossDocument = (await dereferenceConfig(
        nestedCrossDocumentConfig,
        directory,
      )) as any;
      expect(nestedCrossDocument.tests[0].vars.cycle).toEqual(
        directNestedCrossDocument.tests[0].vars.cycle,
      );
      expect(nestedCrossDocument.tests[0].vars.cycle.$ref).toBe(firstUrl);
      expect(JSON.stringify([root, nested, nestedCrossDocument])).not.toContain(
        '__promptfoo_external_refs_',
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('reuses the localized document when RefParser revisits a repeated remote cycle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-remote-cycle-cache-'));
    const secretPath = join(directory, 'secret.json');
    const selfUrl = 'https://example.com/promptfoo-repeated-self-cycle.json';
    await writeFile(secretPath, JSON.stringify({ compromised: true }));
    let fetches = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      fetches++;
      return new Response(
        JSON.stringify(
          fetches === 1 ? { $ref: selfUrl } : { $ref: pathToFileURL(secretPath).href },
        ),
        { headers: { 'content-type': 'application/json' } },
      );
    });

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: ['echo'],
          tests: [
            {
              vars: {
                extended: { $ref: selfUrl, note: 'keep' },
                pure: { $ref: selfUrl },
              },
            },
          ],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(result.tests[0].vars).toEqual({
        extended: { $ref: '#/tests/0/vars/extended', note: 'keep' },
        pure: { $ref: '#/tests/0/vars/pure' },
      });
      expect(JSON.stringify(result)).not.toContain('compromised');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('does not refetch replayed remote configs with encoded trailing spaces', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-remote-space-cache-'));
    const secretPath = join(directory, 'secret.json');
    const remoteUrl = 'https://example.com/promptfoo-space-cycle.json';
    const encodedUrl = `${remoteUrl}%20`;
    await writeFile(secretPath, JSON.stringify({ compromised: true }));
    const fetchUrls: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      fetchUrls.push(url);
      const document =
        url === remoteUrl
          ? {
              defs: { loop: { $ref: '#/defs/loop' } },
              selected: {
                prompts: ['hello'],
                providers: [
                  {
                    id: 'echo',
                    config: { response_format: { schema: { safe: true } } },
                  },
                ],
                tests: [{ vars: { cycle: { $ref: '#/defs/loop' } } }],
              },
            }
          : url === encodedUrl
            ? {
                selected: {
                  prompts: ['hello'],
                  providers: [
                    {
                      id: 'evil',
                      config: {
                        response_format: {
                          schema: { secret: { $ref: pathToFileURL(secretPath).href } },
                        },
                      },
                    },
                  ],
                },
              }
            : undefined;
      if (!document) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(JSON.stringify(document), {
        headers: { 'content-type': 'application/json' },
      });
    });

    try {
      const result = (await dereferenceConfig(
        { $ref: `${remoteUrl} #/selected` } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchUrls).toEqual([encodedUrl]);
      expect(result.providers[0].config.response_format.schema.secret).toEqual({
        $ref: pathToFileURL(secretPath).href,
      });
      expect(JSON.stringify(result)).not.toContain('compromised');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves RefParser behavior for indirect same-document external cycles', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-indirect-external-cycles-'));
    const aliasPath = join(directory, 'alias.json');
    const crossFirstPath = join(directory, 'cross-first.json');
    const crossSecondPath = join(directory, 'cross-second.json');
    const dynamicSiblingPath = join(directory, 'dynamic-sibling.json');
    const nestedExternalPath = join(directory, 'nested-external.json');
    const rootAliasPath = join(directory, 'root-alias.json');
    const schemaCyclePath = join(directory, 'schema-cycle.json');
    const secretPath = join(directory, 'secret.json');
    const aliasUrl = pathToFileURL(aliasPath).href;
    const crossFirstUrl = pathToFileURL(crossFirstPath).href;
    const crossSecondUrl = pathToFileURL(crossSecondPath).href;
    const dynamicSiblingUrl = pathToFileURL(dynamicSiblingPath).href;
    const nestedExternalUrl = pathToFileURL(nestedExternalPath).href;
    const rootAliasUrl = pathToFileURL(rootAliasPath).href;
    const schemaCycleUrl = pathToFileURL(schemaCyclePath).href;
    await writeFile(
      aliasPath,
      JSON.stringify({
        defs: {
          alias: { $ref: '#/defs/loop' },
          base: { child: { $ref: '#/defs/base' } },
          first: { $ref: '#/defs/second' },
          loop: { $ref: '#/defs/loop' },
          relativeAlias: { $ref: '#/defs/relativeLoop' },
          relativeLoop: { $ref: './alias.json#/defs/relativeLoop' },
          second: { $ref: '#/defs/first' },
        },
        metadata: { source: 'external' },
        selected: { child: { $ref: '#/defs/alias' } },
        structural: { $ref: '#/defs/base' },
      }),
    );
    await writeFile(
      rootAliasPath,
      JSON.stringify({ $ref: '#/defs/loop', defs: { loop: { $ref: '#/defs/loop' } } }),
    );
    await writeFile(
      crossFirstPath,
      JSON.stringify({ selected: { $ref: `${crossSecondUrl}#/selected` } }),
    );
    await writeFile(
      crossSecondPath,
      JSON.stringify({ selected: { $ref: `${crossFirstUrl}#/selected` } }),
    );
    await writeFile(nestedExternalPath, JSON.stringify({ value: 'EXTERNAL' }));
    await mkdir(join(directory, 'nested'), { recursive: true });
    await writeFile(
      dynamicSiblingPath,
      JSON.stringify({
        $id: 'nested/base.json',
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        selected: { $ref: './target.json' },
      }),
    );
    await writeFile(join(directory, 'nested', 'target.json'), JSON.stringify({ value: 'DYNAMIC' }));
    await writeFile(secretPath, JSON.stringify({ const: 'SHOULD_NOT_LOAD' }));
    await writeFile(
      schemaCyclePath,
      JSON.stringify({
        defs: {
          alias: {
            $ref: '#/defs/loop',
            prompts: ['hello'],
            providers: [
              {
                id: 'openai:chat:gpt-4o',
                config: {
                  response_format: {
                    schema: {
                      properties: {
                        secret: { $ref: pathToFileURL(secretPath).href },
                      },
                      type: 'object',
                    },
                  },
                },
              },
            ],
          },
          loop: { $ref: '#/defs/loop' },
        },
      }),
    );

    const expectNativeResult = async (config: UnifiedConfig) => {
      let direct: unknown;
      let directError: unknown;
      try {
        direct = await $RefParser.dereference(structuredClone(config));
      } catch (error) {
        directError = error;
      }
      if (directError instanceof Error) {
        await expect(dereferenceConfig(structuredClone(config), directory)).rejects.toThrow(
          directError.message,
        );
      } else {
        expect(await dereferenceConfig(structuredClone(config), directory)).toEqual(direct);
      }
    };

    try {
      for (const consumers of [
        { pure: { $ref: `${aliasUrl}#/defs/alias` } },
        {
          first: { $ref: `${aliasUrl}#/defs/alias` },
          second: { $ref: `${aliasUrl}#/defs/alias` },
        },
        {
          extended: { $ref: `${aliasUrl}#/defs/alias`, note: 'keep' },
          pure: { $ref: `${aliasUrl}#/defs/alias` },
        },
        {
          pure: { $ref: `${aliasUrl}#/defs/alias` },
          extended: { $ref: `${aliasUrl}#/defs/alias`, note: 'keep' },
        },
        {
          pure: { $ref: `${aliasUrl}#/defs/first` },
          extended: { $ref: `${aliasUrl}#/defs/first`, note: 'keep' },
        },
        {
          extended: { $ref: `${aliasUrl}#/defs/relativeAlias`, note: 'keep' },
          pure: { $ref: `${aliasUrl}#/defs/relativeAlias` },
        },
        {
          first: { $ref: `${aliasUrl}#/defs/relativeAlias`, note: 'first' },
          second: { $ref: `${aliasUrl}#/defs/relativeAlias`, note: 'second' },
        },
        {
          extended: { $ref: `${aliasUrl}#/selected`, note: 'keep' },
          pure: { $ref: `${aliasUrl}#/selected` },
        },
        {
          pure: { $ref: `${aliasUrl}#/selected` },
          extended: { $ref: `${aliasUrl}#/selected`, note: 'keep' },
        },
        {
          first: { $ref: `${aliasUrl}#/selected`, note: 'first' },
          second: { $ref: `${aliasUrl}#/selected`, note: 'second' },
        },
        {
          pure: { $ref: `${aliasUrl}#/structural` },
          extended: { $ref: `${aliasUrl}#/structural`, note: 'keep' },
        },
      ]) {
        await expectNativeResult({
          prompts: ['hello'],
          providers: ['echo'],
          tests: [{ vars: consumers }],
        } as unknown as UnifiedConfig);
      }
      await expectNativeResult({ $ref: `${aliasUrl}#/defs/alias` } as unknown as UnifiedConfig);
      await expectNativeResult({
        $ref: `${aliasUrl}#/defs/alias`,
        note: 'root',
      } as unknown as UnifiedConfig);
      await expectNativeResult({ $ref: rootAliasUrl } as unknown as UnifiedConfig);
      await expectNativeResult({ $ref: rootAliasUrl, note: 'root' } as unknown as UnifiedConfig);
      for (const consumers of [
        {
          pure: { $ref: `${crossFirstUrl}#/selected` },
          extended: { $ref: `${crossFirstUrl}#/selected`, note: 'keep' },
        },
        {
          extended: { $ref: `${crossFirstUrl}#/selected`, note: 'keep' },
          pure: { $ref: `${crossFirstUrl}#/selected` },
        },
      ]) {
        await expectNativeResult({
          prompts: ['hello'],
          providers: ['echo'],
          tests: [{ vars: consumers }],
        } as unknown as UnifiedConfig);
      }
      await expectNativeResult({
        $ref: '#/definitions/base',
        definitions: {
          base: {
            prompts: ['hello'],
            providers: ['echo'],
            tests: [{ vars: { external: { $ref: nestedExternalUrl } } }],
          },
        },
      } as unknown as UnifiedConfig);
      await expectNativeResult({
        $ref: `${aliasUrl}#/structural`,
        alias: { $ref: '#/metadata' },
        extra: { $ref: nestedExternalUrl },
      } as unknown as UnifiedConfig);
      const dynamicRoot = (await dereferenceConfig(
        {
          $ref: `${aliasUrl}#/structural`,
          extra: { $ref: `${dynamicSiblingUrl}#/selected` },
        } as unknown as UnifiedConfig,
        directory,
      )) as any;
      expect(dynamicRoot.extra).toEqual({ value: 'DYNAMIC' });
      const protectedCycle = (await dereferenceConfig(
        { $ref: `${schemaCycleUrl}#/defs/alias` } as unknown as UnifiedConfig,
        directory,
      )) as any;
      expect(protectedCycle.providers[0].config.response_format.schema).toEqual({
        properties: { secret: { $ref: pathToFileURL(secretPath).href } },
        type: 'object',
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves YAML aliases when replaying cyclic external configs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-cycle-yaml-alias-'));
    const documentPath = join(directory, 'document.yaml');
    const documentUrl = pathToFileURL(documentPath).href;
    await writeFile(
      documentPath,
      [
        'defs:',
        '  loop:',
        '    $ref: "#/defs/loop"',
        'selected:',
        '  left: &shared',
        '    child:',
        '      $ref: "#/defs/loop"',
        '  right: *shared',
      ].join('\n'),
    );
    const config = {
      prompts: ['hello'],
      providers: ['echo'],
      tests: [
        {
          vars: {
            extended: { $ref: `${documentUrl}#/selected`, note: 'keep' },
            pure: { $ref: `${documentUrl}#/selected` },
          },
        },
      ],
    } as unknown as UnifiedConfig;

    try {
      const direct = (await $RefParser.dereference(structuredClone(config))) as any;
      const result = (await dereferenceConfig(config, directory)) as any;
      expect(result).toEqual(direct);
      expect(result.tests[0].vars.pure.left).toBe(result.tests[0].vars.pure.right);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves alias identity in acyclic external YAML configs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-yaml-alias-'));
    const documentPath = join(directory, 'document.yaml');
    await writeFile(
      documentPath,
      ['target: &shared', '  nested: { value: 1 }', 'left: *shared', 'right: *shared'].join('\n'),
    );
    const config = {
      prompts: ['hello'],
      providers: ['echo'],
      tests: [{ vars: { all: { $ref: pathToFileURL(documentPath).href } } }],
    } as unknown as UnifiedConfig;

    try {
      const direct = (await $RefParser.dereference(structuredClone(config))) as any;
      const result = (await dereferenceConfig(config, directory)) as any;
      expect(result).toEqual(direct);
      expect(result.tests[0].vars.all.left).toBe(result.tests[0].vars.all.right);
      expect(result.tests[0].vars.all.left).toBe(result.tests[0].vars.all.target);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('copy-on-writes protected aliases while preserving ordinary aliases during replay', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-masked-yaml-alias-'));
    const documentPath = join(directory, 'document.yaml');
    await writeFile(
      documentPath,
      [
        '$defs:',
        '  Status: { const: CONFIG }',
        'defs:',
        '  loop:',
        '    $ref: "#/defs/loop"',
        'leaf: &leaf',
        '  type: string',
        'wrapper: &wrapper',
        '  schema:',
        '    type: object',
        '    shared: *leaf',
        '    properties:',
        '      left: *leaf',
        '      right: *leaf',
        '      status:',
        '        $ref: "#/$defs/Status"',
        'selected:',
        '  prompts: [hello]',
        '  providers:',
        '    - id: echo',
        '      config:',
        '        response_format: *wrapper',
        '    - id: echo',
        '      config:',
        '        response_format: *wrapper',
        '  tests:',
        '    - vars:',
        '        ordinary: *wrapper',
        '        left: *wrapper',
        '        right: *wrapper',
        '        cycle:',
        '          $ref: "#/defs/loop"',
      ].join('\n'),
    );

    try {
      const result = (await dereferenceConfig(
        { $ref: `${pathToFileURL(documentPath).href}#/selected` } as unknown as UnifiedConfig,
        directory,
      )) as any;
      const providerFormat = result.providers[0].config.response_format;
      const secondProviderFormat = result.providers[1].config.response_format;
      const { left, ordinary, right } = result.tests[0].vars;

      expect(providerFormat.schema.properties.status).toEqual({ $ref: '#/$defs/Status' });
      expect(providerFormat).toBe(secondProviderFormat);
      expect(providerFormat.schema.shared).toBe(providerFormat.schema.properties.left);
      expect(providerFormat.schema.shared).toBe(providerFormat.schema.properties.right);
      expect(ordinary.schema.properties.status).toEqual({ const: 'CONFIG' });
      expect(providerFormat).not.toBe(ordinary);
      expect(ordinary).toBe(left);
      expect(ordinary).toBe(right);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves aliases inside file-loaded provider schemas', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-schema-yaml-alias-'));
    const schemaPath = join(directory, 'schema.yaml');
    await writeFile(
      schemaPath,
      [
        'type: object',
        'shared: &shared',
        '  type: string',
        'properties:',
        '  left: *shared',
        '  right: *shared',
      ].join('\n'),
    );

    try {
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: {
              response_format: { schema: { $ref: pathToFileURL(schemaPath).href } },
            },
          },
        ],
      } as unknown as UnifiedConfig)) as any;
      const schema = result.providers[0].config.response_format.schema;
      expect(schema.properties.left).toBe(schema.properties.right);
      expect(schema.properties.left).toBe(schema.shared);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves native sibling scope for fragment-selected external root refs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-root-ref-siblings-'));
    const paths = Array.from({ length: 3 }, (_, index) => join(directory, `${index}.json`));
    const urls = paths.map((path) => pathToFileURL(path).href);
    await writeFile(
      paths[0],
      JSON.stringify({
        metadata: { source: 'external' },
        selected: { $ref: `${urls[1]}#/selected` },
      }),
    );
    await writeFile(
      paths[1],
      JSON.stringify({
        metadata: { source: 'intermediate' },
        selected: {
          $ref: `${urls[2]}#/selected`,
          innerAlias: { $ref: '#/metadata' },
          innerNote: 'inner',
        },
      }),
    );
    await writeFile(
      paths[2],
      JSON.stringify({
        metadata: { source: 'deep' },
        selected: { prompts: ['hello'], providers: ['echo'] },
      }),
    );

    try {
      const chainConfig = {
        $ref: `${urls[0]}#/selected`,
        alias: { $ref: '#/metadata' },
        note: 'keep',
      } as unknown as UnifiedConfig;
      const directChain = (await $RefParser.dereference(structuredClone(chainConfig))) as any;
      const chain = (await dereferenceConfig(chainConfig, directory)) as any;
      expect(chain).toEqual(directChain);
      expect(chain.alias).toEqual({ source: 'intermediate' });
      expect(chain.innerAlias).toEqual({ source: 'intermediate' });
      expect(chain.innerNote).toBe('inner');
      expect(chain.note).toBe('keep');

      const scopePath = join(directory, 'scope.json');
      const scopeUrl = pathToFileURL(scopePath).href;
      await writeFile(
        scopePath,
        JSON.stringify({
          metadata: { source: 'external' },
          prompts: ['hello'],
          providers: ['echo'],
        }),
      );
      const scopeConfig = {
        $ref: scopeUrl,
        alias: { $ref: '#/metadata' },
        metadata: { source: 'main' },
        rootAlias: { $ref: '#' },
      } as unknown as UnifiedConfig;
      const directScope = (await $RefParser.dereference(structuredClone(scopeConfig))) as any;
      const scope = (await dereferenceConfig(scopeConfig, directory)) as any;
      expect(scope).toEqual(directScope);
      expect(scope.alias).toEqual({ source: 'external' });

      const missingPath = join(directory, 'missing-metadata.json');
      const missingUrl = pathToFileURL(missingPath).href;
      await writeFile(
        missingPath,
        JSON.stringify({ selected: { prompts: ['hello'], providers: ['echo'] } }),
      );
      const missingExternalMetadata = {
        $ref: `${missingUrl}#/selected`,
        alias: { $ref: '#/metadata' },
        metadata: { source: 'main' },
      } as unknown as UnifiedConfig;
      await expect(
        $RefParser.dereference(structuredClone(missingExternalMetadata)),
      ).rejects.toThrow('#/metadata');
      await expect(dereferenceConfig(missingExternalMetadata, directory)).rejects.toThrow(
        '#/metadata',
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves inherited scope across consecutive extended external refs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-consecutive-ref-siblings-'));
    const paths = ['a.json', 'b.json', 'c.json'].map((name) => join(directory, name));
    const urls = paths.map((path) => pathToFileURL(path).href);
    await writeFile(
      paths[0],
      JSON.stringify({
        metadata: { source: 'A' },
        selected: {
          $ref: `${urls[1]}#/selected`,
          a: 1,
          aAlias: { $ref: '#/metadata' },
        },
      }),
    );
    await writeFile(
      paths[1],
      JSON.stringify({
        metadata: { source: 'B' },
        selected: {
          $ref: `${urls[2]}#/selected`,
          b: 1,
          bAlias: { $ref: '#/metadata' },
        },
      }),
    );
    await writeFile(
      paths[2],
      JSON.stringify({
        metadata: { source: 'C' },
        selected: { prompts: ['hello'], providers: ['echo'] },
      }),
    );
    const config = { $ref: `${urls[0]}#/selected` } as unknown as UnifiedConfig;

    try {
      const direct = (await $RefParser.dereference(structuredClone(config))) as any;
      const result = (await dereferenceConfig(config, directory)) as any;
      expect(result).toEqual(direct);
      expect(result.aAlias).toEqual({ source: 'A' });
      expect(result.bAlias).toEqual({ source: 'A' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves inherited scope across a local extended bridge to external refs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-local-extended-bridge-'));
    const paths = ['a.json', 'b.json', 'c.json'].map((name) => join(directory, name));
    const urls = paths.map((path) => pathToFileURL(path).href);
    await writeFile(
      paths[0],
      JSON.stringify({
        bridge: { $ref: `${urls[1]}#/selected` },
        metadata: { source: 'A' },
        selected: {
          $ref: '#/bridge',
          aAlias: { $ref: '#/metadata' },
        },
      }),
    );
    await writeFile(
      paths[1],
      JSON.stringify({
        metadata: { source: 'B' },
        selected: {
          $ref: `${urls[2]}#/selected`,
          bAlias: { $ref: '#/metadata' },
        },
      }),
    );
    await writeFile(
      paths[2],
      JSON.stringify({ selected: { prompts: ['hello'], providers: ['echo'] } }),
    );
    const config = { $ref: `${urls[0]}#/selected` } as unknown as UnifiedConfig;

    try {
      const direct = (await $RefParser.dereference(structuredClone(config))) as any;
      const result = (await dereferenceConfig(config, directory)) as any;
      expect(result).toEqual(direct);
      expect(result.aAlias).toEqual({ source: 'A' });
      expect(result.bAlias).toEqual({ source: 'A' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('isolates a shared external target for each inherited document scope', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-shared-inherited-scopes-'));
    const paths = Object.fromEntries(
      ['a', 'b', 'common', 'leaf'].map((name) => [name, join(directory, `${name}.json`)]),
    );
    const urls = Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [name, pathToFileURL(path).href]),
    );
    await writeFile(
      paths.common,
      JSON.stringify({
        metadata: { source: 'COMMON' },
        selected: {
          $ref: `${urls.leaf}#/selected`,
          nested: { alias: { $ref: '#/metadata' } },
          sharedAlias: { $ref: '#/metadata' },
        },
      }),
    );
    await writeFile(
      paths.leaf,
      JSON.stringify({ selected: { prompts: ['hello'], providers: ['echo'] } }),
    );
    for (const name of ['a', 'b']) {
      await writeFile(
        paths[name],
        JSON.stringify({
          metadata: { source: name.toUpperCase() },
          selected: {
            $ref: `${urls.common}#/selected`,
            ownAlias: { $ref: '#/metadata' },
          },
        }),
      );
    }

    try {
      for (const order of [
        ['a', 'b'],
        ['b', 'a'],
      ]) {
        const vars = Object.fromEntries(
          order.map((name) => [name, { $ref: `${urls[name]}#/selected` }]),
        );
        const config = {
          prompts: ['hello'],
          providers: ['echo'],
          tests: [{ vars }],
        } as unknown as UnifiedConfig;
        const direct = (await $RefParser.dereference(structuredClone(config))) as any;
        const result = (await dereferenceConfig(config, directory)) as any;

        expect(result).toEqual(direct);
        expect(result.tests[0].vars.a.ownAlias).toEqual({ source: 'A' });
        expect(result.tests[0].vars.a.sharedAlias).toEqual({ source: 'A' });
        expect(result.tests[0].vars.b.ownAlias).toEqual({ source: 'B' });
        expect(result.tests[0].vars.b.sharedAlias).toEqual({ source: 'B' });
        expect(result.tests[0].vars.a.nested.alias).toEqual({
          source: order[0].toUpperCase(),
        });
        expect(result.tests[0].vars.b.nested.alias).toEqual({
          source: order[0].toUpperCase(),
        });
      }

      const mixedConfig = {
        prompts: ['hello'],
        providers: ['echo'],
        tests: [
          {
            vars: {
              overlay: { $ref: `${urls.a}#/selected` },
              pure: { $ref: `${urls.common}#/selected` },
            },
          },
        ],
      } as unknown as UnifiedConfig;
      const directMixed = (await $RefParser.dereference(structuredClone(mixedConfig))) as any;
      const mixed = (await dereferenceConfig(mixedConfig, directory)) as any;
      expect(mixed).toEqual(directMixed);
      expect(mixed.tests[0].vars.overlay.sharedAlias).toEqual({ source: 'A' });
      expect(mixed.tests[0].vars.pure.sharedAlias).toEqual({ source: 'COMMON' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('scans a shared external ref chain once across sibling-bearing consumers', async () => {
    const chainLength = 200;
    const consumerCount = 200;
    const urls = Array.from(
      { length: chainLength },
      (_, index) => `https://example.com/shared-chain/${index}.json`,
    );
    const documents = new Map(
      urls.map((url, index) => [
        url,
        index === chainLength - 1
          ? { value: { leaf: true } }
          : { value: { $ref: `${urls[index + 1]}#/value` } },
      ]),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const document = documents.get(String(input));
      return document
        ? new Response(JSON.stringify(document), { status: 200 })
        : new Response('Not found', { status: 404 });
    });
    const consumers = Object.fromEntries(
      Array.from({ length: consumerCount }, (_, index) => [
        `consumer${index}`,
        { $ref: `${urls[0]}#/value`, note: index },
      ]),
    );

    const result = (await dereferenceConfig({
      prompts: ['hello'],
      providers: ['echo'],
      tests: [{ vars: consumers }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars.consumer0).toEqual({ leaf: true, note: 0 });
    expect(result.tests[0].vars.consumer199).toEqual({ leaf: true, note: 199 });
    expect(fetchSpy).toHaveBeenCalledTimes(chainLength);
  }, 5_000);

  it('does not apply the ref-path budget to ordinary external tree nodes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-large-ordinary-tree-'));
    const documentPath = join(directory, 'document.json');
    const itemCount = 50_010;
    await writeFile(
      documentPath,
      JSON.stringify({
        selected: { items: Array.from({ length: itemCount }, (_, index) => ({ index })) },
      }),
    );

    try {
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ vars: { selected: { $ref: `${pathToFileURL(documentPath).href}#/selected` } } }],
      } as unknown as UnifiedConfig)) as any;
      expect(result.tests[0].vars.selected.items).toHaveLength(itemCount);
      expect(result.tests[0].vars.selected.items.at(-1)).toEqual({ index: itemCount - 1 });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }, 10_000);

  it('resolves whitespace-only and query-only refs from the containing directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-relative-ref-root-'));
    await writeFile(join(directory, ' '), JSON.stringify({ value: 'SPACE' }));
    await writeFile(join(directory, '?v=1'), JSON.stringify({ value: 'QUERY' }));

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: ['echo'],
          tests: [{ vars: { query: { $ref: '?v=1' }, space: { $ref: ' ' } } }],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.tests[0].vars).toEqual({
        query: { value: 'QUERY' },
        space: { value: 'SPACE' },
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('keeps ordinary external fragment traversal compatible with RefParser', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-fragment-sibling-'));
    const documentPath = join(directory, 'document.json');
    await writeFile(
      documentPath,
      JSON.stringify({
        selected: { value: 'ready' },
        unrelated: { $ref: './missing.json' },
      }),
    );

    try {
      await expect(
        dereferenceConfig({
          prompts: ['hello'],
          providers: ['echo'],
          tests: [
            { vars: { selected: { $ref: `${pathToFileURL(documentPath).href}#/selected` } } },
          ],
        } as unknown as UnifiedConfig),
      ).rejects.toMatchObject({ code: 'ERESOLVER', ioErrorCode: 'ENOENT' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('checks unrelated refs in nested external fragments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-nested-fragment-sibling-'));
    const outerPath = join(directory, 'outer.json');
    await writeFile(outerPath, JSON.stringify({ selected: { $ref: './inner.json#/selected' } }));
    await writeFile(
      join(directory, 'inner.json'),
      JSON.stringify({
        selected: { value: 'ready' },
        unrelated: { $ref: './missing.json' },
      }),
    );

    try {
      await expect(
        dereferenceConfig({
          prompts: ['hello'],
          providers: ['echo'],
          tests: [{ vars: { selected: { $ref: `${pathToFileURL(outerPath).href}#/selected` } } }],
        } as unknown as UnifiedConfig),
      ).rejects.toMatchObject({ code: 'ERESOLVER', ioErrorCode: 'ENOENT' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('reports the ordinary consumer path for missing external pointers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-missing-pointer-'));
    const documentPath = join(directory, 'document.json');
    await writeFile(documentPath, JSON.stringify({ one: {} }));

    try {
      await expect(
        dereferenceConfig({
          prompts: ['hello'],
          providers: ['echo'],
          tests: [
            {
              vars: {
                picked: { $ref: `${pathToFileURL(documentPath).href}#/one/missing` },
              },
            },
          ],
        } as unknown as UnifiedConfig),
      ).rejects.toMatchObject({
        parentPath: resolve('#/tests/0/vars/picked'),
        targetFound: '#/one',
        targetRef: '#/one/missing',
        targetToken: 'missing',
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('reports the containing external pointer for nested missing refs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-nested-pointer-path-'));
    const outerPath = join(directory, 'outer.json');
    await writeFile(outerPath, JSON.stringify({ selected: { $ref: './child.json#/one/missing' } }));
    await writeFile(join(directory, 'child.json'), JSON.stringify({ one: {} }));

    try {
      await expect(
        dereferenceConfig({
          prompts: ['hello'],
          providers: ['echo'],
          tests: [{ vars: { picked: { $ref: `${pathToFileURL(outerPath).href}#/selected` } } }],
        } as unknown as UnifiedConfig),
      ).rejects.toMatchObject({
        parentPath: `${pathToFileURL(outerPath).href}#/selected`,
        targetToken: 'missing',
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('keeps RefParser null-intermediate fragment failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-null-pointer-'));
    const documentPath = join(directory, 'document.json');
    await writeFile(documentPath, JSON.stringify({ value: null }));

    try {
      await expect(
        dereferenceConfig({
          prompts: ['hello'],
          providers: ['echo'],
          tests: [
            { vars: { picked: { $ref: `${pathToFileURL(documentPath).href}#/value/missing` } } },
          ],
        } as unknown as UnifiedConfig),
      ).rejects.toThrow("Cannot read properties of null (reading 'missing')");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('shares one external ref target across JSONL rows', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-jsonl-external-identity-'));
    await writeFile(join(directory, 'data.json'), JSON.stringify({ value: { ready: true } }));
    const rows = [
      { vars: { picked: { $ref: 'file://data.json#/value' } } },
      { vars: { picked: { $ref: 'file://data.json#/value' } } },
    ];

    try {
      const result = (await dereferenceWithStandaloneSchemas(rows, 'tests', {
        jsonlRowRoots: true,
        schemaFileBasePath: directory,
      })) as any[];

      expect(result[0].vars.picked).toEqual({ ready: true });
      expect(result[1].vars.picked).toBe(result[0].vars.picked);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('resolves top-level and nested relative refs from their containing files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-containing-config-'));
    const configPath = join(directory, 'promptfooconfig.json');
    await writeFile(
      configPath,
      JSON.stringify({
        prompts: ['hello'],
        providers: { $ref: './owners%20file.json#/providers' },
      }),
    );
    await writeFile(
      join(directory, 'owners file.json'),
      JSON.stringify({
        providers: { $ref: './nested%20owners.json#/providers' },
      }),
    );
    await writeFile(
      join(directory, 'nested owners.json'),
      JSON.stringify({
        providers: [{ id: 'openai:codex-sdk', config: { output_schema: sharedSchema() } }],
      }),
    );

    try {
      const result = (await readConfig(configPath)) as any;
      expect(result.providers[0].config.output_schema).toEqual(sharedSchema());
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves query suffixes when loading file URL refs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-file-query-'));
    const plainPath = join(directory, 'owners.json');
    const queryPath = `${plainPath}?v=1`;
    await writeFile(plainPath, JSON.stringify({ providers: [{ id: 'WRONG_NO_QUERY' }] }));
    await writeFile(queryPath, JSON.stringify({ providers: [{ id: 'RIGHT_QUERY_FILE' }] }));

    try {
      const absolute = (await dereferenceConfig({
        prompts: ['hello'],
        providers: { $ref: `${pathToFileURL(plainPath).href}?v=1#/providers` },
      } as unknown as UnifiedConfig)) as any;
      const relative = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: { $ref: 'file://owners.json?v=1#/providers' },
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(absolute.providers[0].id).toBe('RIGHT_QUERY_FILE');
      expect(relative.providers[0].id).toBe('RIGHT_QUERY_FILE');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('removes only the synthetic external mount from root views', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-mount-'));
    await writeFile(
      join(directory, 'external.json'),
      JSON.stringify({
        __promptfoo_external_refs__: { user: 'KEEP' },
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ vars: { merged: { $ref: '#', note: 'copy' } } }],
      }),
    );

    try {
      const result = (await dereferenceConfig(
        { $ref: 'file://external.json' } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.__promptfoo_external_refs__).toEqual({ user: 'KEEP' });
      expect(result.tests[0].vars.merged.__promptfoo_external_refs__).toEqual({ user: 'KEEP' });
      expect(
        Object.keys(result.tests[0].vars.merged).filter((key) =>
          /^__promptfoo_external_refs_[0-9a-f-]{36}$/.test(key),
        ),
      ).toEqual([]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('removes the synthetic mount from roots with an own __proto__ key', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-prototype-mount-'));
    const external = Object.assign(Object.create(null), {
      prompts: ['hello'],
      providers: ['echo'],
      tests: [{ vars: { secret: { $ref: 'file://secret.json' } } }],
    });
    external.__proto__ = { marker: 'ATTACKER_PROTO' };
    await writeFile(join(directory, 'root.json'), JSON.stringify(external));
    await writeFile(join(directory, 'secret.json'), JSON.stringify({ marker: 'EXPECTED' }));

    try {
      const result = (await dereferenceConfig(
        { $ref: 'file://root.json' } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.tests[0].vars.secret).toEqual({ marker: 'EXPECTED' });
      expect(
        Object.keys(result).filter((key) => key.startsWith('__promptfoo_external_refs_')),
      ).toEqual([]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('discovers schema owners introduced by non-root external config refs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-owner-fragment-'));
    const ownerPath = join(directory, 'owners.json');
    const schema = {
      $defs: {
        Local: { const: 'LOCAL' },
        Node: { properties: { child: { $ref: '#/$defs/Node' } }, type: 'object' },
      },
      properties: {
        cycle: { $ref: '#/$defs/Node' },
        local: { $ref: '#/$defs/Local' },
        malformed: { $ref: '#/%ZZ' },
        missing: { $ref: 'file://missing-schema.json' },
        relative: { $ref: './missing-schema.json' },
        remote: { $ref: 'https://example.com/missing-schema.json' },
      },
      type: 'object',
    };
    await writeFile(
      ownerPath,
      JSON.stringify({
        $defs: { Status: { const: 'EXTERNAL' } },
        providers: [{ id: 'openai:codex-sdk', config: { output_schema: schema } }],
        tests: [{ vars: { status: { $ref: '#/$defs/Status' } } }],
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: { $ref: 'file://owners.json#/providers' },
          tests: { $ref: 'file://owners.json#/tests' },
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.providers[0].config.output_schema).toEqual(schema);
      expect(result.tests[0].vars.status).toEqual({ const: 'EXTERNAL' });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves assertion schemas introduced by external config refs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-assertions-'));
    const assertionSchema = {
      properties: {
        missing: { $ref: 'file://missing-assertion-schema.json' },
        remote: { $ref: 'https://example.com/missing-assertion-schema.json' },
        value: { $ref: '#/$defs/Value' },
      },
      type: 'object',
    };
    await writeFile(
      join(directory, 'assertions.json'),
      JSON.stringify([{ type: 'is-json', value: assertionSchema }]),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: ['echo'],
          tests: [{ assert: { $ref: 'file://assertions.json' } }],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.tests[0].assert[0].value).toEqual(assertionSchema);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('resolves chained external owner refs from each containing file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-owner-relative-'));
    const outer = join(directory, 'outer');
    const nested = join(outer, 'nested');
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(outer, 'root.json'),
      JSON.stringify({ providers: { $ref: './nested/owners.json#/providers' } }),
    );
    await writeFile(
      join(nested, 'owners.json'),
      JSON.stringify({
        providers: [
          {
            id: 'openai:codex-sdk',
            config: { output_schema: sharedSchema() },
          },
        ],
      }),
    );

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: { $ref: 'file://outer/root.json#/providers' },
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.providers[0].config.output_schema).toEqual(sharedSchema());
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('keeps external config I/O disabled and reports missing owner files when enabled', async () => {
    const config = {
      prompts: ['hello'],
      providers: { $ref: 'file:///definitely/missing/pr-5256-owner.json' },
    } as unknown as UnifiedConfig;

    await expect(
      dereferenceWithStandaloneSchemas(config, 'config', { disabled: true }),
    ).resolves.toBe(config);
    await expect(dereferenceConfig(config)).rejects.toMatchObject({
      code: 'ERESOLVER',
      ioErrorCode: 'ENOENT',
    });
  });

  it('separates provider and ordinary consumers of one external config target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-owner-shared-'));
    await writeFile(
      join(directory, 'owners.json'),
      JSON.stringify({
        definitions: {
          Status: { const: 'EXTERNAL' },
          provider: {
            id: 'openai:codex-sdk',
            config: {
              output_schema: {
                properties: { status: { $ref: '#/definitions/Status' } },
                type: 'object',
              },
            },
          },
        },
      }),
    );

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: [{ $ref: 'file://owners.json#/definitions/provider' }],
          tests: [
            {
              vars: {
                provider: { $ref: 'file://owners.json#/definitions/provider' },
              },
            },
          ],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.providers[0].config.output_schema.properties.status).toEqual({
        $ref: '#/definitions/Status',
      });
      expect(result.tests[0].vars.provider.config.output_schema.properties.status).toEqual({
        const: 'EXTERNAL',
      });
      expect(result.providers[0]).not.toBe(result.tests[0].vars.provider);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves cycles across external config documents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-owner-cycle-'));
    await writeFile(
      join(directory, 'a.json'),
      JSON.stringify({
        definitions: {
          Status: { const: 'EXTERNAL' },
          provider: {
            id: 'openai:codex-sdk',
            config: {
              output_schema: {
                properties: { status: { $ref: '#/definitions/Status' } },
                type: 'object',
              },
            },
            peer: { $ref: 'file://b.json#/provider' },
          },
        },
      }),
    );
    await writeFile(
      join(directory, 'b.json'),
      JSON.stringify({
        provider: {
          id: 'peer',
          peer: { $ref: 'file://a.json#/definitions/provider' },
        },
      }),
    );

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: [{ $ref: 'file://a.json#/definitions/provider' }],
          tests: [
            {
              vars: {
                provider: { $ref: 'file://a.json#/definitions/provider' },
              },
            },
          ],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.tests[0].vars.provider.peer.peer).toBe(result.tests[0].vars.provider);
      expect(result.providers[0].peer.peer).toBe(result.tests[0].vars.provider);
      expect(result.providers[0].config.output_schema.properties.status).toEqual({
        $ref: '#/definitions/Status',
      });
      expect(result.tests[0].vars.provider.config.output_schema.properties.status).toEqual({
        const: 'EXTERNAL',
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('localizes ordinary external schema dependencies to a fixed point', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-owner-fixed-point-'));
    const aDirectory = join(directory, 'a');
    const bDirectory = join(directory, 'b');
    await mkdir(aDirectory, { recursive: true });
    await mkdir(bDirectory, { recursive: true });
    await writeFile(
      join(aDirectory, 'owner.json'),
      JSON.stringify({
        provider: {
          id: 'a',
          config: {
            output_schema: {
              properties: {
                nested: { $ref: 'file://../b/owner.json#/provider/config/output_schema' },
              },
              type: 'object',
            },
          },
        },
      }),
    );
    await writeFile(
      join(bDirectory, 'owner.json'),
      JSON.stringify({
        provider: {
          id: 'b',
          config: {
            output_schema: {
              properties: { leaf: { $ref: 'file://c.json#/Leaf' } },
              type: 'object',
            },
          },
        },
      }),
    );
    await writeFile(join(bDirectory, 'c.json'), JSON.stringify({ Leaf: { const: 'RIGHT' } }));
    await writeFile(join(directory, 'c.json'), JSON.stringify({ Leaf: { const: 'WRONG' } }));

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: [
            { $ref: 'file://a/owner.json#/provider' },
            { $ref: 'file://b/owner.json#/provider' },
          ],
          tests: [{ vars: { ordinary: { $ref: 'file://a/owner.json#/provider' } } }],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(
        result.tests[0].vars.ordinary.config.output_schema.properties.nested.properties.leaf,
      ).toEqual({ const: 'RIGHT' });
      expect(result.providers[0].config.output_schema.properties.nested).toEqual({
        $ref: 'file://../b/owner.json#/provider/config/output_schema',
      });
      expect(result.providers[1].config.output_schema.properties.leaf).toEqual({
        $ref: 'file://c.json#/Leaf',
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('resolves schema-root file refs from the config directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-relative-schema-root-'));
    const configPath = join(directory, 'promptfooconfig.json');
    const schema = { properties: { value: { $ref: '#/$defs/Value' } }, type: 'object' };
    await writeFile(join(directory, 'schema.json'), JSON.stringify(schema));
    await writeFile(
      configPath,
      JSON.stringify({
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: { response_format: { schema: { $ref: 'file://schema.json' } } },
          },
        ],
      }),
    );

    try {
      const result = (await readConfig(configPath)) as any;
      expect(result.providers[0].config.response_format.schema).toEqual(schema);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('selects raw file pointers without traversing refs elsewhere in the document', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-schema-anchor-'));
    const schemaPath = join(directory, 'schema.json');
    const selected = {
      $anchor: 'selected',
      properties: { remote: { $ref: 'https://example.com/must-not-fetch.json' } },
      type: 'object',
    };
    await writeFile(
      schemaPath,
      JSON.stringify({
        defs: { '': { const: 'EMPTY' }, '#': { const: 'HASH' } },
        $defs: {
          '%2F': { const: 'PERCENT' },
          '/': { const: 'SLASH' },
          Selected: selected,
          embedded: { $anchor: 'selected', $id: 'other.json', const: 'EMBEDDED' },
          pointerTrap: { $anchor: '/$defs/missing', const: 'WRONG' },
        },
        examples: [{ $anchor: 'selected', const: 'ANNOTATION' }],
        devDependencies: { '@types/node': { const: 'ENCODED_TOKEN' } },
        unrelated: { $ref: './must-not-read.json' },
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: {
              response_format: {
                schema: { $ref: `${pathToFileURL(schemaPath).href}#%2F$defs%2FSelected` },
              },
            },
          },
          {
            id: 'openai:chat:gpt-4o',
            config: {
              response_format: {
                schema: { $ref: `${pathToFileURL(schemaPath).href}#%252F$defs%252FSelected` },
              },
            },
          },
          {
            id: 'openai:chat:gpt-4o',
            config: {
              response_format: {
                schema: { $ref: `${pathToFileURL(schemaPath).href}#/defs/%23` },
              },
            },
          },
          {
            id: 'openai:chat:gpt-4o',
            config: {
              response_format: {
                schema: { $ref: `${pathToFileURL(schemaPath).href}#/$defs/%252F` },
              },
            },
          },
          {
            id: 'openai:chat:gpt-4o',
            config: {
              response_format: {
                schema: { $ref: `${pathToFileURL(schemaPath).href}#/$defs/%25252F` },
              },
            },
          },
          {
            id: 'openai:chat:gpt-4o',
            config: {
              response_format: {
                schema: {
                  $ref: `${pathToFileURL(schemaPath).href}#%252FdevDependencies%252F@types%252Fnode`,
                },
              },
            },
          },
        ],
      } as unknown as UnifiedConfig)) as any;

      expect(result.providers[0].config.response_format.schema).toEqual(selected);
      expect(result.providers[1].config.response_format.schema).toEqual(selected);
      expect(result.providers[2].config.response_format.schema).toEqual({ const: 'EMPTY' });
      expect(result.providers[3].config.response_format.schema).toEqual({ const: 'SLASH' });
      expect(result.providers[4].config.response_format.schema).toEqual({ const: 'PERCENT' });
      expect(result.providers[5].config.response_format.schema).toEqual({
        const: 'ENCODED_TOKEN',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      await expect(
        dereferenceConfig({
          prompts: ['hello'],
          providers: [
            {
              id: 'openai:chat:gpt-4o',
              config: {
                response_format: {
                  schema: { $ref: `${pathToFileURL(schemaPath).href}#/$defs/missing` },
                },
              },
            },
          ],
        } as unknown as UnifiedConfig),
      ).rejects.toThrow('Missing $ref pointer');
      await expect(
        dereferenceConfig({
          prompts: ['hello'],
          providers: [
            {
              id: 'openai:chat:gpt-4o',
              config: {
                response_format: {
                  schema: {
                    $ref: `${pathToFileURL(schemaPath).href}#%252FdevDependencies%252F@types%25252Fnode`,
                  },
                },
              },
            },
          ],
        } as unknown as UnifiedConfig),
      ).rejects.toThrow('Missing $ref pointer');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves named external schema fragments unsupported by the ref parser', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-schema-named-anchor-'));
    const schemaPath = join(directory, 'schema.json');
    await writeFile(
      schemaPath,
      JSON.stringify({
        $defs: {
          first: { $anchor: 'duplicate', const: 'FIRST' },
          second: { $anchor: 'duplicate', const: 'SECOND' },
        },
      }),
    );

    try {
      const ref = `${pathToFileURL(schemaPath).href}#duplicate`;
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: { response_format: { schema: { $ref: ref } } },
          },
        ],
      } as unknown as UnifiedConfig)) as any;

      expect(result.providers[0].config.response_format.schema).toEqual({ $ref: ref });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it.each([
    '##',
    '#%23',
    '###',
    '#%23/foo',
  ])('normalizes external root fragment %s like the ref parser', async (fragment) => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-schema-root-fragment-'));
    const schemaPath = join(directory, 'schema.json');
    const schema = { properties: { value: { type: 'string' } }, type: 'object' };
    await writeFile(schemaPath, JSON.stringify(schema));

    try {
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: {
              response_format: {
                schema: { $ref: `${pathToFileURL(schemaPath).href}${fragment}` },
              },
            },
          },
        ],
      } as unknown as UnifiedConfig)) as any;

      expect(result.providers[0].config.response_format.schema).toEqual(schema);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('does not follow refs inside a schema loaded from a file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-inert-schema-file-'));
    const schemaPath = join(directory, 'schema.json');
    await writeFile(schemaPath, JSON.stringify({ $ref: 'file://secret.json' }));
    await writeFile(join(directory, 'secret.json'), JSON.stringify({ private_key: 'TOP_SECRET' }));

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: [
            {
              id: 'openai:chat:gpt-4o',
              config: {
                response_format: {
                  schema: { $ref: pathToFileURL(schemaPath).href },
                },
              },
            },
          ],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.providers[0].config.response_format.schema).toEqual({
        $ref: 'file://secret.json',
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('keeps protected and ordinary mutable views of one schema file separate', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-schema-file-views-'));
    const schemaPath = join(directory, 'schema.json');
    await writeFile(
      schemaPath,
      JSON.stringify({
        properties: { secret: { $ref: 'file://secret.json' } },
        type: 'object',
      }),
    );
    await writeFile(join(directory, 'secret.json'), JSON.stringify({ const: 'ORDINARY' }));

    try {
      const result = (await dereferenceConfig(
        {
          prompts: ['hello'],
          providers: [
            {
              id: 'openai:chat:gpt-4o',
              config: { response_format: { schema: { $ref: pathToFileURL(schemaPath).href } } },
            },
          ],
          tests: [{ vars: { ordinary: { $ref: pathToFileURL(schemaPath).href } } }],
        } as unknown as UnifiedConfig,
        directory,
      )) as any;

      expect(result.providers[0].config.response_format.schema.properties.secret).toEqual({
        $ref: 'file://secret.json',
      });
      expect(result.tests[0].vars.ordinary.properties.secret).toEqual({ const: 'ORDINARY' });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('loads boolean JSON Schemas from pure file refs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-boolean-schema-'));
    const schemaPath = join(directory, 'schema.json');
    await writeFile(schemaPath, 'false');

    try {
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: { response_format: { schema: { $ref: pathToFileURL(schemaPath).href } } },
          },
        ],
      } as unknown as UnifiedConfig)) as any;

      expect(result.providers[0].config.response_format.schema).toBe(false);
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

  it('parses logical consumers of a referenced provider while keeping its schema raw', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        provider: {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: sharedSchema() } },
        },
      },
      prompts: ['hello'],
      providers: [{ $ref: '#/definitions/provider' }],
      tests: [
        {
          vars: {
            config: { $ref: '#/providers/0/config' },
            provider: { $ref: '#/providers/0' },
            schema: { $ref: '#/providers/0/config/response_format/schema' },
            status: {
              $ref: '#/providers/0/config/response_format/schema/properties/status',
            },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.schema).toEqual(sharedSchema());
    expect(result.tests[0].vars.provider.config.response_format.schema.properties.status).toEqual({
      const: 'CONFIG',
    });
    expect(result.tests[0].vars.config.response_format.schema.properties.status).toEqual({
      const: 'CONFIG',
    });
    expect(result.tests[0].vars.schema.properties.status).toEqual({ const: 'CONFIG' });
    expect(result.tests[0].vars.status).toEqual({ const: 'CONFIG' });
  });

  it('detaches providers selected through a root config ref', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      $ref: '#/definitions/base',
      definitions: {
        base: {
          prompts: ['hello'],
          providers: [
            {
              id: 'openai:chat:gpt-4o',
              config: {
                response_format: { schema: { $ref: '#/definitions/schema' } },
              },
            },
          ],
        },
        schema: sharedSchema(),
      },
      tests: [{ vars: { base: { $ref: '#/definitions/base' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0]).not.toBe(result.definitions.base.providers[0]);
    expect(result.providers[0].config.response_format.schema).toEqual(sharedSchema());
    expect(
      result.tests[0].vars.base.providers[0].config.response_format.schema.properties.status,
    ).toEqual({ const: 'CONFIG' });
  });

  it('detaches a root-selected provider from an ordinary provider alias', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      $ref: '#/definitions/base',
      definitions: {
        base: {
          prompts: ['hello'],
          providers: [
            {
              id: 'openai:chat:gpt-4o',
              config: { response_format: { schema: sharedSchema() } },
            },
          ],
        },
      },
      tests: [{ vars: { provider: { $ref: '#/definitions/base/providers/0' } } }],
    } as unknown as UnifiedConfig)) as any;

    const provider = result.providers[0];
    const ordinary = result.tests[0].vars.provider;
    expect(provider).not.toBe(ordinary);
    expect(provider.config.response_format.schema).toEqual(sharedSchema());
    expect(ordinary.config.response_format.schema.properties.status).toEqual({ const: 'CONFIG' });
  });

  it('detaches a referenced provider config from its ordinary physical alias', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        provider: {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: sharedSchema() } },
        },
      },
      prompts: ['hello'],
      providers: [{ $ref: '#/definitions/provider' }],
      tests: [{ vars: { config: { $ref: '#/definitions/provider/config' } } }],
    } as unknown as UnifiedConfig)) as any;

    const providerConfig = result.providers[0].config;
    const ordinaryConfig = result.tests[0].vars.config;
    expect(providerConfig).not.toBe(ordinaryConfig);
    expect(providerConfig.response_format.schema).toEqual(sharedSchema());
    expect(ordinaryConfig.response_format.schema.properties.status).toEqual({
      const: 'CONFIG',
    });
  });

  it('preserves canonical refs outside a detached provider branch', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: { body: { value: 'canonical' } },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            body: { $ref: '#/definitions/body' },
            root: { $ref: '#' },
            response_format: { schema: sharedSchema() },
          },
        },
      ],
      tests: [{ vars: { config: { $ref: '#/providers/0/config' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.root).toBe(result);
    expect(result.providers[0].config.body).toBe(result.definitions.body);
    expect(result.tests[0].vars.config.root).toBe(result);
    expect(result.tests[0].vars.config.body).toBe(result.definitions.body);
    expect(result.providers[0].config.response_format.schema).toEqual(sharedSchema());
    expect(result.tests[0].vars.config.response_format.schema.properties.status).toEqual({
      const: 'CONFIG',
    });
  });

  it('preserves canonical refs inherited through an extended ref', async () => {
    const result = (await dereferenceConfig({
      definitions: {
        body: { value: 'canonical' },
        extensionBase: { body: { $ref: '#/definitions/body' } },
        extensionAlias: { $ref: '#/definitions/extensionBase' },
        provider: {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: { schema: { type: 'object' } },
            wrapper: { $ref: '#/definitions/extensionAlias', extra: true },
          },
        },
      },
      prompts: ['hello'],
      providers: [{ $ref: '#/definitions/provider' }],
      tests: [{ vars: { config: { $ref: '#/providers/0/config' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.wrapper.body).toBe(result.definitions.body);
    expect(result.tests[0].vars.config.wrapper.body).toBe(result.definitions.body);
  });

  it('clones sibling overlays inherited through an extended ref', async () => {
    const result = (await dereferenceConfig({
      definitions: {
        body: { canonical: true },
        extensionBase: { body: { $ref: '#/definitions/body' } },
      },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: { schema: { type: 'object' } },
            wrapper: {
              $ref: '#/definitions/extensionBase',
              body: { local: true },
            },
          },
        },
      ],
      tests: [{ vars: { config: { $ref: '#/providers/0/config' } } }],
    } as unknown as UnifiedConfig)) as any;

    const providerBody = result.providers[0].config.wrapper.body;
    const ordinaryBody = result.tests[0].vars.config.wrapper.body;
    expect(providerBody).toEqual({ canonical: true, local: true });
    expect(providerBody).not.toBe(ordinaryBody);
    expect(providerBody).not.toBe(result.definitions.body);
  });

  it('preserves target-only nested refs through object sibling overlays', async () => {
    const result = (await dereferenceConfig({
      definitions: {
        base: { body: { canonical: { $ref: '#/definitions/canonical' } } },
        canonical: { value: 'canonical' },
      },
      prompts: ['hello'],
      providers: [
        {
          id: 'echo',
          config: {
            response_format: { schema: { type: 'object' } },
            wrapper: { $ref: '#/definitions/base', body: { local: true } },
          },
        },
      ],
      tests: [{ vars: { config: { $ref: '#/providers/0/config' } } }],
    } as unknown as UnifiedConfig)) as any;

    const providerBody = result.providers[0].config.wrapper.body;
    const ordinaryBody = result.tests[0].vars.config.wrapper.body;
    expect(providerBody).not.toBe(ordinaryBody);
    expect(providerBody.canonical).toBe(result.definitions.canonical);
    expect(ordinaryBody.canonical).toBe(result.definitions.canonical);
  });

  it('keeps empty object overlays in detached ref provenance across pure hops', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        alias: { $ref: '#/definitions/base' },
        base: { body: { peer: { $ref: '#/providers/1/config' } } },
        nestedAlias: { $ref: '#/definitions/nestedBase' },
        nestedBase: { body: { $ref: '#/definitions/nestedBody' } },
        nestedBody: { nested: { $ref: '#/definitions/nestedTarget' } },
        nestedTarget: { peer: { $ref: '#/providers/1/config' } },
      },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: { schema: sharedSchema() },
            arrayWrapper: {
              $ref: '#/definitions/nestedAlias',
              body: { nested: [] },
            },
            nestedWrapper: {
              $ref: '#/definitions/nestedAlias',
              body: { nested: {} },
            },
            wrapper: { $ref: '#/definitions/alias', body: {} },
          },
        },
        {
          id: 'openai:chat:gpt-4o-mini',
          config: { response_format: { schema: sharedSchema() }, value: 'peer' },
        },
      ],
      tests: [
        {
          vars: {
            first: { $ref: '#/providers/0/config' },
            second: { $ref: '#/providers/1/config' },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    const providerFirst = result.providers[0].config;
    const providerSecond = result.providers[1].config;
    const ordinaryFirst = result.tests[0].vars.first;
    const ordinarySecond = result.tests[0].vars.second;
    expect(providerFirst.wrapper).not.toBe(ordinaryFirst.wrapper);
    expect(providerFirst.wrapper.body.peer).toBe(providerSecond);
    expect(ordinaryFirst.wrapper.body.peer).toBe(ordinarySecond);
    expect(providerFirst.nestedWrapper.body.nested.peer).toBe(providerSecond);
    expect(ordinaryFirst.nestedWrapper.body.nested.peer).toBe(ordinarySecond);
    expect(providerFirst.arrayWrapper.body.nested).toEqual([]);
    expect(ordinaryFirst.arrayWrapper.body.nested).toEqual([]);
    expect(providerFirst.wrapper.body.peer.response_format.schema).toEqual(sharedSchema());
    expect(ordinaryFirst.wrapper.body.peer.response_format.schema.properties.status).toEqual({
      const: 'CONFIG',
    });
  });

  it('clones sibling overlays inherited through pure ref hops', async () => {
    const definitions: Record<string, unknown> = {
      base: { body: { $ref: '#/definitions/body' } },
      body: { canonical: true },
    };
    let target = 'base';
    for (let index = 999; index >= 0; index--) {
      definitions[`level${index}`] = { $ref: `#/definitions/${target}` };
      target = `level${index}`;
    }
    const result = (await dereferenceConfig({
      definitions,
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: { schema: { type: 'object' } },
            wrapper: {
              $ref: '#/definitions/level0',
              body: { local: true },
            },
          },
        },
      ],
      tests: [{ vars: { config: { $ref: '#/providers/0/config' } } }],
    } as unknown as UnifiedConfig)) as any;

    const providerBody = result.providers[0].config.wrapper.body;
    const ordinaryBody = result.tests[0].vars.config.wrapper.body;
    expect(providerBody).toEqual({ canonical: true, local: true });
    expect(providerBody).not.toBe(ordinaryBody);
    expect(providerBody).not.toBe(result.definitions.body);
  }, 2_000);

  it('preserves canonical remote refs outside a detached provider branch', async () => {
    const remoteRef = 'https://example.com/canonical-body.json';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ value: 'REMOTE' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = (await dereferenceConfig({
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            body: { $ref: remoteRef },
            response_format: { schema: { type: 'object' } },
          },
        },
      ],
      tests: [
        {
          vars: {
            config: { $ref: '#/providers/0/config' },
            remote: { $ref: remoteRef },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    const providerBody = result.providers[0].config.body;
    const ordinaryBody = result.tests[0].vars.config.body;
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(providerBody).toBe(ordinaryBody);
    expect(providerBody).toBe(result.tests[0].vars.remote);
  });

  it('preserves a programmatic root back-edge from a detached provider branch', async () => {
    const input: any = {
      $defs: { Status: { const: 'CONFIG' } },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema: sharedSchema() } },
        },
      ],
      tests: [{ vars: { config: { $ref: '#/providers/0/config' } } }],
    };
    input.providers[0].config.root = input;

    const result = (await dereferenceConfig(input as UnifiedConfig)) as any;
    const providerConfig = result.providers[0].config;
    const ordinaryConfig = result.tests[0].vars.config;
    expect(providerConfig).not.toBe(ordinaryConfig);
    expect(providerConfig.root).toBe(result);
    expect(ordinaryConfig.root).toBe(result);
    expect(providerConfig.response_format.schema).toEqual(sharedSchema());
    expect(ordinaryConfig.response_format.schema.properties.status).toEqual({ const: 'CONFIG' });
  });

  it('does not activate a referenced schema for ordinary non-schema siblings', async () => {
    const result = (await dereferenceConfig({
      definitions: {
        provider: {
          id: 'echo',
          config: {
            response_format: {
              schema: { properties: { value: { $ref: 'file:///missing-schema.json' } } },
              type: 'json_schema',
            },
          },
        },
      },
      prompts: ['hello'],
      providers: [{ $ref: '#/definitions/provider' }],
      tests: [
        {
          vars: {
            id: { $ref: '#/providers/0/id' },
            type: { $ref: '#/providers/0/config/response_format/type' },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars).toMatchObject({ id: 'echo', type: 'json_schema' });
    expect(result.providers[0].config.response_format.schema.properties.value.$ref).toBe(
      'file:///missing-schema.json',
    );
  });

  it('keeps provider schemas inert for an ordinary root alias', async () => {
    const result = (await dereferenceConfig({
      prompts: ['hello'],
      providers: [
        {
          id: 'echo',
          config: {
            response_format: {
              schema: { properties: { value: { $ref: '#/missing' } } },
            },
          },
        },
      ],
      tests: [{ vars: { whole: { $ref: '#' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars.whole).toBe(result);
    expect(result.providers[0].config.response_format.schema.properties.value.$ref).toBe(
      '#/missing',
    );
  });

  it('discovers schemas below referenced owner containers', async () => {
    const schema = { properties: { value: { $ref: 'file:///missing-owner-schema.json' } } };
    const result = (await dereferenceConfig({
      definitions: {
        assertions: [{ type: 'is-json', value: schema }],
        owners: {
          prompts: [{ config: { response_format: { schema } }, raw: 'hello' }],
          providers: [{ id: 'echo', config: { response_format: { schema } } }],
          tests: [
            {
              assert: { $ref: '#/definitions/assertions' },
              options: { response_format: { schema } },
            },
          ],
        },
      },
      prompts: { $ref: '#/definitions/owners/prompts' },
      providers: { $ref: '#/definitions/owners/providers' },
      tests: { $ref: '#/definitions/owners/tests' },
    } as unknown as UnifiedConfig)) as any;

    expect(result.prompts[0].config.response_format.schema).toEqual(schema);
    expect(result.providers[0].config.response_format.schema).toEqual(schema);
    expect(result.tests[0].options.response_format.schema).toEqual(schema);
    expect(result.tests[0].assert[0].value).toEqual(schema);
  });

  it('discovers schemas below referenced agent handoff containers', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        deepHandoff: {
          agent: {
            model: 'gpt-4o-mini',
            name: 'deep',
            outputType: { schema: sharedSchema(), type: 'json_schema' },
          },
        },
        deep: [{ $ref: '#/definitions/deepHandoff' }],
        top: [
          {
            agent: {
              handoffs: { $ref: '#/definitions/deep' },
              model: 'gpt-4o-mini',
              name: 'top',
              outputType: { schema: sharedSchema(), type: 'json_schema' },
            },
          },
        ],
      },
      prompts: ['hello'],
      providers: [
        { id: 'openai:agents', config: { handoffs: { $ref: '#/definitions/top' } } },
        {
          id: 'openai:agents',
          config: {
            agent: {
              handoffs: { $ref: '#/definitions/top' },
              model: 'gpt-4o-mini',
              name: 'root',
            },
          },
        },
      ],
      tests: [{ vars: { handoffs: { $ref: '#/definitions/top' } } }],
    } as unknown as UnifiedConfig)) as any;

    const rootHandoff = result.providers[0].config.handoffs[0];
    const agentHandoff = result.providers[1].config.agent.handoffs[0];
    expect(rootHandoff.agent.outputType.schema).toEqual(sharedSchema());
    expect(rootHandoff.agent.handoffs[0].agent.outputType.schema).toEqual(sharedSchema());
    expect(agentHandoff.agent.outputType.schema).toEqual(sharedSchema());
    expect(result.tests[0].vars.handoffs[0].agent.outputType.schema.properties.status).toEqual({
      const: 'CONFIG',
    });
  });

  it('keeps cyclic handoff graphs coherent across provider and ordinary views', async () => {
    const schema = sharedSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: {
        a: {
          agent: {
            handoffs: [{ $ref: '#/definitions/b' }],
            model: 'gpt-4o-mini',
            name: 'a',
            outputType: { schema, type: 'json_schema' },
          },
        },
        b: {
          agent: {
            handoffs: [{ $ref: '#/definitions/a' }],
            model: 'gpt-4o-mini',
            name: 'b',
            outputType: { schema, type: 'json_schema' },
          },
        },
        top: [{ $ref: '#/definitions/a' }],
      },
      prompts: ['hello'],
      providers: [{ id: 'openai:agents', config: { handoffs: { $ref: '#/definitions/top' } } }],
      tests: [{ vars: { handoffs: { $ref: '#/definitions/top' } } }],
    } as unknown as UnifiedConfig)) as any;

    const providerA = result.providers[0].config.handoffs[0];
    const providerB = providerA.agent.handoffs[0];
    const ordinaryA = result.tests[0].vars.handoffs[0];
    const ordinaryB = ordinaryA.agent.handoffs[0];
    expect(providerA.agent.outputType.schema).toEqual(schema);
    expect(providerB.agent.outputType.schema).toEqual(schema);
    expect(providerB.agent.handoffs[0]).toBe(providerA);
    expect(ordinaryA.agent.outputType.schema.properties.status).toEqual({ const: 'CONFIG' });
    expect(ordinaryB.agent.outputType.schema.properties.status).toEqual({ const: 'CONFIG' });
    expect(ordinaryB.agent.handoffs[0]).toBe(ordinaryA);
  });

  it('parses schema sources for a sibling-bearing ordinary root ref', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: { schema: sharedSchema() },
      prompts: ['hello'],
      providers: [
        {
          id: 'echo',
          config: {
            response_format: { schema: { $ref: '#/definitions/schema' } },
          },
        },
      ],
      tests: [{ vars: { merged: { $ref: '#', note: 'ordinary' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.schema).toEqual(sharedSchema());
    expect(result.definitions.schema.properties.status).toEqual({ const: 'CONFIG' });
    expect(result.tests[0].vars.merged.note).toBe('ordinary');
    expect(result.tests[0].vars.merged.definitions.schema.properties.status).toEqual({
      const: 'CONFIG',
    });
  });

  it('detaches provider graphs from sibling-bearing root views', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      prompts: ['hello'],
      providers: [
        {
          id: 'first',
          config: {
            peer: { $ref: '#/providers/1/config' },
            response_format: { schema: sharedSchema() },
          },
        },
        {
          id: 'second',
          config: {
            peer: { $ref: '#/providers/0/config' },
            response_format: { schema: sharedSchema() },
          },
        },
      ],
      tests: [{ vars: { merged: { $ref: '#', note: 'ordinary' }, whole: { $ref: '#' } } }],
    } as unknown as UnifiedConfig)) as any;

    const [first, second] = result.providers.map((provider: any) => provider.config);
    const merged = result.tests[0].vars.merged;
    const [mergedFirst, mergedSecond] = merged.providers.map((provider: any) => provider.config);
    expect(first.peer).toBe(second);
    expect(second.peer).toBe(first);
    expect(mergedFirst.peer).toBe(mergedSecond);
    expect(mergedSecond.peer).toBe(mergedFirst);
    expect(mergedFirst).not.toBe(first);
    expect(first.response_format.schema).toEqual(sharedSchema());
    expect(mergedFirst.response_format.schema.properties.status).toEqual({ const: 'CONFIG' });
    expect(merged.note).toBe('ordinary');
    expect(result.tests[0].vars.whole).toBe(result);
  });

  it('detaches test-owned schemas from sibling-bearing root views in the same branch', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      prompts: ['hello'],
      providers: ['echo'],
      tests: [
        {
          options: { response_format: { schema: sharedSchema() } },
          vars: { merged: { $ref: '#', note: 'ordinary' }, whole: { $ref: '#' } },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].options.response_format.schema).toEqual(sharedSchema());
    expect(
      result.tests[0].vars.merged.tests[0].options.response_format.schema.properties.status,
    ).toEqual({ const: 'CONFIG' });
    expect(result.tests[0].vars.merged.note).toBe('ordinary');
    expect(result.tests[0].vars.whole).toBe(result);
  });

  it('detaches cross-referenced provider branches as one graph', async () => {
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:first',
          config: {
            peer: { $ref: '#/providers/1/config' },
            response_format: { schema: sharedSchema() },
          },
        },
        {
          id: 'openai:chat:second',
          config: {
            peer: { $ref: '#/providers/0/config' },
            response_format: { schema: sharedSchema() },
          },
        },
      ],
      tests: [
        {
          vars: {
            first: { $ref: '#/providers/0/config' },
            second: { $ref: '#/providers/1/config' },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    const providerFirst = result.providers[0].config;
    const providerSecond = result.providers[1].config;
    const ordinaryFirst = result.tests[0].vars.first;
    const ordinarySecond = result.tests[0].vars.second;
    expect(providerFirst.peer).toBe(providerSecond);
    expect(providerSecond.peer).toBe(providerFirst);
    expect(ordinaryFirst.peer).toBe(ordinarySecond);
    expect(ordinarySecond.peer).toBe(ordinaryFirst);
    expect(providerFirst.response_format.schema).toEqual(sharedSchema());
    expect(ordinaryFirst.response_format.schema.properties.status).toEqual({ const: 'CONFIG' });
  });

  it('keeps a direct boolean schema sibling on a referenced response format', async () => {
    const result = (await dereferenceConfig({
      definitions: {
        format: { schema: { type: 'object' }, type: 'json_schema' },
      },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: { $ref: '#/definitions/format', schema: false },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format).toEqual({
      schema: false,
      type: 'json_schema',
    });
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

  it('does not URI-decode canonical paths for percent-bearing provider map keys', async () => {
    const schema = sharedSchema();
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      prompts: ['hello'],
      providers: [
        {
          '%2F': {
            config: { response_format: { schema } },
          },
        },
      ],
      tests: [
        {
          vars: {
            direct: {
              $ref: '#/providers/0/%25252F/config/response_format/schema',
            },
          },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    const providerSchema = result.providers[0]['%2F'].config.response_format.schema;
    expect(providerSchema).toEqual(schema);
    expect(result.tests[0].vars.direct.properties.status).toEqual({ const: 'CONFIG' });
    expect(providerSchema).not.toBe(result.tests[0].vars.direct);
  });

  it('clones repeated aliases without exponentially expanding them', async () => {
    let aliases: any = { leaf: true };
    for (let depth = 0; depth < 17; depth++) {
      aliases = { left: aliases, right: aliases };
    }

    const result = (await dereferenceConfig({
      metadata: { aliases },
      prompts: ['hello'],
      providers: ['echo'],
    } as unknown as UnifiedConfig)) as any;
    let current = result.metadata.aliases;
    for (let depth = 0; depth < 17; depth++) {
      expect(current.left).toEqual(current.right);
      current = current.left;
    }
    expect(current).toEqual({ leaf: true });
  });

  it('prunes irrelevant alias DAG paths without missing schema aliases', async () => {
    const originalEntries = Object.entries;
    let aliasVisits = 0;
    vi.spyOn(Object, 'entries').mockImplementation((value: object) => {
      if ((value as { __aliasDag?: boolean }).__aliasDag) {
        aliasVisits++;
      }
      return originalEntries(value);
    });

    let aliases: any = {
      __aliasDag: true,
      picked: { $ref: '#/definitions/value' },
    };
    for (let depth = 0; depth < 14; depth++) {
      aliases = { __aliasDag: true, left: aliases, right: aliases };
    }
    const schema = {
      $defs: { Status: { const: 'SCHEMA' } },
      properties: { status: { $ref: '#/$defs/Status' } },
      type: 'object',
    };

    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions: { value: { loaded: true } },
      metadata: { aliases, schema },
      prompts: ['hello'],
      providers: [
        {
          id: 'openai:chat:gpt-4o',
          config: { response_format: { schema } },
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(aliasVisits).toBeLessThan(1_000);
    let aliasLeaf = result.metadata.aliases;
    for (let depth = 0; depth < 14; depth++) {
      aliasLeaf = aliasLeaf.left;
    }
    expect(aliasLeaf.picked).toEqual({ loaded: true });
    expect(result.metadata.schema.properties.status).toEqual({ const: 'CONFIG' });
    expect(result.providers[0].config.response_format.schema).toEqual(schema);
    expect(result.providers[0].config.response_format.schema).not.toBe(result.metadata.schema);
  });

  it('preserves outer back-edges while cloning repeated aliases', async () => {
    const shared: any = {};
    const input: any = {
      metadata: { first: shared, second: shared },
      prompts: ['hello'],
      providers: ['echo'],
    };
    shared.root = input;

    const result = (await dereferenceConfig(input as UnifiedConfig)) as any;

    expect(result.metadata.first).not.toBe(result.metadata.second);
    expect(result.metadata.first.root).toBe(result);
    expect(result.metadata.second.root).toBe(result);
  });

  it('preserves aliases from a schema file without expanding them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-schema-aliases-'));
    const schemaPath = join(directory, 'schema.yaml');
    const lines = ['a0: &a0', '  leaf: true'];
    for (let depth = 1; depth <= 17; depth++) {
      lines.push(`a${depth}: &a${depth}`, `  left: *a${depth - 1}`, `  right: *a${depth - 1}`);
    }
    lines.push('root: *a17');
    await writeFile(schemaPath, lines.join('\n'));

    try {
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: [
          {
            id: 'openai:chat:gpt-4o',
            config: {
              response_format: {
                schema: { $ref: `${pathToFileURL(schemaPath).href}#/root` },
              },
            },
          },
        ],
      } as unknown as UnifiedConfig)) as any;
      let current = result.providers[0].config.response_format.schema;
      for (let depth = 0; depth < 17; depth++) {
        expect(current.left).toBe(current.right);
        current = current.left;
      }
      expect(current).toEqual({ leaf: true });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('preserves deep schema aliases inside an external YAML config', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-external-config-schema-aliases-'));
    const configPath = join(directory, 'config.yaml');
    const lines = ['a0: &a0', '  leaf: true'];
    for (let depth = 1; depth <= 17; depth++) {
      lines.push(`a${depth}: &a${depth}`, `  left: *a${depth - 1}`, `  right: *a${depth - 1}`);
    }
    lines.push(
      'selected:',
      '  prompts: [hello]',
      '  providers:',
      '    - id: openai:chat:gpt-4o',
      '      config:',
      '        response_format:',
      '          schema: *a17',
    );
    await writeFile(configPath, lines.join('\n'));

    try {
      const result = (await dereferenceConfig(
        { $ref: `${pathToFileURL(configPath).href}#/selected` } as unknown as UnifiedConfig,
        directory,
      )) as any;
      let current = result.providers[0].config.response_format.schema;
      for (let depth = 0; depth < 17; depth++) {
        expect(current.left).toBe(current.right);
        current = current.left;
      }
      expect(current).toEqual({ leaf: true });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('shares preserved aliases across distinct schema file fragments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-schema-fragment-aliases-'));
    const schemaPath = join(directory, 'schema.yaml');
    const lines = ['a0: &a0', '  leaf: true'];
    for (let depth = 1; depth <= 13; depth++) {
      lines.push(`a${depth}: &a${depth}`, `  left: *a${depth - 1}`, `  right: *a${depth - 1}`);
    }
    for (let index = 0; index < 8; index++) {
      lines.push(`schema${index}:`, '  payload: *a13');
    }
    await writeFile(schemaPath, lines.join('\n'));

    try {
      const result = (await dereferenceConfig({
        prompts: ['hello'],
        providers: Array.from({ length: 8 }, (_, index) => ({
          id: 'openai:chat:gpt-4o',
          config: {
            response_format: {
              schema: { $ref: `${pathToFileURL(schemaPath).href}#/schema${index}` },
            },
          },
        })),
      } as unknown as UnifiedConfig)) as any;
      const first = result.providers[0].config.response_format.schema.payload;
      expect(first.left).toBe(first.right);
      for (const provider of result.providers) {
        expect(provider.config.response_format.schema.payload).toBe(first);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('reuses one snapshot for repeated large schema consumers', async () => {
    let aliases: any = { leaf: true };
    for (let depth = 0; depth < 12; depth++) {
      aliases = { left: aliases, right: aliases };
    }
    const schema = { aliases, type: 'object' };

    const result = (await dereferenceConfig({
      definitions: { schema },
      prompts: ['hello'],
      providers: Array.from({ length: 8 }, () => ({
        id: 'openai:chat:gpt-4o',
        config: { response_format: { schema: { $ref: '#/definitions/schema' } } },
      })),
    } as unknown as UnifiedConfig)) as any;

    const firstSchema = result.providers[0].config.response_format.schema;
    expect(firstSchema.aliases.left.left.left).toBeDefined();
    for (const provider of result.providers) {
      expect(provider.config.response_format.schema).toBe(firstSchema);
    }
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

  it('does not expand a branching ref DAG when no standalone schemas exist', async () => {
    const definitions: Record<string, unknown> = { node0: { leaf: true } };
    for (let depth = 1; depth <= 16; depth++) {
      definitions[`node${depth}`] = {
        left: { $ref: `#/definitions/node${depth - 1}` },
        right: { $ref: `#/definitions/node${depth - 1}` },
      };
    }

    const result = (await dereferenceConfig({
      definitions,
      prompts: ['hello'],
      providers: ['echo'],
      tests: [{ vars: { root: { $ref: '#/definitions/node16' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars.root.left).toBe(result.tests[0].vars.root.right);
  }, 2_000);

  it('preserves shared assertion schemas below the discovery safety limit', async () => {
    const definitions: Record<string, unknown> = {
      node0: { type: 'is-json', value: sharedSchema() },
    };
    for (let depth = 1; depth <= 3; depth++) {
      definitions[`node${depth}`] = {
        assert: [
          { $ref: `#/definitions/node${depth - 1}` },
          { $ref: `#/definitions/node${depth - 1}` },
        ],
        type: 'assert-set',
      };
    }
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      definitions,
      prompts: ['hello'],
      providers: ['echo'],
      tests: [
        { assert: [{ $ref: '#/definitions/node3' }] },
        { vars: { leaf: { $ref: '#/definitions/node0' } } },
      ],
    } as unknown as UnifiedConfig)) as any;

    let left = result.tests[0].assert[0];
    let right = result.tests[0].assert[0];
    for (let depth = 0; depth < 3; depth++) {
      expect(left.assert[0]).toBe(left.assert[1]);
      left = left.assert[0];
      right = right.assert[1];
    }
    expect(left.value).toEqual(sharedSchema());
    expect(right.value).toEqual(sharedSchema());
    expect(result.tests[1].vars.leaf.value.properties.status).toEqual({ const: 'CONFIG' });
  });

  it('bounds schema discovery for a branching assertion ref DAG', async () => {
    const definitions: Record<string, unknown> = { node0: { type: 'equals', value: 'x' } };
    for (let depth = 1; depth <= 14; depth++) {
      definitions[`node${depth}`] = {
        assert: [
          { $ref: `#/definitions/node${depth - 1}` },
          { $ref: `#/definitions/node${depth - 1}` },
        ],
        type: 'assert-set',
      };
    }

    await expect(
      dereferenceConfig({
        definitions,
        prompts: ['hello'],
        providers: ['echo'],
        tests: [{ assert: [{ $ref: '#/definitions/node14' }] }],
      } as unknown as UnifiedConfig),
    ).rejects.toThrow('Config schema discovery exceeds the 50,000 path safety limit');
  }, 5_000);

  it('does not replay unrelated extended refs for every physical definition', async () => {
    const definitions: Record<string, unknown> = { n0: { value: 0 } };
    for (let index = 1; index <= 400; index++) {
      definitions[`n${index}`] = {
        $ref: `#/definitions/n${index - 1}`,
        [`v${index}`]: index,
      };
    }

    const result = (await dereferenceConfig({
      definitions,
      prompts: ['hello'],
      providers: [{ id: 'echo', config: { response_format: { schema: { type: 'object' } } } }],
      tests: [{ vars: { payload: { $ref: '#/definitions/n400' } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.tests[0].vars.payload).toBe(result.definitions.n400);
    expect(result.definitions.n400.value).toBe(0);
    expect(result.definitions.n400.v1).toBe(1);
    expect(result.definitions.n400.v400).toBe(400);
  }, 2_000);

  it('bounds cumulative sibling-ref expansion before parsing', async () => {
    const definitions: Record<string, unknown> = { n0: { value: 0 } };
    for (let index = 1; index <= 2_000; index++) {
      definitions[`n${index}`] = {
        $ref: `#/definitions/n${index - 1}`,
        [`v${index}`]: index,
      };
    }

    await expect(
      dereferenceConfig({
        definitions,
        prompts: ['hello'],
        providers: [{ id: 'echo', config: { response_format: { schema: { type: 'object' } } } }],
      } as unknown as UnifiedConfig),
    ).rejects.toThrow('Config ref expansion exceeds the 1,000,000 property safety limit');
  }, 2_000);

  it('checks shallow wide configs without exceeding the JavaScript argument limit', async () => {
    const wide = Object.fromEntries(
      Array.from({ length: 200_000 }, (_, index) => [`value${index}`, index]),
    );
    const result = (await dereferenceConfig({
      metadata: { wide },
      prompts: ['hello'],
      providers: [{ id: 'echo', config: { response_format: { schema: { type: 'object' } } } }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.metadata.wide.value0).toBe(0);
    expect(result.metadata.wide.value199999).toBe(199_999);
  }, 10_000);

  it('does not copy provenance for long provider selector chains', async () => {
    const definitions: Record<string, unknown> = {
      base: {
        config: { response_format: { schema: { type: 'object' } } },
        id: 'echo',
      },
    };
    let target = 'base';
    for (let index = 7_999; index >= 0; index--) {
      definitions[`provider${index}`] = { $ref: `#/definitions/${target}` };
      target = `provider${index}`;
    }

    const result = (await dereferenceConfig({
      definitions,
      prompts: ['hello'],
      providers: [{ $ref: '#/definitions/provider0' }],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.response_format.schema).toEqual({ type: 'object' });
  }, 5_000);

  it('does not path-expand a provider ref ring', async () => {
    const providerCount = 100;
    const result = (await dereferenceConfig({
      $defs: { Status: { const: 'CONFIG' } },
      prompts: ['hello'],
      providers: Array.from({ length: providerCount }, (_, index) => ({
        id: `provider-${index}`,
        config: {
          peer: { $ref: `#/providers/${(index + 1) % providerCount}/config` },
          response_format: { schema: sharedSchema() },
        },
      })),
      tests: [
        {
          vars: Object.fromEntries(
            Array.from({ length: providerCount }, (_, index) => [
              `provider${index}`,
              { $ref: `#/providers/${index}/config` },
            ]),
          ),
        },
      ],
    } as unknown as UnifiedConfig)) as any;

    expect(result.providers[0].config.peer).toBe(result.providers[1].config);
    expect(result.tests[0].vars.provider0.peer).toBe(result.tests[0].vars.provider1);
    expect(result.providers[0].config).not.toBe(result.tests[0].vars.provider0);
  }, 2_000);
});
