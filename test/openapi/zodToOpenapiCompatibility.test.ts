import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

extendZodWithOpenApi(z);

function generateSchemas(registry: OpenAPIRegistry) {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Dependency compatibility', version: '1.0.0' },
  }).components?.schemas;
}

describe('zod-to-openapi compatibility', () => {
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
