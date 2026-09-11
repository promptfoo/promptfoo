import { createCipheriv } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OTLPTracingExporter } from '../../../src/providers/openai/agents-tracing';
import { decodeExportTraceServiceRequest } from '../../../src/tracing/protobuf';

const mockFetchWithProxy = vi.hoisted(() => vi.fn());

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: mockFetchWithProxy,
}));

function getAttributes(span: any): Record<string, unknown> {
  return Object.fromEntries(
    span.attributes.map((attribute: any) => {
      const value = attribute.value;
      if (value.stringValue !== undefined) {
        return [attribute.key, value.stringValue];
      }
      if (value.intValue !== undefined) {
        return [attribute.key, Number(value.intValue)];
      }
      if (value.boolValue !== undefined) {
        return [attribute.key, value.boolValue];
      }
      if (value.doubleValue !== undefined) {
        return [attribute.key, value.doubleValue];
      }
      return [attribute.key, value];
    }),
  );
}

function createJwe(
  protectedHeader: Record<string, string> | null = { alg: 'dir', enc: 'A256GCM' },
) {
  const header = protectedHeader
    ? Buffer.from(JSON.stringify(protectedHeader)).toString('base64url')
    : '';
  const iv = Buffer.alloc(12, 1);
  const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 2), iv);
  cipher.setAAD(Buffer.from(header));
  const encrypted = Buffer.concat([cipher.update('fixture credential'), cipher.final()]);
  return {
    ...(header && { protected: header }),
    encrypted_key: '',
    iv: iv.toString('base64url'),
    ciphertext: encrypted.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  };
}

