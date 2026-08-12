import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpProvider } from '../../src/providers/http';
import { generateTraceContextIfNeeded } from '../../src/tracing/evaluatorTracing';
import {
  addActiveSpanRoleAttribute,
  closeTurnSpan,
  emitTurnMarkerSpan,
  GenAIAttributes,
  getGenAITracer,
  openTurnSpan,
  withGenAISpan,
  withGenAIToolSpan,
} from '../../src/tracing/genaiTracer';
import { isRelevantSpan } from '../../src/tracing/spanFilter';
import { getActiveTraceparent, SPAN_ROLE_ATTRIBUTE } from '../../src/tracing/spanRoles';
import {
  withGraderSpan,
  withTestCaseSpan,
  withTracedProviderCall,
} from '../../src/tracing/targetTracer';

import type { ApiProvider, CallApiContextParams, TestSuite } from '../../src/types/index';

const createTrace = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../src/tracing/store', () => ({
  getTraceStore: () => ({ createTrace }),
}));

describe('test-case execution trace hierarchy', () => {
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
    createTrace.mockReset();
    createTrace.mockResolvedValue(undefined);
  });

  it('uses the recorded test-case root as the traceparent for one provider execution', async () => {
    const traceContext = await generateTraceContextIfNeeded(
      {
        metadata: {
          tracingEnabled: true,
          evaluationId: 'eval-1',
          testCaseId: 'test-1',
        },
      },
      {},
      2,
      3,
      undefined,
      { providerId: 'python:customer.py', promptLabel: 'customer prompt', repeatIndex: 4 },
    );

    expect(traceContext?.rootSpan).toBeDefined();
    const rootContext = traceContext!.rootSpan!.spanContext();
    expect(traceContext?.traceparent).toBe(`00-${rootContext.traceId}-${rootContext.spanId}-01`);
    expect(createTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: rootContext.traceId,
        metadata: expect.objectContaining({ providerId: 'python:customer.py', repeatIndex: 4 }),
      }),
    );

    await withTestCaseSpan(traceContext?.rootSpan, async () => [{ score: 1, success: true }]);

    const [root] = exporter.getFinishedSpans();
    expect(root.name).toBe('promptfoo.test_case');
    expect(root.parentSpanContext).toBeUndefined();
    expect(root.attributes).toMatchObject({
      [SPAN_ROLE_ATTRIBUTE]: 'test_case',
      'promptfoo.provider.id': 'python:customer.py',
      'promptfoo.prompt.index': 3,
      'promptfoo.repeat.index': 4,
      'promptfoo.test.success': true,
      'promptfoo.test.score': 1,
    });
  });

  it('parents target and grading branches beneath the same recorded test-case root', async () => {
    const root = getGenAITracer().startSpan('test case shared');
    const targetContexts: Array<CallApiContextParams | undefined> = [];
    const targetProvider: ApiProvider = {
      id: () => 'http:customer-agent',
      callApi: async (_prompt, context) => {
        targetContexts.push(context);
        return { output: 'customer response' };
      },
    };
    const gradingProvider: ApiProvider = {
      id: () => 'openai:judge',
      callApi: async () => ({ output: 'judge response' }),
    };
    const callContext: CallApiContextParams = {
      prompt: { raw: 'test prompt', label: 'target' },
      vars: {},
    };

    await withTestCaseSpan(root, async () => {
      await withTracedProviderCall(
        { provider: targetProvider, callContext },
        async (targetContext) => {
          await withGenAISpan(
            {
              system: 'customer',
              operationName: 'chat',
              model: 'application-model',
              providerId: 'http:customer-agent',
              traceparent: targetContext?.traceparent,
            },
            async () => {
              await withGenAIToolSpan(
                { name: 'lookup_order', arguments: { order_id: '123' }, callId: 'call-1' },
                async () => ({ status: 'shipped' }),
              );
              return { output: 'model response' };
            },
          );
          return targetProvider.callApi('test prompt', targetContext);
        },
      );

      await withGraderSpan({ graderId: 'llm-rubric' }, async () => {
        await withTracedProviderCall(
          { provider: gradingProvider, callContext, role: 'grader' },
          async (gradingContext) =>
            withGenAISpan(
              {
                system: 'openai',
                operationName: 'chat',
                model: 'judge-model',
                providerId: gradingProvider.id(),
                traceparent: gradingContext?.traceparent,
              },
              async () => {
                await withGenAIToolSpan(
                  { name: 'check_policy', arguments: { policy: 'returns' } },
                  async () => ({ allowed: true }),
                );
                return { output: 'judge response' };
              },
            ),
        );
        return { pass: false, score: 0, reason: 'The response did not satisfy the rubric.' };
      });

      return [{ score: 0, success: false }];
    });

    const spans = exporter.getFinishedSpans();
    const rootSpan = spans.find((span) => span.name === 'test case shared')!;
    const targetSpan = spans.find((span) => span.name === 'http:customer-agent')!;
    const targetModel = spans.find((span) => span.name === 'chat application-model')!;
    const targetTool = spans.find((span) => span.name === 'execute_tool lookup_order')!;
    const graderSpan = spans.find((span) => span.name === 'grader llm-rubric')!;
    const gradingProviderSpan = spans.find((span) => span.name === 'grader provider openai:judge')!;
    const judgeModel = spans.find((span) => span.name === 'chat judge-model')!;
    const graderTool = spans.find((span) => span.name === 'execute_tool check_policy')!;

    expect(targetSpan.parentSpanContext?.spanId).toBe(rootSpan.spanContext().spanId);
    expect(targetModel.parentSpanContext?.spanId).toBe(targetSpan.spanContext().spanId);
    expect(targetTool.parentSpanContext?.spanId).toBe(targetModel.spanContext().spanId);
    expect(graderSpan.parentSpanContext?.spanId).toBe(rootSpan.spanContext().spanId);
    expect(gradingProviderSpan.parentSpanContext?.spanId).toBe(graderSpan.spanContext().spanId);
    expect(judgeModel.parentSpanContext?.spanId).toBe(gradingProviderSpan.spanContext().spanId);
    expect(graderTool.parentSpanContext?.spanId).toBe(judgeModel.spanContext().spanId);
    expect(targetContexts[0]?.traceparent).toContain(targetSpan.spanContext().spanId);
    expect(graderSpan.attributes).toMatchObject({
      [GenAIAttributes.EVALUATION_NAME]: 'llm-rubric',
      [GenAIAttributes.EVALUATION_SCORE_LABEL]: 'fail',
      [GenAIAttributes.EVALUATION_SCORE_VALUE]: 0,
      [GenAIAttributes.EVALUATION_EXPLANATION]: 'The response did not satisfy the rubric.',
      [SPAN_ROLE_ATTRIBUTE]: 'grader',
    });
    expect(gradingProviderSpan.attributes).not.toHaveProperty('promptfoo.target.type');
    expect(gradingProviderSpan.attributes).not.toHaveProperty('promptfoo.target.label');
    expect(gradingProviderSpan.attributes).not.toHaveProperty(GenAIAttributes.OPERATION_NAME);
    expect(targetModel.attributes[SPAN_ROLE_ATTRIBUTE]).toBe('target');
    expect(targetTool.attributes).toMatchObject({
      [GenAIAttributes.OPERATION_NAME]: 'execute_tool',
      [SPAN_ROLE_ATTRIBUTE]: 'target',
      'gen_ai.tool.call.id': 'call-1',
      'gen_ai.tool.name': 'lookup_order',
      'tool.arguments': '{"order_id":"123"}',
      'tool.output': '{"status":"shipped"}',
    });
    expect(judgeModel.attributes[SPAN_ROLE_ATTRIBUTE]).toBe('grader');
    expect(graderTool.attributes[SPAN_ROLE_ATTRIBUTE]).toBe('grader');
    expect(isRelevantSpan({ attributes: targetModel.attributes })).toBe(true);
    expect(isRelevantSpan({ attributes: targetTool.attributes })).toBe(true);
    expect(isRelevantSpan({ attributes: graderSpan.attributes })).toBe(false);
    expect(isRelevantSpan({ attributes: judgeModel.attributes })).toBe(false);
    expect(isRelevantSpan({ attributes: graderTool.attributes })).toBe(false);
  });

  it('records HTTP target execution without inventing a model-inference span', async () => {
    const root = getGenAITracer().startSpan('test case http target');
    const provider = Object.create(HttpProvider.prototype) as HttpProvider;
    provider.id = () => 'https://customer.example/chat';
    vi.spyOn(provider as any, 'callApiInternal').mockResolvedValue({ output: 'customer response' });
    const callContext: CallApiContextParams = {
      prompt: { raw: 'test prompt', label: 'target' },
      vars: {},
    };

    await withTestCaseSpan(root, async () => {
      await withTracedProviderCall({ provider, callContext }, (targetContext) =>
        provider.callApi('test prompt', targetContext),
      );
      return [{ score: 1, success: true }];
    });

    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual([
      'https://customer.example/chat',
      'test case http target',
    ]);
    expect(spans[0].attributes).toMatchObject({
      [SPAN_ROLE_ATTRIBUTE]: 'target',
      'promptfoo.target.type': 'http',
    });
    expect(spans[0].attributes).not.toHaveProperty(GenAIAttributes.OPERATION_NAME);
    expect(spans[0].attributes).not.toHaveProperty(GenAIAttributes.REQUEST_MODEL);
  });

  it('records embedding inference and usage beneath the grading-provider span', async () => {
    const root = getGenAITracer().startSpan('test case embedding grader');
    const provider: ApiProvider & { modelName: string } = {
      id: () => 'azure:text-embedding-3-small',
      modelName: 'text-embedding-3-small',
      callApi: async () => ({ output: 'unused' }),
    };

    await withTestCaseSpan(root, async () => {
      await withGraderSpan({ graderId: 'similarity' }, async () => {
        await withTracedProviderCall(
          { provider, role: 'grader', operationName: 'embeddings' },
          async () => ({ embedding: [1, 0], tokenUsage: { prompt: 7, total: 7 } }),
        );
        return { pass: true, score: 1 };
      });
      return [{ score: 1, success: true }];
    });

    const spans = exporter.getFinishedSpans();
    const providerSpan = spans.find(
      (span) => span.name === 'grader provider azure:text-embedding-3-small',
    )!;
    const embeddingSpan = spans.find((span) => span.name === 'embeddings text-embedding-3-small')!;

    expect(embeddingSpan.parentSpanContext?.spanId).toBe(providerSpan.spanContext().spanId);
    expect(embeddingSpan.attributes).toMatchObject({
      [GenAIAttributes.OPERATION_NAME]: 'embeddings',
      [GenAIAttributes.PROVIDER_NAME]: 'azure.ai.openai',
      [GenAIAttributes.REQUEST_MODEL]: 'text-embedding-3-small',
      [GenAIAttributes.USAGE_INPUT_TOKENS]: 7,
      [SPAN_ROLE_ATTRIBUTE]: 'grader',
      'promptfoo.usage.total_tokens': 7,
    });
  });

  it('sanitizes and bounds grader explanations before exporting them', async () => {
    const root = getGenAITracer().startSpan('test case grader explanation');

    await withTestCaseSpan(root, async () => {
      await withGraderSpan({ graderId: 'contains' }, async () => ({
        pass: true,
        score: 1,
        reason: `api_key=abcdefghijklmnop ${'long explanation '.repeat(100)}`,
      }));
      return [{ score: 1, success: true }];
    });

    const graderSpan = exporter.getFinishedSpans().find((span) => span.name === 'grader contains')!;
    const explanation = graderSpan.attributes[GenAIAttributes.EVALUATION_EXPLANATION] as string;

    expect(explanation).toContain('api_key=<REDACTED>');
    expect(explanation).not.toContain('abcdefghijklmnop');
    expect(explanation).toHaveLength(1024);
    expect(explanation.endsWith('…')).toBe(true);
    expect(graderSpan.attributes[GenAIAttributes.EVALUATION_SCORE_LABEL]).toBe('pass');
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
        expect(isRelevantSpan({ attributes: span.attributes })).toBe(role === 'target');
      }
    },
  );

  it('keeps the root open until deferred grading finishes', async () => {
    const root = getGenAITracer().startSpan('test case deferred');
    let finishGrading: (() => void) | undefined;
    const deferredGrading = new Promise<void>((resolve) => {
      finishGrading = resolve;
    });
    const result = [{ score: 0, success: false }];

    await expect(
      withTestCaseSpan(
        root,
        async () => result,
        () => deferredGrading,
      ),
    ).resolves.toBe(result);
    expect(exporter.getFinishedSpans()).toHaveLength(0);

    result[0] = { score: 1, success: true };
    finishGrading!();
    await deferredGrading;
    await Promise.resolve();

    const [finishedRoot] = exporter.getFinishedSpans();
    expect(finishedRoot.attributes['promptfoo.test.success']).toBe(true);
    expect(finishedRoot.attributes['promptfoo.test.score']).toBe(1);
  });

  it('creates independent root traces for separate targets using the same test case', async () => {
    const suite = { tracing: { enabled: true } } as TestSuite;
    const test = { metadata: { evaluationId: 'eval-1', testCaseId: 'shared-test' } };
    const first = await generateTraceContextIfNeeded(test, {}, 0, 0, suite, {
      providerId: 'http:target-a',
    });
    const second = await generateTraceContextIfNeeded(test, {}, 0, 0, suite, {
      providerId: 'http:target-b',
    });

    expect(first?.rootSpan?.spanContext().traceId).not.toBe(
      second?.rootSpan?.spanContext().traceId,
    );
    await Promise.all([
      withTestCaseSpan(first?.rootSpan, async () => [{ score: 1, success: true }]),
      withTestCaseSpan(second?.rootSpan, async () => [{ score: 1, success: true }]),
    ]);

    expect(
      exporter.getFinishedSpans().map((span) => span.attributes['promptfoo.provider.id']),
    ).toEqual(expect.arrayContaining(['http:target-a', 'http:target-b']));
  });

  it('records target exceptions on both the target and test-case spans', async () => {
    const root = getGenAITracer().startSpan('test case failure');
    const provider: ApiProvider = {
      id: () => 'http:broken-target',
      callApi: async () => {
        throw new Error('target unavailable');
      },
    };
    const callContext: CallApiContextParams = {
      prompt: { raw: 'test prompt', label: 'target' },
      vars: {},
    };

    await expect(
      withTestCaseSpan(root, () =>
        withTracedProviderCall({ provider, callContext }, (context) =>
          provider.callApi('test prompt', context),
        ),
      ),
    ).rejects.toThrow('target unavailable');

    for (const span of exporter.getFinishedSpans()) {
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
    }
    expect(getActiveTraceparent()).toBeUndefined();
  });
});
