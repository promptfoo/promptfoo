import Ajv from 'ajv';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';
import {
  HttpAuthInputJsonSchema,
  HttpAuthInputSchema,
  HttpProviderConfigInputJsonSchema,
  HttpProviderConfigInputSchema,
} from '../../src/contracts';
import { HttpProviderConfigFieldsSchema } from '../../src/contracts/providerConfig/http';
import { HttpMultipartConfigSchema as PortableMultipartSchema } from '../../src/contracts/providerConfig/httpMultipart';
import { HttpSignatureAuthSchema } from '../../src/contracts/providerConfig/httpSignature';
import { HttpProviderConfigSchema, SessionEndpointConfigSchema } from '../../src/providers/http';
import { HttpMultipartConfigSchema } from '../../src/providers/httpMultipart';

import type { HttpAuthInput, HttpProviderConfigInput } from '../../src/contracts';
import type { HttpProviderConfig } from '../../src/providers/http';

const multipart = { parts: [{ kind: 'file', name: 'document', source: { type: 'generated' } }] };
const validAuth = [
  { type: 'bearer', token: '{{ TOKEN }}' },
  { type: 'basic', username: '', password: '' },
  { type: 'api_key', value: '', placement: 'header', keyName: 'X-Key' },
  { type: 'api_key', value: '{{ KEY }}', placement: 'query', keyName: '{{ NAME }}' },
  {
    type: 'oauth',
    grantType: 'client_credentials',
    clientId: '',
    clientSecret: '',
    tokenUrl: '{{ URL }}',
    scopes: ['{{ SCOPE }}'],
  },
  { type: 'oauth', grantType: 'password', username: 'user', password: '', tokenUrl: '{{ URL }}' },
  { type: 'file', path: 'file:///nonexistent/auth.js:getToken' },
];
const invalidAuth = [
  { type: 'none' },
  { type: 'oauth', clientId: 'id', clientSecret: 'secret', tokenUrl: 'url' },
  { type: 'oauth', grantType: 'client_credentials', clientId: 'id', clientSecret: 'secret' },
  {
    type: 'oauth',
    grantType: 'password',
    username: 'user',
    password: '',
    tokenUrl: 'url',
    scopes: 'read write',
  },
  { type: 'api_key', value: 'key' },
  { type: 'api_key', api_key: 'key', placement: 'header', keyName: 'X-Key' },
  { type: 'file', path: '' },
  { type: 'bearer', token: 123 },
];
const validSignatures = [
  { type: 'pem', privateKey: '{{ KEY }}' },
  { type: 'pem', privateKeyPath: 'missing.pem' },
  { type: 'pem', certificateContent: 'cHJpdmF0ZS1rZXk=' },
  { type: 'jks', keystorePath: 'missing.jks' },
  { type: 'jks', keystoreContent: 'base64' },
  { type: 'jks', certificateContent: 'base64', certificatePassword: '{{ PASSWORD }}' },
  { type: 'pfx', pfxPath: 'missing.pfx' },
  { type: 'pfx', pfxContent: 'base64' },
  { type: 'pfx', certPath: 'cert.pem', keyPath: 'key.pem' },
  { type: 'pfx', certContent: 'base64', keyContent: 'base64' },
  { type: 'pfx', certificateContent: 'base64' },
  { privateKey: 'key', keyPassword: '{{ PASSWORD }}' },
  { privateKeyPath: 'key.pem' },
  { keystorePath: 'keys.jks' },
  { keystoreContent: 'base64' },
  { pfxPath: 'keys.pfx' },
  { pfxContent: 'base64' },
  { certPath: 'cert.pem', keyPath: 'key.pem' },
  { certificateContent: 'base64', certificateFilename: 'upload.P12' },
];
const invalidSignatures = [
  {},
  { type: 'pem' },
  { type: 'pem', privateKey: '' },
  { type: 'pem', pfxPath: 'wrong.pfx' },
  { type: 'jks', privateKeyPath: 'wrong.pem' },
  { type: 'pfx', certPath: 'cert.pem' },
  { type: 'pfx', certContent: 'base64' },
  { type: 'unknown', privateKey: 'key' },
  { certificateContent: 'base64' },
  { certificateContent: 'base64', certificateFilename: 'not-an-extensionpfx' },
  { certificateFilename: 'upload.pfx', privateKey: 'wrong-format' },
  { certificateFilename: 'upload.pem', keystorePath: 'wrong-format.jks' },
  { type: 'pem', privateKey: 'key', signatureValidityMs: '300000' },
];

