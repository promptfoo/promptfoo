import { describe, expect, it } from 'vitest';
import { OTLPTracingExporter } from '../../../src/providers/openai/agents-tracing';

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

describe('OTLPTracingExporter', () => {
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
    expect(span.name).toBe('tool lookup_order');
    expect(getAttributes(span)).toMatchObject({
      'evaluation.id': 'eval-1',
      'openai.agents.span_type': 'function',
      'test.case.id': 'case-1',
      'tool.arguments': '{"order_id":"123"}',
      'tool.name': 'lookup_order',
      'tool.output': '{"status":"shipped"}',
    });
    expect(span.parentSpanId).toBe(Buffer.from('fedcba9876543210', 'hex').toString('base64'));
  });

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
