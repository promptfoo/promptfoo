import { SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTraceContextIfNeeded } from '../../src/tracing/evaluatorTracing';
import { getGenAITracer, withGenAISpan } from '../../src/tracing/genaiTracer';
import { getActiveTraceparent, SPAN_ROLE_ATTRIBUTE } from '../../src/tracing/spanRoles';
import { withTestCaseSpan, withTracedProviderCall } from '../../src/tracing/targetTracer';

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

  it('parents a target and its model call beneath the test-case root', async () => {
    const root = getGenAITracer().startSpan('test case model');
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
          async () => ({ output: 'done' }),
        ),
      );
      return [{ score: 1, success: true }];
    });

    const spans = exporter.getFinishedSpans();
    const rootSpan = spans.find((span) => span.name === 'test case model')!;
    const targetSpan = spans.find((span) => span.name === 'openai:gpt-4.1')!;
    const modelSpan = spans.find((span) => span.name === 'chat gpt-4.1')!;

    expect(targetSpan.parentSpanContext?.spanId).toBe(rootSpan.spanContext().spanId);
    expect(modelSpan.parentSpanContext?.spanId).toBe(targetSpan.spanContext().spanId);
    expect(modelSpan.attributes[SPAN_ROLE_ATTRIBUTE]).toBe('target');
  });

  it('honors an explicitly selected parent within the active trace', async () => {
    const root = getGenAITracer().startSpan('test case explicit parent');

    await withTestCaseSpan(root, async () => {
      await getGenAITracer().startActiveSpan('requested parent', async (requestedParent) => {
        const parentContext = requestedParent.spanContext();
        const explicitTraceparent = `00-${parentContext.traceId}-${parentContext.spanId}-01`;

        try {
          await getGenAITracer().startActiveSpan(
            'different active parent',
            async (activeParent) => {
              try {
                await withGenAISpan(
                  {
                    system: 'openai',
                    operationName: 'chat',
                    model: 'gpt-4.1',
                    providerId: 'openai:gpt-4.1',
                    traceparent: explicitTraceparent,
                  },
                  async () => ({ output: 'done' }),
                );
              } finally {
                activeParent.end();
              }
            },
          );
        } finally {
          requestedParent.end();
        }
      });

      return [{ score: 1, success: true }];
    });

    const spans = exporter.getFinishedSpans();
    const requestedParent = spans.find((span) => span.name === 'requested parent')!;
    const activeParent = spans.find((span) => span.name === 'different active parent')!;
    const modelSpan = spans.find((span) => span.name === 'chat gpt-4.1')!;

    expect(modelSpan.parentSpanContext?.spanId).toBe(requestedParent.spanContext().spanId);
    expect(modelSpan.parentSpanContext?.spanId).not.toBe(activeParent.spanContext().spanId);
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
