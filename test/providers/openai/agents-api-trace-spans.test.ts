import { describe, expect, it, vi } from 'vitest';
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

describe('normalizeHostedTrace', () => {
  it('attaches the native tree to each invocation, including children listed before their root', () => {
    const native = payload(tool, model, root);
    const { spans, complete } = normalizeHostedTrace(native, parentId);
    expect(complete).toBe(true);
    expect(spans).toHaveLength(3);
    const hostedRoot = spans.find((span) => span.parentSpanId === parentId)!;
    expect(hostedRoot.name).toBe('invoke_agent');
    expect(spans.filter((span) => span.parentSpanId === hostedRoot.spanId)).toHaveLength(2);
    expect(normalizeHostedTrace(native, parentId).spans).toEqual(spans);
    const other = normalizeHostedTrace(native, 'aaaaaaaaaaaaaaaa').spans;
    expect(other.every((span) => spans.every((s) => s.spanId !== span.spanId))).toBe(true);
  });

  it('retains the nanosecond duration and start offset below timestamp precision', () => {
    const call = {
      ...tool,
      startTimeUnixNano: '1700000000000000001',
      endTimeUnixNano: '1700000000010000002',
    };
    const { spans } = normalizeHostedTrace(payload(root, call), parentId);
    expect(spans[1]).toMatchObject({
      startTime: Number(BigInt(call.startTimeUnixNano)) / 1e6,
      endTime: Number(BigInt(call.endTimeUnixNano)) / 1e6,
      attributes: {
        'promptfoo.openai.start_time_offset_ns': 1,
        'promptfoo.openai.duration_ns': '10000001',
      },
    });
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
    expect(() => normalizeHostedTrace(payload(ambiguous), parentId)).toThrow();
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
    expect(normalizeHostedTrace(payload(attested), parentId).complete).toBe(true);
  });

  it('stores timings, status and tool identity without argument aliases, content or source span names', () => {
    const failedTool = {
      ...tool,
      status: { code: 'STATUS_CODE_ERROR', message: 'private status detail' },
      attributes: [...tool.attributes, attribute('tool.arguments', JSON.stringify({ id: 17 }))],
    };
    const normalized = normalizeHostedTrace(payload(root, failedTool, model), parentId).spans;
    const storedTool = normalized.find((span) => span.attributes?.['tool.name'] === 'lookup_order');
    expect(storedTool).toMatchObject({
      startTime: 1700000000000,
      endTime: 1700000000025,
      statusCode: 2,
      name: 'execute_tool lookup_order',
      attributes: { 'gen_ai.tool.name': 'lookup_order', 'tool.name': 'lookup_order' },
    });
    expect(storedTool?.attributes?.['tool.arguments']).toBeUndefined();
    expect(storedTool?.attributes?.['gen_ai.tool.call.arguments']).toBeUndefined();
    expect(
      normalized.find((s) => s.name === 'chat gpt-6-astra')?.attributes?.['gen_ai.request.model'],
    ).toBe('gpt-6-astra');
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
    const { spans, complete } = normalizeHostedTrace(data, parentId);
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
    const { spans, complete } = normalizeHostedTrace(data, parentId);
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
      expect(normalizeHostedTrace(payload(...spans), parentId).complete).toBe(false);
    }
    expect(normalizeHostedTrace(payload(root, chat), parentId).complete).toBe(true);
    expect(
      normalizeHostedTrace(payload(root, { ...model, droppedAttributesCount: 1 }), parentId)
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
      const { spans } = normalizeHostedTrace(trace, parentId);
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
        normalizeHostedTrace(payload(root, s), parentId).spans.find(
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
      const { spans, complete } = normalizeHostedTrace(payload(root, call), parentId);
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
  ])('withholds tool and model identifiers containing an embedded %s', (_label, token) => {
    const name = `mcp_lookup_${token}`;
    const namedTool = {
      ...tool,
      attributes: [
        attribute('gen_ai.operation.name', 'execute_tool'),
        attribute('gen_ai.tool.name', name),
      ],
    };
    expect(() => normalizeHostedTrace(payload(root, namedTool), parentId)).toThrow(
      'Invalid hosted OTLP trace',
    );
    const namedModel = {
      ...model,
      attributes: [
        attribute('gen_ai.operation.name', 'chat'),
        attribute('gen_ai.request.model', name),
      ],
    };
    expect(() => normalizeHostedTrace(payload(root, namedModel), parentId)).toThrow(
      'Invalid hosted OTLP trace',
    );
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
      normalizeHostedTrace(payload(root, chat), parentId, undefined, [...redact]),
    ).toThrow('Invalid hosted OTLP trace');
  });

  it.each([
    'vendor/model',
    'vendor/npm_package_registry_metadata',
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
    const { spans, complete } = normalizeHostedTrace(payload(root, chat), parentId);
    expect(complete).toBe(true);
    expect(spans[1]).toMatchObject({
      name: `chat ${id}`,
      attributes: { 'gen_ai.request.model': id },
    });
  });

  it('applies the active request policy to a tool name and its aliases', async () => {
    await expect(
      cliState.withRequestTracingConfig(
        {
          enabled: true,
          otlp: { http: { enabled: true, port: 4318, redactAttributes: ['gen_ai.tool.name'] } },
        },
        async () => normalizeHostedTrace(payload(root, tool), parentId),
      ),
    ).rejects.toThrow('Invalid hosted OTLP trace');
  });

  it('withholds an identifier that contains a provider credential', () => {
    const redact = (value: string) => value.replaceAll('lookup_order', '[REDACTED]');
    expect(() => normalizeHostedTrace(payload(root, tool), parentId, redact)).toThrow(
      'Invalid hosted OTLP trace',
    );
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

    function importProtected(spans: object[], resourceAttributes: object[] = []) {
      return normalizeHostedTrace(
        {
          resourceSpans: [
            { resource: { attributes: resourceAttributes }, scopeSpans: [{ spans }] },
          ],
        },
        parentId,
        undefined,
        [protectedKey],
      );
    }

    it('withholds tool names that echo protected strings and integers', () => {
      for (const [name, value] of [
        ['read_tenant_42', { stringValue: tenant }],
        ['read_7', { intValue: '7' }],
        ['read_7', { intValue: '0007' }],
      ] as const) {
        const call = callNamed(name, { key: protectedKey, value });
        expect(() => importProtected([root, call])).toThrow('Invalid hosted OTLP trace');
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
      expect(() => importProtected([root, chat], resourceAttributes)).toThrow(
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
      const { spans, complete } = importProtected([root, call]);
      expect(complete).toBe(true);
      expect(spans[1]).toMatchObject({
        name: 'execute_tool read_filename',
        attributes: {
          'tool.name': 'read_filename',
        },
      });
    });

    it('checks identities against protected fields inside argument JSON', () => {
      const raw = JSON.stringify({ metadata: [{ [protectedKey]: tenant }] });
      const call = callNamed('read_tenant_42', attribute('gen_ai.tool.call.arguments', raw));
      expect(() => importProtected([root, call])).toThrow('Invalid hosted OTLP trace');
    });

    it('withholds the identity when a duplicate protected JSON key could conceal its source', () => {
      for (const values of [
        [tenant, 'other'],
        ['other', tenant],
      ]) {
        const raw = `{"${protectedKey}":"${values[0]}","${protectedKey}":"${values[1]}"}`;
        const call = callNamed('read_tenant_42', attribute('gen_ai.tool.call.arguments', raw));
        expect(() => importProtected([root, call])).toThrow('Invalid hosted OTLP trace');
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
        expect(() => importProtected([root, ...siblings])).toThrow('Invalid hosted OTLP trace');
      }
    });

    function withCarriers(input: unknown, rules = [protectedKey]) {
      return normalizeHostedTrace(input, parentId, undefined, rules);
    }

    describe('credential attributes and argument aliases', () => {
      const credential = 'kappa-blue-19';

      it('withholds a tool name echoing an opaque API key by default', () => {
        const call = callNamed(`lookup_${credential}`, attribute('x-api-key', credential));
        expect(() => normalizeHostedTrace(payload(root, call), parentId)).toThrow(
          'Invalid hosted OTLP trace',
        );
      });

      it('checks the credential part of an Authorization header without a custom rule', () => {
        const call = callNamed(
          `lookup_${credential}`,
          attribute('Authorization', `Bearer ${credential}`),
        );
        expect(() => normalizeHostedTrace(payload(root, call), parentId)).toThrow(
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
        expect(() => normalizeHostedTrace(payload(root, call, source), parentId)).toThrow(
          'Invalid hosted OTLP trace',
        );
      });

      it.each(['tool.arguments', 'gen_ai.tool.call.arguments'])(
        'checks credential fields inside %s JSON',
        (key) => {
          const raw = JSON.stringify({ headers: { 'X-API-Key': credential } });
          const call = callNamed(`lookup_${credential}`, attribute(key, raw));
          expect(() => normalizeHostedTrace(payload(root, call), parentId)).toThrow(
            'Invalid hosted OTLP trace',
          );
        },
      );

      it.each(['tool.arguments', 'gen_ai.tool.call.arguments'])(
        'recognizes an escaped JSON credential key in %s',
        (key) => {
          const raw = String.raw`{"headers":{"X-\u0041PI-\u004bey":"${credential}"}}`;
          const call = callNamed(`lookup_${credential}`, attribute(key, raw));
          expect(() => normalizeHostedTrace(payload(root, call), parentId)).toThrow(
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

      it('keeps a tool name containing a count from a usage attribute', () => {
        const call = callNamed('lookup_7', {
          key: 'gen_ai.usage.input_tokens',
          value: { intValue: '7' },
        });
        expect(normalizeHostedTrace(payload(root, call), parentId).spans[1].name).toBe(
          'execute_tool lookup_7',
        );
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

    it('bounds empty scopes across the snapshot under default redaction', () => {
      const emptyScopes = Array.from({ length: 1000 }, () => ({}));
      const groups = Array.from({ length: 34 }, () => ({ scopeSpans: emptyScopes }));
      const populated = { scopeSpans: [{ spans: [root] }] };
      const data = { resourceSpans: [...groups, populated] };
      expect(() => normalizeHostedTrace(data, parentId)).toThrow('Invalid hosted OTLP trace');

      const calls = Array.from({ length: 999 }, (_, index) => ({
        ...callNamed('lookup_order'),
        spanId: (index + 10).toString(16).padStart(16, '0'),
      }));
      const { spans, complete } = normalizeHostedTrace(payload(root, ...calls), parentId);
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
      expect(() => importProtected([root, call])).toThrow('Invalid hosted OTLP trace');
    });
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
        expect(normalizeHostedTrace(payload(...encoded), parentId)).toEqual(
          normalizeHostedTrace(payload(...fixture), parentId),
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
      expect(normalizeHostedTrace(wire, parentId)).toEqual({ spans: [], complete: false });
    });

    it('imports a populated scope alongside empty resource and scope groups', () => {
      const wire = { resourceSpans: [{}, { scopeSpans: [{}, { spans: [root, tool] }, {}] }] };
      expect(normalizeHostedTrace(wire, parentId)).toEqual(
        normalizeHostedTrace(payload(root, tool), parentId),
      );
    });

    it.each([
      ['root', (value: unknown) => value],
      ['resource group', (value: unknown) => ({ resourceSpans: [value] })],
      ['scope group', (value: unknown) => ({ resourceSpans: [{ scopeSpans: [value] }] })],
    ] as const)('requires the %s to be an object', (_description, wire) => {
      for (const malformed of [null, [], 'unexpected']) {
        expect(() => normalizeHostedTrace(wire(malformed), parentId)).toThrow();
      }
    });

    it.each([
      ['resourceSpans', (value: unknown) => ({ resourceSpans: value })],
      ['scopeSpans', (value: unknown) => ({ resourceSpans: [{ scopeSpans: value }] })],
      ['spans', (value: unknown) => ({ resourceSpans: [{ scopeSpans: [{ spans: value }] }] })],
    ] as const)('rejects an invalid or oversized %s collection', (_description, wire) => {
      for (const malformed of [null, {}, 'unexpected', Array(1_001).fill({})]) {
        expect(() => normalizeHostedTrace(wire(malformed), parentId)).toThrow();
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
      const { spans, complete } = normalizeHostedTrace(native, parentId);
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
    expect(() => normalizeHostedTrace(payload(...spans), parentId)).toThrow();
  });

  it('rejects an oversized trace instead of silently dropping tool evidence beyond the limit', () => {
    const children = Array.from({ length: 1000 }, (_, i) =>
      nativeSpan((i + 1).toString(16).padStart(16, '0'), 'chat', root.spanId),
    );
    expect(() => normalizeHostedTrace(payload(root, ...children), parentId)).toThrow();
  });
});
