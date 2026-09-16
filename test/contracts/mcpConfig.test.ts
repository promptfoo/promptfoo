import Ajv from 'ajv';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  McpConfigInputJsonSchema,
  McpConfigInputSchema,
  McpConfigSchema,
  McpServerInputSchema,
} from '../../src/contracts';

import type { McpConfigInput, McpConfigParsed, McpServerInput } from '../../src/contracts';

const oauth = { type: 'oauth', clientId: '{{ CLIENT_ID }}', clientSecret: '{{ CLIENT_SECRET }}' };
const valid: unknown[] = [
  {},
  { enabled: false },
  { enabled: true, servers: [] },
  { server: { command: 'node' } },
  { server: { path: './server.py', name: 'local', env: { MODE: 'test' } } },
  { server: { url: 'https://mcp.example.test', auth: { type: 'none' } } },
  { server: { url: 'https://mcp.example.test', auth: oauth } },
  { server: { url: 'https://mcp.example.test', auth: { ...oauth, scopes: '{{ SCOPES }}' } } },
  { server: { url: 'https://mcp.example.test', auth: { type: 'api_key', api_key: 'key' } } },
  {
    server: {
      url: 'https://mcp.example.test',
      auth: { type: 'api_key', value: '', api_key: 'key' },
    },
  },
  { server: { command: 'node', path: './server.js', url: 'https://mcp.example.test' } },
  { server: { command: '', path: '', url: 'https://mcp.example.test' } },
  { server: { command: 'node', extra: { keep: true } }, extra: { keep: true } },
  {
    enabled: true,
    server: { command: 'node', args: ['./single.js'] },
    servers: [{ url: 'https://mcp.example.test', headers: { 'X-Header': '{{ HEADER }}' } }],
    serverName: 'test',
    transformResponse: 'result.structuredContent',
    responseParser: 'file://parser.js',
    timeout: 0,
    resetTimeoutOnProgress: true,
    maxTotalTimeout: 10000,
    pingOnConnect: true,
    tools: ['lookup'],
    exclude_tools: ['delete'],
    debug: false,
    verbose: true,
  },
];

const invalid: unknown[] = [
  null,
  [],
  'mcp',
  { enabled: 'true' },
  { server: {} },
  { enabled: false, server: {} },
  { server: { command: '', path: '', url: '' } },
  { server: { command: 123, url: 'https://mcp.example.test' } },
  { server: { command: 'node', args: 'server.js' } },
  { server: { command: 'node', args: [123] } },
  { server: { command: 'node', env: { TOKEN: 123 } } },
  { server: { url: 'https://mcp.example.test', headers: [] } },
  { server: { url: 'https://mcp.example.test', headers: { KEY: false } } },
  { server: { url: 'https://mcp.example.test', auth: { type: 'api_key' } } },
  {
    server: { url: 'https://mcp.example.test', auth: { type: 'api_key', value: '', api_key: '' } },
  },
  { server: { url: 'https://mcp.example.test', auth: { type: 'bearer', token: 123 } } },
  { server: { url: 'https://mcp.example.test', auth: { type: 'unknown', value: 'key' } } },
  { servers: {} },
  { servers: [{ command: 'node' }, {}] },
  {
    server: { command: 'node' },
    servers: [{ url: 'https://mcp.example.test', auth: { type: 'api_key' } }],
  },
  { timeout: -1 },
  { timeout: Number.POSITIVE_INFINITY },
  { timeout: '1000' },
  { maxTotalTimeout: -1 },
  { resetTimeoutOnProgress: 'false' },
  { pingOnConnect: 1 },
  { tools: 'lookup' },
  { exclude_tools: [123] },
  { debug: 'true' },
  { verbose: 1 },
  { transformResponse: {} },
  { responseParser: 123 },
];

describe('MCP configuration contracts', () => {
  const validateJson = new Ajv({ strict: true }).compile(McpConfigInputJsonSchema);

  it.each(valid)('accepts the same complete input in Zod and JSON Schema: %j', (input) => {
    expect(McpConfigInputSchema.safeParse(input).success).toBe(true);
    expect(McpConfigSchema.safeParse(input).success).toBe(true);
    expect(validateJson(input), JSON.stringify(validateJson.errors)).toBe(true);
  });

  it.each(invalid)('rejects malformed known fields in every union branch: %j', (input) => {
    expect(McpConfigInputSchema.safeParse(input).success).toBe(false);
    expect(McpConfigSchema.safeParse(input).success).toBe(false);
    expect(validateJson(input)).toBe(false);
  });

  it('applies defaults only to runtime config and preserves extension fields', () => {
    const input = {
      servers: [
        { url: 'https://mcp.example.test', auth: oauth, extension: { keep: true } },
        { command: 'node', auth: { type: 'none' } },
      ],
      extension: { keep: true },
    };
    expect(McpConfigInputSchema.parse(input)).toEqual(input);
    const parsed = McpConfigSchema.parse(input);
    expect(parsed.enabled).toBe(true);
    expect(parsed.servers?.[0].auth).toEqual({ ...oauth, grantType: 'client_credentials' });
    expect(parsed.servers?.[1].auth).toBeUndefined();
    expect(parsed.servers?.[0].extension).toEqual({ keep: true });
    expect(parsed.extension).toEqual({ keep: true });
    expect(input.servers[0].auth).not.toHaveProperty('grantType');
    expect(McpConfigInputSchema.parse(input)).not.toHaveProperty('enabled');
  });

  it('preserves function transforms only in the in-process schema without calling them', () => {
    const transform = vi.fn();
    const input = { transformResponse: transform, responseParser: transform };
    expect(McpConfigSchema.parse(input).transformResponse).toBe(transform);
    expect(McpConfigSchema.parse(input).responseParser).toBe(transform);
    expect(McpConfigInputSchema.safeParse(input).success).toBe(false);
    expect(transform).not.toHaveBeenCalled();
  });

  it('validates nested auth in the server schema independently', () => {
    expect(McpServerInputSchema.safeParse({ command: 'node' }).success).toBe(true);
    expect(
      McpServerInputSchema.safeParse({ url: 'https://mcp.example.test', auth: { type: 'api_key' } })
        .success,
    ).toBe(false);
  });

  it('infers the connection requirement and distinguishes raw input from parsed defaults', () => {
    expectTypeOf<McpConfigInput>().not.toBeAny();
    expectTypeOf<McpConfigParsed['enabled']>().toEqualTypeOf<boolean>();
    expectTypeOf<McpConfigInput['enabled']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<{ server: {} }>().not.toExtend<McpConfigInput>();
    expectTypeOf<{ command: string }>().toExtend<McpServerInput>();
    expectTypeOf<{ path: string }>().toExtend<McpServerInput>();
    expectTypeOf<{ url: string }>().toExtend<McpServerInput>();
    expectTypeOf<{ transformResponse: () => string }>().not.toExtend<McpConfigInput>();
    expectTypeOf<{
      server: { url: string; auth: { type: 'api_key' } };
    }>().not.toExtend<McpConfigInput>();
  });
});
