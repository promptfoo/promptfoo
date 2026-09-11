import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addActiveSpanRoleAttribute,
  closeTurnSpan,
  emitTurnMarkerSpan,
  getGenAITracer,
  openTurnSpan,
  withGenAISpan,
  withGenAIToolSpan,
} from '../../src/tracing/genaiTracer';
import { SPAN_ROLE_ATTRIBUTE } from '../../src/tracing/spanRoles';
import { withTestCaseSpan, withTracedProviderCall } from '../../src/tracing/targetTracer';

import type { ApiProvider, CallApiContextParams } from '../../src/types/index';

describe('provider tool execution hierarchy', () => {
  let tracerProvider: NodeTracerProvider;
  let exporter: InMemorySpanExporter;

  beforeAll(() => {
    exporter = new InMemorySpanExporter();
    tracerProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    tracerProvider.register();
  });

  afterAll(async () => {
    await tracerProvider.shutdown();
  });

  beforeEach(() => {
    exporter.reset();
  });

  it('parents target tool executions beneath the active model span', async () => {
    const root = getGenAITracer().startSpan('test case target tool');
    const provider: ApiProvider = {
      id: () => 'openai:gpt-4.1',
      callApi: async () => ({ output: 'done' }),
    };
    const callContext: CallApiContextParams = {
      prompt: { raw: 'test prompt', label: 'target' },
      vars: {},
    };

    await withTestCaseSpan(root, async () => {
      await withTracedProviderCall({ provider, callContext }, (targetContext) =>
        withGenAISpan(
          {
            system: 'openai',
            operationName: 'chat',
            model: 'gpt-4.1',
            providerId: provider.id(),
            traceparent: targetContext?.traceparent,
          },
          async () => {
            await withGenAIToolSpan(
              { name: 'lookup_order', arguments: { order_id: '123' }, callId: 'call-1' },
              async () => ({ status: 'shipped' }),
            );
            return { output: 'done' };
          },
        ),
      );
      return [{ score: 1, success: true }];
    });

    const spans = exporter.getFinishedSpans();
    const modelSpan = spans.find((span) => span.name === 'chat gpt-4.1')!;
    const toolSpan = spans.find((span) => span.name === 'execute_tool lookup_order')!;

    expect(toolSpan.parentSpanContext?.spanId).toBe(modelSpan.spanContext().spanId);
    expect(toolSpan.attributes).toMatchObject({
      [SPAN_ROLE_ATTRIBUTE]: 'target',
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'lookup_order',
      'gen_ai.tool.call.id': 'call-1',
      'tool.arguments': '{"order_id":"123"}',
      'tool.output': '{"status":"shipped"}',
    });
  });

  it.each(['target', 'grader'] as const)(
    'preserves the %s role on nested tool, streaming-turn, and marker spans',
    async (role) => {
      const root = getGenAITracer().startSpan(`test case ${role} agent`);
      const provider: ApiProvider = {
        id: () => 'openai:agent',
        callApi: async () => ({ output: 'done' }),
      };
      const callContext: CallApiContextParams = {
        prompt: { raw: 'test prompt', label: role },
        vars: {},
      };

      await withTestCaseSpan(root, async () => {
        await withTracedProviderCall({ provider, callContext, role }, async () => {
          const tracer = getGenAITracer();
          const state = { turnCount: 0, activeTurnIndex: 0 };
          const now = Date.now();

          openTurnSpan(state, { tracer, eventTime: now, system: 'openai' });
          const tool = tracer.startSpan('tool search', {
            attributes: addActiveSpanRoleAttribute({ 'tool.name': 'search' }),
          });
          tool.end();
          closeTurnSpan(state, { eventTime: now + 1 });
          emitTurnMarkerSpan({
            tracer,
            index: 2,
            startTime: now,
            endTime: now + 1,
            attributes: { 'gen_ai.turn.index': 2 },
          });

          return { output: 'done' };
        });
        return [{ score: 1, success: true }];
      });

      const childSpans = exporter
        .getFinishedSpans()
        .filter((span) => span.name.startsWith('gen_ai.turn') || span.name === 'tool search');

      expect(childSpans).toHaveLength(3);
      for (const span of childSpans) {
        expect(span.attributes[SPAN_ROLE_ATTRIBUTE]).toBe(role);
      }
    },
  );
});