describe.each([
  {
    type: 'pem',
    schema: HttpSignatureAuthSchema.options[1],
    validSources: [
      { privateKeyPath: 'key.pem' },
      { privateKey: 'key' },
      { privateKeyPath: 'key.pem', privateKey: 'key' },
      { privateKey: '' },
    ],
    invalidSources: [{}],
    error: 'Either privateKeyPath or privateKey must be provided for PEM type',
  },
  {
    type: 'jks',
    schema: HttpSignatureAuthSchema.options[2],
    validSources: [
      { keystorePath: 'keys.jks' },
      { keystoreContent: 'base64' },
      { keystorePath: 'keys.jks', keystoreContent: 'base64' },
      { keystoreContent: '' },
    ],
    invalidSources: [{}],
    error: 'Either keystorePath or keystoreContent must be provided for JKS type',
  },
  {
    type: 'pfx',
    schema: HttpSignatureAuthSchema.options[3],
    validSources: [
      { pfxPath: 'keys.pfx' },
      { pfxContent: 'base64' },
      { certPath: 'cert.pem', keyPath: 'key.pem' },
      { certContent: 'base64-cert', keyContent: 'base64-key' },
    ],
    invalidSources: [
      {},
      { pfxPath: '' },
      { pfxContent: '' },
      { certPath: 'cert.pem' },
      { keyPath: 'key.pem' },
      { certContent: 'base64-cert' },
      { keyContent: 'base64-key' },
      { certPath: 'cert.pem', keyContent: 'base64-key' },
      { certContent: 'base64-cert', keyPath: 'key.pem' },
    ],
    error:
      'Either pfxPath, pfxContent, both certPath and keyPath, or both certContent and keyContent must be provided for PFX type',
  },
])(
  'HTTP $type runtime signature variant in isolation',
  ({ type, schema, validSources, invalidSources, error }) => {
    it.each<Record<string, string | undefined>>(validSources)(
      'accepts supported key sources and applies runtime defaults: %j',
      (source) => {
        const input = { type, ...source };
        expect(schema.parse(input)).toEqual({
          ...input,
          signatureValidityMs: 300000,
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
        });
      },
    );

    it.each(invalidSources)('reports missing or incomplete key sources: %j', (source) => {
      const result = schema.safeParse({ type, ...source });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual([{ code: 'custom', path: [], message: error }]);
      }
    });
  },
);

