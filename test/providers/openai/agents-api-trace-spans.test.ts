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

function payload(...spans: ReturnType<typeof nativeSpan>[]) {
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

function importWithRedaction(
  key: string,
  args: unknown = { lookup: { order_id: '417' }, limit: 3 },
) {
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
      const { spans } = normalizeHostedTrace(payload(root, namedModel), parentId, false);
      expect(spans[1].name).toBe('chat');
      expect(JSON.stringify(spans)).not.toContain(token);
    },
  );

  it('scans a bounded trace containing many JWT prefixes without retrying every prefix', () => {
    const text = ' ' + 'eyJ'.repeat(20_000) + '.onlyone';
    const raw = JSON.stringify({ text });
    const calls = Array.from({ length: 4 }, (_, i) => ({
      ...toolWithArgs(raw),
      spanId: (i + 10).toString(16).padStart(16, '0'),
    }));
    const { spans } = normalizeHostedTrace(payload(root, ...calls), parentId, true);
    for (const span of spans.slice(1)) {
      expect(span.attributes?.['tool.arguments']).toBe(raw);
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

  it('applies request-scoped redactions to nested arguments before storing them', async () => {
    const { spans } = await importWithRedaction('order_id');
    const attrs = spans.find((span) => span.attributes?.['tool.name'] === 'lookup_order')!
      .attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ limit: 3 });
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toContain('417');
  });

  it('applies the redaction policy through multiple layers of JSON-encoded arguments', async () => {
    const input = JSON.stringify({ body: JSON.stringify([{ ORDER_ID: 'private order' }]) });
    const { spans } = await importWithRedaction('order_id', { input, cwd: '/workspace' });
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ cwd: '/workspace' });
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toContain('private order');
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
    ['oversized', JSON.stringify({ text: 'x'.repeat(65_536) })],
    ['malformed', '{"text":'],
    ['duplicate keys', '{"text":"private overwritten value","text":"public"}'],
    ['unrepresentable number', '{"n":9007199254740993}'],
    ['unsafe integer with identical wire spelling', '{"n":1000000000000000100}'],
    ['rounded fraction', '{"n":0.10000000000000001}'],
    ['overflow', '{"n":1e400}'],
    ['underflow', '{"n":1e-400}'],
    ['escaped duplicate key', String.raw`{"inputs":[{"0":1,"\u0030":2}]}`],
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

  it.each([
    '{"rate":1.0,"scales":[1e0,-2.500E-3,0.00100,10e+01]}',
    '{"1":"a","0":"b","colon:in:key":"string:with:colons","nested":{"2":1,"1":2}}',
  ])('preserves lossless JSON spelling and parsed arguments (%s)', (raw) => {
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(attrs['gen_ai.tool.call.arguments']).toBe(raw);
    expect(JSON.parse(attrs['tool.arguments'])).toEqual(JSON.parse(raw));
    expect(attrs['promptfoo.tool.arguments_redacted']).toBeUndefined();
  });

  it('preserves the sign of a zero argument through sanitizer inspection', () => {
    const raw = '{"measurement":-0.00}';
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(attrs['gen_ai.tool.call.arguments']).toBe(raw);
    expect(Object.is(JSON.parse(attrs['tool.arguments']).measurement, -0)).toBe(true);
    expect(attrs['promptfoo.tool.arguments_redacted']).toBeUndefined();
  });

  it('omits a signed zero if filtering another field requires reserialization', () => {
    const raw = '{"authorization":"withhold","sensor":[-0.00],"unit":"m"}';
    const { spans } = normalizeHostedTrace(payload(root, toolWithArgs(raw)), parentId, true);
    const attrs = spans.find((span) => span.name === 'execute_tool lookup_order')!.attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ unit: 'm' });
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
  });

  it('retains the native argument key and spelling for exact raw attribute filters', () => {
    const raw = '{ "text" : "contains  spaces" }';
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

  it('preserves a string argument containing JSON text across storage', () => {
    const text = '{ "order_id" : "417" }';
    const { spans } = normalizeHostedTrace(
      payload(root, toolWithArgs(JSON.stringify(text))),
      parentId,
      true,
    );
    const attrs = spans.find((span) => span.attributes?.['tool.name'] === 'lookup_order')!
      .attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toBe(text);
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

  it('rejects an oversized trace instead of silently dropping tool evidence beyond the limit', () => {
    const children = Array.from({ length: 1000 }, (_, i) =>
      nativeSpan((i + 1).toString(16).padStart(16, '0'), 'chat', root.spanId),
    );
    expect(() => normalizeHostedTrace(payload(root, ...children), parentId, false)).toThrow();
  });
});
