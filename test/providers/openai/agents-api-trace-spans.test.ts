import { describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { normalizeHostedTrace } from '../../../src/providers/openai/agents-api-trace-spans';

const traceId = 'b94f3ef2d9574e71a3084b13865d60b8';
const parentId = '6f3b409971b19c81';

function attribute(key: string, stringValue: string) {
  return { key, value: { stringValue } };
}

function nativeSpan(spanId: string, operation: string, parentSpanId?: string) {
  return {
    traceId,
    spanId,
    parentSpanId,
    name: 'private source span name',
    startTimeUnixNano: '1700000000000000000',
    endTimeUnixNano: '1700000000025000000',
    status: { code: 'STATUS_CODE_OK', message: 'private status detail' },
    attributes: [attribute('gen_ai.operation.name', operation)],
  };
}

function payload(...spans: object[]) {
  return { resourceSpans: [{ scopeSpans: [{ spans }] }] };
}

const root = nativeSpan('1111111111111111', 'invoke_agent');
const completenessKey = 'openai.managed_agents.trace.completeness';
root.attributes.push(
  attribute(
    completenessKey,
    JSON.stringify({ status: 'complete', missing_outputs: [], ordering_issues: [] }),
  ),
);
const tool = nativeSpan('2222222222222222', 'execute_tool', root.spanId);
tool.attributes.push(
  attribute('gen_ai.tool.name', 'lookup_order'),
  attribute(
    'gen_ai.tool.call.arguments',
    JSON.stringify({
      order_id: '417',
      headers: { Authorization: 'private authentication' },
      note: 'uses a fixture credential',
    }),
  ),
  attribute('gen_ai.tool.call.result', 'private tool result'),
);
const model = nativeSpan('3333333333333333', 'chat', root.spanId);
model.attributes.push(
  attribute('gen_ai.request.model', 'gpt-6-astra'),
  attribute('gen_ai.input.messages', 'private input'),
  attribute('gen_ai.output.messages', 'private answer'),
  attribute('gen_ai.system_instructions', 'private instructions'),
);

function toolWithArgs(raw?: string) {
  const attributes = [
    attribute('gen_ai.operation.name', 'execute_tool'),
    attribute('gen_ai.tool.name', 'lookup_order'),
  ];
  if (raw !== undefined) {
    attributes.push(attribute('gen_ai.tool.call.arguments', raw));
  }
  return { ...tool, attributes };
}

function importWithRedaction(key: string, args: unknown = { order_id: '417', limit: 3 }) {
  return cliState.withRequestTracingConfig(
    { enabled: true, otlp: { http: { enabled: true, port: 4318, redactAttributes: [key] } } },
    async () => {
      const cleanTool = toolWithArgs(JSON.stringify(args));
      return normalizeHostedTrace(payload(root, cleanTool), parentId, true);
    },
  );
}

describe('normalizeHostedTrace', () => {
  it('attaches the native tree to each invocation, including children listed before their root', () => {
    const native = payload(tool, model, root);
    const { spans, complete } = normalizeHostedTrace(native, parentId, false);
    expect(complete).toBe(true);
    expect(spans).toHaveLength(3);
    const hostedRoot = spans.find((span) => span.parentSpanId === parentId)!;
    expect(hostedRoot.name).toBe('invoke_agent');
    expect(spans.filter((span) => span.parentSpanId === hostedRoot.spanId)).toHaveLength(2);
    expect(normalizeHostedTrace(native, parentId, false).spans).toEqual(spans);
    const other = normalizeHostedTrace(native, 'aaaaaaaaaaaaaaaa', false).spans;
    expect(other.every((span) => spans.every((s) => s.spanId !== span.spanId))).toBe(true);
  });

  it('stores timings, status and tool identity without content or source span names', () => {
    const failedTool = {
      ...tool,
      status: { code: 'STATUS_CODE_ERROR', message: 'private status detail' },
    };
    const normalized = normalizeHostedTrace(
      payload(root, failedTool, model),
      parentId,
      false,
    ).spans;
    const storedTool = normalized.find((span) => span.attributes?.['tool.name'] === 'lookup_order');
    expect(storedTool).toMatchObject({
      startTime: 1700000000000,
      endTime: 1700000000025,
      statusCode: 2,
    });
    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toMatch(/private|order_id|fixture credential/);
  });

  it('classifies effective resource and span errors without persisting resource diagnostics', () => {
    const call = { ...tool, attributes: [...tool.attributes, attribute('status.code', 'OK')] };
    const data = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              attribute('status.code', 'ERROR'),
              attribute('private-resource', 'private diagnostic'),
            ],
          },
          scopeSpans: [{ spans: [root, call] }],
        },
      ],
    };
    const { spans, complete } = normalizeHostedTrace(data, parentId, false);
    expect(complete).toBe(true);
    expect(spans.find((s) => s.name === 'invoke_agent')?.statusCode).toBe(2);
    expect(spans.find((s) => s.name === 'execute_tool lookup_order')?.statusCode).toBe(1);
    expect(spans.every((s) => s.attributes?.['promptfoo.openai.error_status_complete'])).toBe(true);
    expect(JSON.stringify(spans)).not.toMatch(/private|status\.code/);
  });

  it('keeps observed errors and tool identity across OTLP attribute loss', () => {
    const data = {
      resourceSpans: [
        {
          resource: { droppedAttributesCount: 1, attributes: [attribute('status.code', 'ERROR')] },
          scopeSpans: [
            {
              spans: [
                root,
                { ...tool, droppedAttributesCount: '1' },
                { ...model, attributes: [...model.attributes, attribute('status.code', 'OK')] },
              ],
            },
          ],
        },
      ],
    };
    const { spans, complete } = normalizeHostedTrace(data, parentId, false);
    expect(complete).toBe(true);
    expect(
      spans.map((s) => [
        s.name,
        s.statusCode,
        s.attributes?.['promptfoo.openai.error_status_complete'],
      ]),
    ).toEqual([
      ['invoke_agent', 2, true],
      ['execute_tool lookup_order', 1, false],
      ['chat gpt-6-astra', 1, false],
    ]);
  });

  it('accepts a bare chat name only when the exporter could not have dropped its model', () => {
    const chat = nativeSpan(model.spanId, 'chat', root.spanId);
    const uncertain = { ...chat, droppedAttributesCount: 1 };
    for (const spans of [
      [root, uncertain],
      [uncertain, root],
    ]) {
      expect(normalizeHostedTrace(payload(...spans), parentId, false).complete).toBe(false);
    }
    expect(normalizeHostedTrace(payload(root, chat), parentId, false).complete).toBe(true);
    expect(
      normalizeHostedTrace(payload(root, { ...model, droppedAttributesCount: 1 }), parentId, false)
        .complete,
    ).toBe(true);
    const resource = { attributes: [attribute('gen_ai.request.model', 'resource-model')] };
    const withResource = (span: object, droppedAttributesCount = 0) =>
      normalizeHostedTrace(
        {
          resourceSpans: [
            {
              resource: { ...resource, droppedAttributesCount },
              scopeSpans: [{ spans: [root, span] }],
            },
          ],
        },
        parentId,
        false,
      );
    expect(withResource(chat).spans.map((s) => s.name)).toContain('chat resource-model');
    expect(withResource(model, 1).spans.map((s) => s.name)).toContain('chat gpt-6-astra');
    expect(withResource(uncertain).complete).toBe(false);
    expect(
      normalizeHostedTrace(
        {
          resourceSpans: [
            { resource: { droppedAttributesCount: 1 }, scopeSpans: [{ spans: [root, chat] }] },
          ],
        },
        parentId,
        false,
      ).complete,
    ).toBe(false);
  });

  it.each([
    ['error', { boolValue: true }, 'UNSET', '', 2],
    ['http.status_code', { intValue: '500' }, 'UNSET', '', 2],
    ['failed', { stringValue: 'true' }, 'OK', '', 2],
    [
      'exception',
      { kvlistValue: { values: [attribute('message', 'private exception')] } },
      'UNSET',
      '',
      2,
    ],
    ['otel.status_code', { stringValue: 'ERROR' }, 'UNSET', '', 2],
    ['failure', { boolValue: false }, 'UNSET', 'private timeout detail', 2],
    ['error', { boolValue: false }, 'UNSET', '', 0],
    ['http.status_code', { intValue: '200' }, 'OK', '', 1],
  ] as const)(
    'classifies %s with status %s without persisting diagnostic text',
    (key, value, code, message, expectedCode) => {
      const call = {
        ...tool,
        status: { code, message },
        attributes: [...tool.attributes, { key, value }],
      };
      const { spans, complete } = normalizeHostedTrace(payload(root, call), parentId, false);
      expect(complete).toBe(true);
      const saved = spans.find((span) => span.name === 'execute_tool lookup_order');
      expect(saved?.statusCode).toBe(expectedCode);
      expect(saved?.attributes).not.toHaveProperty(key);
      expect(JSON.stringify(spans)).not.toContain('private');
    },
  );

  it.each([
    ['API key', 'AIza' + 'x'.repeat(35)],
    ['JWT', 'eyJfixture.payload.signature'],
  ])(
    'withholds tool and model identifiers containing an embedded %s even without argument capture',
    (_label, token) => {
      const name = `mcp_lookup_${token}`;
      const namedTool = {
        ...tool,
        attributes: [
          attribute('gen_ai.operation.name', 'execute_tool'),
          attribute('gen_ai.tool.name', name),
        ],
      };
      expect(() => normalizeHostedTrace(payload(root, namedTool), parentId, false)).toThrow(
        'Invalid hosted OTLP trace',
      );
      const namedModel = {
        ...model,
        attributes: [
          attribute('gen_ai.operation.name', 'chat'),
          attribute('gen_ai.request.model', name),
        ],
      };
      expect(() => normalizeHostedTrace(payload(root, namedModel), parentId, false)).toThrow(
        'Invalid hosted OTLP trace',
      );
    },
  );

  it.each([
    'vendor/model',
    'organization/vendor-very-long-but-human-readable-model-name-2026-10-20-0000003',
  ])('preserves safe model ID %s in attributes and span names', (id) => {
    const chat = {
      ...model,
      attributes: [
        attribute('gen_ai.operation.name', 'chat'),
        attribute('gen_ai.request.model', id),
      ],
    };
    const { spans, complete } = normalizeHostedTrace(payload(root, chat), parentId, false);
    expect(complete).toBe(true);
    expect(spans[1]).toMatchObject({
      name: `chat ${id}`,
      attributes: { 'gen_ai.request.model': id },
    });
  });

  it('scans a bounded trace containing many JWT prefixes without retrying every prefix', () => {
    const text = ' ' + 'eyJ'.repeat(20_000) + '.onlyone';
    const raw = JSON.stringify({ cmd: 'curl ' + text, cwd: '/workspace' });
    const calls = Array.from({ length: 4 }, (_, i) => ({
      ...toolWithArgs(raw),
      spanId: (i + 10).toString(16).padStart(16, '0'),
    }));
    const { spans } = normalizeHostedTrace(payload(root, ...calls), parentId, true);
    for (const span of spans.slice(1)) {
      expect(JSON.parse(span.attributes?.['tool.arguments'])).toEqual({ cwd: '/workspace' });
      expect(span.attributes?.['promptfoo.tool.arguments_redacted']).toBe(true);
    }
  }, 3000);

  it('imports opted-in arguments after redaction, and still omits results, messages and raw status', () => {
    const redact = (s: string) => s.replaceAll('fixture credential', '[REDACTED]');
    const { spans } = normalizeHostedTrace(payload(root, tool, model), parentId, true, redact);
    const attrs = spans.find((span) => span.attributes?.['tool.name'] === 'lookup_order')!
      .attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ order_id: '417' });
    expect(attrs['gen_ai.tool.call.arguments']).toBe(attrs['tool.arguments']);
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toMatch(/private|fixture credential/);
  });

  it('applies request-scoped redactions to supported fields before storing them', async () => {
    const { spans } = await importWithRedaction('order_id');
    const attrs = spans.find((span) => span.attributes?.['tool.name'] === 'lookup_order')!
      .attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ limit: 3 });
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toContain('417');
  });

  it('withholds the entire input when it contains nested JSON text', () => {
    const input = JSON.stringify({ body: JSON.stringify([{ ORDER_ID: 'private order' }]) });
    const raw = JSON.stringify({ input, cwd: '/workspace' });
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ cwd: '/workspace' });
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toContain('private order');
  });

  it.each([
    ["curl -H 'X-API-Key: synthetic-fixture' https://example.test"],
    ['curl --header="Proxy-Authorization: synthetic-fixture" https://example.test'],
    ["curl -H 'Authentication: synthetic-fixture' https://example.test"],
    ['export _GITHUB_TOKEN=synthetic-fixture; run'],
    ['client --password synthetic-fixture'],
    ['client "--password" synthetic-fixture'],
    ['curl -u alice:synthetic-fixture https://example.test'],
    ['curl --netrc-file synthetic-fixture https://example.test'],
    ["/bin/bash -lc 'cat ledger.csv; curl -u alice:synthetic-fixture https://example.test'"],
    [['curl', '-H', 'Authorization: synthetic-fixture']],
    [['client', '--api-key', 'synthetic-fixture']],
    [String.raw`curl -d "{\"customer_id\":\"synthetic-fixture\"}" https://example.test`],
  ])('omits named credentials or custom protected fields embedded in %j', async (cmd) => {
    const { spans } = await importWithRedaction('customer_id', { cmd, cwd: '/workspace' });
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ cwd: '/workspace' });
    expect(attrs['gen_ai.tool.call.arguments']).toBe(attrs['tool.arguments']);
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toContain('synthetic-fixture');
  });

  it('preserves the supported scalar fields and the original raw JSON', () => {
    const args = {
      cwd: '/workspace',
      path: '/workspace/ledger.csv',
      file_path: 'data/ledger.csv',
      filename: 'ledger.csv',
      id: 17,
      order_id: '00417',
      limit: 10,
      offset: 0,
      count: 2,
      page: 1,
    };
    const raw = JSON.stringify(args, null, 2);
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    expect(spans[1].attributes?.['tool.arguments']).toBe(raw);
    expect(spans[1].attributes?.['gen_ai.tool.call.arguments']).toBe(raw);
    expect(spans[1].attributes?.['promptfoo.tool.arguments_redacted']).toBeUndefined();
  });

  it('applies provider credential redaction to a supported path', () => {
    const path = '/workspace/private-file.csv';
    const raw = JSON.stringify({ path, cwd: '/workspace' });
    const { spans } = normalizeHostedTrace(
      payload(root, toolWithArgs(raw)),
      parentId,
      true,
      (value) => value.replaceAll(path, '[REDACTED]'),
    );
    expect(JSON.parse(spans[1].attributes?.['tool.arguments'])).toEqual({ cwd: '/workspace' });
    expect(spans[1].attributes?.['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toContain(path);
  });

  it.each([
    ["/bin/bash -lc 'cat /workspace/ledger.csv'"],
    ["/bin/bash -lc 'cat receipt.txt'"],
    ['wc -l /workspace/ledger.csv'],
    ['head -n 4 ledger.csv'],
    [['/bin/bash', '-lc', 'tail -n 3 ledger.csv']],
    [['/usr/bin/ls', '-la', '/workspace']],
    ['pwd'],
  ])('retains complete file inspection arguments for %j', (command) => {
    const raw = JSON.stringify({ command, cwd: '/workspace' });
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    expect(spans[1].attributes?.['tool.arguments']).toBe(raw);
    expect(spans[1].attributes?.['promptfoo.tool.arguments_redacted']).toBeUndefined();
  });

  it('preserves a nonempty list of file inspection commands', () => {
    const raw = JSON.stringify({ commands: ['pwd', 'cat /workspace/ledger.csv'] });
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    expect(spans[1].attributes?.['tool.arguments']).toBe(raw);
    expect(spans[1].attributes?.['promptfoo.tool.arguments_redacted']).toBeUndefined();
  });

  it.each([
    ['unrecognized function fields', { query: 'ordinary text', format: 'compact' }],
    ['different casing', { ORDER_ID: '1729', Cmd: 'pwd' }],
    ['malformed JSON body', { body: '{"name":"GITHUB_TOKEN","value":"synthetic-fixture"' }],
    ['encoded JSON body', { input: '{"name":"customer_id","value":"synthetic-fixture"}' }],
    ['environment tuples', { env: [['UPSTREAM_PRIVATE_KEY', 'synthetic-fixture']] }],
    ['header tuples', { request_headers: [['X-Api-Key', 'synthetic-fixture']] }],
    ['custom header map', { request_headers: { 'X-Honeycomb-Team': 'synthetic-fixture' } }],
    ['name and value', { name: 'X-Api-Key', value: 'synthetic-fixture' }],
    [
      'nested metadata',
      { metadata: { payload: { request_headers: { key: 'synthetic-fixture' } } } },
    ],
    ['path containing a credential', { path: 'https://user:synthetic-fixture@example.test/file' }],
    ['structured filename', { filename: { path: 'synthetic-fixture' } }],
    ['arbitrary ID', { id: 'synthetic-fixture' }],
    ['oversized decimal ID', { order_id: '1'.repeat(120) }],
    ['nonnumeric controls', { limit: '2', count: 1.5 }],
    ['empty command list', { commands: [] }],
    ['mixed command list', { commands: ['pwd', 'curl -u user:synthetic-fixture'] }],
    ['non-string command list', { commands: [['cat', 'file.csv']] }],
  ] as const)('omits %s and keeps the independently valid working directory', (_label, fields) => {
    const raw = JSON.stringify({ ...fields, cwd: '/workspace' });
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans[1].attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ cwd: '/workspace' });
    expect(attrs['gen_ai.tool.call.arguments']).toBe(attrs['tool.arguments']);
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toContain('synthetic-fixture');
  });

  it('drops command fields containing credential-bearing URLs and embedded token-like values', () => {
    const args = {
      cmd: 'curl https://svc:private-password@example.test/resource',
      script: 'set -x; export TOKEN=AKIA1234567890ABCDEF',
      dsn: 'connect postgres://svc:private-password@example.test/data',
      cwd: '/workspace',
    };
    const { spans } = normalizeHostedTrace(
      payload(root, toolWithArgs(JSON.stringify(args))),
      parentId,
      true,
    );
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ cwd: '/workspace' });
    expect(attrs['gen_ai.tool.call.arguments']).toBe(attrs['tool.arguments']);
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toMatch(/private-password|AKIA/);
  });

  it.each([
    ['oversized', ' '.repeat(65_536) + '{"limit":2}'],
    ['malformed', '{"order_id":'],
    ['duplicate keys', '{"order_id":"417","order_id":"418"}'],
    ['unrepresentable number', '{"limit":9007199254740993}'],
    ['unsafe integer with identical wire spelling', '{"limit":1000000000000000100}'],
    ['rounded fraction', '{"limit":1.00000000000000001}'],
    ['overflow', '{"limit":1e400}'],
    ['underflow', '{"limit":1e-400}'],
    ['escaped duplicate key', String.raw`{"order_id":"417","\u006frder_id":"418"}`],
  ])('retains the span tree when %s arguments cannot be faithfully imported', (_label, raw) => {
    const { spans, complete } = normalizeHostedTrace(
      payload(root, toolWithArgs(raw)),
      parentId,
      true,
    );
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(complete).toBe(true);
    expect(attrs['tool.arguments']).toBeUndefined();
    expect(attrs['gen_ai.tool.call.arguments']).toBeUndefined();
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
  });

  it('preserves lossless number spellings in supported fields', () => {
    const raw = '{"limit":1.0,"offset":1e0,"count":2.500E+1,"page":10e+01}';
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans[1].attributes!;
    expect(attrs['gen_ai.tool.call.arguments']).toBe(raw);
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({
      limit: 1,
      offset: 1,
      count: 25,
      page: 100,
    });
    expect(attrs['promptfoo.tool.arguments_redacted']).toBeUndefined();
  });

  it('keeps a supported sibling when integer-like keys change serialization order', () => {
    const raw = '{"1":"a","0":"b","limit":1}';
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    expect(JSON.parse(spans[1].attributes?.['tool.arguments'])).toEqual({ limit: 1 });
    expect(spans[1].attributes?.['promptfoo.tool.arguments_redacted']).toBe(true);
  });

  it('preserves the sign of a zero argument through sanitizer inspection', () => {
    const raw = '{"offset":-0.00}';
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(attrs['gen_ai.tool.call.arguments']).toBe(raw);
    expect(Object.is(JSON.parse(attrs['tool.arguments']).offset, -0)).toBe(true);
    expect(attrs['promptfoo.tool.arguments_redacted']).toBeUndefined();
  });

  it('omits a signed zero if filtering another field requires reserialization', () => {
    const raw = '{"authorization":"withhold","offset":-0.00,"cwd":"/workspace"}';
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ cwd: '/workspace' });
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
  });

  it('retains the native argument key and spelling for exact raw attribute filters', () => {
    const raw = '{ "cmd" : "cat ledger.csv",  "page" : 1 }';
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(attrs['gen_ai.tool.call.arguments']).toBe(raw);
    expect(attrs['tool.arguments']).toBe(raw);
    expect(attrs['promptfoo.tool.arguments_redacted']).toBeUndefined();
  });

  it('preserves escaped Unicode and slashes in the native JSON spelling', () => {
    const raw = String.raw`{ "\u0063md": "cat \/workspace\/caf\u00e9" }`;
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(attrs['gen_ai.tool.call.arguments']).toBe(raw);
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ cmd: 'cat /workspace/café' });
    expect(attrs['promptfoo.tool.arguments_redacted']).toBeUndefined();
  });

  it('omits normalized arguments when the native attribute is protected', async () => {
    const { spans } = await importWithRedaction('gen_ai.tool.call.arguments');
    const attrs = spans.find((span) => span.attributes?.['tool.name'] === 'lookup_order')!
      .attributes!;
    expect(attrs).not.toHaveProperty('tool.arguments');
    expect(JSON.stringify(spans)).not.toContain('417');
  });

  it('rejects evidence when a protected tool name would be exposed through span aliases', async () => {
    await expect(importWithRedaction('gen_ai.tool.name')).rejects.toThrow();
  });

  it.each(['null', undefined])('omits unavailable native arguments (%s)', (raw) => {
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans.find((span) => span.attributes?.['tool.name'] === 'lookup_order')!
      .attributes!;
    expect(attrs).not.toHaveProperty('tool.arguments');
  });

  it.each([
    ['root command string', 'cat /workspace/ledger.csv'],
    ['root command argv', ['cat', '/workspace/ledger.csv']],
    ['root name/value tuple', ['X-Honeycomb-Team', 'synthetic-fixture']],
    ['encoded argument object', '{"order_id":"417"}'],
    ['root scalar', 17],
  ])('omits %s without losing the shell span identity', (_label, value) => {
    const native = toolWithArgs(JSON.stringify(value));
    native.attributes = native.attributes.map((a) =>
      a.key === 'gen_ai.tool.name' ? attribute(a.key, 'shell') : a,
    );
    const { spans, complete } = normalizeHostedTrace(payload(root, native), parentId, true);
    expect(complete).toBe(true);
    expect(spans[1].name).toBe('execute_tool shell');
    const attrs = spans[1].attributes!;
    expect(attrs['tool.arguments']).toBeUndefined();
    expect(attrs['gen_ai.tool.call.arguments']).toBeUndefined();
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toContain('synthetic-fixture');
  });

  it('canonicalizes standard hex IDs and protobuf JSON base64 IDs to the same tree', () => {
    const asBase64 = (id: string) => Buffer.from(id, 'hex').toString('base64');
    const encoded = [root, tool].map((span) => ({
      ...span,
      traceId: asBase64(traceId),
      spanId: asBase64(span.spanId),
      parentSpanId: span.parentSpanId ? asBase64(span.parentSpanId) : undefined,
    }));
    expect(normalizeHostedTrace(payload(...encoded), parentId, false)).toEqual(
      normalizeHostedTrace(payload(root, tool), parentId, false),
    );
  });

  it.each([
    ['unpublished', payload(), 0],
    ['missing completeness', payload(nativeSpan(root.spanId, 'invoke_agent'), tool), 2],
    [
      'partial',
      payload(
        {
          ...root,
          attributes: [
            attribute('gen_ai.operation.name', 'invoke_agent'),
            attribute(
              completenessKey,
              JSON.stringify({ status: 'partial', missing_outputs: ['private missing output'] }),
            ),
          ],
        },
        tool,
      ),
      2,
    ],
  ] as const)(
    'reports %s evidence as incomplete without exposing fields',
    (_description, native, count) => {
      const { spans, complete } = normalizeHostedTrace(native, parentId, false);
      expect(complete).toBe(false);
      expect(spans).toHaveLength(count);
      expect(JSON.stringify(spans)).not.toContain('private');
    },
  );

  it.each([
    ['a zero span ID', [{ ...root, spanId: '0000000000000000' }]],
    ['a malformed span ID', [{ ...root, spanId: '?'.repeat(16) }]],
    ['a nonnumeric timestamp', [{ ...root, endTimeUnixNano: 'tomorrow' }]],
    ['a duplicate span', [root, tool, { ...tool }]],
    ['mixed trace IDs', [root, { ...tool, traceId: 'f'.repeat(32) }]],
    ['a missing parent', [root, { ...tool, parentSpanId: model.spanId }]],
    [
      'a missing parent in an incomplete root',
      [nativeSpan(root.spanId, 'invoke_agent'), { ...tool, parentSpanId: model.spanId }],
    ],
    [
      'a cycle alongside a valid root',
      [root, { ...tool, parentSpanId: model.spanId }, { ...model, parentSpanId: tool.spanId }],
    ],
  ] as const)('rejects %s without importing partial evidence', (_description, spans) => {
    expect(() => normalizeHostedTrace(payload(...spans), parentId, false)).toThrow();
  });

  it.each([
    ['wire bytes', ' '.repeat(48_000) + '{"limit":3}', 12],
    [
      'JSON values',
      JSON.stringify({
        cmd: 'pwd',
        cwd: '/workspace',
        id: 1,
        order_id: '417',
        count: 2,
        offset: 0,
        limit: 3,
        page: 1,
      }),
      600,
    ],
  ] as const)(
    'bounds the total %s inspected per snapshot while preserving tool spans',
    (_label, raw, calls) => {
      const children = Array.from({ length: calls }, (_, i) => ({
        ...toolWithArgs(raw),
        spanId: (i + 1).toString(16).padStart(16, '0'),
      }));
      const { spans, complete } = normalizeHostedTrace(payload(root, ...children), parentId, true);
      expect(complete).toBe(true);
      const imported = spans.filter((span) => span.name === 'execute_tool lookup_order');
      expect(imported).toHaveLength(children.length);
      const captured = imported.filter((span) => span.attributes?.['tool.arguments'] === raw);
      expect(captured.length).toBeGreaterThan(0);
      expect(captured.length).toBeLessThan(imported.length);
      expect(
        imported
          .slice(captured.length)
          .every(
            (span) =>
              span.attributes?.['gen_ai.tool.call.arguments'] === undefined &&
              span.attributes?.['promptfoo.tool.arguments_redacted'] === true,
          ),
      ).toBe(true);
      expect(
        normalizeHostedTrace(payload(root, children.at(-1)!), parentId, true).spans[1].attributes?.[
          'tool.arguments'
        ],
      ).toBe(raw);
    },
  );

  it('withholds a wide argument but imports a later small call and intact sibling fields', () => {
    const wide = Object.fromEntries(Array.from({ length: 6_000 }, (_, i) => [i, 0]));
    const wideCall = toolWithArgs(JSON.stringify({ ...wide, limit: 2 }));
    const mixed = {
      ...toolWithArgs(JSON.stringify({ body: JSON.stringify(wide), cwd: '/workspace' })),
      spanId: '4444444444444444',
    };
    const { spans, complete } = normalizeHostedTrace(
      payload(root, wideCall, mixed),
      parentId,
      true,
    );
    expect(complete).toBe(true);
    expect(spans[1].attributes?.['tool.arguments']).toBeUndefined();
    expect(spans[1].attributes?.['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.parse(spans[2].attributes?.['tool.arguments'])).toEqual({ cwd: '/workspace' });
    expect(spans[2].attributes?.['promptfoo.tool.arguments_redacted']).toBe(true);
  });

  it('rejects an oversized trace instead of silently dropping tool evidence beyond the limit', () => {
    const children = Array.from({ length: 1000 }, (_, i) =>
      nativeSpan((i + 1).toString(16).padStart(16, '0'), 'chat', root.spanId),
    );
    expect(() => normalizeHostedTrace(payload(root, ...children), parentId, false)).toThrow();
  });
});
