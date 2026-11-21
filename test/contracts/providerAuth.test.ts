import Ajv from 'ajv';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { McpAuthInputJsonSchema, McpAuthInputSchema, McpAuthSchema } from '../../src/contracts';
import * as contractsAuth from '../../src/contracts/providerConfig/auth';
import { A2AAuthSchema } from '../../src/providers/a2a/types';
import * as legacyAuth from '../../src/providers/mcp/auth';

import type { McpAuthInput, McpAuthParsed } from '../../src/contracts';

const clientCredentials = { type: 'oauth', clientId: 'client', clientSecret: 'secret' };
const passwordGrant = { type: 'oauth', grantType: 'password', username: 'user', password: '' };

const validInputs: unknown[] = [
  { type: '' },
  { type: 'none' },
  { type: 'no_auth' },
  { type: 'bearer', token: 'token' },
  { type: 'bearer', token: '' },
  { type: 'basic', username: '', password: '' },
  { type: 'api_key', value: 'key' },
  { type: 'api_key', api_key: 'legacy' },
  { type: 'api_key', value: '', api_key: 'legacy' },
  { type: 'api_key', value: 'key', api_key: '' },
  { type: 'api_key', value: 'key', api_key: 'legacy' },
  { type: 'api_key', value: ' ' },
  { type: 'api_key', api_key: ' ' },
  { type: 'api_key', value: 'key', placement: 'header', keyName: 'X-Key' },
  { type: 'api_key', value: 'key', placement: 'query', keyName: '' },
  { type: 'api_key', value: '{{ token }}' },
  { type: 'bearer', token: '{{ secrets.TOKEN }}' },
  clientCredentials,
  { ...clientCredentials, grantType: 'client_credentials' },
  { ...clientCredentials, scopes: 'read write' },
  { ...clientCredentials, scopes: ['read', '{{ scopes }}'], tokenUrl: '{{ tokenUrl }}' },
  { ...clientCredentials, clientId: '', clientSecret: '', tokenUrl: '' },
  passwordGrant,
  { ...passwordGrant, scopes: 'read,write' },
  { ...passwordGrant, scopes: [], clientId: 'client', clientSecret: 'secret' },
];

const invalidInputs: unknown[] = [
  null,
  false,
  42,
  'bearer',
  [],
  {},
  { type: 'unknown', token: 'token' },
  { type: 'file', path: 'auth.js' },
  { type: 'bearer' },
  { type: 'bearer', token: 123 },
  { type: 'basic', username: 'user' },
  { type: 'basic', username: 'user', password: false },
  { type: 'api_key' },
  { type: 'api_key', value: '' },
  { type: 'api_key', api_key: '' },
  { type: 'api_key', value: '', api_key: '' },
  { type: 'api_key', value: 123, api_key: 'legacy' },
  { type: 'api_key', value: 'key', api_key: false },
  { type: 'api_key', value: null, api_key: 'legacy' },
  { type: 'api_key', value: 'key', placement: 'body' },
  { type: 'api_key', value: 'key', keyName: 123 },
  { type: 'oauth', clientId: 'client' },
  { ...clientCredentials, grantType: 'authorization_code' },
  { ...clientCredentials, scopes: [123] },
  { ...clientCredentials, scopes: null },
  { ...clientCredentials, tokenUrl: false },
  { type: 'oauth', grantType: 'password', username: 'user' },
  { ...passwordGrant, password: 123 },
];

