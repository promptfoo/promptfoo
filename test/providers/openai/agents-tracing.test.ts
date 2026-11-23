import { createCipheriv } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { OTLPTracingExporter } from '../../../src/providers/openai/agents-tracing';
import { decodeExportTraceServiceRequest } from '../../../src/tracing/protobuf';
import { SECRET_FIELD_NAMES } from '../../../src/util/sanitizer';
import type { Span, SpanData } from '@openai/agents';

const mockFetchWithProxy = vi.hoisted(() => vi.fn());

vi.mock('../../../src/logger');
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

function redacted(...fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, '<redacted>']));
}

function wireStrings(...values: string[]) {
  return { arrayValue: { values: values.map((stringValue) => ({ stringValue })) } };
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

  const formats = ['json', 'protobuf'] as const;
  type Format = (typeof formats)[number];

  async function exportSpans(
    format: Format,
    fixtures: {
      spanData: Record<string, unknown>;
      traceMetadata?: Record<string, unknown>;
      error?: unknown;
    }[],
  ) {
    const spans = fixtures.map(({ spanData, traceMetadata, error }, index) => ({
      type: 'trace.span',
      traceId: 'trace_0123456789abcdef0123456789abcdef',
      spanId: 'span_0123456789abcde' + index,
      spanData,
      traceMetadata: { ...traceMetadata, 'promptfoo.otlp_format': format },
      error,
    }));
    // Synthetic spans deliberately include malformed fields the SDK types forbid.
    await new OTLPTracingExporter().export(spans as unknown as Span<SpanData>[]);
    expect(mockFetchWithProxy).toHaveBeenCalledOnce();
    const body = mockFetchWithProxy.mock.calls[0][1].body;
    const payload =
      format === 'protobuf' ? await decodeExportTraceServiceRequest(body) : JSON.parse(body);
    // All fixtures reserve 'opaque' for credentials. Check the complete decoded wire payload.
    expect(JSON.stringify(payload)).not.toContain('opaque');
    return payload;
  }

  async function exportCustomData(
    format: Format,
    data: Record<string, unknown>,
    name: unknown = 'lookup',
    error?: unknown,
  ) {
    const payload = await exportSpans(format, [
      { spanData: { type: 'custom', name, data }, error },
      { spanData: { type: 'custom', name: 'healthy', data: { result: 'healthy' } } },
    ]);
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(2);
    expect(getAttributes(spans[1]).result).toBe('healthy');
    return { attributes: getAttributes(spans[0]), payload };
  }

  it.each(['success', 'status', 'exception'])('omits collector details on %s', async (result) => {
    const endpoint = 'https://trace:opaque@host';
    if (result === 'status') {
      mockFetchWithProxy.mockResolvedValue({ status: 500, statusText: 'opaque' });
    }
    if (result === 'exception') {
      mockFetchWithProxy.mockRejectedValue({ message: 'opaque' });
    }
    await exportSpans('json', [
      { spanData: { type: 'custom' }, traceMetadata: { 'promptfoo.otlp_endpoint': endpoint } },
    ]);
    expect(mockFetchWithProxy.mock.calls[0][0]).toBe(endpoint + '/v1/traces');
    expect(
      JSON.stringify([vi.mocked(logger.debug).mock.calls, vi.mocked(logger.error).mock.calls]),
    ).not.toContain('opaque');
  });

  it.each(formats)('keeps both spans without exporting credentials in %s', async (format) => {
    const { attributes, payload } = await exportCustomData(
      format,
      {
        request: "curl --header 'X-Api-Key: sensitive header value'",
        assigned: 'env HOME=/tmp curl -u buildbot:sensitive https://host',
        argv: ['/usr/bin/env', 'HOME=/tmp', 'curl', '-u', 'buildbot:sensitive'],
        envFile: 'PASSWORD=\\sensitive/value\npassword=opaque\\sensitive\nREGION=west',
        config: '"password" = "sensitive value"',
        folded: 'Authorization:\r\n Bearer sensitive',
        callback: 'https://host/cb?code=sensitive&count=2',
        forwarded: 'next=sk%2Dsensitiveabcdefghijklmnopqrst',
        raw: 'github_pat_sensitive ghp_sensitive glpat-sensitive',
        code_verifier: 'sensitive',
        duplicate: '{"body":{"password":"sensitive"},"body":"ok"}',
        status_code: 200,
        source: 'next=%2Fsettings',
      },
      17,
      {
        get message() {
          throw new Error('unreadable');
        },
      },
    );
    expect(JSON.stringify(payload)).not.toContain('sensitive');
    expect(attributes.envFile).toBe('PASSWORD=<redacted>\npassword=<redacted>\nREGION=west');
    expect(attributes.callback).toBe('https://host/cb?code=<redacted>&count=2');
    expect(attributes.source).toBe('next=%2Fsettings');
    expect(JSON.parse(attributes.duplicate as string)).toEqual({ body: 'ok' });
    expect(attributes.status_code).toBe(200);
    expect(payload.resourceSpans[0].scopeSpans[0].spans[0]).toMatchObject({
      name: '<redacted>',
      status: { code: 2, message: '<redacted>' },
    });
  });

  it.each(formats)(
    'redacts Stripe secret and restricted keys in %s tool output and errors',
    async (format) => {
      const suffix = 'opaque'.repeat(4);
      const publicText = `pk_live_${'x'.repeat(24)} task_test_results sk_organization`;
      const name = 'work_test_provider_configurations';
      const input = {
        task_test_execution_timeout_seconds: 60,
        task_test_execution_timeout_enabled: true,
      };
      const payload = await exportSpans(format, [
        {
          spanData: {
            type: 'function',
            name,
            input,
            output: `Found sk_live_${suffix}, rk_test_opaque and ${publicText}`,
          },
          error: new Error(`Rejected sk_test_${suffix} and rk_live_${suffix}`),
        },
      ]);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
      const attributes = getAttributes(span);
      expect(span.name).toBe(`execute_tool ${name}`);
      expect(attributes['tool.name']).toBe(name);
      expect(JSON.parse(attributes['tool.arguments'] as string)).toEqual(input);
      expect(attributes['tool.output']).toBe(`Found <redacted>, <redacted> and ${publicText}`);
      expect(span.status.message).toBe('Rejected <redacted> and <redacted>');
    },
  );

  it.each(formats)('redacts formatted and organization Stripe keys in %s', async (format) => {
    const suffix = 'opaque'.repeat(4);
    const payload = await exportSpans(format, [
      {
        spanData: {
          type: 'function',
          name: 'lookup',
          output: `Found \u001b[32msk_live_${suffix}\u001b[0m, sk_org_${suffix} and sk_org${suffix}`,
        },
        error: new Error(`Rejected _rk_live_${suffix}_ in {"log":"retry\\nsk_org_live_${suffix}"}`),
      },
    ]);
    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(getAttributes(span)['tool.output']).toBe(
      'Found \u001b[32m<redacted>\u001b[0m, <redacted> and <redacted>',
    );
    expect(span.status.message).toBe('Rejected _<redacted>_ in {"log":"retry\\n<redacted>"}');
  });

  it.each(formats)(
    'redacts Stripe keys after encoded delimiters without decoding the trace in %s',
    async (format) => {
      const key = `sk_live_${'opaque'.repeat(4)}`;
      const prefixes = [
        encodeURIComponent('Error: '),
        '%3a',
        '%2520',
        '\\u0020',
        '\\x2f',
        '%1B%5B32m',
        't%61sk_test_results_',
      ];
      const publicText =
        't%61sk_test_results w\\u006frk_test_provider_configurations %20pk_live_public';
      const payload = await exportSpans(format, [
        {
          spanData: {
            type: 'function',
            name: 'lookup',
            output: prefixes.map((prefix) => prefix + key).join(' ') + ' ' + publicText,
          },
          error: new Error(`https://host/Failure%20${key}?password=opaque`),
        },
      ]);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(getAttributes(span)['tool.output']).toBe(
        prefixes.map((prefix) => prefix + '<redacted>').join(' ') + ' ' + publicText,
      );
      expect(span.status.message).toBe('https://host/Failure%20<redacted>?password=<redacted>');
    },
  );

  it.each(formats)(
    'masks values before redacting Stripe-like field names in %s',
    async (format) => {
      const payload = await exportSpans(format, [
        {
          spanData: {
            type: 'function',
            name: 'lookup',
            output: 'task_test_database_master_password=opaque',
          },
          error: new Error('?sk_org_token=opaque&region=west'),
        },
      ]);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(getAttributes(span)['tool.output']).toBe(
        'task_test_database_master_password=<redacted>',
      );
      expect(span.status.message).toBe('?<redacted>=<redacted>&region=west');
    },
  );

  it.each(formats)(
    'redacts standalone authorization values and encoded form credentials in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        bearer: 'Bearer 0123456789abcdefghijklmnop',
        basic: 'Basic YWxpY2U6b3BhcXVlLXBhc3N3b3Jk',
        form: 'api+key=opaque/plus&access+token=opaque/token&token+count=12',
        query: 'https://service.test/run?key=opaque/query&name=public',
        formKey: 'key=opaque/form&name=public',
        structured: { key: 'public identifier', session_status: 'complete' },
        description: 'Basic authentication is supported',
      });
      expect(attributes.bearer).toBe('<redacted>');
      expect(attributes.basic).toBe('<redacted>');
      expect(attributes.form).toBe('api+key=<redacted>&access+token=<redacted>&token+count=12');
      expect(attributes.query).toBe('https://service.test/run?key=<redacted>&name=public');
      expect(attributes.formKey).toBe('key=<redacted>&name=public');
      expect(JSON.parse(attributes.structured as string)).toEqual({
        key: 'public identifier',
        session_status: 'complete',
      });
      expect(attributes.description).toBe('Basic authentication is supported');
    },
  );

  it.each(formats)('redacts short standalone authorization values in %s', async (format) => {
    const payload = await exportSpans(format, [
      {
        spanData: { type: 'function', name: 'lookup', output: 'Basic dTpw' },
        error: new Error('\u00a0bEaReR\tx'),
        traceMetadata: { plan: 'Basic plan', method: 'Bearer', prose: 'Use Bearer authentication' },
      },
    ]);
    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(getAttributes(span)).toMatchObject({
      'tool.output': '<redacted>',
      'trace.metadata.plan': 'Basic plan',
      'trace.metadata.method': 'Bearer',
      'trace.metadata.prose': 'Use Bearer authentication',
    });
    expect(span.status.message).toBe('<redacted>');
  });

  it.each(formats)('classifies complete dotted TOML keys in %s', async (format) => {
    const output = [
      '"api"."key" = "opaque/value"',
      `service . 'private' . key = 'opaque/second'`,
      'api. "keys" = """opaque "third"\nopaque/value"""',
      String.raw`"\u0061pi"."\U0000006Bey" = "opaque/escaped"`,
      String.raw`"\x61pi".key = 'opaque/byte'`,
      String.raw`"api\U0000004Bey" = "opaque/long"`,
      String.raw`"\x70assword" = 'opaque/short'`,
      '"cache"."key" = "visible"',
      "'token' . count = 12",
    ].join('\n');
    const payload = await exportSpans(format, [
      {
        spanData: { type: 'function', name: 'read_file', output },
        error: new Error(`"api".keys = ["opaque/first", "opaque/second"]`),
      },
    ]);
    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(getAttributes(span)['tool.output']).toContain('"api"."key" = "<redacted>"');
    expect(getAttributes(span)['tool.output']).toContain('"cache"."key" = "visible"');
    expect(getAttributes(span)['tool.output']).toContain("'token' . count = 12");
    expect(span.status.message).toBe('<redacted>');
  });

  it.each(formats)(
    'withholds TOML credential tables and preserves public tables in %s',
    async (format) => {
      const publicTables = [
        'service = {api = {region = "west"}, cache = { key = "visible" }}',
        '[api]\nregion = "west"',
        '[cache]\nkey = "visible"',
        '[token.count]\ntotal = 12',
      ].join('\n');
      const { attributes } = await exportCustomData(format, {
        dotted: '[private.keys]\nprod = "opaque/prod"',
        empty: '[private.keys]\n"" = "opaque/empty"',
        poetry: '[pypi-token] # publishing\npypi = "pypi-opaque"',
        split: '[service.private]\n# key stored below\n"keys".stage = "opaque/split"',
        quoted: String.raw`[[service . "pri\U00000076ate" . 'keys']]` + '\nname = "opaque/array"',
        inline: 'service.credentials = {prod={value="first"},stage={value="opaque/other"}}',
        nested: 'private = { info = { region = "west" }, keys = {stage = "opaque/nested"} }',
        path: String.raw`private = {path = 'C:\keys\', key = 'opaque/value'}`,
        array: 'service.api = [{name = "}", key = "opaque/array"}]',
        multiline: '[api]\nnote = """\n[cache]\n"""\nkey = "opaque/real"',
        description: 'note = """public"""\n[api]\nkey = "opaque/first"',
        descriptionLiteral: "note = '''public'''\n[credentials]\nregion = 'opaque/second'",
        rows: '[api]\nrows = [\n["cache"]\n]\nkey = "opaque/real"',
        brace: 'password = { local = "}", remote = "opaque/remainder" }',
        settings: '[app]\npassword = "opaque/pwd"\nregion = "west"',
        publicTables,
      });
      expect(attributes).toMatchObject(
        redacted(
          'dotted',
          'empty',
          'poetry',
          'split',
          'quoted',
          'inline',
          'nested',
          'path',
          'array',
          'multiline',
          'description',
          'descriptionLiteral',
          'rows',
          'brace',
        ),
      );
      expect(attributes.settings).toBe('[app]\npassword = "<redacted>"\nregion = "west"');
      expect(attributes.publicTables).toBe(publicTables);
    },
  );

  it.each(formats)('bounds expansion of repeated TOML table prefixes in %s', async (format) => {
    const prefix = '[' + 'group.'.repeat(200) + 'api]';
    const rows = Array.from({ length: 60 }, (_, i) => 'item' + i + ' = 0');
    const { attributes } = await exportCustomData(format, {
      large: [prefix, ...rows].join('\n'),
      small: [prefix, rows[0]].join('\n'),
    });
    expect(attributes.large).toBe('<redacted>');
    expect(attributes.small).toBe([prefix, rows[0]].join('\n'));
  });

  it.each(formats)(
    'never consumes another credential after a quoted assignment label in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        description: `note = "apiKey = '"\napiKey = 'opaque/next'`,
        label: 'label = "Password: "\npassword = "opaque/next"',
        table: `config = { note = "apiKey = '", apiKey = 'opaque/inline' }`,
        path: String.raw`config = { path = 'C:\folder\', note = 'password=', password = 'opaque/next' }`,
        adjacent: 'const note = "password="; const password = "opaque/next";',
        property: `const note = "password='"; cfg["apiKey"] = 'opaque/next';`,
        comment: "/* password = ' */ cfg.password = 'opaque/next';",
        ordinary: 'label = "Example: "\nregion = "public"',
        unambiguous: '[app]\npassword = "opaque=="\nregion = "public"',
      });
      expect(attributes).toMatchObject(
        redacted('description', 'label', 'table', 'path', 'adjacent', 'property', 'comment'),
      );
      expect(attributes.ordinary).toBe('label = "Example: "\nregion = "public"');
      expect(attributes.unambiguous).toBe('[app]\npassword = "<redacted>"\nregion = "public"');
    },
  );

  it.each(formats)(
    'withholds ambiguous TOML endings before another credential in %s',
    async (format) => {
      const next = "\npassword = 'opaque/adjacent'";
      const { attributes } = await exportCustomData(format, {
        quoted: String.raw`"private"."key" = 'C:\keys\'` + next,
        bare: String.raw`apiKey = 'C:\keys\'` + next,
        triple: String.raw`'api'.key = '''C:\keys\'''` + "\npassword = '''opaque/adjacent'''",
        publicFirst: String.raw`path = 'C:\folder\'` + next,
        ordinary: String.raw`path = 'C:\folder\'` + "\nregion = 'public'",
      });
      expect(attributes).toMatchObject(redacted('quoted', 'bare', 'triple'));
      expect(attributes.publicFirst).toBe(
        String.raw`path = 'C:\folder\'` + "\npassword = '<redacted>'",
      );
      expect(attributes.ordinary).toBe(String.raw`path = 'C:\folder\'` + "\nregion = 'public'");
    },
  );

  it('preserves long dotted names without an assignment', async () => {
    const path = '"name".'.repeat(6000) + '"item"';
    const { attributes } = await exportCustomData('json', { path });
    expect(attributes.path).toBe(path);
  });

  it.each(formats)('masks static JavaScript property assignments in %s', async (format) => {
    const output = [
      'process.env["API_KEY"] = "opaque/property";',
      "cfg[ 'apiKey' ] = `first\nopaque/template`;",
      'cfg["private"]["key"] = "opaque/compound";',
      'cfg[`apiKey`] ??= "opaque/default";',
      String.raw`cfg['api\u{4B}ey'] = 'opaque/escaped';`,
      'const password = String.raw\n`opaque/tagged`;',
      'cfg["cache"]["key"] = "visible";',
      'cfg["token_count"] = 9;',
    ].join('\n');
    const payload = await exportSpans(format, [
      { spanData: { type: 'function', name: 'read_file', output } },
    ]);
    const { 'tool.output': text } = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
    expect(text).toContain('process.env["API_KEY"] = "<redacted>";');
    expect(text).toContain('cfg["cache"]["key"] = "visible";');
    expect(text).toContain('cfg["token_count"] = 9;');
  });

  it.each(formats)(
    'classifies escaped JavaScript identifiers and continued literal keys in %s',
    async (format) => {
      const publicKey = String.raw`cfg.cache\u{4B}ey = "visible"; cfg.token\u005Fcount = 12;`;
      const output = [
        String.raw`const api\u004Bey = "opaque/decl";`,
        String.raw`cfg.api\u{4b}ey = "opaque/property";`,
        String.raw`cfg.\u0070rivate.\u{6B}ey = 'opaque/compound';`,
        publicKey,
      ].join('\n');
      const continued = ['\r\n', '\n', '\r', '\u2028', '\u2029'].flatMap((newline) =>
        ['"', "'", '`'].map(
          (quote) => 'cfg[' + quote + 'api\\' + newline + 'Key' + quote + '] = `opaque/template`;',
        ),
      );
      const payload = await exportSpans(format, [
        { spanData: { type: 'function', name: 'read_file', output } },
        ...continued.map((text) => ({
          spanData: { type: 'function', name: 'read_file', output: text },
        })),
      ]);
      const [first, ...rest] = payload.resourceSpans[0].scopeSpans[0].spans;
      expect(getAttributes(first)['tool.output']).toContain(publicKey);
      for (const span of rest) {
        expect(getAttributes(span)['tool.output']).toContain('<redacted>');
      }
    },
  );

  it.each(formats)('classifies inherited static object properties in %s', async (format) => {
    const ordinary = 'const cfg = { cache: {key: "shown"}, token_count: 2 };';
    const source = {
      api: { key: 'opaque/nested' },
      private: [{ keys: ['opaque/array'] }],
      cache: { key: 'shown' },
    };
    const { attributes } = await exportCustomData(format, {
      literal: 'const cfg = { private: { key: "opaque/object" } };',
      qualified: String.raw`const cfg = { priva\u{74}e: [ { "key": "opaque/array" } ] };`,
      spaced: 'const cfg = { api: /* note */ { key: "opaque/comment" } };',
      member: 'cfg["api"] = { ["key"]: "opaque/member" };',
      split: 'const cfg = { ["private"]\n:\n{ key\n:\n"opaque/split" }};',
      grouped: 'const cfg = { api: (({ key: "opaque/grouped" })) };',
      target: '(cfg.api) = { key: "opaque/target" };',
      staticKey: 'cfg[("private")][("key")] = "opaque/member";',
      guarded: 'if (ready) config.api ??= ({ key: "opaque/default" });',
      logical: 'cfg["private"] ||= { \u00a0key: "opaque/logical" };',
      publicDefault: 'if (ready) cfg.cache ??= ({ key: "shown" });',
      declaration: 'const api = { label: `# info`, key: "opaque/key" };',
      quoted: String.raw`const api = { note: 'don\'t close }', key: 'opaque/value' };`,
      api: JSON.stringify({ key: 'opaque/root', status: 'ok' }),
      native: source,
      serialized: JSON.stringify(source),
      ordinary,
    });
    expect(attributes.ordinary).toBe(ordinary);
    expect(attributes.publicDefault).toBe('if (ready) cfg.cache ??= ({ key: "shown" });');
    expect(JSON.parse(attributes.api as string)).toEqual({ key: '<redacted>', status: 'ok' });
    for (const field of [attributes.native, attributes.serialized]) {
      expect(JSON.parse(field as string)).toEqual({
        api: { key: '<redacted>' },
        private: [{ keys: '<redacted>' }],
        cache: { key: 'shown' },
      });
    }
  });

  it.each(formats)(
    'protects unquoted credential values and literal defaults in %s',
    async (format) => {
      const ordinary = 'const cacheKey = process.env.CACHE_KEY ?? "shown";';
      const { attributes } = await exportCustomData(format, {
        comma: 'status=ok,password=opaque',
        table: 'service = { password=123456, region="west" }',
        compact: 'service={password=123456}',
        logical: 'if (ready) cfg.password??=123456;',
        fallback: 'const apiKey = process.env.API_KEY ?? "opaque/default";',
        alternative: 'const password = settings.value || "opaque/default";',
        conditional: 'const apiKey = configured ? configured : "opaque/default";',
        ordinary,
      });
      for (const key of ['table', 'compact', 'logical']) {
        expect(attributes[key]).not.toContain('123456');
      }
      expect(attributes.ordinary).toBe(ordinary);
    },
  );

  it.each(formats)(
    'keeps static credential names through JavaScript lexical ambiguity in %s',
    async (format) => {
      const ordinary = 'const cache = { pattern: /[}]/, key: "shown" };';
      const { attributes } = await exportCustomData(format, {
        indexed: 'cfg.api[0].key = "opaque/index";',
        nested: 'cfg.private[0x10][1].key = "opaque/nested";',
        escaped: String.raw`cfg["pass\word"] = "opaque/identity";`,
        privateField: 'class Client { #api = {key: "opaque/private"}; }',
        pattern: 'const cfg = { api: {pattern: /#/, key: "opaque/hash"} };',
        brace: 'const api = { pattern: /[}]/, key: "opaque/brace" };',
        ordinary,
        list: 'cfg.cache[0].key = "shown";',
        oversized: 'const cache = { pattern: /#/, items: [' + '0,'.repeat(5_001) + '] };',
      });
      expect(attributes.ordinary).toBe(ordinary);
      expect(attributes.list).toBe('cfg.cache[0].key = "shown";');
      expect(attributes.oversized).toBe('<redacted>');
    },
  );

  it.each(formats)('masks named multi-value headers in %s', async (format) => {
    const headers = [
      { name: 'Authorization', values: ['opaque/first', 'opaque/second'] },
      { key: 'X-Api-Key', Values: ['opaque/key'] },
      { name: 'Cache-Control', values: ['public'] },
    ];
    const { attributes } = await exportCustomData(format, {
      request: { headers },
      serialized: JSON.stringify({ headers }),
    });
    for (const key of ['request', 'serialized']) {
      expect(JSON.parse(attributes[key] as string).headers).toEqual([
        { name: 'Authorization', values: '<redacted>' },
        { key: 'X-Api-Key', Values: '<redacted>' },
        { name: 'Cache-Control', values: ['public'] },
      ]);
    }
  });

  it.each(formats)('withholds partially masked assignments in %s', async (format) => {
    const ordinary = 'const cacheKey = String("shown");';
    const { attributes } = await exportCustomData(format, {
      called: 'const password = String("opaque");',
      chained: 'const API_KEY = Buffer.from("opaque", "base64").toString();',
      spaced: 'cfg.password = String ( "opaque" );',
      second: 'cfg.apiKey = getValue(env,\n "opaque");',
      member: 'cfg.password = "" .concat("opaque");',
      comparison: 'const password = "dev" === process.env.MODE ? "opaque" : env.PASS;',
      inequality: 'cfg.apiKey = "prod"\n!== env.MODE && "opaque";',
      membership: 'cfg.apiKey = "dev" in env ? "opaque" : env.PASS;',
      bitwise: 'cfg.password = "1"&mode ? "opaque" : env.PASS;',
      tagged: 'cfg.password = String.raw`dev` /* mode */ === env.MODE ? "opaque" : fallback;',
      async: 'cfg.apiKey = await "opaque";',
      continued: 'cfg.apiKey = await\n"opaque";',
      numeric: 'cfg.password = Number(/* input */\n654371);',
      adjacent: `PASSWORD=""'opaque'`,
      suffix: 'PASSWORD="part"opaque',
      prefix: `PASSWORD=part"opaque"`,
      fragment: 'PASSWORD=part#opaque',
      comma: 'export PASSWORD=part,opaque',
      commas: 'export PASSWORD="part",,opaque',
      escaped: String.raw`export PASSWORD=part\ opaque`,
      line: 'export PASSWORD=part\\\nopaque',
      ordinary,
      path: 'PATH=part#shown',
      mode: 'const cacheKey = "dev" === env.MODE ? "shown" : env.CACHE;',
    });
    expect(attributes.numeric).not.toContain('654371');
    expect(attributes.ordinary).toBe(ordinary);
    expect(attributes.path).toBe('PATH=part#shown');
    expect(attributes.mode).toBe('const cacheKey = "dev" === env.MODE ? "shown" : env.CACHE;');
  });

  it.each(formats)('withholds named credential values in source text in %s', async (format) => {
    const ordinary = 'const headers = [{name: "Cache-Control", values: ["shown"]}];';
    const { attributes } = await exportCustomData(format, {
      table: '[[headers]]\nname="Authorization"\nvalues=["opaque"]',
      source: 'const headers = [{ name: "Authorization", values: ["opaque"] }];',
      single: 'const auth = { "Value": "opaque", "KEY": "X-Api-Key" };',
      escaped: String.raw`const entries = [{ ["na\u006De"]: "Authoriza\u0074ion", values: ["opaque"] }];`,
      ordinary,
      publicTable: '[[headers]]\nname="Cache-Control"\nvalues=["shown"]',
    });
    expect(attributes.ordinary).toBe(ordinary);
    expect(attributes.publicTable).toBe('[[headers]]\nname="Cache-Control"\nvalues=["shown"]');
  });

  it.each(formats)('recognizes line comments after property colons in %s', async (format) => {
    const ordinary = 'const cfg = { url: "https://example.test", cache:// note\n{ key: "shown" }};';
    const { attributes } = await exportCustomData(format, {
      qualified: 'const cfg = { api:// region\n { key: "opaque/qualified" }};',
      quoted: 'const cfg = { "private":// }\r\n [{keys: ["opaque/array"]}] };',
      label: 'const headers = [{ name:// note\n"Authorization", values: ["opaque/label"] }];',
      keyed: 'const h = { value: "opaque/keyed", key:// label\u2028 "X-Api-Key" };',
      ordinary,
    });
    expect(attributes.ordinary).toBe(ordinary);
  });

  it.each(formats)(
    'withholds ambiguous JavaScript credential assignments in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        before: 'const apiKey /* note */ = `opaque/first`;',
        after: 'const password = /* note */ `opaque/second`;',
        bracketed: 'cfg["apiKey"] // note\n = "opaque/third";',
        compound: 'cfg["private"] /* note */ ["key"] = "opaque/compound";',
        tagged: 'const password = String.raw /* note */ `opaque/fourth`;',
        member: 'const password = String. /* note */ raw`opaque/fifth`;',
        joined: 'cfg["apiKey"] = "first" + "opaque/suffix";',
        continued: 'const password = `first` /* note */ + `opaque/second`;',
        ordinary: 'const cacheKey = /* note */ `visible`;',
      });
      expect(attributes).toMatchObject(
        redacted(
          'before',
          'after',
          'bracketed',
          'compound',
          'tagged',
          'member',
          'joined',
          'continued',
        ),
      );
      expect(attributes.ordinary).toBe('const cacheKey = /* note */ `visible`;');
    },
  );

  it.each(formats)(
    'ignores quoted comment markers before JavaScript credentials in %s',
    async (format) => {
      const compound = 'cfg["private"] /* note */ ["key"] = "opaque/compound";';
      const prefix = 'const files = "src/*";\n';
      const ordinary = prefix + 'cfg["cache"] /* note */ ["key"] = "visible";';
      const { attributes } = await exportCustomData(format, {
        host: 'const path = "//host"; ' + compound,
        glob: prefix + compound,
        escaped: String.raw`const files = 'a\'src/*'; ` + compound,
        template: 'const glob = `src/*`; ' + compound,
        suffix: prefix + 'const apiKey = "first" /* join */ + "opaque/suffix";',
        ordinary,
      });
      expect(attributes).toMatchObject(redacted('host', 'glob', 'escaped', 'template', 'suffix'));
      expect(attributes.ordinary).toBe(ordinary);
    },
  );

  it.each(formats)(
    'masks complete JavaScript credential template literals in %s',
    async (format) => {
      const output = 'const password = `\nopaque/value\n`; const note = `public text`;';
      const payload = await exportSpans(format, [
        {
          spanData: { type: 'function', name: 'read_file', output },
          error: new Error('let apiKey = `first \\` opaque second`; keep();'),
          traceMetadata: {
            nested: 'const password = `a ${f(`opaque`)} opaque`;',
            truncated: 'const apiKey = `first\nopaque',
            tagged: 'const privateKey = String.raw`opaque\nopaque`; keep();',
          },
        },
      ]);
      const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(getAttributes(span)['tool.output']).toContain('const note = `public text`;');
      expect(span.status.message).toContain('; keep();');
      expect(getAttributes(span)['trace.metadata.tagged']).toContain('; keep();');
      expect(getAttributes(span)).toMatchObject(
        redacted('trace.metadata.nested', 'trace.metadata.truncated'),
      );
    },
  );

  it.each(
    formats.flatMap((format) =>
      ['X-Session-Id', 'Ocp-Apim-Subscription-Key', 'X-Honeycomb-Team'].map(
        (name) => [format, name] as const,
      ),
    ),
  )('redacts %s header records for %s in every supported container', async (format, header) => {
    const diagnostics = {
      'X-Idempotency-Key': 'request-id',
      'X-Token-Count': 42,
      'X-Auth-Type': 'oauth',
      'X-Input-Tokens': 12,
    };
    const { attributes } = await exportCustomData(format, {
      headers: { [header.toLowerCase()]: 'opaque/object', 'Content-Type': 'text/plain' },
      rawHeaders: [header, 'opaque/raw', 'Content-Type', 'text/plain'],
      records: [{ name: header, value: 'opaque/record' }],
      text: `${header}: opaque/text`,
      nested: JSON.stringify({ headers: { [header.toLowerCase()]: 'opaque/serialized' } }),
      ...diagnostics,
      session_status: 'completed',
      session_duration: 42,
    });
    expect(JSON.parse(attributes.headers as string)).toEqual({
      [header.toLowerCase()]: '<redacted>',
      'Content-Type': 'text/plain',
    });
    expect(attributes).toMatchObject(diagnostics);
    expect(attributes.session_status).toBe('completed');
    expect(attributes.session_duration).toBe(42);
  });

  it.each(formats)('uses HTTP credential rules in %s', async (format) => {
    const fields = { vendorSessionId: 'opaque', gatewayauthentication: 'opaque' };
    const { attributes } = await exportCustomData(format, {
      headers: { ...fields, 'User-Agent': 'Basic opaque', 'X-Cache-Key': 'visible' },
      requestHeaders: JSON.stringify(Object.entries(fields)),
      scalar: JSON.stringify(JSON.stringify({ headers: fields })),
      rawHeaders: 'VendorKey: opaque',
      responseHeaders: 'Content-Type: text/plain\nUser-Agent: Basic opaque',
      'response.headers.gatewayjwtv2': 'opaque',
      queryParams: { 'user[key]': 'opaque' },
      form: 'public=ok;key[0]=opaque',
      url: 'https://host/?accesskeyid2=opaque&region=west',
      result: 'POST https://gateway.test/v1/token_opaqueTenant123/responses',
      relative: '/auth/opaqueTenant123',
      generic: 'key-opaque123456789abcdefghij',
    });
    expect(JSON.parse(attributes.headers as string)['X-Cache-Key']).toBe('visible');
    expect(attributes.url).toBe('https://host/?accesskeyid2=<redacted>&region=west');
    expect(attributes.result).toBe('POST https://gateway.test/v1/%5BREDACTED%5D/responses');
  });

  it.each(formats)(
    'redacts callable values at custom and trace metadata roots in %s',
    async (format) => {
      const callback = () => 'private callable contents';

      const payload = await exportSpans(format, [
        {
          spanData: { type: 'custom', name: 'lookup', data: { callback, result: 'healthy' } },
          traceMetadata: { callback },
        },
      ]);
      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      expect(attributes.callback).toBe('<redacted>');
      expect(attributes['trace.metadata.callback']).toBe('<redacted>');
      expect(attributes.result).toBe('healthy');
      expect(JSON.stringify(payload)).not.toContain('private callable contents');
    },
  );

  it.each(formats)(
    'masks attached curl credentials and separate OAuth and proxy arguments in %s',
    async (format) => {
      const args = [
        'curl',
        '-ubot:opaque/user',
        '-U',
        'bot:opaque/proxy',
        '--oauth2-bearer',
        'opaque/bearer',
        '-Ubot:opaque/attached',
        '-iu',
        'bot:opaque/group',
        '-NgUbot:opaque/group-attached',
        '--proxy-user=bot:opaque/long',
        '-su"bot:opaque/secret phrase"',
        '--pass',
        'opaque/pass',
        '-Efile:opaque/cert',
        '-bname=opaque/cookie',
        'https://host',
      ];
      const { attributes, payload } = await exportCustomData(format, {
        argv: args,
        text: args.join(' '),
        continued: 'curl -u \\\n bot:opaque/password https://host',
        unrelated: 'git push -uorigin main',
      });
      expect(JSON.stringify(payload)).not.toMatch(/opaque|phrase/);
      expect(attributes.text).toContain('https://host');
      expect(attributes.unrelated).toBe('git push -uorigin main');
    },
  );

  it.each(formats)(
    'masks curl credentials in command chains and nested shell programs in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        joined: "curl -''u bot:opaque/value https://host",
        escaped: "c\\url --us''er bot:opaque/value https://host",
        expansion: 'curl --us$(echo er) bot:opaque/value https://host',
        command: 'echo public&&/usr/bin/curl -u bot:opaque/value https://host',
        nested: "sh -c 'curl --proxy-user bot:opaque/value https://host'",
        args: ['bash', '-lc', 'echo public\ncurl -ubot:opaque/value https://host'],
      });
      expect(attributes.expansion).toBe('<redacted>');
      expect(attributes.command).toBe('echo public&&/usr/bin/curl -u <redacted> https://host');
    },
  );

  it.each(formats)(
    'redacts complete URL and form credentials, including punctuation, in %s',
    async (format) => {
      const { attributes, payload } = await exportCustomData(format, {
        query: 'https://host/?password=,opaque/value&region=west',
        encodedKey: 'https://host/?%61pi_key=before];opaque/value&region=west',
        form: 'secret=]opaque/value&region=west',
        redirect: 'next=https://host/?password=,opaque/value&region=west',
        publicForm: 'cities=London,Tokyo&bbox=[1,2]',
      });
      expect(JSON.stringify(payload)).not.toMatch(/opaque|before/);
      expect(attributes.query).toBe('https://host/?password=<redacted>&region=west');
      expect(attributes.encodedKey).toBe('https://host/?%61pi_key=<redacted>&region=west');
      expect(attributes.form).toBe('secret=<redacted>&region=west');
      expect(attributes.publicForm).toBe('cities=London,Tokyo&bbox=[1,2]');
    },
  );

  it.each(formats)(
    'classifies attached system and project property names in %s',
    async (format) => {
      const cmd = ['java', '-Dpassword=first;second opaque/marker', '-Dinput.tokens=42', 'Main'];
      const { attributes } = await exportCustomData(format, {
        cmd,
        serialized: JSON.stringify(cmd),
        shell: 'mvn "-DapiKey=prefix opaque/marker" -Dfile.encoding=UTF-8',
        gradle: "gradle -Ptoken='prefix opaque/marker' check",
        nested: "sh -c 'java -Dpassword=opaque/marker Main'",
        jvm: 'JAVA_TOOL_OPTIONS="-Dpassword=opaque/marker"',
        powershell: ['cmdlet', '-Dsn', 'opaque/marker', '-PasswordHash', 'opaque/marker'],
        expansion: 'java -Dpassword=$(echo opaque/marker) Main',
        options: 'gradle -Dorg.gradle.jvmargs="-Dpassword=opaque/marker"',
        split: ['gradle', '--project-prop', 'token=prefix opaque/marker', 'check'],
        define: 'mvn --define="db.password=prefix opaque/marker" --define=region=west',
      });
      const clean = ['java', '-Dpassword=<redacted>', '-Dinput.tokens=42', 'Main'];
      expect(attributes.cmd).toEqual(wireStrings(...clean));
      expect(attributes.command).toBe(clean.join(' '));
      expect(JSON.parse(attributes.serialized as string)).toEqual(clean);
      expect(attributes.shell).toBe('mvn -DapiKey=<redacted> -Dfile.encoding=UTF-8');
      expect(attributes.gradle).toBe('gradle -Ptoken=<redacted> check');
      expect(attributes.define).toContain('--define=region=west');
    },
  );

  it.each(formats)(
    'preserves literal operands without ending authentication masking in %s',
    async (format) => {
      const cmd = ['curl', '--data', '&&', '-u', 'bot:opaque/value', 'https://host'];
      const { attributes } = await exportCustomData(format, { cmd, nested: JSON.stringify(cmd) });
      expect(attributes.cmd).toEqual(
        wireStrings('curl', '--data', '&&', '-u', '<redacted>', 'https://host'),
      );
      expect(attributes.command).toBe('curl --data && -u <redacted> https://host');
    },
  );

  it.each(formats)('checks environment maps and multiline dumps in %s', async (format) => {
    const env = { DBPWD: 'opaque', VENDOR_CERTKEY: 'opaque', KEY: 'opaque', MAX_TOKENS: '128' };
    const { attributes } = await exportCustomData(format, {
      env,
      nested: JSON.stringify({ environment: env }),
      'process.env.DBPWD': 'opaque',
      'environmentVariables._DBPWD': 'opaque',
      environment: [{ name: 'APP_ENCRYPTIONKEY', value: 'opaque' }],
      'process.env': 'HOME=/tmp\nDBPWD=opaque\nKEY=opaque',
      envVars: [
        'DBPWD=opaque',
        'HOME=/tmp\r\nexport KEY = "first\r\nopaque"',
        'REGION=west\nMAX_TOKENS=128',
      ],
      key: 'item',
    });
    expect(JSON.parse(attributes.env as string).MAX_TOKENS).toBe('128');
    expect(attributes.envVars).toEqual(
      wireStrings('<redacted>', '<redacted>', 'REGION=west\nMAX_TOKENS=128'),
    );
    expect(attributes.key).toBe('item');
  });

  it.each(formats)('preserves unrelated command options after curl in %s', async (format) => {
    const cmd = ['rg', 'curl', '-u', 'src'];
    const shell = 'curl https://example.test && rg curl -u src ; git push -u origin main';
    const { attributes } = await exportCustomData(format, {
      cmd,
      shell,
      literal: ['curl', 'https://example.test', '&&', 'git', 'push', '-u', 'bot:opaque', 'main'],
      chained: 'curl -u "bot:opaque;value" https://host;git push -u origin main',
      lines: 'curl https://host\ngit push -u origin main',
    });
    expect(attributes.cmd).toEqual(wireStrings(...cmd));
    expect(attributes.command).toBe(cmd.join(' '));
    expect(attributes.shell).toBe(shell);
    expect(attributes.chained).toBe('curl -u <redacted> https://host;git push -u origin main');
    expect(attributes.lines).toContain('git push -u origin main');
  });

  it.each(formats)(
    'withholds embedded fields with escaped or punctuated credential keys in %s',
    async (format) => {
      const publicText = 'Reply: {"city name":"London","st\\u0061tus":"ok"}';
      const { attributes } = await exportCustomData(format, {
        text: 'Request failed: {"pass\\u0077ord":"opaque/value"}',
        array: 'Received {"\\u0061pi_key":["opaque/value"]}',
        control: 'Received {"db\\tpassword":"opaque/value"}',
        spaced: 'Request failed: {"api key":"opaque/value"}',
        jsonc: '{"password" /* note */: "opaque/value"}',
        scalar: JSON.stringify('{"password"\t/* note */\t: "opaque/value"}'),
        comment: 'Reply: {"apiKey" // note\n: ["opaque/value"]}',
        toml: "Request: 'database password' = 'opaque/value'",
        native: { 'api key': 'opaque/value', 'pass\\u0077ord': 'opaque/value' },
        publicText,
      });
      expect(attributes.publicText).toBe(publicText);
    },
  );

  it.each(formats)(
    'uses sibling executable information for split arguments in %s',
    async (format) => {
      const args = ['-u', 'bot:opaque/value', 'https://host'];
      const search = { program: 'rg', args: ['curl', '-u', 'src'] };
      const { attributes } = await exportCustomData(format, {
        cmd: 'curl',
        args,
        nested: { executable: '/usr/bin/curl', arguments: args.join(' ') },
        wrapped: { command: ['env', 'curl'], args },
        split: { command: ['env', 'curl', '-u'], args: args.slice(1) },
        serialized: JSON.stringify({ command: 'curl', argv: args }),
        search,
        text: 'env -i rg curl -u src',
      });
      expect(attributes.args).toEqual(wireStrings('-u', '<redacted>', 'https://host'));
      expect(attributes.search).toBe(JSON.stringify(search));
      expect(attributes.text).toBe('env -i rg curl -u src');
    },
  );

  it('scans native curl wrappers once, independent of the number of options', async () => {
    const args = ['env', ...Array(2000).fill('-i'), 'curl', '-u', 'bot:opaque/password'];
    let reads = 0;
    Object.defineProperty(args, 0, {
      get: () => {
        reads++;
        return 'env';
      },
    });
    await exportCustomData('json', { argv: args });
    expect(reads).toBeLessThan(10);
  });

  it.each(formats)(
    'keeps ordinary short options and masks curl authentication in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        command: ['git', 'push', '-u', 'origin', 'main'],
        gitText: 'git push -u origin main',
        curlArgs: ['curl', '-u', 'fixture-user:fixture-password'],
        curlText: 'curl -u fixture-user:fixture-password',
        curlLong: 'curl --user fixture-user:fixture-password',
        wrappedCurl: ['env', 'curl', '-u', 'fixture-user:fixture-password'],
        wrappedCurlText: 'env -i curl --user fixture-user:fixture-password',
        wrappedIdentity: 'env docker exec --user root app id',
        identity: ['docker', 'exec', '--user', 'root', 'app', 'id'],
        identityText: 'docker exec --user root app id',
        requiredOption: ['client', '--password', '-fixture-value'],
      });
      expect(attributes.command).toBe('git push -u origin main');
      expect(attributes.gitText).toBe('git push -u origin main');
      expect(attributes.curlArgs).toEqual(wireStrings('curl', '-u', '<redacted>'));
      expect(attributes.curlText).toBe('curl -u <redacted>');
      expect(attributes.curlLong).toBe('curl --user <redacted>');
      expect(attributes.wrappedCurl).toEqual(wireStrings('env', 'curl', '-u', '<redacted>'));
      expect(attributes.wrappedCurlText).toBe('env -i curl --user <redacted>');
      expect(attributes.wrappedIdentity).toBe('env docker exec --user root app id');
      expect(attributes.identity).toEqual(
        wireStrings('docker', 'exec', '--user', 'root', 'app', 'id'),
      );
      expect(attributes.identityText).toBe('docker exec --user root app id');
      expect(attributes.requiredOption).toEqual(wireStrings('client', '--password', '<redacted>'));
    },
  );

  it.each(formats)(
    'preserves text after quoted headers and TypeScript generic syntax in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        command: `curl -H "Authorization: Bearer fixture-value" https://example.test && echo done`,
        singleQuote: `curl -H 'Cookie: fixture=value' https://example.test && echo done`,
        genericType: `rg 'Promise<Session>' src`,
        nestedType: 'const value: Promise<Array<Session>> = result;',
        tsx: 'Promise<Session>;<div /> <b>Hi</b>',
        xml: 'prefix<Session>private</Session>',
      });
      expect(attributes.command).toBe(
        'curl -H "Authorization: <redacted>" https://example.test && echo done',
      );
      expect(attributes.singleQuote).toBe(
        "curl -H 'Cookie: <redacted>' https://example.test && echo done",
      );
      expect(attributes.genericType).toBe("rg 'Promise<Session>' src");
      expect(attributes.nestedType).toBe('const value: Promise<Array<Session>> = result;');
      expect(attributes.tsx).toBe('Promise<Session>;<div /> <b>Hi</b>');
      expect(attributes.xml).toBe('<redacted>');
    },
  );

  it.each(formats)('preserves JSON, ordinary lists and source paths in %s', async (format) => {
    const json =
      '{"url":"https://example.test","email":"alice@example.test","count":12345678901234567890123456789012345678901234567890123456789012345}';
    const lists = { fields: ['password', 'email'], tools: ['get_session', 'lookup_order'] };
    const sourcePath = 'src/app/src/pages/redteam/setup/components/PluginsTab.tsx';
    const { attributes } = await exportCustomData(format, {
      json,
      lists,
      command: `cat ${sourcePath}`,
    });
    expect(attributes.json).toBe(json);
    expect(JSON.parse(attributes.lists as string)).toEqual(lists);
    expect(attributes.command).toBe(`cat ${sourcePath}`);
  });

  it.each(formats)(
    'preserves exact numbers and command text through repeated redaction in %s',
    async (format) => {
      const decimal = '{"amount":1.0000000000000001,"password":"fixture"}';
      const { attributes } = await exportCustomData(format, {
        decimal,
        command: ['bash', '-c', 'echo sk-abcdefghijklmnopqrstuvwxyz; echo done'],
        ordinaryCommand: 'pwd && echo done',
        nestedCommand: JSON.stringify({ command: 'pwd && echo done', password: 'fixture' }),
        encoded: String.raw`prefix \"password\": \"fixture\"`,
        unfinished: String.raw`prefix \"public\\`,
      });
      expect(attributes.decimal).toBe('{"amount":1.0000000000000001,"password":"<redacted>"}');
      expect(attributes.command).toBe('bash -c echo <REDACTED_API_KEY>; echo done');
      expect(attributes.ordinaryCommand).toBe('pwd && echo done');
      expect(JSON.parse(attributes.nestedCommand as string)).toEqual({
        command: 'pwd && echo done',
        password: '<redacted>',
      });
      expect(attributes.encoded).toBe('<redacted>');
      expect(attributes.unfinished).toBe(String.raw`prefix \"public\\`);
    },
  );

  it.each(formats)(
    'redacts unsupported callable metadata and preserves adjacent values in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        structured: { callback: () => 'ordinary callback', note: 'kept' },
      });

      expect(JSON.parse(attributes.structured as string)).toEqual({
        callback: '<redacted>',
        note: 'kept',
      });
    },
  );

  it.each(formats)('preserves trailing holes in ordinary nested arrays in %s', async (format) => {
    const items = ['first'];
    items.length = 3;
    const structured = { items, empty: new Array(2) };
    const { attributes } = await exportCustomData(format, { structured });

    expect(attributes.structured).toBe(JSON.stringify(structured));
    expect(items).toHaveLength(3);
    expect(Object.keys(items)).toEqual(['0']);
  });

  it.each(formats)(
    'masks whitespace-delimited properties and retains ordinary lines in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        properties: 'region test\npassword fixture/value\napi_key\tfixture-key\nretries 3',
        dottedName: 'application.release.version',
        dottedAssignment: 'application.api_key=fixture-key',
      });
      expect(attributes.properties).toBe(
        'region test\npassword <redacted>\napi_key\t<redacted>\nretries 3',
      );
      expect(attributes.dottedName).toBe('application.release.version');
      expect(attributes.dottedAssignment).toBe('application.api_key=<redacted>');
    },
  );

  it.each(formats)(
    'rejects sparse arrays beyond the structured node limit in %s',
    async (format) => {
      const sparse: string[] = [];
      sparse[10_000] = 'fixture';
      const aggregate = Array.from({ length: 6 }, () => {
        const item = [];
        item[1_999] = 'last';
        return item;
      });
      const { attributes } = await exportCustomData(format, {
        sparse,
        nested: { sparse },
        aggregate,
        ordinary: ['first', 'last'],
      });
      expect(attributes).toMatchObject(redacted('sparse', 'nested', 'aggregate'));
      expect(attributes.ordinary).toEqual(wireStrings('first', 'last'));
    },
  );

  it.each(formats)(
    'redacts credential text formats without changing ordinary metadata in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        xml: '<config><password>fixture-value</password></config>',
        multipart:
          'Content-Disposition: form-data; name="credentials[password]"\r\n\r\nfixture-value',
        url: '//fixture-user:fixture-value@example.test/resource',
        publicUrl: '//example.test/resource',
        message: 'machine learning uses account metadata',
      });
      expect(attributes.xml).toBe('<redacted>');
      expect(attributes.multipart).toBe('<redacted>');
      expect(attributes.url).toBe('//<redacted>@example.test/resource');
      expect(attributes.publicUrl).toBe('//example.test/resource');
      expect(attributes.message).toBe('machine learning uses account metadata');
    },
  );

  it.each(formats)('keeps healthy spans when an attribute accessor fails in %s', async (format) => {
    const unreadable = Object.defineProperty({}, 'ciphertext', {
      enumerable: true,
      get() {
        throw new Error('unreadable attribute');
      },
    });
    const { attributes } = await exportCustomData(format, { details: unreadable, result: 'ok' });
    expect(attributes.details).toBe('<redacted>');
    expect(attributes.result).toBe('ok');
  });

  it.each(formats)(
    'keeps healthy spans when top-level custom attributes cannot be read in %s',
    async (format) => {
      const data: Record<string, unknown> = { result: 'ok' };
      const keys = ['details', 'command', 'cmd', 'exit_code', 'sandbox.operation'];
      for (const key of keys) {
        Object.defineProperty(data, key, {
          enumerable: true,
          get() {
            throw new Error('unreadable custom attribute');
          },
        });
      }

      const { attributes, payload } = await exportCustomData(format, data);
      expect(attributes.result).toBe('ok');
      for (const key of keys) {
        expect(attributes[key]).toBe('<redacted>');
      }
      expect(attributes['process.exit.code']).toBeUndefined();
      expect(payload.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('lookup');
    },
  );

  it.each(formats)(
    'preserves command and exit-code aliases when primary attributes are undefined in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        command: undefined,
        cmd: ['echo', 'ok'],
        exit_code: undefined,
        exitCode: 0,
      });
      expect(attributes.command).toBe('echo ok');
      expect(attributes['process.exit.code']).toBe(0);
      expect(attributes).not.toHaveProperty('exit_code');
    },
  );

  it.each(formats)(
    'redacts credential names without hiding public metadata in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        session_id: 'fixture-session',
        session_status: 'completed',
        session_duration: 42,
        useSession: true,
        arguments: ['client', '--session-id', 'fixture-session'],
        credentials: 'fixture-credential',
        certificateContent: 'fixture certificate',
        certificateIssuer: 'public issuer',
        token_count: 10,
      });
      expect(attributes.session_id).toBe('<redacted>');
      expect(attributes.session_status).toBe('completed');
      expect(attributes.session_duration).toBe(42);
      expect(attributes.useSession).toBe(true);
      expect(attributes.arguments).toEqual(wireStrings('client', '--session-id', '<redacted>'));
      expect(attributes.credentials).toBe('<redacted>');
      expect(attributes.certificateContent).toBe('<redacted>');
      expect(attributes.certificateIssuer).toBe('public issuer');
      expect(attributes.token_count).toBe(10);
    },
  );

  it.each(formats)('redacts typed credential declarations in %s', async (format) => {
    const { attributes } = await exportCustomData(format, {
      declaration: 'const password: string = "fixture-value";',
      ordinary: 'const token_count: number = 7;',
    });
    expect(attributes.declaration).toBe('<redacted>');
    expect(attributes.ordinary).toBe('const token_count: number = 7;');
  });

  it.each(formats)('redacts JWT headers containing JSON whitespace in %s', async (format) => {
    const tokens = ['{ "alg": "RS256" }', '\t{\r\n"alg":"RS256"}\n'].map(
      (header) => `${Buffer.from(header).toString('base64url')}.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl`,
    );
    const identifier = 'a-'.repeat(20_000);
    const { attributes, payload } = await exportCustomData(format, {
      result: tokens.join('\n'),
      module: 'package.module.method',
      identifier,
    });
    expect(attributes.result).toBe('<redacted>\n<redacted>');
    expect(attributes.module).toBe('package.module.method');
    expect(attributes.identifier).toBe(identifier);
    for (const token of tokens) {
      expect(JSON.stringify(payload)).not.toContain(token);
    }
  });

  it.each(formats)('redacts direct-encryption compact JWE credentials in %s', async (format) => {
    const token = Object.values(createJwe()).join('.');
    const { attributes } = await exportCustomData(format, {
      result: token,
      module: 'package.module.method',
    });
    expect(attributes.result).toBe('<redacted>');
    expect(attributes.module).toBe('package.module.method');
  });

  it.each(formats)(
    'redacts JWE JSON objects while preserving ordinary ciphertext metadata in %s',
    async (format) => {
      const flattened = createJwe();
      const { encrypted_key, ...envelope } = flattened;
      const general = { ...envelope, recipients: [{ encrypted_key }] };
      const ordinary = { ciphertext: 'public data', tag: 'version-1' };
      const input = { flattened, general, ordinary };
      const { attributes, payload } = await exportCustomData(format, {
        native: input,
        result: JSON.stringify(input),
        root: JSON.stringify(flattened),
      });
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

  it.each(formats)(
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
      const { attributes, payload } = await exportCustomData(format, {
        native: values,
        serialized: JSON.stringify(values),
      });
      const expected = Object.fromEntries(Object.keys(values).map((key) => [key, '<redacted>']));
      expect(JSON.parse(attributes.native as string)).toEqual(expected);
      expect(JSON.parse(attributes.serialized as string)).toEqual(expected);
      expect(JSON.stringify(payload)).not.toContain(split.ciphertext);
      expect(JSON.stringify(payload)).not.toContain(unprotected.ciphertext);
    },
  );

  it.each(formats)('redacts YAML credential flow collections in %s', async (format) => {
    const { attributes } = await exportCustomData(format, {
      sequence: 'tokens: [opaque-token-one, opaque-token-two]',
      mapping: 'password: {primary: opaque-secret}',
      nested: 'config: {password: {primary: opaque-nested}}',
      flowSequence: '[{password: {primary: opaque-sequence}}]',
      multiline: 'config:\n  credentials: [\n    opaque-first,\n    opaque-second\n  ]',
      ordinary: 'names: [first, second]',
    });
    expect(attributes).toMatchObject(
      redacted('sequence', 'mapping', 'nested', 'flowSequence', 'multiline'),
    );
    expect(attributes.ordinary).toBe('names: [first, second]');
  });

  it.each(formats)('redacts netrc password and account clauses in %s', async (format) => {
    const { attributes } = await exportCustomData(format, {
      single: 'machine api.example login buildbot password opaque/value',
      commented:
        'machine api.example\n# deployment account\nlogin buildbot\npassword opaque/commented',
      quoted: 'machine api.example\nlogin buildbot\npassword "opaque quoted phrase"',
      fallback: 'default login buildbot account opaque-account',
      ordinary: 'machine learning uses account metadata',
    });
    expect(attributes).toMatchObject(redacted('single', 'commented', 'quoted', 'fallback'));
    expect(attributes.ordinary).toBe('machine learning uses account metadata');
  });

  it.each(formats)('masks registered and connection-string credentials in %s', async (format) => {
    const marker = 'opaque/base64==';
    const connection =
      'DefaultEndpointsProtocol=https;AccountName=public;AccountKey=' +
      marker +
      ';EndpointSuffix=core.windows.net';
    const keys = [
      ...SECRET_FIELD_NAMES,
      'jksContent',
      'sshKey',
      'AccountKey',
      'SharedAccessKey',
      'AzureStorageKey',
      'dbConnectionString',
      'SENTRY_DSN',
      'connection.string',
      'ConnectionStrings__Primary',
      'SQLCONNSTR_Main',
      'env.portkeyvirtualkey',
    ];
    const fields = Object.fromEntries(keys.map((key) => [key, marker]));
    const output = { ...fields, AZURE_STORAGE_CONNECTION_STRING: connection, region: 'west' };
    const payload = await exportSpans(format, [
      {
        spanData: {
          type: 'function',
          name: 'lookup',
          input: connection,
          output: JSON.stringify(output),
        },
        traceMetadata: output,
      },
    ]);
    const attrs = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
    expect(JSON.stringify(payload)).not.toContain(marker);
    expect(attrs['tool.arguments']).toBe(connection.replace(marker, '<redacted>'));
    expect(JSON.parse(attrs['tool.output'] as string)).toMatchObject({
      AZURE_STORAGE_CONNECTION_STRING: '<redacted>',
      region: 'west',
    });
    expect(attrs['trace.metadata.AZURE_STORAGE_CONNECTION_STRING']).toBe('<redacted>');
  });

  it.each(formats)('redacts complete YAML, ODBC, and XML credentials in %s', async (format) => {
    const { attributes, payload } = await exportCustomData(format, {
      yaml: "password: 'opaque''suffix'",
      flow: 'config: {passphrase: "opaque nested phrase"}',
      nested: "config: [{password: 'opaque''nested'}]",
      odbc: 'Driver={ODBC Driver};UID=buildbot;PWD={opaque;credential};Database=public',
      escapedOdbc: 'Driver={ODBC Driver};PWD={opaque}};suffix};Database=public',
      xml: '<settings><password>opaque/xml</password></settings>',
      multilineXml: '<password\n data="public">opaque/body</password>',
      mixedXml: '<list>text<entry label="a > b"\r\n key="password">opaque/value</entry></list>',
      spacedXml: '<property name = "password" value = "opaque/spaced"/>',
      public: 'config: {description: "public phrase"}',
    });
    expect(attributes.yaml).toBe("password: '<redacted>'");
    expect(attributes.flow).toBe('config: {passphrase: "<redacted>"}');
    expect(attributes.nested).toBe("config: [{password: '<redacted>'}]");
    expect(attributes.odbc).toBe(
      'Driver={ODBC Driver};UID=buildbot;PWD=<redacted>;Database=public',
    );
    expect(attributes.escapedOdbc).toBe('Driver={ODBC Driver};PWD=<redacted>;Database=public');
    expect(attributes).toMatchObject(redacted('xml', 'multilineXml', 'mixedXml', 'spacedXml'));
    expect(attributes.public).toBe('config: {description: "public phrase"}');
    expect(JSON.stringify(payload)).not.toMatch(/opaque|suffix|credential/);
  });

  it.each(formats)('redacts PGP armor and TLS private-key fields in %s', async (format) => {
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
    const { attributes } = await exportCustomData(format, {
      armor:
        '-----BEGIN PGP PRIVATE KEY BLOCK-----\nopaque/base64\n-----END PGP PRIVATE KEY BLOCK-----',
      native: keys,
      serialized: JSON.stringify(keys),
    });
    expect(attributes.armor).toBe('<redacted>');
    for (const name of ['native', 'serialized']) {
      expect(JSON.parse(attributes[name] as string)).toEqual({
        'client-key-data': '<redacted>',
        ...redacted('client_key', 'ssl_key', 'tlsKey', 'signing_key', 'encryptionKey'),
        tls_key_algorithm: 'RSA',
        ssl_key_type: 'EC',
        client_key_id: 'kid-123',
        'client-certificate-data': 'public certificate',
      });
    }
  });

  it.each(formats)('redacts byte array attributes in %s', async (format) => {
    const throwing = { safe: 'public' };
    Object.defineProperty(throwing, 'secret', {
      enumerable: true,
      get() {
        throw new Error('do not read');
      },
    });
    const { attributes, payload } = await exportCustomData(format, {
      direct: Buffer.from('sk-direct-byte-secret'),
      native: { bytes: Buffer.from('sk-opaque-byte-secret') },
      throwing,
    });

    expect(attributes.direct).toBe('<redacted>');
    expect(JSON.parse(attributes.native as string)).toEqual({ bytes: '<redacted>' });
    expect(JSON.parse(attributes.throwing as string)).toEqual({
      safe: 'public',
      secret: '<redacted>',
    });
    expect(JSON.stringify(payload)).not.toContain('direct-byte-secret');
  });

  it.each(formats)(
    'redacts remaining credential text and structured shapes in %s',
    async (format) => {
      const { attributes } = await exportCustomData(format, {
        text: 'curl --user alice:opaque-user -H "Authorization: Custom opaque-auth"',
        embedded: 'Request: "{\\"p\\u0061ssword\\":\\"opaque-embedded\\"}"',
        native: {
          assertion: { type: 'contains', value: 'Paris' },
          client_assertion: 'opaque-assertion',
          client_assertion_type: 'public-type',
          passwords: 'opaque-passwords',
          env: { PGPASSWORD: 'opaque-pgpassword' },
          headers: ['Authorization', 'opaque-header', 'Content-Type'],
          encoded: '{"kty":"RSA","d":"opaque-jwk"}',
        },
      });

      expect(attributes.text).not.toContain('opaque-');
      expect(attributes.embedded).not.toContain('opaque-');
      expect(JSON.parse(attributes.native as string)).toMatchObject({
        assertion: { type: 'contains', value: 'Paris' },
        client_assertion: '<redacted>',
        client_assertion_type: 'public-type',
        passwords: '<redacted>',
        env: { PGPASSWORD: '<redacted>' },
        headers: ['Authorization', '<redacted>', 'Content-Type'],
        encoded: '{"kty":"RSA","d":"<redacted>"}',
      });
    },
  );

  it.each(formats)('preserves unmatched non-credential text in %s', async (format) => {
    const xml = '<entry key="public">'.repeat(3);
    const unterminated = '<entry key="public"'.repeat(3);
    const blankLines = '\n'.repeat(3);
    const encoded = '\\"public'.repeat(3);
    const fragments = ['a-a-a-', String.raw`\\\\`, 'Content-Disposition: x Content-Disposition: y'];
    const { attributes } = await exportCustomData(format, {
      xml,
      unterminated,
      blankLines,
      encoded,
      fragments: JSON.stringify(fragments),
    });

    expect(attributes.xml).toBe(xml);
    expect(attributes.unterminated).toBe(unterminated);
    expect(attributes.blankLines).toBe(blankLines);
    expect(attributes.encoded).toBe(encoded);
    expect(attributes.fragments).toBe(JSON.stringify(fragments));
  });

  it.each(formats)('redacts plural key collections in %s', async (format) => {
    const input = {
      api_keys: ['opaque/one', 'opaque/two'],
      apiKeys: { primary: 'opaque/three' },
      apikeys: ['opaque/four'],
      accessKeys: ['opaque/five'],
      private_keys: ['opaque/six'],
      cache_keys: ['public identifier'],
    };
    const { attributes } = await exportCustomData(format, {
      native: input,
      serialized: JSON.stringify(input),
    });
    for (const name of ['native', 'serialized']) {
      expect(JSON.parse(attributes[name] as string)).toEqual({
        ...redacted('api_keys', 'apiKeys', 'apikeys', 'accessKeys', 'private_keys'),
        cache_keys: ['public identifier'],
      });
    }
  });

  it.each(formats)(
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
      const { attributes } = await exportCustomData(format, { native: Array(200).fill(envelope) });
      expect(attributes.native).toBe('<redacted>');
      expect(reads).toBeLessThanOrEqual(10_000);
    },
  );

  it.each(formats)('redacts complete plain YAML credential scalars in %s', async (format) => {
    const { attributes } = await exportCustomData(format, {
      inline: 'passphrase: correct horse battery staple\nname: fixture',
      continued: 'config:\n  password:\n    correct horse\n    battery staple',
      ordinary: 'description: correct horse battery staple',
    });
    expect(attributes.inline).toBe('<redacted>');
    expect(attributes.continued).toBe('<redacted>');
    expect(attributes.ordinary).toBe('description: correct horse battery staple');
  });

  it.each(formats)(
    'redacts scoped npmrc credentials and preserves registry settings in %s',
    async (format) => {
      const npmrc = [
        '//registry.example/:_password=b3BhcXVlL3Bhc3N3b3Jk',
        '//registry.example/path/:_auth=opaque-base64-credential',
        '//registry.example/:_authToken="opaque token value"',
        '//registry.example/:username=fixture-user',
        'registry=https://registry.example/',
      ].join('\n');
      const { attributes } = await exportCustomData(format, { result: npmrc });
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

  it.each(formats)(
    'redacts native and serialized header lists and preserves public pairs in %s',
    async (format) => {
      const pairs = [
        'Authorization',
        'Negotiate opaque-proof',
        'Content-Type',
        'text/plain',
        'Cookie',
        'opaque-cookie',
      ];
      const clean = [
        'Authorization',
        '<redacted>',
        'Content-Type',
        'text/plain',
        'Cookie',
        '<redacted>',
      ];
      const headers = {
        rawHeaders: pairs,
        requestHeaders: pairs,
        responseHeaders: JSON.stringify(pairs),
      };
      const { attributes } = await exportCustomData(format, {
        ...headers,
        native: headers,
        result: JSON.stringify(headers),
        HTTPHeaders: [pairs.slice(0, 2)],
        partialHeaders: '["Authorization","Negotiate opaque-proof"',
      });
      expect(attributes.requestHeaders).toEqual(wireStrings(...clean));
      expect(JSON.parse(attributes.responseHeaders as string)).toEqual(clean);
      for (const key of ['native', 'result']) {
        expect(JSON.parse(attributes[key] as string)).toEqual({
          rawHeaders: clean,
          requestHeaders: clean,
          responseHeaders: JSON.stringify(clean),
        });
      }
    },
  );

  it.each(formats)('preserves code following an Authorization assignment in %s', async (format) => {
    const { attributes } = await exportCustomData(format, {
      script: 'enum Header { Authorization = "Authorization", ContentType = "Content-Type" }',
      header: 'Authorization=Digest realm="service", response="opaque-proof"',
    });
    expect(attributes.script).toBe(
      'enum Header { Authorization = "<redacted>", ContentType = "Content-Type" }',
    );
    expect(attributes.header).toBe('Authorization=<redacted>');
  });

  it.each(formats)('redacts case-varied header records in %s', async (format) => {
    const records = [
      { Name: 'Authorization', Value: 'opaque/header-value' },
      { KEY: 'X-Api-Key', VALUE: 'opaque/api-value' },
      { Name: 'Content-Type', Value: 'application/json' },
    ];
    const { attributes } = await exportCustomData(format, { records: JSON.stringify(records) });
    expect(JSON.parse(attributes.records as string)).toEqual([
      { Name: 'Authorization', Value: '<redacted>' },
      { KEY: 'X-Api-Key', VALUE: '<redacted>' },
      records[2],
    ]);
  });

  it.each(formats)(
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
      const { attributes, payload } = await exportCustomData(format, { key_set: { keys } });
      const sanitized = JSON.parse(attributes.key_set as string).keys;
      expect(sanitized).toEqual([
        {
          ...rsa,
          ...redacted('d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'),
        },
        keys[1],
        { ...keys[2], d: '<redacted>' },
        { ...keys[3], d: '<redacted>' },
        { kty: 'oct', k: '<redacted>' },
      ]);
      expect(JSON.stringify(payload)).not.toContain('private-');
    },
  );

  it.each(formats)('checks credential siblings before flattening records in %s', async (format) => {
    const records = [
      { kty: 'oct', k: 'opaque', kid: 'visible' },
      { kty: 'RSA', p: 'opaque', n: 'visible' },
      { kty: 'EC', d: 'opaque', x: 'visible' },
      { name: 'Authorization', value: 'opaque', region: 'visible' },
      { ...createJwe(), ciphertext: 'opaque' },
    ];
    const payload = await exportSpans(
      format,
      records.flatMap((data) => [
        { spanData: { type: 'custom', data }, traceMetadata: { value: 'public metadata' } },
        {
          spanData: { type: 'synthetic', ...data },
          traceMetadata: { ...data, 'evaluation.id': 'eval123', 'test.case.id': 'test123' },
        },
      ]),
    );
    const spans = payload.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(records.length * 2);
    expect(getAttributes(spans[0])).toMatchObject({ k: '<redacted>', kid: 'visible' });
    expect(getAttributes(spans[1])).toMatchObject({
      'agent.kid': 'visible',
      'trace.metadata.kid': 'visible',
    });
    expect(getAttributes(spans[6])['trace.metadata.value']).toBe('public metadata');
    expect(getAttributes(spans.at(-1))).toMatchObject({
      'evaluation.id': 'eval123',
      'test.case.id': 'test123',
    });
  });

  it.each(formats)(
    'bounds deeply nested native attributes before normalization in %s',
    async (format) => {
      let nested: unknown = 'deep-private-canary';
      for (let depth = 0; depth < 20_000; depth++) {
        nested = [nested];
      }
      const { attributes, payload } = await exportCustomData(format, {
        nested,
        details: { count: 2n, label: 'public' },
      });
      expect(JSON.parse(attributes.details as string)).toEqual({ count: '2', label: 'public' });
      expect(JSON.stringify(payload)).not.toContain('deep-private-canary');
      expect(JSON.stringify(payload)).toContain('<redacted>');
      expect(JSON.stringify(payload).length).toBeLessThan(10_000);
    },
  );

  it('exports task and turn hierarchy without treating them as model calls', async () => {
    const usage = {
      input_tokens: 12,
      output_tokens: 8,
      cached_input_tokens: 3,
      cache_write_input_tokens: 0,
    };
    const spanData: SpanData[] = [
      { type: 'task', name: 'Support task', usage: { ...usage, requests: 1, total_tokens: 20 } },
      { type: 'agent', name: 'Support Agent' },
      { type: 'turn', turn: 1, agent_name: 'Support Agent', usage },
      { type: 'response', _response: { model: 'gpt-4.1' } },
      { type: 'function', name: 'lookup_order', input: '{}', output: 'found' },
    ];
    const spanIds = spanData.map((_, index) => String(index + 1).padStart(16, '0'));
    const parentIndices = [null, 0, 1, 2, 2];
    const spans = spanData.map((data, index) => ({
      type: 'trace.span',
      traceId: 'trace_0123456789abcdef0123456789abcdef',
      spanId: `span_${spanIds[index]}`,
      parentId: parentIndices[index] === null ? null : `span_${spanIds[parentIndices[index]!]}`,
      spanData: data,
      traceMetadata: { 'promptfoo.otlp_format': 'json' },
      error: null,
    }));
    await new OTLPTracingExporter().export(spans as any);

    const exported = JSON.parse(mockFetchWithProxy.mock.calls[0][1].body).resourceSpans[0]
      .scopeSpans[0].spans;
    expect(exported.map((span: any) => span.name)).toEqual([
      'agent.task',
      'invoke_agent Support Agent',
      'agent.turn',
      'chat gpt-4.1',
      'execute_tool lookup_order',
    ]);
    expect(exported.map((span: any) => span.parentSpanId)).toEqual([
      undefined,
      ...[0, 1, 2, 2].map((index) => Buffer.from(spanIds[index], 'hex').toString('base64')),
    ]);
    expect(exported.map((span: any) => span.kind)).toEqual([1, 1, 1, 3, 1]);
    expect(getAttributes(exported[0])).toMatchObject({
      'agent.name': 'Support task',
      'agent.usage': JSON.stringify({ ...usage, requests: 1, total_tokens: 20 }),
    });
    expect(getAttributes(exported[2])).toMatchObject({
      'agent.turn': 1,
      'agent.agent_name': 'Support Agent',
      'agent.usage': JSON.stringify(usage),
    });
  });

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
      const input =
        '{"jwt":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_value",' +
        '"authorization_endpoint":"https://issuer.example/authorize",' +
        '"callback":"https://host/?access_token=secret\\\"suffix",' +
        '"url":"postgres://alice:s3cr3t@db.example/app",' +
        '"headers":[["Authorization","Bearer opaque/value"]]}';
      const payload = await exportSpans(format, [
        {
          spanData: { type: 'function', name: 'lookup', input },
          error: new Error(
            'apiKey: "tiny"; access_token = \'opaque/value\'; https://blob.example/x?sig=opaque%2Fsignature',
          ),
        },
      ]);
      const exportedSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];
      const attributes = getAttributes(exportedSpan);
      const arguments_ = JSON.parse(attributes['tool.arguments'] as string);
      expect(arguments_).toMatchObject({
        jwt: '<redacted>',
        authorization_endpoint: 'https://issuer.example/authorize',
        callback: 'https://host/?access_token=<redacted>',
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
      {
        name: 'credential text variants',
        input: {
          xml: '<entry key="password">opaque/xml</entry>',
          form: 'user[password]=opaque/value',
          AWS_ACCESS_KEY_ID: 'ASIAABCDEFGHIJKLMNOP',
        },
        expected: {
          xml: '<redacted>',
          form: 'user[password]=<redacted>',
          AWS_ACCESS_KEY_ID: '<redacted>',
        },
      },
    ].flatMap((testCase) => formats.map((format) => ({ ...testCase, format }))),
  )('sanitizes $name in $format exports', async ({ input, expected, format }) => {
    const payload = await exportSpans(format, [
      {
        spanData: { type: 'function', name: 'lookup', input: JSON.stringify(input) },
      },
    ]);
    const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
    expect(JSON.parse(attributes['tool.arguments'] as string)).toEqual(expected);
  });

  it.each(formats)(
    'preserves scientific notation while redacting $format tool arguments',
    async (format) => {
      const decimalUnderflow = `0.${'0'.repeat(400)}1`;

      const payload = await exportSpans(format, [
        {
          spanData: {
            type: 'function',
            name: 'lookup',
            input: `{"access_token":"tiny","amount":1e400,"underflow":1e-4000,"decimal":${decimalUnderflow}}`,
          },
        },
      ]);
      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      expect(attributes['tool.arguments']).toBe(
        `{"access_token":"<redacted>","amount":1e400,"underflow":1e-4000,"decimal":${decimalUnderflow}}`,
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

  it.each(formats)(
    'redacts credentials from tool data, metadata, and error messages in %s exports',
    async (format) => {
      const diagnostics = {
        token_count: 12,
        token_type: 'Bearer',
        token_ids: [101, 102],
        token_endpoint: 'https://issuer.example.com/oauth/token',
        token_url: 'https://issuer.example.com/token',
        secretary: 'Alice',
      };
      const apiKey = 'sk-abcdefghijklmnopqrstuvwxyz';
      const sessionToken = 'agent-session-token-value-123456789012345';
      const metadataSecret = 'customer-credential-without-a-known-prefix';
      const accessToken = 'opaque.value/with+arbitrary=chars';
      const clientSecret = 'tiny';
      const refreshToken = 'renew?credential/value';
      const clientCredentials = 'oauth-client-bundle';
      const callback = `https://host/callback?access_token=${accessToken}&token_count=12`;
      const colonCookie = 'colon-cookie-session';
      const secondaryCookie = 'csrf-cookie-opaque/value';
      const logDetails = [
        'access_token: colon-opaque/value',
        `Cookie: session=${colonCookie}; csrf=${secondaryCookie}`,
        'Authorization: Bearer header-opaque.value/with+arbitrary=chars',
        'Authorization=Basic equals-header-opaque/value',
        'Authorization: Digest realm="accounts;production", response="digest-response-opaque/value"',
        'Authorization=Negotiate negotiate-opaque/value',
        'Authorization: AWS4-HMAC-SHA256 Credential=account, SignedHeaders=host;x-amz-date, Signature=aws-signature-opaque/value',
      ].join('\n');
      const evaluationId = 'a'.repeat(64);
      const testCaseId = 'b'.repeat(64);
      const span = {
        spanData: {
          type: 'function',
          name: 'lookup_account',
          input: JSON.stringify({
            apiKey,
            accountId: 'account-123',
            access_token: accessToken,
            callback,
            encodedCallback: 'https://host/callback?%61ccess_token=encoded-query-opaque/value',
            credentials: 'opaque-credential-bundle',
            clientCredentials,
            authorization: ['Bearer opaque/container-value'],
            ...diagnostics,
            logDetails,
            nested: [{ refreshToken }],
          }),
          output: JSON.stringify({
            token: sessionToken,
            client_secret: clientSecret,
            secrets: 'opaque-secret-bundle',
            tokens: 'opaque-token-bundle',
            cookie: { session: 'opaque-cookie-session' },
            cookies: [{ name: 'sid', value: secondaryCookie }],
          }),
        },
        traceMetadata: {
          [apiKey]: 'metadata-key',
          customerApiKey: metadataSecret,
          clientCredentials,
          'evaluation.id': evaluationId,
          'test.case.id': testCaseId,
        },
        error: new Error(
          `Authentication failed for ${apiKey}: ${JSON.stringify({
            client_secret: clientSecret,
            access_token: accessToken,
          })}; ${callback}; ${logDetails}`,
        ),
      };

      const payload = await exportSpans(format, [span]);
      for (const secret of [
        apiKey,
        sessionToken,
        metadataSecret,
        clientSecret,
        refreshToken,
        clientCredentials,
        colonCookie,
      ]) {
        expect(JSON.stringify(payload)).not.toContain(secret);
      }

      const exportedSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];
      const attributes = getAttributes(exportedSpan);
      expect(JSON.parse(attributes['tool.arguments'] as string)).toEqual({
        apiKey: '<redacted>',
        accountId: 'account-123',
        access_token: '<redacted>',
        callback: 'https://host/callback?access_token=<redacted>&token_count=12',
        encodedCallback: 'https://host/callback?%61ccess_token=<redacted>',
        ...redacted('credentials', 'clientCredentials', 'authorization'),
        ...diagnostics,
        logDetails: '<redacted>',
        nested: [{ refreshToken: '<redacted>' }],
      });
      expect(JSON.parse(attributes['tool.output'] as string)).toEqual(
        redacted('token', 'client_secret', 'secrets', 'tokens', 'cookie', 'cookies'),
      );
      expect(attributes['trace.metadata.customerApiKey']).toBe('<redacted>');
      expect(attributes['trace.metadata.clientCredentials']).toBe('<redacted>');
      expect(attributes['evaluation.id']).toBe(evaluationId);
      expect(attributes['test.case.id']).toBe(testCaseId);
      expect(exportedSpan.status.message).toBe('<redacted>');
    },
  );

  it.each(formats)(
    'redacts headers, command arguments, and span names throughout %s payloads',
    async (format) => {
      const credentials = [
        'opaque-digest-proof',
        'opaque-cookie-value',
        'opaque/cli-value',
        'opaque cli token',
        'sk-abcdefghijklmnopqrstuvwxyz',
      ];
      const payload = await exportSpans(format, [
        {
          spanData: {
            type: 'custom',
            name: credentials[4],
            data: {
              digest: `Authorization: Digest uri="/app?x=1&y=2", response="${credentials[0]}"`,
              header_text: `Cookie: sid="${credentials[1]}"`,
              cmd: ['deploy', '--api-key', credentials[2], '--region', 'test-region'],
              dashPrefixedValue: ['deploy', '--password', '--fixture-value', 'test-region'],
              invocation: `deploy --dry-run --api-key=${credentials[2]} --token-count 12`,
              command: `deploy --dry-run --token "${credentials[3]}" --region test-region`,
            },
          },
        },
        {
          spanData: {
            type: 'custom',
            name: 'sandbox.exec',
            data: { cmd: ['deploy', '--api-key', credentials[3], '--region', 'test-region'] },
          },
        },
      ]);
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
      expect(getAttributes(span).dashPrefixedValue).toEqual(
        wireStrings('deploy', '--password', '<redacted>', 'test-region'),
      );
      expect(getAttributes(span).cmd).toEqual(
        wireStrings('deploy', '--api-key', '<redacted>', '--region', 'test-region'),
      );
    },
  );

  it.each(formats)(
    'redacts unlabeled credentials and preserves Date serialization in %s',
    async (format) => {
      const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl';
      const date = new Date('2026-01-01T00:00:00Z');
      const serialized = { toJSON: vi.fn(() => ({ date, password: 'opaque-custom' })) };

      const payload = await exportSpans(format, [
        {
          spanData: {
            type: 'custom',
            name: `result ${jwt}`,
            data: {
              result: jwt,
              literal_yaml: 'api_key: |\n  opaque/value',
              folded_yaml: "'password': >- # credential\n  secret text",
              ordinary_yaml: 'description: |\n  public description',
              request: '{"offset":-0,"exponent":-0e0,"password":"opaque"}',
              google: 'error ' + 'AIza' + 'a'.repeat(35),
              multipart: 'Content-Disposition: form-data; name="password"\r\n\r\nopaque-multipart',
              envelope:
                'request failed: {"protected":"e30","ciphertext":"opaque-cipher","tag":"opaque-tag"}',
              xml: '<property name="password" value="opaque-xml"/>',
            },
          },
          traceMetadata: {
            recorded_at: date,
            'evaluation.id': serialized,
            nested: { date },
            serialized,
            list: [date, serialized],
          },
          error: { message: jwt },
        },
      ]);
      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      const dateText = JSON.stringify(date);
      expect(attributes).toMatchObject({
        ...redacted('result', 'literal_yaml', 'folded_yaml'),
        ordinary_yaml: 'description: |\n  public description',
        request: '{"offset":-0,"exponent":-0e0,"password":"<redacted>"}',
        'evaluation.id': '<redacted>',
        'trace.metadata.recorded_at': dateText,
        'trace.metadata.nested': JSON.stringify({ date }),
        'trace.metadata.serialized': '<redacted>',
        'trace.metadata.list': wireStrings(dateText, '<redacted>'),
      });
      expect(serialized.toJSON).not.toHaveBeenCalled();
      expect(JSON.stringify(payload)).not.toContain(jwt);
      expect(JSON.stringify(payload)).not.toContain('AIza' + 'a'.repeat(35));
    },
  );

  it.each(formats)(
    'redacts escaped credentials while preserving descriptive authentication and usage fields in %s',
    async (format) => {
      const payload = await exportSpans(format, [
        {
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
              auth_status: 'authenticated',
              auth_enabled: true,
              token_endpoint_auth_methods_supported: ['client_secret_post'],
              num_tokens: 12,
              tokens_used: 3,
              estimated_tokens: 15,
              access_token: 'opaque-access-token',
              auth: 'opaque-auth',
            },
          },
        },
      ]);
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
        auth_status: 'authenticated',
        auth_enabled: true,
        token_endpoint_auth_methods_supported: wireStrings('client_secret_post'),
        num_tokens: 12,
        tokens_used: 3,
        estimated_tokens: 15,
        access_token: '<redacted>',
        auth: '<redacted>',
      });
    },
  );

  it.each(formats)(
    'sanitizes custom linkage and bounds native arrays without consuming trailing code in %s',
    async (format) => {
      const aggregate = Array<string>(70).fill('x'.repeat(1024));
      const unread = vi.fn();
      Object.defineProperty(aggregate, 69, { get: unread });
      const payload = await exportSpans(format, [
        {
          spanData: {
            type: 'custom',
            name: 'lookup',
            data: {
              'evaluation.id': 'sk-abcdefghijklmnopqrstuvwxyz',
              'test.case.id': 'sk-abcdefghijklmnopqrstuvwxyz',
              chunks: ['x'.repeat(65_537)],
              aggregate,
              script: 'document.cookie = serializePreferences(settings); return response;',
              bytes: { nested: Buffer.from('opaque-bytes') },
            },
          },
        },
        {
          spanData: { type: 'custom', name: 'lookup', data: { 'evaluation.id': 'spoofed' } },
          traceMetadata: {
            'evaluation.id': 'sk-trusted-evaluation',
            'test.case.id': 'sk-trusted-case',
          },
        },
      ]);
      const spans = payload.resourceSpans[0].scopeSpans[0].spans;
      const attributes = getAttributes(spans[0]);
      expect.soft(attributes['evaluation.id']).toBe('<REDACTED_API_KEY>');
      expect.soft(attributes['test.case.id']).toBe('<REDACTED_API_KEY>');
      expect.soft(attributes.chunks === '<redacted>').toBe(true);
      expect(attributes.aggregate).toBe('<redacted>');
      expect(unread).not.toHaveBeenCalled();
      expect.soft(attributes.script).toBe('document.cookie = <redacted>; return response;');
      expect.soft(attributes.bytes).toBe('{"nested":"<redacted>"}');
      expect(getAttributes(spans[1])).toMatchObject({
        'evaluation.id': 'sk-trusted-evaluation',
        'test.case.id': 'sk-trusted-case',
      });
    },
  );

  it.each(formats)(
    'redacts resource names, equals-delimited headers, and private keys in %s',
    async (format) => {
      const credentials = ['opaque-equals-digest-proof', 'sk-abcdefghijklmnopqrstuvwxyz'];
      const jwe = JSON.stringify(createJwe());
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
      const payload = await exportSpans(format, [
        {
          spanData: {
            type: 'custom',
            name: jwe,
            data: {
              digest: `Authorization=Digest uri="/app?x=1&y=2", response="${credentials[0]}"`,
              private_keys: privateKeys.map((key) => `Command failed: ${key}`),
              truncated: 'Failure: -----BEGIN PRIVATE KEY-----\nprivate-partial-material',
              public_key: '-----BEGIN PUBLIC KEY-----\npublic-material\n-----END PUBLIC KEY-----',
              account_id: 'account-123',
            },
          },
          traceMetadata: {
            'promptfoo.service_name': jwe,
          },
        },
      ]);
      const serialized = JSON.stringify(payload);
      for (const credential of [
        ...credentials,
        createJwe().ciphertext,
        'private-material-',
        'private-partial-material',
      ]) {
        expect.soft(serialized).not.toContain(credential);
      }
      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      expect(attributes.account_id).toBe('account-123');
      expect(attributes.public_key).toContain('public-material');
    },
  );

  it.each(formats)(
    'redacts password aliases and embedded encoded credentials in %s',
    async (format) => {
      const password = 'tiny/db-password';
      const encodedPassword = 'opaque/db-password';
      const note = `Response: ${JSON.stringify({ body: JSON.stringify({ accountId: '123' }) })}`;
      const payload = await exportSpans(format, [
        {
          spanData: {
            type: 'function',
            name: 'lookup',
            input: JSON.stringify({ pwd: password, accountId: '123', note }),
            output: `Connection failed; PWD=${password}`,
          },
          error: new Error(
            `Request failed: ${JSON.stringify({ body: JSON.stringify({ password: encodedPassword }) })}`,
          ),
        },
      ]);
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
      const input = includesCredential
        ? '{"access_token":"tiny","order_id":9223372036854775807}'
        : '{"order_id":9223372036854775807,"token_count":12}';
      const payload = await exportSpans(format, [
        {
          spanData: { type: 'function', name: 'lookup_order', input },
        },
      ]);
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
      const parseSpy = shape === 'oversized' ? vi.spyOn(JSON, 'parse') : undefined;
      try {
        const payload = await exportSpans(format, [
          { spanData: { type: 'function', name: 'nested_tool', input: unsafeInput } },
          { spanData: { type: 'function', name: 'healthy_tool', input: '{"accountId":"123"}' } },
        ]);
        if (parseSpy) {
          expect(parseSpy.mock.calls.some(([text]) => text === unsafeInput)).toBe(false);
        }
        const exportedSpans = payload.resourceSpans[0].scopeSpans[0].spans;
        expect(exportedSpans).toHaveLength(2);
        expect(JSON.stringify(exportedSpans)).not.toContain(deeplyNestedSecret);
        expect(JSON.stringify(exportedSpans)).not.toContain('9223372036854776000');
        expect(getAttributes(exportedSpans[0])['tool.arguments']).toContain('<redacted>');
        expect(getAttributes(exportedSpans[1])['tool.arguments']).toBe('{"accountId":"123"}');
      } finally {
        parseSpy?.mockRestore();
      }
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
