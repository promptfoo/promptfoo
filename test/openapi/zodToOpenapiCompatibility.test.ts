import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpProviderConfigFieldsSchema } from '../../src/contracts/providerConfig/http';
import { McpConfigInputSchema } from '../../src/contracts/providerConfig/mcp';

extendZodWithOpenApi(z);

function generateSchemas(registry: OpenAPIRegistry) {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Dependency compatibility', version: '1.0.0' },
  }).components?.schemas;
}

describe('zod-to-openapi compatibility', () => {
  it('preserves HTTP field descriptions and parser deprecation metadata', () => {
    const registry = new OpenAPIRegistry();
    registry.register(
      'HttpConfigMetadata',
      HttpProviderConfigFieldsSchema.pick({
        auth: true,
        headers: true,
        responseParser: true,
      }),
    );
    expect(generateSchemas(registry)?.HttpConfigMetadata).toMatchObject({
      properties: {
        auth: { anyOf: expect.any(Array) },
        headers: { description: expect.stringContaining('support templates') },
        responseParser: {
          type: 'string',
          deprecated: true,
          description: 'Deprecated alias for transformResponse',
        },
      },
    });
  });

  it('preserves MCP descriptions and deprecation without inventing timeout defaults', () => {
    const registry = new OpenAPIRegistry();
    registry.registerPath({
      method: 'post',
      path: '/mcp-config',
      request: {
        body: { content: { 'application/json': { schema: McpConfigInputSchema } } },
      },
      responses: { 200: { description: 'Valid configuration' } },
    });
    const document = new OpenApiGeneratorV31(registry.definitions).generateDocument({
      openapi: '3.1.0',
      info: { title: 'MCP documentation', version: '1.0.0' },
    });
    const body = document.paths?.['/mcp-config'].post?.requestBody;
    const schema = body && 'content' in body ? body.content['application/json'].schema : undefined;
    expect(schema).toMatchObject({
      properties: {
        timeout: {
          type: 'number',
          description: expect.stringContaining('60000 (60 seconds)'),
        },
        responseParser: {
          type: 'string',
          description: 'Deprecated alias for transformResponse',
          deprecated: true,
        },
      },
    });
    expect(schema).not.toHaveProperty('properties.timeout.default');
  });

  it('preserves discriminator mappings for nested discriminated unions', () => {
    const registry = new OpenAPIRegistry();
    const circle = z.object({ type: z.literal('circle') }).openapi('Circle');
    const rectangle = z
      .discriminatedUnion('fill', [
        z.object({ type: z.literal('rectangle'), fill: z.literal('solid') }),
        z.object({ type: z.literal('rectangle'), fill: z.literal('empty') }),
      ])
      .openapi('Rectangle');

    registry.register('Shape', z.discriminatedUnion('type', [circle, rectangle]));

    expect(generateSchemas(registry)?.Shape).toEqual(
      expect.objectContaining({
        discriminator: {
          propertyName: 'type',
          mapping: {
            circle: '#/components/schemas/Circle',
            rectangle: '#/components/schemas/Rectangle',
          },
        },
      }),
    );
  });

  it('emits supported Zod string formats and a valid bigint pattern', () => {
    const registry = new OpenAPIRegistry();

    registry.register(
      'Formats',
      z.object({
        guid: z.guid(),
        cidrv4: z.cidrv4(),
        cidrv6: z.cidrv6(),
        base64url: z.base64url(),
        time: z.iso.time(),
        duration: z.iso.duration(),
        count: z.bigint(),
      }),
    );

    expect(generateSchemas(registry)?.Formats).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          guid: { type: 'string', format: 'uuid' },
          cidrv4: { type: 'string', format: 'ipv4-cidr' },
          cidrv6: { type: 'string', format: 'ipv6-cidr' },
          base64url: { type: 'string', format: 'base64url' },
          time: { type: 'string', format: 'time' },
          duration: { type: 'string', format: 'duration' },
          count: { type: 'string', pattern: '^\\d+$' },
        }),
      }),
    );
  });
});
