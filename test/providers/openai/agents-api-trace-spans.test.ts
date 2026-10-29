import { describe, expect, it, vi } from 'vitest';
import { extractTrajectorySteps } from '../../../src/assertions/trajectoryUtils';
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

  it.each([
    ['1699999999999999999', '1700000000000000000'],
    ['1700000000000000001', '1700000000000000002'],
    [9007199254740961, 9007199254740962],
  ])('orders overlapping calls by native starts %s and %s', (firstStart, secondStart) => {
    const first = {
      ...nativeSpan('aaaaaaaaaaaaaaaa', 'execute_tool', root.spanId),
      startTimeUnixNano: firstStart,
      endTimeUnixNano: '1700000000020000000',
      attributes: [
        attribute('gen_ai.operation.name', 'execute_tool'),
        attribute('gen_ai.tool.name', 'first'),
      ],
    };
    const second = {
      ...first,
      spanId: 'bbbbbbbbbbbbbbbb',
      startTimeUnixNano: secondStart,
      endTimeUnixNano: '1700000000010000000',
      attributes: [
        attribute('gen_ai.operation.name', 'execute_tool'),
        attribute('gen_ai.tool.name', 'second'),
      ],
    };
    const { spans } = normalizeHostedTrace(payload(root, second, first), parentId, false);
    expect(spans[1].startTime).toBe(spans[2].startTime);
    const steps = extractTrajectorySteps({
      spans,
      traceId,
      evaluationId: 'eval',
      testCaseId: 'row',
    });
    expect(steps.filter((s) => s.type === 'tool').map((s) => s.name)).toEqual(['first', 'second']);
  });

  it('orders equally started calls by their native ends when millisecond timestamps tie', () => {
    const earlier = {
      ...tool,
      endTimeUnixNano: '1700000000000000100',
    };
    const later = {
      ...earlier,
      spanId: '4444444444444444',
      endTimeUnixNano: '1700000000000000101',
      attributes: [
        attribute('gen_ai.operation.name', 'execute_tool'),
        attribute('gen_ai.tool.name', 'send_receipt'),
      ],
    };
    const { spans } = normalizeHostedTrace(payload(root, later, earlier), parentId, false);
    expect(spans[1].endTime).toBe(spans[2].endTime);
    const steps = extractTrajectorySteps({
      spans,
      traceId,
      evaluationId: 'eval',
      testCaseId: 'row',
    });
    expect(steps.filter((step) => step.type === 'tool').map((step) => step.name)).toEqual([
      'lookup_order',
      'send_receipt',
    ]);
  });

  it.each([
    '"status":"partial","status":"complete","missing_outputs":[],"ordering_issues":[]',
    String.raw`"status":"partial","\u0073tatus":"complete","missing_outputs":[],"ordering_issues":[]`,
    '"status":"complete","missing_outputs":["span"],"missing_outputs":[],"ordering_issues":[]',
    '"status":"complete","missing_outputs":[],"ordering_issues":["order"],"ordering_issues":[]',
  ])('rejects duplicate completeness fields in {%s}', (fields) => {
    const ambiguous = {
      ...root,
      attributes: [
        attribute('gen_ai.operation.name', 'invoke_agent'),
        attribute(completenessKey, `{${fields}}`),
      ],
    };
    expect(() => normalizeHostedTrace(payload(ambiguous), parentId, false)).toThrow();
  });

  it('accepts whitespace and escaped keys in an unambiguous completeness marker', () => {
    const attested = {
      ...root,
      attributes: [
        attribute('gen_ai.operation.name', 'invoke_agent'),
        attribute(
          completenessKey,
          String.raw`{ "ordering_issues" : [], "\u0073tatus" : "complete", "missing_outputs" : [] }`,
        ),
      ],
    };
    expect(normalizeHostedTrace(payload(attested), parentId, false).complete).toBe(true);
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
      ['invoke_agent', 2, 'otlp-v2'],
      ['execute_tool lookup_order', 1, false],
      ['chat gpt-6-astra', 1, false],
    ]);
  });

  it('records only verified absent raw tool fields on chat and agent spans', () => {
    const evidenceKey = 'promptfoo.openai.absent_tool_attributes';
    const capture = (spanLoss = 0, resourceLoss = 0, redact: string[] = []) =>
      normalizeHostedTrace(
        {
          resourceSpans: [
            {
              resource: {
                attributes: [
                  attribute(
                    'tool.arguments',
                    JSON.stringify({ detail: 'private resource arguments' }),
                  ),
                ],
                droppedAttributesCount: resourceLoss,
              },
              scopeSpans: [
                {
                  spans: [
                    root,
                    {
                      ...model,
                      droppedAttributesCount: spanLoss,
                      attributes: [
                        ...model.attributes,
                        attribute('gen_ai.tool.name', 'private tool label'),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        parentId,
        false,
        undefined,
        redact,
      );
    const { spans, complete } = capture();
    expect(complete).toBe(true);
    expect(spans[0].attributes?.[evidenceKey]).toEqual([
      'gen_ai.tool.name',
      'tool.name',
      'gen_ai.tool.call.arguments',
    ]);
    expect(spans[1].attributes?.[evidenceKey]).toEqual(['tool.name', 'gen_ai.tool.call.arguments']);
    expect(JSON.stringify(spans)).not.toMatch(/private tool label|private resource arguments/);
    expect(capture(1).spans[1].attributes?.[evidenceKey]).toBeUndefined();
    expect(capture(0, 1).spans[0].attributes?.[evidenceKey]).toBeUndefined();
    expect(capture(0, 0, ['tool.name']).spans[1].attributes?.[evidenceKey]).toEqual([
      'gen_ai.tool.call.arguments',
    ]);
    expect(capture(0, 0, [evidenceKey]).spans[1].attributes?.[evidenceKey]).toBeUndefined();
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

  it('converts a long inherited HTTP status once across spans', () => {
    const status = '0'.repeat(1024 * 1024) + '503';
    let conversions = 0;
    vi.stubGlobal(
      'Number',
      new Proxy(Number, {
        apply(target, receiver, args) {
          if (args[0] === status) {
            conversions++;
          }
          return Reflect.apply(target, receiver, args);
        },
      }),
    );
    try {
      const trace = {
        resourceSpans: [
          {
            resource: { attributes: [attribute('http.status_code', status)] },
            scopeSpans: [{ spans: [root, tool, model] }],
          },
        ],
      };
      const { spans } = normalizeHostedTrace(trace, parentId, false);
      expect(spans.map((span) => span.statusCode)).toEqual([2, 2, 2]);
      expect(conversions).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    { stringValue: '200', intValue: '503' },
    { boolValue: 'false' },
    { intValue: 'bad' },
    { intValue: '9223372036854775808' },
    { doubleValue: {} },
    { kvlistValue: { values: [{ key: 'nested', value: { intValue: false } }] } },
  ])(
    'withholds error coverage for a malformed OTLP value but preserves observed failures',
    (value) => {
      const span = {
        ...tool,
        attributes: [...tool.attributes, { key: 'http.status_code', value }],
      };
      const normalized = (s: typeof span) =>
        normalizeHostedTrace(payload(root, s), parentId, false).spans.find(
          (saved) => saved.name === 'execute_tool lookup_order',
        );
      expect(normalized(span)).toMatchObject({
        attributes: { 'promptfoo.openai.error_status_complete': false },
      });
      expect(normalized({ ...span, status: { code: 'ERROR', message: '' } })).toMatchObject({
        statusCode: 2,
      });
    },
  );

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
    ...['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_', 'npm_'].map((prefix) => [
      prefix,
      prefix + 'x'.repeat(36),
    ]),
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

  it('withholds remote credentials in file and command arguments while keeping a safe sibling', () => {
    const filename = 'receipt_npm_' + 'x'.repeat(36);
    const command = ['cat', '/workspace/data_ghp_' + 'y'.repeat(36) + '.txt'];
    const args = { filename, command, cwd: '/workspace' };
    const { spans } = normalizeHostedTrace(
      payload(root, toolWithArgs(JSON.stringify(args))),
      parentId,
      true,
    );
    const attrs = spans[1].attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ cwd: '/workspace' });
    expect(attrs['gen_ai.tool.call.arguments']).toBe(attrs['tool.arguments']);
    expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    expect(JSON.stringify(spans)).not.toMatch(/npm_|ghp_/);
  });

  it.each([
    ['vendor/api_key/fixture-private-value', []],
    ['ft:vendor/Authorization:fixture-private-value', []],
    ['vendor/org.tenant/fixture-private-value', ['org.tenant']],
  ] as const)('withholds a model ID with a protected namespace in %s', (id, redact) => {
    const chat = {
      ...model,
      attributes: [
        attribute('gen_ai.operation.name', 'chat'),
        attribute('gen_ai.request.model', id),
      ],
    };
    expect(() =>
      normalizeHostedTrace(payload(root, chat), parentId, false, undefined, [...redact]),
    ).toThrow('Invalid hosted OTLP trace');
  });

  it('omits credential-labelled paths in file and command arguments', () => {
    const args = {
      filename: 'api_key/fixture-private-value',
      cmd: ['cat', '/workspace/Authorization/fixture-private-value'],
      commands: ["sh -c 'cat org.tenant/fixture-private-value'"],
      cwd: '/workspace/public',
    };
    const { spans } = normalizeHostedTrace(
      payload(root, toolWithArgs(JSON.stringify(args))),
      parentId,
      true,
      undefined,
      ['org.tenant'],
    );
    const attrs = spans[1].attributes!;
    expect(JSON.parse(attrs['tool.arguments'])).toEqual({ cwd: '/workspace/public' });
    expect(JSON.stringify(spans)).not.toContain('fixture-private-value');
  });

  it.each([
    ['execute_tool', 'gen_ai.tool.name', 'api_key_abcdefgh'],
    ['chat', 'gen_ai.request.model', 'vendor/token_abcdefgh'],
    ['chat', 'gen_ai.request.model', 'vendor/X-Honeycomb-Team_abc-def'],
    ['execute_tool', 'gen_ai.tool.name', 'mcp:api-key-abc.def'],
  ] as const)('withholds %s when a terminal label includes its value', (operation, key, id) => {
    const call = {
      ...tool,
      attributes: [attribute('gen_ai.operation.name', operation), attribute(key, id)],
    };
    expect(() => normalizeHostedTrace(payload(root, call), parentId, false)).toThrow(
      'Invalid hosted OTLP trace',
    );
  });

  it.each([
    'vendor/model',
    'gpt-4.1-mini-2025-04-14',
    'ft:gpt-4.1-mini-2025-04-14',
    'vendor/npm_package_registry_metadata',
    'vendor/get_access_token',
    'ft:vendor/research/gpt-mini-2026-09-30:run-17',
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
    ['cat Bearer synthetic-fixture'],
    [['cat', 'Bearer', 'synthetic-fixture']],
    [['cat', 'Basic', 'synthetic-fixture']],
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

  describe('protected attribute echoes', () => {
    const protectedKey = 'org.private_tenant';
    const tenant = 'tenant_42';

    function callNamed(name: string, ...attributes: object[]) {
      return {
        ...tool,
        attributes: [
          attribute('gen_ai.operation.name', 'execute_tool'),
          attribute('gen_ai.tool.name', name),
          ...attributes,
        ],
      };
    }

    function importProtected(spans: object[], capture: boolean, resourceAttributes: object[] = []) {
      return normalizeHostedTrace(
        {
          resourceSpans: [
            { resource: { attributes: resourceAttributes }, scopeSpans: [{ spans }] },
          ],
        },
        parentId,
        capture,
        undefined,
        [protectedKey],
      );
    }

    it.each([false, true])('withholds tool name echoes with capture set to %s', (capture) => {
      for (const [name, value] of [
        ['read_tenant_42', { stringValue: tenant }],
        ['read_7', { intValue: '7' }],
        ['read_7', { intValue: '0007' }],
      ] as const) {
        const call = callNamed(name, { key: protectedKey, value });
        expect(() => importProtected([root, call], capture)).toThrow('Invalid hosted OTLP trace');
      }
    });

    it('recognizes protected keys in a resource kvlist when constructing an inherited model name', () => {
      const chat = nativeSpan(model.spanId, 'chat', root.spanId);
      const resourceAttributes = [
        {
          key: 'labels',
          value: {
            arrayValue: {
              values: [{ kvlistValue: { values: [attribute(protectedKey, tenant)] } }],
            },
          },
        },
        attribute('gen_ai.request.model', 'models/tenant_42'),
      ];
      expect(() => importProtected([root, chat], false, resourceAttributes)).toThrow(
        'Invalid hosted OTLP trace',
      );
    });

    it('keeps a tool name matching a kvlist field name rather than a protected leaf value', () => {
      const attr = {
        key: protectedKey,
        value: { kvlistValue: { values: [attribute('filename', tenant)] } },
      };
      const raw = '{"filename":"report.csv"}';
      const call = callNamed('read_filename', attr, attribute('gen_ai.tool.call.arguments', raw));
      const { spans, complete } = importProtected([root, call], true);
      expect(complete).toBe(true);
      expect(spans[1]).toMatchObject({
        name: 'execute_tool read_filename',
        attributes: {
          'tool.name': 'read_filename',
          'tool.arguments': raw,
          'gen_ai.tool.call.arguments': raw,
        },
      });
    });

    it.each([false, true])(
      'checks identities against protected argument fields with capture set to %s',
      (capture) => {
        const raw = JSON.stringify({ metadata: [{ [protectedKey]: tenant }] });
        const call = callNamed('read_tenant_42', attribute('gen_ai.tool.call.arguments', raw));
        expect(() => importProtected([root, call], capture)).toThrow('Invalid hosted OTLP trace');
      },
    );

    it.each(['wire attribute', 'nested tool argument'])(
      'removes echoed paths and commands sourced from a %s',
      (source) => {
        const args = {
          ...(source === 'nested tool argument' && { metadata: [{ [protectedKey]: tenant }] }),
          path: 'tenant_42.csv',
          cmd: ['cat', 'tenant_42.csv'],
          limit: 3,
        };
        const call = callNamed(
          'lookup_order',
          attribute('gen_ai.tool.call.arguments', JSON.stringify(args)),
          ...(source === 'wire attribute' ? [attribute(protectedKey, tenant)] : []),
        );
        const { spans } = importProtected([root, call], true);
        const attrs = spans[1].attributes!;
        expect(JSON.parse(attrs['tool.arguments'])).toEqual({ limit: 3 });
        expect(attrs['gen_ai.tool.call.arguments']).toBe(attrs['tool.arguments']);
        expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
        expect(JSON.stringify(spans)).not.toContain(tenant);
      },
    );

    it('checks the emitted argument spelling for echoes as well as its decoded values', () => {
      const raw = '{"limit":4.17e2}';
      const call = callNamed(
        'lookup_order',
        attribute(protectedKey, '4.17e2'),
        attribute('gen_ai.tool.call.arguments', raw),
      );
      const { spans } = importProtected([root, call], true);
      const attrs = spans[1].attributes!;
      expect(attrs['tool.arguments']).toBeUndefined();
      expect(attrs['gen_ai.tool.call.arguments']).toBeUndefined();
      expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
    });

    it('withholds the identity when a duplicate protected JSON key could conceal its source', () => {
      for (const values of [
        [tenant, 'other'],
        ['other', tenant],
      ]) {
        const raw = `{"${protectedKey}":"${values[0]}","${protectedKey}":"${values[1]}"}`;
        const call = callNamed('read_tenant_42', attribute('gen_ai.tool.call.arguments', raw));
        expect(() => importProtected([root, call], false)).toThrow('Invalid hosted OTLP trace');
      }
    });

    it('withholds an echo regardless of when the protected span appears in the snapshot', () => {
      const call = callNamed('read_tenant_42');
      const source = {
        ...model,
        attributes: [...model.attributes, attribute(protectedKey, tenant)],
      };
      for (const siblings of [
        [call, source],
        [source, call],
      ]) {
        expect(() => importProtected([root, ...siblings], false)).toThrow(
          'Invalid hosted OTLP trace',
        );
      }
    });

    function withCarriers(input: unknown, rules = [protectedKey]) {
      return normalizeHostedTrace(input, parentId, false, undefined, rules);
    }

    describe('JSON in protected string attributes', () => {
      it.each([
        ['object', JSON.stringify({ tenant })],
        ['array', JSON.stringify([tenant])],
        ['escaped scalar', String.raw`"ten\u0061nt_42"`],
        ['encoded nested value', JSON.stringify({ record: JSON.stringify({ tenant }) })],
      ])('withholds a tool name echoing the protected %s', (_kind, raw) => {
        const call = callNamed('read_tenant_42', attribute(protectedKey, raw));
        expect(() => withCarriers(payload(root, call))).toThrow('Invalid hosted OTLP trace');
      });

      it('withholds a model name echoing protected JSON inside an event kvlist', () => {
        const chat = {
          ...model,
          attributes: [
            attribute('gen_ai.operation.name', 'chat'),
            attribute('gen_ai.request.model', tenant),
          ],
          events: [
            {
              name: 'request',
              attributes: [
                {
                  key: 'labels',
                  value: {
                    kvlistValue: { values: [attribute(protectedKey, JSON.stringify({ tenant }))] },
                  },
                },
              ],
            },
          ],
        };
        expect(() => withCarriers(payload(root, chat))).toThrow('Invalid hosted OTLP trace');
      });

      it.each([
        ['malformed object', '{"tenant":"tenant_42"'],
        ['overwritten key', '{"tenant":"tenant_42","ten\\u0061nt":"other"}'],
        ['truncated nested string', JSON.stringify({ record: '{"tenant":"tenant_42"' })],
      ])('rejects a protected %s that cannot be inspected', (_kind, raw) => {
        const call = callNamed('lookup_order', attribute(protectedKey, raw));
        expect(() => withCarriers(payload(root, call))).toThrow('Invalid hosted OTLP trace');
      });

      it('counts repeated protected documents once and keeps unrelated identities', () => {
        const raw = ' '.repeat(5_000) + JSON.stringify({ tenant });
        const attrs = {
          key: protectedKey,
          value: {
            arrayValue: { values: Array.from({ length: 64 }, () => ({ stringValue: raw })) },
          },
        };
        const { spans, complete } = withCarriers(payload(root, callNamed('lookup_order', attrs)));
        expect(complete).toBe(true);
        expect(spans[1].name).toBe('execute_tool lookup_order');
        expect(JSON.stringify(spans)).not.toContain(tenant);
      });
    });

    describe('credential attributes and argument aliases', () => {
      const credential = 'kappa-blue-19';

      it('withholds a tool name echoing an opaque API key with default capture settings', () => {
        const call = callNamed(`lookup_${credential}`, attribute('x-api-key', credential));
        expect(() => normalizeHostedTrace(payload(root, call), parentId, false)).toThrow(
          'Invalid hosted OTLP trace',
        );
      });

      it('checks the credential part of an Authorization header without a custom rule', () => {
        const call = callNamed(
          `lookup_${credential}`,
          attribute('Authorization', `Bearer ${credential}`),
        );
        expect(() => normalizeHostedTrace(payload(root, call), parentId, false)).toThrow(
          'Invalid hosted OTLP trace',
        );
      });

      it('checks nested credential fields in a later span event without a custom rule', () => {
        const call = callNamed(`lookup_${credential}`);
        const source = {
          ...model,
          events: [
            {
              name: 'request',
              attributes: [
                {
                  key: 'request_headers',
                  value: { kvlistValue: { values: [attribute('X-Honeycomb-Team', credential)] } },
                },
              ],
            },
          ],
        };
        expect(() => normalizeHostedTrace(payload(root, call, source), parentId, false)).toThrow(
          'Invalid hosted OTLP trace',
        );
      });

      it.each(['tool.arguments', 'gen_ai.tool.call.arguments'])(
        'checks credential fields inside %s JSON with argument capture disabled',
        (key) => {
          const raw = JSON.stringify({ headers: { 'X-API-Key': credential } });
          const call = callNamed(`lookup_${credential}`, attribute(key, raw));
          expect(() => normalizeHostedTrace(payload(root, call), parentId, false)).toThrow(
            'Invalid hosted OTLP trace',
          );
        },
      );

      it.each(['tool.arguments', 'gen_ai.tool.call.arguments'])(
        'recognizes an escaped JSON credential key in %s',
        (key) => {
          const raw = String.raw`{"headers":{"X-\u0041PI-\u004bey":"${credential}"}}`;
          const call = callNamed(`lookup_${credential}`, attribute(key, raw));
          expect(() => normalizeHostedTrace(payload(root, call), parentId, false)).toThrow(
            'Invalid hosted OTLP trace',
          );
        },
      );

      it.each([
        ['tool.arguments', 'tool.arguments'],
        ['tool.arguments', 'gen_ai.tool.call.arguments'],
        ['gen_ai.tool.call.arguments', 'tool.arguments'],
      ])('protects JSON leaves in %s when redactAttributes names %s', (key, pattern) => {
        const raw = JSON.stringify({ customer: tenant });
        const call = callNamed('read_tenant_42', attribute(key, raw));
        expect(() => withCarriers(payload(root, call), [pattern])).toThrow(
          'Invalid hosted OTLP trace',
        );
      });

      it('keeps the numeric tool name and lookup ID when only the path echoes a credential', () => {
        const raw = JSON.stringify({ path: `/files/${credential}`, id: 17 });
        const call = callNamed(
          'lookup_7',
          attribute('x-api-key', credential),
          { key: 'gen_ai.usage.input_tokens', value: { intValue: '7' } },
          attribute('gen_ai.tool.call.arguments', raw),
        );
        const { spans, complete } = normalizeHostedTrace(payload(root, call), parentId, true);
        expect(complete).toBe(true);
        expect(spans[1].name).toBe('execute_tool lookup_7');
        const attrs = spans[1].attributes!;
        expect(JSON.parse(attrs['tool.arguments'])).toEqual({ id: 17 });
        expect(attrs['gen_ai.tool.call.arguments']).toBe(attrs['tool.arguments']);
        expect(attrs['promptfoo.tool.arguments_redacted']).toBe(true);
        expect(JSON.stringify(spans)).not.toContain(credential);
      });
    });

    it('checks scope, event and link attributes for values echoed in a tool name', () => {
      const call = callNamed('read_tenant_42');
      const carrier = { attributes: [attribute(protectedKey, tenant)] };
      const event = { name: 'download', timeUnixNano: root.startTimeUnixNano, ...carrier };
      const link = { traceId, spanId: root.spanId, ...carrier };
      const cases = [
        payload(root, { ...call, events: [event] }),
        payload(root, { ...call, links: [link] }),
        { resourceSpans: [{ scopeSpans: [{ scope: carrier, spans: [root, call] }] }] },
      ];
      for (const data of cases) {
        expect(() => withCarriers(data)).toThrow('Invalid hosted OTLP trace');
        expect(withCarriers(data, []).spans[1].name).toBe('execute_tool read_tenant_42');
      }
    });

    it('checks protected values from empty scopes and resources in either wire order', () => {
      const call = callNamed('read_tenant_42');
      const carrier = { attributes: [attribute(protectedKey, tenant)] };
      const populated = { spans: [root, call] };
      const scope = { scope: carrier };
      const group = { scopeSpans: [populated] };
      const emptyGroup = { resource: carrier };
      for (const resourceSpans of [
        [{ scopeSpans: [scope, populated] }],
        [{ scopeSpans: [populated, scope] }],
        [emptyGroup, group],
        [group, emptyGroup],
      ]) {
        expect(() => withCarriers({ resourceSpans })).toThrow('Invalid hosted OTLP trace');
      }
    });

    it('keeps safe tool identity and omits unrelated event details', () => {
      const call = {
        ...callNamed('read_tenant_42'),
        events: [{ name: 'private detail', attributes: [attribute('public_tag', tenant)] }],
      };
      const { complete, spans } = withCarriers(payload(root, call));
      expect(complete).toBe(true);
      expect(spans[1].name).toBe('execute_tool read_tenant_42');
      expect(JSON.stringify(spans)).not.toMatch(/private detail|public_tag/);
    });

    it('withholds uninspectable carriers under built-in and custom redaction rules', () => {
      const call = callNamed('lookup_order');
      for (const data of [
        payload(root, { ...call, events: { attributes: [] } }),
        payload(root, { ...call, links: [{ attributes: 'malformed' }] }),
        { resourceSpans: [{ scopeSpans: [{ scope: 'malformed', spans: [root, call] }] }] },
      ]) {
        expect(() => withCarriers(data)).toThrow('Invalid hosted OTLP trace');
        expect(() => withCarriers(data, [])).toThrow('Invalid hosted OTLP trace');
      }
    });

    it('shares the protected-value budget across resources, events and links', () => {
      const carrier = (offset: number) => ({
        attributes: [
          {
            key: protectedKey,
            value: {
              arrayValue: {
                values: Array.from({ length: 43 }, (_, index) => ({
                  stringValue: `fixture_${offset + index}`,
                })),
              },
            },
          },
        ],
      });
      const call = { ...callNamed('lookup_order'), events: [carrier(43)], links: [carrier(86)] };
      const data = {
        resourceSpans: [{ resource: carrier(0), scopeSpans: [{ spans: [root, call] }] }],
      };
      expect(() => withCarriers(data)).toThrow('Invalid hosted OTLP trace');
    });

    it('bounds aggregate traversal even when individual events contain no attributes', () => {
      const events = Array.from({ length: 1000 }, () => ({ name: 'empty' }));
      const calls = Array.from({ length: 33 }, (_, index) => ({
        ...callNamed('lookup_order'),
        spanId: (index + 10).toString(16).padStart(16, '0'),
        events,
      }));
      expect(withCarriers(payload(root, ...calls.slice(0, 2))).complete).toBe(true);
      expect(() => withCarriers(payload(root, ...calls))).toThrow('Invalid hosted OTLP trace');
    });

    it('bounds empty scopes across the snapshot with default redaction and capture disabled', () => {
      const emptyScopes = Array.from({ length: 1000 }, () => ({}));
      const groups = Array.from({ length: 34 }, () => ({ scopeSpans: emptyScopes }));
      const populated = { scopeSpans: [{ spans: [root] }] };
      const data = { resourceSpans: [...groups, populated] };
      expect(() => normalizeHostedTrace(data, parentId, false)).toThrow(
        'Invalid hosted OTLP trace',
      );

      const calls = Array.from({ length: 999 }, (_, index) => ({
        ...callNamed('lookup_order'),
        spanId: (index + 10).toString(16).padStart(16, '0'),
      }));
      const { spans, complete } = normalizeHostedTrace(payload(root, ...calls), parentId, false);
      expect(spans).toHaveLength(1000);
      expect(complete).toBe(true);
    });

    it('withholds the snapshot when the protected-value budget is exhausted', () => {
      const values = Array.from({ length: 129 }, (_, index) => ({
        stringValue: `fixture_${index}`,
      }));
      const call = callNamed('lookup_order', {
        key: protectedKey,
        value: { arrayValue: { values } },
      });
      expect(() => importProtected([root, call], false)).toThrow('Invalid hosted OTLP trace');
    });
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

  it.each(['base64', 'base64url'] as const)(
    'canonicalizes padded and unpadded %s IDs',
    (encoding) => {
      const rootId = 'fbffffffffffffff';
      const fixture = [
        { ...root, spanId: rootId },
        { ...tool, parentSpanId: rootId },
      ];
      const encode = (id: string, padded: boolean) => {
        const bytes = Buffer.from(id, 'hex');
        const bare = bytes.toString(encoding).replace(/=+$/, '');
        return padded ? bare.padEnd(4 * Math.ceil(bytes.length / 3), '=') : bare;
      };
      for (const padded of [false, true]) {
        const encoded = fixture.map((span) => ({
          ...span,
          traceId: encode(span.traceId, padded),
          spanId: encode(span.spanId, padded),
          parentSpanId: span.parentSpanId ? encode(span.parentSpanId, padded) : undefined,
        }));
        expect(normalizeHostedTrace(payload(...encoded), parentId, false)).toEqual(
          normalizeHostedTrace(payload(...fixture), parentId, false),
        );
      }
    },
  );

  describe('OTLP repeated fields', () => {
    it.each([
      { description: 'resourceSpans', wire: {} },
      { description: 'scopeSpans', wire: { resourceSpans: [{}] } },
      { description: 'spans', wire: { resourceSpans: [{ scopeSpans: [{}] }] } },
    ])('treats omitted $description as unpublished', ({ wire }) => {
      expect(normalizeHostedTrace(wire, parentId, false)).toEqual({ spans: [], complete: false });
    });

    it('imports a populated scope alongside empty resource and scope groups', () => {
      const wire = { resourceSpans: [{}, { scopeSpans: [{}, { spans: [root, tool] }, {}] }] };
      expect(normalizeHostedTrace(wire, parentId, false)).toEqual(
        normalizeHostedTrace(payload(root, tool), parentId, false),
      );
    });

    it.each([
      ['root', (value: unknown) => value],
      ['resource group', (value: unknown) => ({ resourceSpans: [value] })],
      ['scope group', (value: unknown) => ({ resourceSpans: [{ scopeSpans: [value] }] })],
    ] as const)('requires the %s to be an object', (_description, wire) => {
      for (const malformed of [null, [], 'unexpected']) {
        expect(() => normalizeHostedTrace(wire(malformed), parentId, false)).toThrow();
      }
    });

    it.each([
      ['resourceSpans', (value: unknown) => ({ resourceSpans: value })],
      ['scopeSpans', (value: unknown) => ({ resourceSpans: [{ scopeSpans: value }] })],
      ['spans', (value: unknown) => ({ resourceSpans: [{ scopeSpans: [{ spans: value }] }] })],
    ] as const)('rejects an invalid or oversized %s collection', (_description, wire) => {
      for (const malformed of [null, {}, 'unexpected', Array(1_001).fill({})]) {
        expect(() => normalizeHostedTrace(wire(malformed), parentId, false)).toThrow();
      }
    });
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
    ['noncanonical base64 padding bits', [{ ...root, spanId: '__________9' }]],
    ['mixed base64 alphabets', [{ ...root, spanId: '+_________8' }]],
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
