import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTraceContextIfNeeded } from '../../src/tracing/evaluatorTracing';
import { getGenAITracer, withGenAISpan } from '../../src/tracing/genaiTracer';
import { isRelevantSpan } from '../../src/tracing/spanFilter';
import { getActiveTraceparent, SPAN_ROLE_ATTRIBUTE } from '../../src/tracing/spanRoles';
import {
  GraderAttributes,
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
            async () => ({ output: 'model response' }),
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
              async () => ({ output: 'judge response' }),
            ),
        );
        return { pass: false, score: 0 };
      });

      return [{ score: 0, success: false }];
    });

    const spans = exporter.getFinishedSpans();
    const rootSpan = spans.find((span) => span.name === 'test case shared')!;
    const targetSpan = spans.find((span) => span.name === 'http:customer-agent')!;
    const targetModel = spans.find((span) => span.name === 'chat application-model')!;
    const graderSpan = spans.find((span) => span.name === 'grader llm-rubric')!;
    const gradingProviderSpan = spans.find((span) => span.name === 'grader model openai:judge')!;
    const judgeModel = spans.find((span) => span.name === 'chat judge-model')!;

    expect(targetSpan.parentSpanContext?.spanId).toBe(rootSpan.spanContext().spanId);
    expect(targetModel.parentSpanContext?.spanId).toBe(targetSpan.spanContext().spanId);
    expect(graderSpan.parentSpanContext?.spanId).toBe(rootSpan.spanContext().spanId);
    expect(gradingProviderSpan.parentSpanContext?.spanId).toBe(graderSpan.spanContext().spanId);
    expect(judgeModel.parentSpanContext?.spanId).toBe(gradingProviderSpan.spanContext().spanId);
    expect(targetContexts[0]?.traceparent).toContain(targetSpan.spanContext().spanId);
    expect(graderSpan.attributes).toMatchObject({
      [GraderAttributes.GRADER_PASS]: false,
      [GraderAttributes.GRADER_SCORE]: 0,
      [SPAN_ROLE_ATTRIBUTE]: 'grader',
    });
    expect(targetModel.attributes[SPAN_ROLE_ATTRIBUTE]).toBe('target');
    expect(judgeModel.attributes[SPAN_ROLE_ATTRIBUTE]).toBe('grader');
    expect(isRelevantSpan({ attributes: targetModel.attributes })).toBe(true);
    expect(isRelevantSpan({ attributes: judgeModel.attributes })).toBe(false);
  });

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