describe('OTLPTracingExporter', () => {
  beforeEach(() => {
    mockFetchWithProxy.mockReset();
    mockFetchWithProxy.mockResolvedValue({ ok: true });
  });

  async function exportCustomData(data: Record<string, unknown>, format: 'json' | 'protobuf') {
    const exporter = new OTLPTracingExporter();
    await exporter.export(
      [data, { result: 'healthy' }].map((attributes, index) => ({
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: `span_0123456789abcde${index}`,
        spanData: { type: 'custom', name: index ? 'healthy' : 'lookup', data: attributes },
        traceMetadata: { 'promptfoo.otlp_format': format },
        error: null,
      })) as any,
    );
    expect(mockFetchWithProxy).toHaveBeenCalledOnce();
    const body = mockFetchWithProxy.mock.calls[0][1].body;
    const payload =
      format === 'protobuf' ? await decodeExportTraceServiceRequest(body) : JSON.parse(body);
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(2);
    expect(getAttributes(spans[1]).result).toBe('healthy');
    return { attributes: getAttributes(spans[0]), payload };
  }

  it.each(['json', 'protobuf'] as const)(
    'redacts JWT headers containing JSON whitespace in %s',
    async (format) => {
      const tokens = ['{ "alg": "RS256" }', '\t{\r\n"alg":"RS256"}\n'].map(
        (header) => `${Buffer.from(header).toString('base64url')}.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl`,
      );
      const identifier = 'a-'.repeat(20_000);
      const { attributes, payload } = await exportCustomData(
        { result: tokens.join('\n'), module: 'package.module.method', identifier },
        format,
      );
      expect(attributes.result).toBe('<redacted>\n<redacted>');
      expect(attributes.module).toBe('package.module.method');
      expect(attributes.identifier).toBe(identifier);
      for (const token of tokens) {
        expect(JSON.stringify(payload)).not.toContain(token);
      }
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts direct-encryption compact JWE credentials in %s',
    async (format) => {
      const token = Object.values(createJwe()).join('.');
      const { attributes } = await exportCustomData(
        { result: token, module: 'package.module.method' },
        format,
      );
      expect(attributes.result).toBe('<redacted>');
      expect(attributes.module).toBe('package.module.method');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts JWE JSON objects while preserving ordinary ciphertext metadata in %s',
    async (format) => {
      const flattened = createJwe();
      const { encrypted_key, ...envelope } = flattened;
      const general = { ...envelope, recipients: [{ encrypted_key }] };
      const ordinary = { ciphertext: 'public data', tag: 'version-1' };
      const input = { flattened, general, ordinary };
      const { attributes, payload } = await exportCustomData(
        { native: input, result: JSON.stringify(input), root: JSON.stringify(flattened) },
        format,
      );
      for (const key of ['native', 'result']) {
        expect(JSON.parse(attributes[key] as string)).toEqual({
          flattened: '<redacted>',
          general: '<redacted>',
          ordinary,
        });
      }
      expect(JSON.parse(attributes.root as string)).toBe('<redacted>');
      expect(JSON.stringify(payload)).not.toContain(flattened.ciphertext);
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts JWE JSON with combined or unprotected headers in %s',
    async (format) => {
      const { encrypted_key, ...split } = createJwe({ enc: 'A256GCM' });
      const { encrypted_key: directKey, ...unprotected } = createJwe(null);
      const values = {
        splitGeneral: { ...split, recipients: [{ encrypted_key, header: { alg: 'dir' } }] },
        splitShared: { ...split, encrypted_key, unprotected: { alg: 'dir' } },
        shared: {
          ...unprotected,
          encrypted_key: directKey,
          unprotected: { alg: 'dir', enc: 'A256GCM' },
        },
        flattened: {
          ...unprotected,
          encrypted_key: directKey,
          header: { alg: 'dir', enc: 'A256GCM' },
        },
        general: {
          ...unprotected,
          recipients: [{ encrypted_key: directKey, header: { alg: 'dir', enc: 'A256GCM' } }],
        },
      };
      const { attributes, payload } = await exportCustomData(
        { native: values, serialized: JSON.stringify(values) },
        format,
      );
      const expected = Object.fromEntries(Object.keys(values).map((key) => [key, '<redacted>']));
      expect(JSON.parse(attributes.native as string)).toEqual(expected);
      expect(JSON.parse(attributes.serialized as string)).toEqual(expected);
      expect(JSON.stringify(payload)).not.toContain(split.ciphertext);
      expect(JSON.stringify(payload)).not.toContain(unprotected.ciphertext);
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts YAML credential flow collections in %s',
    async (format) => {
      const { attributes, payload } = await exportCustomData(
        {
          sequence: 'tokens: [opaque-token-one, opaque-token-two]',
          mapping: 'password: {primary: opaque-secret}',
          nested: 'config: {password: {primary: opaque-nested}}',
          flowSequence: '[{password: {primary: opaque-sequence}}]',
          multiline: 'config:\n  credentials: [\n    opaque-first,\n    opaque-second\n  ]',
          ordinary: 'names: [first, second]',
        },
        format,
      );
      expect(attributes.sequence).toBe('<redacted>');
      expect(attributes.mapping).toBe('<redacted>');
      expect(attributes.nested).toBe('<redacted>');
      expect(attributes.flowSequence).toBe('<redacted>');
      expect(attributes.multiline).toBe('<redacted>');
      expect(attributes.ordinary).toBe('names: [first, second]');
      expect(JSON.stringify(payload)).not.toContain('opaque-');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts netrc password and account clauses in %s',
    async (format) => {
      const { attributes, payload } = await exportCustomData(
        {
          single: 'machine api.example login buildbot password opaque/value',
          commented:
            'machine api.example\n# deployment account\nlogin buildbot\npassword opaque/commented',
          quoted: 'machine api.example\nlogin buildbot\npassword "opaque quoted phrase"',
          fallback: 'default login buildbot account opaque-account',
          ordinary: 'machine learning uses account metadata',
        },
        format,
      );
      expect(attributes.single).toBe('<redacted>');
      expect(attributes.commented).toBe('<redacted>');
      expect(attributes.quoted).toBe('<redacted>');
      expect(attributes.fallback).toBe('<redacted>');
      expect(attributes.ordinary).toBe('machine learning uses account metadata');
      expect(JSON.stringify(payload)).not.toContain('opaque');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts complete quoted YAML and ODBC credentials in %s',
    async (format) => {
      const { attributes, payload } = await exportCustomData(
        {
          yaml: "password: 'opaque''suffix'",
          flow: 'config: {passphrase: "opaque nested phrase"}',
          nested: "config: [{password: 'opaque''nested'}]",
          odbc: 'Driver={ODBC Driver};UID=buildbot;PWD={opaque;credential};Database=public',
          escapedOdbc: 'Driver={ODBC Driver};PWD={opaque}};suffix};Database=public',
          xml: '<settings><password>opaque/xml</password></settings>',
          public: 'config: {description: "public phrase"}',
        },
        format,
      );
      expect(attributes.yaml).toBe("password: '<redacted>'");
      expect(attributes.flow).toBe('config: {passphrase: "<redacted>"}');
      expect(attributes.nested).toBe("config: [{password: '<redacted>'}]");
      expect(attributes.odbc).toBe(
        'Driver={ODBC Driver};UID=buildbot;PWD=<redacted>;Database=public',
      );
      expect(attributes.escapedOdbc).toBe('Driver={ODBC Driver};PWD=<redacted>;Database=public');
      expect(attributes.xml).toBe('<redacted>');
      expect(attributes.public).toBe('config: {description: "public phrase"}');
      expect(JSON.stringify(payload)).not.toMatch(/opaque|suffix|credential/);
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts PGP armor and TLS private-key fields in %s',
    async (format) => {
      const keys = {
        'client-key-data': 'opaque/base64',
        client_key: 'opaque/client',
        ssl_key: 'opaque/ssl',
        tlsKey: 'opaque/tls',
        signing_key: 'opaque/signing',
        encryptionKey: 'opaque/encryption',
        tls_key_algorithm: 'RSA',
        ssl_key_type: 'EC',
        client_key_id: 'kid-123',
        'client-certificate-data': 'public certificate',
      };
      const { attributes, payload } = await exportCustomData(
        {
          armor:
            '-----BEGIN PGP PRIVATE KEY BLOCK-----\nopaque/base64\n-----END PGP PRIVATE KEY BLOCK-----',
          native: keys,
          serialized: JSON.stringify(keys),
        },
        format,
      );
      expect(attributes.armor).toBe('<redacted>');
      for (const name of ['native', 'serialized']) {
        expect(JSON.parse(attributes[name] as string)).toEqual({
          'client-key-data': '<redacted>',
          client_key: '<redacted>',
          ssl_key: '<redacted>',
          tlsKey: '<redacted>',
          signing_key: '<redacted>',
          encryptionKey: '<redacted>',
          tls_key_algorithm: 'RSA',
          ssl_key_type: 'EC',
          client_key_id: 'kid-123',
          'client-certificate-data': 'public certificate',
        });
      }
      expect(JSON.stringify(payload)).not.toContain('opaque/');
    },
  );

  it.each(['json', 'protobuf'] as const)('redacts byte array attributes in %s', async (format) => {
    const { attributes, payload } = await exportCustomData(
      { native: { bytes: Buffer.from('sk-opaque-byte-secret') } },
      format,
    );

    expect(JSON.parse(attributes.native as string)).toEqual({ bytes: '<redacted>' });
    expect(JSON.stringify(payload)).not.toContain('opaque-byte-secret');
  });

  it.each(['json', 'protobuf'] as const)(
    'redacts remaining credential text and structured shapes in %s',
    async (format) => {
      const { attributes, payload } = await exportCustomData(
        {
          text: 'Authorization=Custom opaque-auth curl --user alice:opaque-user',
          embedded: 'Request: "{\\"p\\u0061ssword\\":\\"opaque-embedded\\"}"',
          native: {
            client_assertion: 'opaque-assertion',
            client_assertion_type: 'public-type',
            passwords: 'opaque-passwords',
            env: { PGPASSWORD: 'opaque-pgpassword' },
            argv: ['Authorization', 'opaque-header', 'Content-Type'],
            encoded: '{"kty":"RSA","d":"opaque-jwk"}',
          },
        },
        format,
      );

      expect(attributes.text).not.toContain('opaque-');
      expect(attributes.embedded).not.toContain('opaque-');
      expect(JSON.parse(attributes.native as string)).toMatchObject({
        client_assertion: '<redacted>',
        client_assertion_type: 'public-type',
        passwords: '<redacted>',
        env: { PGPASSWORD: '<redacted>' },
        argv: ['Authorization', '<redacted>', 'Content-Type'],
        encoded: '{"kty":"RSA","d":"<redacted>"}',
      });
      expect(JSON.stringify(payload)).not.toContain('opaque-');
    },
  );

  it.each(['json', 'protobuf'] as const)('redacts plural key collections in %s', async (format) => {
    const input = {
      api_keys: ['opaque/one', 'opaque/two'],
      apiKeys: { primary: 'opaque/three' },
      apikeys: ['opaque/four'],
      accessKeys: ['opaque/five'],
      private_keys: ['opaque/six'],
      cache_keys: ['public identifier'],
    };
    const { attributes, payload } = await exportCustomData(
      { native: input, serialized: JSON.stringify(input) },
      format,
    );
    for (const name of ['native', 'serialized']) {
      expect(JSON.parse(attributes[name] as string)).toEqual({
        api_keys: '<redacted>',
        apiKeys: '<redacted>',
        apikeys: '<redacted>',
        accessKeys: '<redacted>',
        private_keys: '<redacted>',
        cache_keys: ['public identifier'],
      });
    }
    expect(JSON.stringify(payload)).not.toContain('opaque/');
  });

  it.each(['json', 'protobuf'] as const)(
    'bounds recipient inspection across repeated native envelopes in %s',
    async (format) => {
      let reads = 0;
      const recipient = {
        get header() {
          reads++;
          return {};
        },
      };
      const envelope = {
        ciphertext: 'ordinary',
        tag: 'ordinary',
        recipients: Array(200).fill(recipient),
      };
      const { attributes } = await exportCustomData({ native: Array(200).fill(envelope) }, format);
      expect(attributes.native).toBe('<redacted>');
      expect(reads).toBeLessThanOrEqual(10_000);
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts complete plain YAML credential scalars in %s',
    async (format) => {
      const { attributes } = await exportCustomData(
        {
          inline: 'passphrase: correct horse battery staple\nname: fixture',
          continued: 'config:\n  password:\n    correct horse\n    battery staple',
          ordinary: 'description: correct horse battery staple',
        },
        format,
      );
      expect(attributes.inline).toBe('<redacted>');
      expect(attributes.continued).toBe('<redacted>');
      expect(attributes.ordinary).toBe('description: correct horse battery staple');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts scoped npmrc credentials and preserves registry settings in %s',
    async (format) => {
      const npmrc = [
        '//registry.example/:_password=b3BhcXVlL3Bhc3N3b3Jk',
        '//registry.example/path/:_auth=opaque-base64-credential',
        '//registry.example/:_authToken="opaque token value"',
        '//registry.example/:username=fixture-user',
        'registry=https://registry.example/',
      ].join('\n');
      const { attributes } = await exportCustomData({ result: npmrc }, format);
      expect(attributes.result).toBe(
        [
          '//registry.example/:_password=<redacted>',
          '//registry.example/path/:_auth=<redacted>',
          '//registry.example/:_authToken="<redacted>"',
          '//registry.example/:username=fixture-user',
          'registry=https://registry.example/',
        ].join('\n'),
      );
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts alternating raw header values in native and serialized data in %s',
    async (format) => {
      const rawHeaders = [
        'Authorization',
        'opaque-header-proof',
        'Content-Type',
        'application/json',
        'Cookie',
        'opaque-cookie-proof',
      ];
      const { attributes, payload } = await exportCustomData(
        { native: { rawHeaders }, result: JSON.stringify({ rawHeaders }) },
        format,
      );
      for (const key of ['native', 'result']) {
        expect(JSON.parse(attributes[key] as string)).toEqual({
          rawHeaders: [
            'Authorization',
            '<redacted>',
            'Content-Type',
            'application/json',
            'Cookie',
            '<redacted>',
          ],
        });
      }
      expect(JSON.stringify(payload)).not.toContain('opaque-');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'preserves code following an Authorization assignment in %s',
    async (format) => {
      const { attributes } = await exportCustomData(
        {
          script: 'enum Header { Authorization = "Authorization", ContentType = "Content-Type" }',
          header: 'Authorization=Digest realm="service", response="opaque-proof"',
        },
        format,
      );
      expect(attributes.script).toBe(
        'enum Header { Authorization = "<redacted>", ContentType = "Content-Type" }',
      );
      expect(attributes.header).toBe('Authorization=<redacted>');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts case-varied header records in %s',
    async (format) => {
      const records = [
        { Name: 'Authorization', Value: 'opaque/header-value' },
        { KEY: 'X-Api-Key', VALUE: 'opaque/api-value' },
        { Name: 'Content-Type', Value: 'application/json' },
      ];
      const { attributes, payload } = await exportCustomData(
        { records: JSON.stringify(records) },
        format,
      );
      expect(JSON.parse(attributes.records as string)).toEqual([
        { Name: 'Authorization', Value: '<redacted>' },
        { KEY: 'X-Api-Key', VALUE: '<redacted>' },
        records[2],
      ]);
      expect(JSON.stringify(payload)).not.toContain('opaque/');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts private JWK parameters and retains public fields in %s',
    async (format) => {
      const rsa = {
        kty: 'RSA',
        n: 'public-modulus',
        e: 'AQAB',
        d: 'private-exponent',
        p: 'private-prime-p',
        q: 'private-prime-q',
        dp: 'private-dp',
        dq: 'private-dq',
        qi: 'private-qi',
        oth: [{ r: 'private-r', d: 'private-d', t: 'private-t' }],
      };
      const keys = [
        rsa,
        { kty: 'RSA', n: 'public-modulus', e: 'AQAB' },
        { kty: 'EC', crv: 'P-256', x: 'public-x', y: 'public-y', d: 'private-ec-d' },
        { kty: 'OKP', crv: 'Ed25519', x: 'public-x', d: 'private-okp-d' },
        { kty: 'oct', k: 'private-symmetric' },
      ];
      const { attributes, payload } = await exportCustomData({ key_set: { keys } }, format);
      const sanitized = JSON.parse(attributes.key_set as string).keys;
      expect(sanitized).toEqual([
        {
          ...rsa,
          d: '<redacted>',
          p: '<redacted>',
          q: '<redacted>',
          dp: '<redacted>',
          dq: '<redacted>',
          qi: '<redacted>',
          oth: '<redacted>',
        },
        keys[1],
        { ...keys[2], d: '<redacted>' },
        { ...keys[3], d: '<redacted>' },
        { kty: 'oct', k: '<redacted>' },
      ]);
      expect(JSON.stringify(payload)).not.toContain('private-');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'bounds deeply nested native attributes before normalization in %s',
    async (format) => {
      let nested: unknown = 'deep-private-canary';
      for (let depth = 0; depth < 20_000; depth++) {
        nested = [nested];
      }
      const { attributes, payload } = await exportCustomData(
        { nested, details: { count: 2n, label: 'public' } },
        format,
      );
      expect(JSON.parse(attributes.details as string)).toEqual({ count: '2', label: 'public' });
      expect(JSON.stringify(payload)).not.toContain('deep-private-canary');
      expect(JSON.stringify(payload)).toContain('<redacted>');
      expect(JSON.stringify(payload).length).toBeLessThan(10_000);
    },
  );

  it('keeps provider token counts standard and namespaces Promptfoo totals', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        startedAt: '2026-05-06T12:00:00.000Z',
        endedAt: '2026-05-06T12:00:01.000Z',
        spanData: {
          type: 'generation',
          model: 'gpt-4.1',
          usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
        },
        traceMetadata: {},
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('chat gpt-4.1');
    expect(span.kind).toBe(3); // OTLP SpanKind.CLIENT
    expect(getAttributes(span)).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'openai',
      'gen_ai.request.model': 'gpt-4.1',
      'gen_ai.usage.input_tokens': 12,
      'gen_ai.usage.output_tokens': 8,
      'promptfoo.usage.total_tokens': 20,
    });
    expect(getAttributes(span)).not.toHaveProperty('gen_ai.usage.total_tokens');
  });

  it('maps Responses API spans into model inference spans without creating duplicates', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        startedAt: '2026-05-06T12:00:00.000Z',
        endedAt: '2026-05-06T12:00:01.000Z',
        spanData: {
          type: 'response',
          response_id: 'resp_123',
          _response: {
            id: 'resp_123',
            model: 'gpt-4.1',
            usage: {
              input_tokens: 120,
              output_tokens: 35,
              total_tokens: 155,
              input_tokens_details: { cached_tokens: 40 },
              output_tokens_details: { reasoning_tokens: 12 },
            },
          },
        },
        traceMetadata: {},
        error: null,
      },
    ]);

    const spans = payload.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('chat gpt-4.1');
    expect(spans[0].kind).toBe(3); // OTLP SpanKind.CLIENT
    expect(getAttributes(spans[0])).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'openai',
      'gen_ai.response.model': 'gpt-4.1',
      'gen_ai.response.id': 'resp_123',
      'gen_ai.usage.input_tokens': 120,
      'gen_ai.usage.output_tokens': 35,
      'gen_ai.usage.cache_read.input_tokens': 40,
      'gen_ai.usage.reasoning.output_tokens': 12,
      'openai.api.type': 'responses',
      'openai.agents.span_type': 'response',
      'openai.response_id': 'resp_123',
      'promptfoo.usage.total_tokens': 155,
    });
    expect(getAttributes(spans[0])).not.toHaveProperty('gen_ai.request.model');
  });

  it('keeps requested model aliases distinct from returned deployment identifiers', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        spanData: {
          type: 'response',
          response_id: 'resp_123',
          _response: { id: 'resp_123', model: 'gpt-4.1-2025-04-14' },
        },
        traceMetadata: { 'promptfoo.request_model': 'support-agent-alias' },
        error: null,
      },
    ]);

    const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
    expect(attributes).toMatchObject({
      'gen_ai.request.model': 'support-agent-alias',
      'gen_ai.response.model': 'gpt-4.1-2025-04-14',
    });
    expect(attributes).not.toHaveProperty('trace.metadata.promptfoo.request_model');
  });

  it.each([{ format: 'json' }, { format: 'protobuf' }] as const)(
    'redacts structured and quoted credential forms in $format exports',
    async ({ format }) => {
      const exporter = new OTLPTracingExporter();
      const input =
        '{"jwt":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_value",' +
        '"authorization_endpoint":"https://issuer.example/authorize",' +
        '"callback":"https://host/?access_token=secret\\\"suffix",' +
        '"url":"postgres://alice:s3cr3t@db.example/app",' +
        '"headers":[["Authorization","Bearer opaque/value"]]}';
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: { type: 'function', name: 'lookup', input },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: new Error(
            'apiKey: "tiny"; access_token = \'opaque/value\'; https://blob.example/x?sig=opaque%2Fsignature',
          ),
        } as any,
      ]);

      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const exportedSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];
      const attributes = getAttributes(exportedSpan);
      const arguments_ = JSON.parse(attributes['tool.arguments'] as string);
      expect(arguments_).toMatchObject({
        jwt: '<redacted>',
        authorization_endpoint: 'https://issuer.example/authorize',
        callback: 'https://host/?access_token=<redacted>"suffix',
        url: 'postgres://<redacted>@db.example/app',
        headers: [['Authorization', '<redacted>']],
      });
      expect(exportedSpan.status.message).not.toContain('tiny');
      expect(exportedSpan.status.message).not.toContain('opaque/value');
      expect(exportedSpan.status.message).not.toContain('opaque%2Fsignature');
    },
  );

  it.each(
    [
      {
        name: 'URI authority credentials',
        input: {
          cache_url: 'redis://:opaque-password@cache.example/0',
          request_url: 'https://opaque-token@host/',
        },
        expected: {
          cache_url: 'redis://<redacted>@cache.example/0',
          request_url: 'https://<redacted>@host/',
        },
      },
      {
        name: 'named header records',
        input: {
          headers: [
            { name: 'Authorization', value: 'Bearer opaque/value' },
            { key: 'X-Api-Key', value: 'tiny' },
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
        expected: {
          headers: [
            { name: 'Authorization', value: '<redacted>' },
            { key: 'X-Api-Key', value: '<redacted>' },
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
      },
      {
        name: 'signature metadata',
        input: {
          signature_algorithm: 'HMAC-SHA256',
          signature_format: 'DER',
          signature_scheme: 'RSA-PSS',
          signature_encoding: 'base64',
          function_signature: 'lookup(id: string)',
          signature: 'opaque/value',
        },
        expected: {
          signature_algorithm: 'HMAC-SHA256',
          signature_format: 'DER',
          signature_scheme: 'RSA-PSS',
          signature_encoding: 'base64',
          function_signature: 'lookup(id: string)',
          signature: '<redacted>',
        },
      },
      {
        name: 'credential map keys',
        input: { api_key: 'tiny', sessions: { 'sk-abcdefghijklmnopqrstuvwxyz': true } },
        expected: { api_key: '<redacted>', sessions: { '<REDACTED_API_KEY>': true } },
      },
    ].flatMap((testCase) => ['json', 'protobuf'].map((format) => ({ ...testCase, format }))),
  )('sanitizes $name in $format exports', async ({ input, expected, format }) => {
    await new OTLPTracingExporter().export([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        spanData: { type: 'function', name: 'lookup', input: JSON.stringify(input) },
        traceMetadata: { 'promptfoo.otlp_format': format },
        error: null,
      } as any,
    ]);
    const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
    const payload =
      format === 'protobuf'
        ? await decodeExportTraceServiceRequest(body as Uint8Array)
        : JSON.parse(body as string);
    const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
    expect(JSON.parse(attributes['tool.arguments'] as string)).toEqual(expected);
  });

  it.each(['json', 'protobuf'] as const)(
    'preserves scientific notation while redacting $format tool arguments',
    async (format) => {
      const exporter = new OTLPTracingExporter();
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: {
            type: 'function',
            name: 'lookup',
            input: '{"access_token":"tiny","amount":1e400,"underflow":1e-4000}',
          },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        } as any,
      ]);

      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      expect(attributes['tool.arguments']).toBe(
        '{"access_token":"<redacted>","amount":1e400,"underflow":1e-4000}',
      );
    },
  );

  it.each([
    {
      description: 'explicit custom provider metadata',
      model: 'production-deployment',
      modelConfig: { provider: 'azure' },
      metadata: {},
      expectedProvider: 'azure',
    },
    {
      description: 'provider-prefixed custom models',
      model: 'anthropic/claude-sonnet-4-5',
      modelConfig: undefined,
      metadata: {},
      expectedProvider: 'anthropic',
    },
    {
      description: 'provider metadata propagated from a custom model object',
      model: 'custom-deployment',
      modelConfig: undefined,
      metadata: { 'promptfoo.model_provider': 'litellm' },
      expectedProvider: 'litellm',
    },
  ])(
    'preserves $description on generation spans',
    ({ model, modelConfig, metadata, expectedProvider }) => {
      const exporter = new OTLPTracingExporter() as any;
      const payload = exporter.transformToOTLP([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: { type: 'generation', model, model_config: modelConfig },
          traceMetadata: metadata,
          error: null,
        },
      ]);

      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      expect(attributes['gen_ai.provider.name']).toBe(expectedProvider);
      expect(attributes).not.toHaveProperty('trace.metadata.promptfoo.model_provider');
    },
  );

  it('omits provider attribution when a custom model backend cannot be identified', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        spanData: { type: 'generation', model: 'private-customer-deployment' },
        traceMetadata: {},
        error: null,
      },
    ]);

    expect(getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0])).not.toHaveProperty(
      'gen_ai.provider.name',
    );
  });

  it('exports protobuf to protobuf-only receivers', async () => {
    const exporter = new OTLPTracingExporter();
    const span = {
      type: 'trace.span',
      traceId: 'trace_0123456789abcdef0123456789abcdef',
      spanId: 'span_0123456789abcdef',
      spanData: { type: 'generation', model: 'gpt-4.1' },
      traceMetadata: {
        'promptfoo.otlp_endpoint': 'http://127.0.0.1:14318',
        'promptfoo.otlp_format': 'protobuf',
      },
      error: null,
    };

    await exporter.export([span as any]);

    expect(mockFetchWithProxy).toHaveBeenCalledWith(
      'http://127.0.0.1:14318/v1/traces',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-protobuf' },
        body: expect.any(Uint8Array),
      }),
    );
    const request = mockFetchWithProxy.mock.calls[0][1];
    const decoded = await decodeExportTraceServiceRequest(request.body);
    expect(decoded.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('chat gpt-4.1');
  });

  it('keeps explicitly configured and default destinations on JSON', async () => {
    const exporter = new OTLPTracingExporter();
    const span = {
      type: 'trace.span',
      traceId: 'trace_0123456789abcdef0123456789abcdef',
      spanId: 'span_0123456789abcdef',
      spanData: { type: 'generation', model: 'gpt-4.1' },
      traceMetadata: { 'promptfoo.otlp_endpoint': 'https://collector.example.com:4318' },
      error: null,
    };

    await exporter.export([span as any]);

    expect(mockFetchWithProxy).toHaveBeenCalledWith(
      'https://collector.example.com:4318/v1/traces',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      }),
    );
  });

  it('keeps Responses API spans useful when the SDK exposes only a response identifier', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        spanData: { type: 'response', response_id: 'resp_partial' },
        traceMetadata: {},
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('chat unknown-model');
    expect(getAttributes(span)).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'openai',
      'openai.api.type': 'responses',
      'gen_ai.response.id': 'resp_partial',
    });
    expect(getAttributes(span)).not.toHaveProperty('gen_ai.request.model');
  });

  it('maps agent runs into standard agent invocation spans', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        spanData: { type: 'agent', name: 'Support Agent', tools: ['lookup_order'] },
        traceMetadata: {},
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('invoke_agent Support Agent');
    expect(span.kind).toBe(1); // OTLP SpanKind.INTERNAL
    expect(getAttributes(span)).toMatchObject({
      'gen_ai.operation.name': 'invoke_agent',
      'gen_ai.agent.name': 'Support Agent',
      'agent.name': 'Support Agent',
    });
  });

  it('uses Promptfoo service resources without exposing internal routing metadata', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        spanData: { type: 'response', response_id: 'resp_123' },
        traceMetadata: { 'promptfoo.service_name': 'custom-promptfoo-service' },
        error: null,
      },
      {
        type: 'trace.span',
        traceId: 'trace_abcdef0123456789abcdef0123456789',
        spanId: 'span_abcdef0123456789',
        parentId: null,
        spanData: { type: 'response', response_id: 'resp_456' },
        traceMetadata: {},
        error: null,
      },
    ]);

    expect(payload.resourceSpans).toHaveLength(2);
    expect(payload.resourceSpans[0].resource.attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'custom-promptfoo-service' } },
    ]);
    expect(payload.resourceSpans[1].resource.attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'promptfoo' } },
    ]);
    expect(getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0])).not.toHaveProperty(
      'trace.metadata.promptfoo.service_name',
    );
  });

  it('maps function spans into Promptfoo trajectory-friendly tool attributes', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        startedAt: '2026-05-06T12:00:00.000Z',
        endedAt: '2026-05-06T12:00:01.000Z',
        spanData: {
          type: 'function',
          name: 'lookup_order',
          input: '{"order_id":"123"}',
          output: '{"status":"shipped"}',
        },
        traceMetadata: {
          'evaluation.id': 'eval-1',
          'test.case.id': 'case-1',
          'promptfoo.parent_span_id': 'fedcba9876543210',
        },
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('execute_tool lookup_order');
    expect(getAttributes(span)).toMatchObject({
      'evaluation.id': 'eval-1',
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'lookup_order',
      'openai.agents.span_type': 'function',
      'test.case.id': 'case-1',
      'tool.arguments': '{"order_id":"123"}',
      'tool.name': 'lookup_order',
      'tool.output': '{"status":"shipped"}',
    });
    expect(span.parentSpanId).toBe(Buffer.from('fedcba9876543210', 'hex').toString('base64'));
  });

  it.each(['json', 'protobuf'] as const)(
    'redacts credentials from tool data, metadata, and error messages in %s exports',
    async (format) => {
      const exporter = new OTLPTracingExporter();
      const apiKey = 'sk-abcdefghijklmnopqrstuvwxyz';
      const sessionToken = 'agent-session-token-value-123456789012345';
      const metadataSecret = 'customer-credential-without-a-known-prefix';
      const accessToken = 'opaque.value/with+arbitrary=chars';
      const clientSecret = 'tiny';
      const refreshToken = 'renew?credential/value';
      const credentials = 'opaque-credential-bundle';
      const clientCredentials = 'oauth-client-bundle';
      const secrets = 'opaque-secret-bundle';
      const tokens = 'opaque-token-bundle';
      const authorization = 'Bearer opaque/container-value';
      const cookie = 'opaque-cookie-session';
      const callback = `https://host/callback?access_token=${accessToken}&token_count=12`;
      const colonToken = 'colon-opaque/value';
      const colonCookie = 'colon-cookie-session';
      const headerCredential = 'header-opaque.value/with+arbitrary=chars';
      const encodedCredential = 'encoded-query-opaque/value';
      const secondaryCookie = 'csrf-cookie-opaque/value';
      const equalsCredential = 'equals-header-opaque/value';
      const digestCredential = 'digest-response-opaque/value';
      const negotiateCredential = 'negotiate-opaque/value';
      const awsCredential = 'aws-signature-opaque/value';
      const encodedCallback = `https://host/callback?%61ccess_token=${encodedCredential}`;
      const logDetails = [
        `access_token: ${colonToken}`,
        `Cookie: session=${colonCookie}; csrf=${secondaryCookie}`,
        `Authorization: Bearer ${headerCredential}`,
        `Authorization=Basic ${equalsCredential}`,
        `Authorization: Digest realm="accounts;production", response="${digestCredential}"`,
        `Authorization=Negotiate ${negotiateCredential}`,
        `Authorization: AWS4-HMAC-SHA256 Credential=account, SignedHeaders=host;x-amz-date, Signature=${awsCredential}`,
      ].join('\n');
      const evaluationId = 'a'.repeat(64);
      const testCaseId = 'b'.repeat(64);
      const span = {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        spanData: {
          type: 'function',
          name: 'lookup_account',
          input: JSON.stringify({
            apiKey,
            accountId: 'account-123',
            access_token: accessToken,
            callback,
            encodedCallback,
            credentials,
            clientCredentials,
            authorization: [authorization],
            token_count: 12,
            token_type: 'Bearer',
            token_ids: [101, 102],
            token_endpoint: 'https://issuer.example.com/oauth/token',
            token_url: 'https://issuer.example.com/token',
            secretary: 'Alice',
            logDetails,
            nested: [{ refreshToken }],
          }),
          output: JSON.stringify({
            token: sessionToken,
            client_secret: clientSecret,
            secrets,
            tokens,
            cookie: { session: cookie },
          }),
        },
        traceMetadata: {
          [apiKey]: 'metadata-key',
          customerApiKey: metadataSecret,
          clientCredentials,
          'evaluation.id': evaluationId,
          'test.case.id': testCaseId,
          'promptfoo.otlp_format': format,
        },
        error: new Error(
          `Authentication failed for ${apiKey}: ${JSON.stringify({
            client_secret: clientSecret,
            access_token: accessToken,
          })}; ${callback}; ${logDetails}`,
        ),
      };

      await exporter.export([span as any]);

      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const serializedPayload = JSON.stringify(payload);
      expect(serializedPayload).not.toContain(apiKey);
      expect(serializedPayload).not.toContain(sessionToken);
      expect(serializedPayload).not.toContain(metadataSecret);
      expect(serializedPayload).not.toContain(accessToken);
      expect(serializedPayload).not.toContain(clientSecret);
      expect(serializedPayload).not.toContain(refreshToken);
      expect(serializedPayload).not.toContain(credentials);
      expect(serializedPayload).not.toContain(clientCredentials);
      expect(serializedPayload).not.toContain(secrets);
      expect(serializedPayload).not.toContain(tokens);
      expect(serializedPayload).not.toContain(authorization);
      expect(serializedPayload).not.toContain(cookie);
      expect(serializedPayload).not.toContain(colonToken);
      expect(serializedPayload).not.toContain(colonCookie);
      expect(serializedPayload).not.toContain(headerCredential);
      expect(serializedPayload).not.toContain(encodedCredential);
      expect(serializedPayload).not.toContain(secondaryCookie);
      expect(serializedPayload).not.toContain(equalsCredential);
      expect(serializedPayload).not.toContain(digestCredential);
      expect(serializedPayload).not.toContain(negotiateCredential);
      expect(serializedPayload).not.toContain(awsCredential);

      const exportedSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];
      const attributes = getAttributes(exportedSpan);
      expect(JSON.parse(attributes['tool.arguments'] as string)).toEqual({
        apiKey: '<redacted>',
        accountId: 'account-123',
        access_token: '<redacted>',
        callback: 'https://host/callback?access_token=<redacted>&token_count=12',
        encodedCallback: 'https://host/callback?%61ccess_token=<redacted>',
        credentials: '<redacted>',
        clientCredentials: '<redacted>',
        authorization: '<redacted>',
        token_count: 12,
        token_type: 'Bearer',
        token_ids: [101, 102],
        token_endpoint: 'https://issuer.example.com/oauth/token',
        token_url: 'https://issuer.example.com/token',
        secretary: 'Alice',
        logDetails: '<redacted>',
        nested: [{ refreshToken: '<redacted>' }],
      });
      expect(JSON.parse(attributes['tool.output'] as string)).toEqual({
        token: '<redacted>',
        client_secret: '<redacted>',
        secrets: '<redacted>',
        tokens: '<redacted>',
        cookie: '<redacted>',
      });
      expect(attributes['trace.metadata.customerApiKey']).toBe('<redacted>');
      expect(attributes['trace.metadata.clientCredentials']).toBe('<redacted>');
      expect(attributes['evaluation.id']).toBe(evaluationId);
      expect(attributes['test.case.id']).toBe(testCaseId);
      expect(exportedSpan.status.message).toBe('<redacted>');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts headers, command arguments, and span names throughout %s payloads',
    async (format) => {
      const exporter = new OTLPTracingExporter();
      const credentials = [
        'opaque-digest-proof',
        'opaque-cookie-value',
        'opaque/cli-value',
        'opaque cli token',
        'sk-abcdefghijklmnopqrstuvwxyz',
      ];
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: {
            type: 'custom',
            name: credentials[4],
            data: {
              digest: `Authorization: Digest uri="/app?x=1&y=2", response="${credentials[0]}"`,
              header_text: `Cookie: sid="${credentials[1]}"`,
              cmd: ['deploy', '--api-key', credentials[2], '--region', 'test-region'],
              invocation: `deploy --dry-run --api-key=${credentials[2]} --token-count 12`,
              command: `deploy --dry-run --token "${credentials[3]}" --region test-region`,
            },
          },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        } as any,
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcde0',
          spanData: {
            type: 'custom',
            name: 'sandbox.exec',
            data: { cmd: ['deploy', '--api-key', credentials[3], '--region', 'test-region'] },
          },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        } as any,
      ]);
      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      for (const credential of credentials) {
        expect.soft(JSON.stringify(payload)).not.toContain(credential);
      }
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[1]).command).toBe(
        'deploy --api-key <redacted> --region test-region',
      );
      expect(getAttributes(span).command).toBe(
        'deploy --dry-run --token <redacted> --region test-region',
      );
      expect(getAttributes(span).invocation).toBe(
        'deploy --dry-run --api-key=<redacted> --token-count 12',
      );
      expect(getAttributes(span).cmd).toEqual({
        arrayValue: {
          values: [
            { stringValue: 'deploy' },
            { stringValue: '--api-key' },
            { stringValue: '<redacted>' },
            { stringValue: '--region' },
            { stringValue: 'test-region' },
          ],
        },
      });
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts unlabeled credentials and preserves JSON serialization in %s',
    async (format) => {
      const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl';
      const date = new Date('2026-01-01T00:00:00Z');
      const serialized = { toJSON: () => ({ date, password: 'opaque-custom' }) };
      const exporter = new OTLPTracingExporter();
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: {
            type: 'custom',
            name: `result ${jwt}`,
            data: {
              result: jwt,
              literal_yaml: 'api_key: |\n  opaque/value',
              folded_yaml: "'password': >- # credential\n  secret text",
              ordinary_yaml: 'description: |\n  public description',
              request: '{"offset":-0,"exponent":-0e0,"password":"opaque"}',
            },
          },
          traceMetadata: {
            'promptfoo.otlp_format': format,
            recorded_at: date,
            nested: { date },
            serialized,
            list: [date, serialized],
          },
          error: { message: jwt },
        } as any,
      ]);
      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      const dateText = JSON.stringify(date);
      const serializedText = JSON.stringify({ date, password: '<redacted>' });
      expect(attributes).toMatchObject({
        result: '<redacted>',
        literal_yaml: '<redacted>',
        folded_yaml: '<redacted>',
        ordinary_yaml: 'description: |\n  public description',
        request: '{"offset":-0,"exponent":-0e0,"password":"<redacted>"}',
        'trace.metadata.recorded_at': dateText,
        'trace.metadata.nested': JSON.stringify({ date }),
        'trace.metadata.serialized': serializedText,
        'trace.metadata.list': {
          arrayValue: { values: [{ stringValue: dateText }, { stringValue: serializedText }] },
        },
      });
      expect(JSON.stringify(payload)).not.toContain(jwt);
      expect(JSON.stringify(payload)).not.toContain('opaque-custom');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts escaped credentials while preserving descriptive authentication and usage fields in %s',
    async (format) => {
      const exporter = new OTLPTracingExporter();
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: {
            type: 'custom',
            name: 'lookup',
            data: {
              url: 'https://user:opaque@part@host.example/path',
              quotedUrl: 'https://user:opaque"part@host.example/path',
              quoted: String.raw`Request: {"password":"opaque\"suffix"}`,
              assignment: String.raw`Request: password='opaque\'suffix' done`,
              apostrophe: `Request: password="opaque'suffix"`,
              truncated: String.raw`Request: password="opaque\"suffix`,
              auth_type: 'Bearer',
              auth_method: 'client_secret_post',
              token_endpoint_auth_methods_supported: ['client_secret_post'],
              num_tokens: 12,
              tokens_used: 3,
              estimated_tokens: 15,
              access_token: 'opaque-access-token',
              auth: 'opaque-auth',
            },
          },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        } as any,
      ]);
      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      expect(attributes).toMatchObject({
        url: 'https://<redacted>@host.example/path',
        quotedUrl: 'https://<redacted>@host.example/path',
        quoted: 'Request: {"password":"<redacted>"}',
        assignment: "Request: password='<redacted>' done",
        apostrophe: 'Request: password="<redacted>"',
        truncated: 'Request: password="<redacted>"',
        auth_type: 'Bearer',
        auth_method: 'client_secret_post',
        token_endpoint_auth_methods_supported: {
          arrayValue: { values: [{ stringValue: 'client_secret_post' }] },
        },
        num_tokens: 12,
        tokens_used: 3,
        estimated_tokens: 15,
        access_token: '<redacted>',
        auth: '<redacted>',
      });
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'sanitizes custom linkage and bounds native arrays without consuming trailing code in %s',
    async (format) => {
      const exporter = new OTLPTracingExporter();
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: {
            type: 'custom',
            name: 'lookup',
            data: {
              'evaluation.id': 'sk-abcdefghijklmnopqrstuvwxyz',
              'test.case.id': 'sk-abcdefghijklmnopqrstuvwxyz',
              chunks: ['x'.repeat(65_537)],
              aggregate: Array.from({ length: 65 }, () => 'x'.repeat(1024)),
              script: 'document.cookie = serializePreferences(settings); return response;',
            },
          },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        } as any,
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcde0',
          spanData: { type: 'custom', name: 'lookup', data: { 'evaluation.id': 'spoofed' } },
          traceMetadata: {
            'promptfoo.otlp_format': format,
            'evaluation.id': 'eval-trusted',
            'test.case.id': 'case-trusted',
          },
          error: null,
        } as any,
      ]);
      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const spans = payload.resourceSpans[0].scopeSpans[0].spans;
      const attributes = getAttributes(spans[0]);
      expect.soft(attributes['evaluation.id']).toBe('<REDACTED_API_KEY>');
      expect.soft(attributes['test.case.id']).toBe('<REDACTED_API_KEY>');
      expect.soft(attributes.chunks === '<redacted>').toBe(true);
      expect.soft(attributes.aggregate === '<redacted>').toBe(true);
      expect.soft(attributes.script).toBe('document.cookie = <redacted>; return response;');
      expect(getAttributes(spans[1])).toMatchObject({
        'evaluation.id': 'eval-trusted',
        'test.case.id': 'case-trusted',
      });
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts resource names, equals-delimited headers, and private keys in %s',
    async (format) => {
      const exporter = new OTLPTracingExporter();
      const credentials = ['opaque-equals-digest-proof', 'sk-abcdefghijklmnopqrstuvwxyz'];
      const privateKeys = [
        'PRIVATE KEY',
        'RSA PRIVATE KEY',
        'EC PRIVATE KEY',
        'OPENSSH PRIVATE KEY',
        'ENCRYPTED PRIVATE KEY',
      ].map(
        (label, index) =>
          `-----BEGIN ${label}-----\nprivate-material-${index}\n-----END ${label}-----`,
      );
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: {
            type: 'custom',
            name: 'lookup',
            data: {
              digest: `Authorization=Digest uri="/app?x=1&y=2", response="${credentials[0]}"`,
              private_keys: privateKeys.map((key) => `Command failed: ${key}`),
              truncated: 'Failure: -----BEGIN PRIVATE KEY-----\nprivate-partial-material',
              public_key: '-----BEGIN PUBLIC KEY-----\npublic-material\n-----END PUBLIC KEY-----',
              account_id: 'account-123',
            },
          },
          traceMetadata: {
            'promptfoo.otlp_format': format,
            'promptfoo.service_name': credentials[1],
          },
          error: null,
        } as any,
      ]);
      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const serialized = JSON.stringify(payload);
      for (const credential of [...credentials, 'private-material-', 'private-partial-material']) {
        expect.soft(serialized).not.toContain(credential);
      }
      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      expect(attributes.account_id).toBe('account-123');
      expect(attributes.public_key).toContain('public-material');
    },
  );

  it.each(['json', 'protobuf'] as const)(
    'redacts password aliases and embedded encoded credentials in %s',
    async (format) => {
      const exporter = new OTLPTracingExporter();
      const password = 'tiny/db-password';
      const encodedPassword = 'opaque/db-password';
      const note = `Response: ${JSON.stringify({ body: JSON.stringify({ accountId: '123' }) })}`;
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: {
            type: 'function',
            name: 'lookup',
            input: JSON.stringify({ pwd: password, accountId: '123', note }),
            output: `Connection failed; PWD=${password}`,
          },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: new Error(
            `Request failed: ${JSON.stringify({ body: JSON.stringify({ password: encodedPassword }) })}`,
          ),
        } as any,
      ]);
      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      expect.soft(JSON.stringify(payload)).not.toContain(password);
      expect.soft(JSON.stringify(payload)).not.toContain(encodedPassword);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(span.status.message).toBe('<redacted>');
      expect(JSON.parse(getAttributes(span)['tool.arguments'] as string)).toEqual({
        pwd: '<redacted>',
        accountId: '123',
        note,
      });
    },
  );

  it.each([
    { format: 'json', includesCredential: false },
    { format: 'protobuf', includesCredential: false },
    { format: 'json', includesCredential: true },
    { format: 'protobuf', includesCredential: true },
  ] as const)(
    'preserves large integer identifiers in $format tool arguments when credential redaction is $includesCredential',
    async ({ format, includesCredential }) => {
      const exporter = new OTLPTracingExporter();
      const input = includesCredential
        ? '{"access_token":"tiny","order_id":9223372036854775807}'
        : '{"order_id":9223372036854775807,"token_count":12}';
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: { type: 'function', name: 'lookup_order', input },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        } as any,
      ]);

      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const exportedSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(getAttributes(exportedSpan)['tool.arguments']).toBe(
        includesCredential ? '{"access_token":"<redacted>","order_id":9223372036854775807}' : input,
      );
    },
  );

  it.each([
    { format: 'json', shape: 'deeply nested' },
    { format: 'protobuf', shape: 'deeply nested' },
    { format: 'json', shape: 'oversized' },
    { format: 'protobuf', shape: 'oversized' },
  ] as const)(
    'keeps $format span batches exportable when tool data is $shape',
    async ({ format, shape }) => {
      const exporter = new OTLPTracingExporter();
      const deeplyNestedSecret = 'deeply-nested-credential';
      const oversizedInput = `[${'0,'.repeat(50_000)}${JSON.stringify({
        access_token: deeplyNestedSecret,
      })}]`;
      const unsafeInput =
        shape === 'oversized'
          ? oversizedInput
          : '{"order_id":9223372036854775807,"nested":' +
            '['.repeat(5000) +
            JSON.stringify({ access_token: deeplyNestedSecret }) +
            ']'.repeat(5000) +
            '}';
      const spans = [
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcde0',
          spanData: { type: 'function', name: 'nested_tool', input: unsafeInput },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        },
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcde1',
          spanData: { type: 'function', name: 'healthy_tool', input: '{"accountId":"123"}' },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        },
      ];

      const parseSpy = shape === 'oversized' ? vi.spyOn(JSON, 'parse') : undefined;
      try {
        await exporter.export(spans as any);
        if (parseSpy) {
          expect(parseSpy).not.toHaveBeenCalledWith(unsafeInput);
        }
      } finally {
        parseSpy?.mockRestore();
      }

      expect(mockFetchWithProxy).toHaveBeenCalledOnce();
      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const exportedSpans = payload.resourceSpans[0].scopeSpans[0].spans;
      expect(exportedSpans).toHaveLength(2);
      expect(JSON.stringify(exportedSpans)).not.toContain(deeplyNestedSecret);
      expect(JSON.stringify(exportedSpans)).not.toContain('9223372036854776000');
      expect(getAttributes(exportedSpans[0])['tool.arguments']).toContain('<redacted>');
      expect(getAttributes(exportedSpans[1])['tool.arguments']).toBe('{"accountId":"123"}');
    },
  );

  it('turns sandbox custom spans into command-aware spans', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        startedAt: '2026-05-06T12:00:00.000Z',
        endedAt: '2026-05-06T12:00:01.000Z',
        spanData: {
          type: 'custom',
          name: 'sandbox.exec',
          data: {
            cmd: ['cat', 'repo/task.md'],
            workdir: 'repo',
          },
        },
        traceMetadata: {},
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('sandbox.exec');
    expect(getAttributes(span)).toMatchObject({
      command: 'cat repo/task.md',
      cmd: {
        arrayValue: {
          values: [{ stringValue: 'cat' }, { stringValue: 'repo/task.md' }],
        },
      },
      'openai.agents.custom_span.name': 'sandbox.exec',
      'openai.agents.span_type': 'custom',
      workdir: 'repo',
    });
  });
});