describe('MCP auth contracts', () => {
  const validateJson = new Ajv({ strict: true }).compile(McpAuthInputJsonSchema);

  it.each(validInputs)('accepts the same valid JSON input in Zod and JSON Schema: %j', (input) => {
    expect(McpAuthInputSchema.safeParse(input).success).toBe(true);
    expect(McpAuthSchema.safeParse(input).success).toBe(true);
    expect(validateJson(input), JSON.stringify(validateJson.errors)).toBe(true);
  });

  it.each(invalidInputs)(
    'rejects the same invalid JSON input in Zod and JSON Schema: %j',
    (input) => {
      expect(McpAuthInputSchema.safeParse(input).success).toBe(false);
      expect(McpAuthSchema.safeParse(input).success).toBe(false);
      expect(validateJson(input)).toBe(false);
    },
  );

  it('exports the API-key requirement from the schema without refinement overrides', () => {
    const schema = z.toJSONSchema(contractsAuth.ApiKeyAuthSchema, {
      io: 'input',
      target: 'draft-07',
    });
    const validateApiKey = new Ajv({ strict: true }).compile(schema);
    expect(validateApiKey({ type: 'api_key' })).toBe(false);
    expect(validateApiKey({ type: 'api_key', value: '', api_key: 'legacy' })).toBe(true);
    expect(validateApiKey({ type: 'api_key', value: 'key', api_key: '' })).toBe(true);
    expect(validateApiKey({ type: 'api_key', value: 'key', api_key: 'legacy' })).toBe(true);
  });

  it('keeps input parsing free of OAuth defaults and no-auth normalization', () => {
    const input = { ...clientCredentials, scopes: 'read write' };
    expect(McpAuthInputSchema.parse(input)).toEqual(input);
    expect(input).not.toHaveProperty('grantType');
    expect(McpAuthSchema.parse(input)).toEqual({ ...input, grantType: 'client_credentials' });
    for (const type of ['', 'none', 'no_auth']) {
      expect(McpAuthInputSchema.parse({ type })).toEqual({ type });
      expect(McpAuthSchema.parse({ type })).toBeUndefined();
    }
    expect(McpAuthInputSchema.safeParse(undefined).success).toBe(false);
    expect(McpAuthInputSchema.optional().parse(undefined)).toBeUndefined();
  });

  it('preserves both credential aliases and defers API-key placement defaults', () => {
    const input = { type: 'api_key', value: 'preferred', api_key: 'legacy' };
    expect(McpAuthInputSchema.parse(input)).toEqual(input);
    expect(McpAuthSchema.parse(input)).toEqual(input);
  });

  it.each(validInputs)(
    'rejects unknown authoring fields while retaining runtime stripping: %j',
    (auth) => {
      const input = { ...(auth as object), extra: { retainedInInput: true } };
      expect(McpAuthInputSchema.safeParse(input).success).toBe(false);
      expect(validateJson(input)).toBe(false);
      expect(McpAuthSchema.parse(input)).toEqual(McpAuthSchema.parse(auth));
      expect(A2AAuthSchema.parse(input)).toEqual(McpAuthSchema.parse(auth));
      expect(input.extra).toEqual({ retainedInInput: true });
    },
  );

  it('composes with request schemas and retains nested Zod error paths', () => {
    const requestSchema = z.object({ auth: McpAuthInputSchema });
    expect(requestSchema.parse({ auth: clientCredentials })).toEqual({ auth: clientCredentials });
    const result = requestSchema.safeParse({ auth: { type: 'api_key' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['auth']);
    }
  });

  it('preserves legacy schema exports and A2A normalization', () => {
    for (const name of [
      'ApiKeyAuthSchema',
      'BearerAuthSchema',
      'BasicAuthSchema',
      'NoAuthSchema',
      'OAuthClientCredentialsAuthSchema',
      'OAuthPasswordAuthSchema',
      'ProviderAuthSchema',
    ] as const) {
      expect(legacyAuth[name]).toBe(contractsAuth[name]);
    }
    expect(legacyAuth.OptionalProviderAuthSchema).toBe(McpAuthSchema);
    expect(A2AAuthSchema).toBe(McpAuthSchema);
    expect(A2AAuthSchema.parse({ type: 'none' })).toBeUndefined();
    expect(A2AAuthSchema.parse(clientCredentials)).toEqual({
      ...clientCredentials,
      grantType: 'client_credentials',
    });
  });

  it('infers distinct input and parsed types without any', () => {
    type OAuthInput = Extract<McpAuthInput, { type: 'oauth'; clientId: string }>;
    type OAuthParsed = Extract<McpAuthParsed, { type: 'oauth'; clientId: string }>;
    expectTypeOf<McpAuthInput>().not.toBeAny();
    expectTypeOf<McpAuthParsed>().not.toBeAny();
    expectTypeOf<OAuthInput['grantType']>().toEqualTypeOf<'client_credentials' | undefined>();
    expectTypeOf<OAuthParsed['grantType']>().toEqualTypeOf<'client_credentials'>();
    expectTypeOf<OAuthInput['scopes']>().toEqualTypeOf<string | string[] | undefined>();
    expectTypeOf<{ type: 'api_key' }>().not.toExtend<McpAuthInput>();
    expectTypeOf<{ type: 'bearer'; token: number }>().not.toExtend<McpAuthInput>();
    expectTypeOf<{ type: 'unknown' }>().not.toExtend<McpAuthInput>();
    expectTypeOf<{ type: 'api_key'; value: string }>().toExtend<McpAuthInput>();
    expectTypeOf<{ type: 'api_key'; api_key: string }>().toExtend<McpAuthInput>();
    expectTypeOf<undefined>().toExtend<McpAuthParsed>();
    expectTypeOf<undefined>().not.toExtend<McpAuthInput>();
  });
});