describe('HTTP authoring contracts', () => {
  const validate = new Ajv({ strict: true, allowUnionTypes: true }).compile(
    HttpProviderConfigInputJsonSchema,
  );
  const validateAuth = new Ajv({ strict: true }).compile(HttpAuthInputJsonSchema);

  it.each(validAuth)('preserves HTTP auth semantics: %j', (auth) => {
    expect(HttpAuthInputSchema.parse(auth)).toEqual(auth);
    expect(validateAuth(auth), JSON.stringify(validateAuth.errors)).toBe(true);
    expect(HttpProviderConfigSchema.parse({ auth }).auth).toEqual(auth);
    expect(validate({ method: 'GET', auth })).toBe(true);
  });

  it.each(invalidAuth)('rejects invalid auth in Zod and exported schemas: %j', (auth) => {
    expect(HttpAuthInputSchema.safeParse(auth).success).toBe(false);
    expect(validateAuth(auth)).toBe(false);
    expect(validate({ method: 'GET', auth })).toBe(false);
    expect(HttpProviderConfigSchema.safeParse({ auth }).success).toBe(false);
  });

  it.each([
    { method: 'GET' },
    { body: {} },
    { body: [] },
    { method: '{{ METHOD }}', body: 'file://missing.json' },
    { request: 'file://missing.http', body: { ignored: true } },
    { multipart },
    { request: '', multipart },
    {
      body: { arbitrary: [1, true, null, { nested: '{{ VALUE }}' }] },
      tools: [{ custom: { schema: {} } }],
      tool_choice: { custom: true },
    },
    {
      method: 'GET',
      session: { url: '{{ URL }}', responseParser: 'data.body.id' },
      tokenEstimation: {},
    },
    {
      method: 'GET',
      headers: { 'X-Anything': '{{ HEADER }}' },
      queryParams: { anything: '{{ QUERY }}' },
    },
    ...validSignatures.map((signatureAuth) => ({ method: 'GET', signatureAuth })),
  ])('preserves raw authoring input with matching JSON Schema acceptance: %j', (input) => {
    expect(HttpProviderConfigInputSchema.parse(input)).toEqual(input);
    expect(validate(input), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([
    {},
    { method: 'POST' },
    { body: '' },
    { request: '' },
    { body: null },
    { body: true },
    { body: {}, multipart },
    { request: 'POST / HTTP/1.1', multipart },
    { method: 'GET', multipart },
    { multipart: { parts: [] } },
    { multipart: { parts: [{ kind: 'file', name: 'file', source: { type: 'path' } }] } },
    { method: 'GET', session: { url: 'url' } },
    { method: 'GET', session: { url: 'url', method: 'PUT', responseParser: 'data.id' } },
    { method: 'GET', headers: { 'X-Key': 123 } },
    { method: 'GET', maxRetries: -1 },
    { method: 'GET', tokenEstimation: { multiplier: 0 } },
    ...invalidSignatures.map((signatureAuth) => ({ method: 'GET', signatureAuth })),
  ])('rejects malformed complete configs in Zod and JSON Schema: %j', (input) => {
    expect(HttpProviderConfigInputSchema.safeParse(input).success).toBe(false);
    expect(validate(input), JSON.stringify(validate.errors)).toBe(false);
  });

  it.each([
    { method: 'GET', typo: true },
    { method: 'GET', auth: { ...validAuth[0], typo: true } },
    { method: 'GET', tls: { typo: true } },
    { method: 'GET', signatureAuth: { type: 'pem', privateKey: 'key', typo: true } },
    { method: 'GET', tokenEstimation: { typo: true } },
    { method: 'GET', session: { url: 'url', responseParser: 'data.id', typo: true } },
    { multipart: { parts: [{ kind: 'field', name: 'field', value: 'value', typo: true }] } },
    {
      multipart: {
        parts: [{ kind: 'file', name: 'file', source: { type: 'generated', typo: true } }],
      },
    },
  ])('rejects unknown authoring fields without tightening the runtime schema: %j', (input) => {
    expect(HttpProviderConfigInputSchema.safeParse(input).success).toBe(false);
    expect(validate(input)).toBe(false);
    expect(HttpProviderConfigSchema.safeParse(input).success).toBe(true);
  });

  it('preserves legacy defaults and signature normalization only at runtime', () => {
    const input = {
      multipart,
      session: { url: 'url', responseParser: 'data.id' },
      tls: {},
      tokenEstimation: {},
      signatureAuth: { type: 'pem', certificateContent: 'cHJpdmF0ZS1rZXk=' },
    };
    expect(HttpProviderConfigInputSchema.parse(input)).toEqual(input);
    expect(HttpProviderConfigSchema.parse(input)).toMatchObject({
      multipart: { parts: [{ source: { generator: 'basic-document', format: 'pdf' } }] },
      session: { method: 'POST' },
      tls: { rejectUnauthorized: true },
      tokenEstimation: { enabled: false, multiplier: 1.3 },
      signatureAuth: {
        type: 'pem',
        privateKey: 'private-key',
        signatureValidityMs: 300000,
        signatureAlgorithm: 'SHA256',
      },
    });
    expect(
      HttpProviderConfigInputSchema.safeParse({ method: 'GET', signatureAuth: { type: 'pem' } })
        .success,
    ).toBe(false);
    expect(HttpProviderConfigSchema.safeParse({ signatureAuth: { type: 'pem' } }).success).toBe(
      true,
    );
    expect(HttpProviderConfigSchema.parse({ body: {}, ignored: true })).not.toHaveProperty(
      'ignored',
    );
    expect(HttpMultipartConfigSchema).toBe(PortableMultipartSchema);
  });

  it('keeps functions and Buffers runtime-only and never executes a function during parsing', () => {
    const transform = vi.fn(() => 'output');
    for (const field of [
      'transformRequest',
      'transformResponse',
      'responseParser',
      'sessionParser',
      'validateStatus',
    ]) {
      const input = { method: 'GET', [field]: transform };
      expect(HttpProviderConfigInputSchema.safeParse(input).success).toBe(false);
      expect(HttpProviderConfigSchema.safeParse(input).success).toBe(true);
    }
    expect(
      SessionEndpointConfigSchema.safeParse({ url: 'url', responseParser: transform }).success,
    ).toBe(true);
    const input = { method: 'GET', tls: { pfx: Buffer.from('bundle') } };
    expect(HttpProviderConfigInputSchema.safeParse(input).success).toBe(false);
    expect(HttpProviderConfigSchema.safeParse(input).success).toBe(true);
    expect(HttpProviderConfigInputSchema.safeParse({ body: { callback: transform } }).success).toBe(
      false,
    );
    expect(HttpProviderConfigInputSchema.safeParse({ body: { value: Infinity } }).success).toBe(
      false,
    );
    expect(transform).not.toHaveBeenCalled();
  });

  it('exports metadata with no default injection or unrepresentable-type fallback', () => {
    expect(HttpProviderConfigInputJsonSchema).toEqual(
      z.toJSONSchema(HttpProviderConfigInputSchema, {
        target: 'draft-07',
        io: 'input',
        unrepresentable: 'throw',
        reused: 'ref',
      }),
    );
    expect(HttpProviderConfigFieldsSchema.shape.responseParser.meta()).toMatchObject({
      deprecated: true,
    });
    expect(HttpProviderConfigFieldsSchema.shape.body.description).toContain('intentionally open');
    expect(HttpProviderConfigInputSchema.parse({ method: 'GET' })).toEqual({ method: 'GET' });
  });

  it('keeps public documented types schema-derived', () => {
    expectTypeOf<HttpProviderConfigInput>().toExtend<
      z.input<typeof HttpProviderConfigInputSchema>
    >();
    expectTypeOf<
      z.input<typeof HttpProviderConfigInputSchema>
    >().toExtend<HttpProviderConfigInput>();
    expectTypeOf<HttpProviderConfig>().toEqualTypeOf<z.output<typeof HttpProviderConfigSchema>>();
    expectTypeOf<HttpAuthInput>().toEqualTypeOf<z.input<typeof HttpAuthInputSchema>>();
    expectTypeOf<{ method: 'POST' }>().not.toExtend<HttpProviderConfigInput>();
    expectTypeOf<{
      body: {};
      signatureAuth: { type: 'pem' };
    }>().not.toExtend<HttpProviderConfigInput>();
    expectTypeOf<{
      method: 'GET';
      transformResponse: () => string;
    }>().not.toExtend<HttpProviderConfigInput>();
  });

  it('preserves TLS pairing rules across serializable input and runtime validation', () => {
    for (const cert of [undefined, '', 'cert', [], ['cert']]) {
      for (const key of [undefined, '', 'key', [], ['key']]) {
        for (const pfx of [undefined, '', 'bundle']) {
          const input = JSON.parse(JSON.stringify({ method: 'GET', tls: { cert, key, pfx } }));
          const expected = HttpProviderConfigSchema.safeParse(input).success;
          expect(
            HttpProviderConfigInputSchema.safeParse(input).success,
            JSON.stringify(input),
          ).toBe(expected);
          expect(validate(input), JSON.stringify(input)).toBe(expected);
        }
      }
    }
    for (const tls of [
      { certPath: 'cert', keyPath: 'key' },
      { cert: 'cert', keyPath: 'key' },
      { certPath: 'cert', key: 'key' },
      { pfxPath: 'bundle', cert: 'cert' },
    ]) {
      expect(validate({ method: 'GET', tls })).toBe(true);
      expect(HttpProviderConfigInputSchema.safeParse({ method: 'GET', tls }).success).toBe(true);
    }
  });
});
