import {
  context,
  type ProxyTracerProvider,
  propagation,
  ROOT_CONTEXT,
  trace,
} from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushOtel,
  initializeOtel,
  shutdownOtel,
  trackLocalTrace,
} from '../../src/tracing/otelSdk';
import { UNRELIABLE_SPAN_ATTRIBUTE } from '../../src/tracing/store';
import { createDeferred } from '../util/utils';
import type { Resource } from '@opentelemetry/resources';

const { mockAddSpans, resourceOverride } = vi.hoisted(() => ({
  mockAddSpans: vi.fn(),
  resourceOverride: { current: undefined as Resource | undefined },
}));

vi.mock('../../src/tracing/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/tracing/store')>()),
  getTraceStore: () => ({ addSpans: mockAddSpans }),
}));
vi.mock('../../src/logger');
vi.mock('@opentelemetry/resources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opentelemetry/resources')>();
  return {
    ...actual,
    resourceFromAttributes: (...args: Parameters<typeof actual.resourceFromAttributes>) =>
      resourceOverride.current ?? actual.resourceFromAttributes(...args),
  };
});

const config = { enabled: true, localExport: true, serviceName: 'flush-test', debug: false };

describe('scoped local SDK flush', () => {
  beforeEach(() => {
    mockAddSpans.mockReset().mockResolvedValue({ stored: true });
    resourceOverride.current = undefined;
  });

  afterEach(async () => {
    await shutdownOtel();
    trace.disable();
    context.disable();
    propagation.disable();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('marks a row incomplete when its batch times out before reaching the exporter', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OTEL_BSP_EXPORT_TIMEOUT', '20');
    const attributes = createDeferred<string>();
    resourceOverride.current = resourceFromAttributes({ detector: attributes.promise });
    initializeOtel(config);
    const span = trace.getTracer('test').startSpan('undispatched');
    const row = trackLocalTrace(span.spanContext().traceId)!;
    span.end();
    try {
      const flushed = row.flush();
      await vi.advanceTimersByTimeAsync(21);
      await expect(flushed).resolves.toBe(true);
      expect(row.isComplete()).toBe(false);
      expect(mockAddSpans).not.toHaveBeenCalled();
    } finally {
      attributes.resolve('ready');
      await vi.advanceTimersByTimeAsync(1);
      row.release();
    }
  });

  it('marks a row incomplete when the batch processor silently drops an ended span', async () => {
    vi.stubEnv('OTEL_BSP_MAX_QUEUE_SIZE', '1');
    vi.stubEnv('OTEL_BSP_MAX_EXPORT_BATCH_SIZE', '1');
    const writing = createDeferred<{ stored: boolean }>();
    mockAddSpans.mockReturnValueOnce(writing.promise);
    initializeOtel(config);
    const tracer = trace.getTracer('test');
    const first = tracer.startSpan('first');
    const row = trackLocalTrace(first.spanContext().traceId)!;
    const parent = trace.setSpan(ROOT_CONTEXT, first);
    first.end();
    tracer.startSpan('queued', {}, parent).end();
    tracer.startSpan('dropped-tool-call', {}, parent).end();
    try {
      writing.resolve({ stored: true });
      await expect(row.flush()).resolves.toBe(true);
      expect(row.isComplete()).toBe(false);
      const stored = mockAddSpans.mock.calls.flatMap(([, spans]) =>
        spans.map((span: { name: string }) => span.name),
      );
      expect(stored.sort()).toEqual(['first', 'queued']);
    } finally {
      writing.resolve({ stored: true });
      row.release();
    }
  });

  it('withholds completeness while a tracked target child is still recording', async () => {
    initializeOtel(config);
    const tracer = trace.getTracer('test');
    const parent = tracer.startSpan('target');
    const row = trackLocalTrace(parent.spanContext().traceId)!;
    const child = tracer.startSpan('unfinished-tool', {}, trace.setSpan(ROOT_CONTEXT, parent));
    parent.end();
    try {
      await expect(row.flush()).resolves.toBe(true);
      expect(row.isComplete()).toBe(false);
      expect(child.isRecording()).toBe(true);
      child.end();
      await expect(row.flush()).resolves.toBe(true);
      expect(row.isComplete()).toBe(true);
    } finally {
      child.end();
      row.release();
    }
  });

  it('completes target evidence while its preexisting root and unsampled spans stay open', async () => {
    initializeOtel(config);
    const tracer = trace.getTracer('test');
    const root = tracer.startSpan('evaluation-root');
    const row = trackLocalTrace(root.spanContext().traceId)!;
    const target = tracer.startSpan(
      'promptfoo.test_case',
      { attributes: { 'promptfoo.span.role': 'grader' } },
      trace.setSpan(ROOT_CONTEXT, root),
    );
    const unsampled = tracer.startSpan(
      'unsampled',
      {},
      trace.setSpanContext(ROOT_CONTEXT, { ...root.spanContext(), traceFlags: 0 }),
    );
    target.end();
    try {
      await expect(row.flush()).resolves.toBe(true);
      expect(row.isComplete()).toBe(true);
      expect(root.isRecording()).toBe(true);
      expect(unsampled.isRecording()).toBe(false);
      expect(mockAddSpans.mock.calls.flatMap(([, spans]) => spans)).toEqual([
        expect.objectContaining({
          name: 'promptfoo.test_case',
          attributes: expect.objectContaining({ 'promptfoo.span.role': 'grader' }),
        }),
      ]);
    } finally {
      row.release();
      unsampled.end();
      root.end();
    }
  });

  it('keeps incomplete and complete rows separate on a shared provider', async () => {
    initializeOtel(config);
    initializeOtel(config);
    const tracer = trace.getTracer('test');
    const first = tracer.startSpan('first-target');
    const firstRow = trackLocalTrace(first.spanContext().traceId)!;
    const activeChild = tracer.startSpan('active-child', {}, trace.setSpan(ROOT_CONTEXT, first));
    first.end();
    const second = tracer.startSpan('second-target');
    const secondRow = trackLocalTrace(second.spanContext().traceId)!;
    second.end();
    try {
      await expect(secondRow.flush()).resolves.toBe(true);
      expect(secondRow.isComplete()).toBe(true);
      expect(firstRow.isComplete()).toBe(false);
      activeChild.end();
      await expect(firstRow.flush()).resolves.toBe(true);
      expect(firstRow.isComplete()).toBe(true);
    } finally {
      activeChild.end();
      firstRow.release();
      secondRow.release();
    }
  });

  it('seals active target children while excluding subsequent grader spans', async () => {
    initializeOtel(config);
    const tracer = trace.getTracer('test');
    const root = tracer.startSpan('evaluation-root');
    const row = trackLocalTrace(root.spanContext().traceId)!;
    const target = tracer.startSpan('target', {}, trace.setSpan(ROOT_CONTEXT, root));
    const child = tracer.startSpan('late-tool', {}, trace.setSpan(ROOT_CONTEXT, target));
    target.end();
    try {
      await expect(row.flush()).resolves.toBe(true);
      expect(row.isComplete()).toBe(false);
      const capturedIds = [target.spanContext().spanId, child.spanContext().spanId];
      expect(row.seal()).toEqual(capturedIds);
      const grader = tracer.startSpan('grader', {}, trace.setSpan(ROOT_CONTEXT, root));
      tracer.startSpan('execute_tool', {}, trace.setSpan(ROOT_CONTEXT, grader)).end();
      grader.end();
      root.end();
      child.end();
      await expect(row.flush()).resolves.toBe(true);
      expect(row.isComplete()).toBe(true);
      expect(row.seal()).toEqual(capturedIds);
      expect(mockAddSpans.mock.calls.flatMap(([, spans]) => spans)).toHaveLength(5);
    } finally {
      child.end();
      root.end();
      row.release();
    }
  });

  it.each([
    {
      name: 'dropped tool names',
      setting: 'OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT',
      limit: '1',
      attributes: { observed: 'yes', 'gen_ai.tool.name': 'send_email' },
      expected: { observed: 'yes' },
      reliable: false,
    },
    {
      name: 'truncated tool names',
      setting: 'OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT',
      limit: '6',
      attributes: { 'gen_ai.tool.name': 'send_email' },
      expected: { 'gen_ai.tool.name': 'send_e' },
      reliable: false,
    },
    {
      name: 'truncated tool arguments',
      setting: 'OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT',
      limit: '24',
      attributes: {
        'gen_ai.tool.name': 'send_email',
        'gen_ai.tool.call.arguments': '{"to":"recipient@example.com","subject":"private"}',
      },
      expected: {
        'gen_ai.tool.name': 'send_email',
        'gen_ai.tool.call.arguments': '{"to":"recipient@example',
      },
      reliable: false,
    },
    {
      name: 'truncated strings inside arrays',
      setting: 'OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT',
      limit: '6',
      attributes: { tool_names: ['send_email'] },
      expected: { tool_names: ['send_e'] },
      reliable: false,
    },
    {
      name: 'exact-limit strings indistinguishable from truncation',
      setting: 'OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT',
      limit: '6',
      attributes: { 'gen_ai.tool.name': 'search' },
      expected: { 'gen_ai.tool.name': 'search' },
      reliable: false,
    },
  ])(
    'detects $name without hiding stored evidence',
    async ({ setting, limit, attributes, expected, reliable }) => {
      vi.stubEnv(setting, limit);
      initializeOtel(config);
      const tracer = trace.getTracer('test');
      const root = tracer.startSpan('evaluation-root');
      const row = trackLocalTrace(root.spanContext().traceId)!;
      const target = tracer.startSpan('target', {}, trace.setSpan(ROOT_CONTEXT, root));
      target.setAttributes(attributes);
      target.end();
      try {
        await expect(row.flush()).resolves.toBe(true);
        expect(row.isComplete()).toBe(false);
        expect(row.isReliable()).toBe(reliable);
        expect(row.seal()).toEqual([target.spanContext().spanId]);
        expect(mockAddSpans.mock.calls.flatMap(([, spans]) => spans)).toEqual([
          expect.objectContaining({ attributes: expect.objectContaining(expected) }),
        ]);
      } finally {
        row.release();
        root.end();
      }
    },
  );

  it('keeps below-limit attribute values complete', async () => {
    vi.stubEnv('OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT', '32');
    initializeOtel(config);
    const tracer = trace.getTracer('test');
    const root = tracer.startSpan('evaluation-root');
    const row = trackLocalTrace(root.spanContext().traceId)!;
    const target = tracer.startSpan('target', {}, trace.setSpan(ROOT_CONTEXT, root));
    target.setAttributes({ 'gen_ai.tool.name': 'send_email', tool_names: ['search'] });
    target.end();
    try {
      await expect(row.flush()).resolves.toBe(true);
      expect(row.isComplete()).toBe(true);
      expect(row.isReliable()).toBe(true);
      expect(row.seal()).toEqual([target.spanContext().spanId]);
    } finally {
      row.release();
      root.end();
    }
  });

  it.each([
    { loss: 'dropped attributes', countLimit: '2', valueLimit: '100', unreliable: true },
    { loss: 'truncated attributes', countLimit: '128', valueLimit: '6', unreliable: true },
    { loss: 'intact attributes', countLimit: '128', valueLimit: '100', unreliable: false },
  ])(
    'persists $loss reliability after releasing the row tracker',
    async ({ countLimit, valueLimit, unreliable }) => {
      vi.stubEnv('OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT', countLimit);
      vi.stubEnv('OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT', valueLimit);
      initializeOtel(config);
      const tracer = trace.getTracer('test');
      const root = tracer.startSpan('evaluation-root');
      const row = trackLocalTrace(root.spanContext().traceId)!;
      const target = tracer.startSpan('target', {}, trace.setSpan(ROOT_CONTEXT, root));
      const child = tracer.startSpan('late-tool', {}, trace.setSpan(ROOT_CONTEXT, target));
      target.end();
      try {
        await expect(row.flush()).resolves.toBe(true);
        expect(row.isComplete()).toBe(false);
        expect(row.seal()).toContain(child.spanContext().spanId);
        row.release();

        // Loss occurs after the row's live reliability state is gone. A caller's
        // marker cannot override the exporter decision persisted with this span.
        child.setAttribute(UNRELIABLE_SPAN_ATTRIBUTE, false);
        child.setAttribute('tool.arguments', 'safe_probe');
        child.setAttribute('gen_ai.tool.name', 'send_email');
        child.end();
        await expect(flushOtel()).resolves.toBe(true);
        const storedChild = mockAddSpans.mock.calls
          .flatMap(([, spans]) => spans)
          .find((span: { spanId: string }) => span.spanId === child.spanContext().spanId);
        expect(storedChild.attributes[UNRELIABLE_SPAN_ATTRIBUTE]).toBe(unreliable);
        expect(storedChild.parentSpanId).toBe(target.spanContext().spanId);
      } finally {
        child.end();
        root.end();
        row.release();
      }
    },
  );

  it('withholds completeness after a host provider takes over during a row', async () => {
    initializeOtel(config);
    const before = trace.getTracer('test').startSpan('before-host-takeover');
    const row = trackLocalTrace(before.spanContext().traceId)!;
    before.end();
    await expect(row.flush()).resolves.toBe(true);
    const host = new TracerProvider();
    trace.disable();
    expect(trace.setGlobalTracerProvider(host)).toBe(true);
    try {
      trace
        .getTracer('host')
        .startSpan('host-only-child', {}, trace.setSpan(ROOT_CONTEXT, before))
        .end();
      await expect(row.flush()).resolves.toBe(true);
      expect(row.isComplete()).toBe(false);
      expect(() => initializeOtel(config)).toThrow('was replaced by the host');
      await shutdownOtel();
      expect((trace.getTracerProvider() as ProxyTracerProvider).getDelegate()).toBe(host);
      const hostSpan = trace.getTracer('host').startSpan('host-still-active');
      expect(hostSpan.isRecording()).toBe(true);
      hostSpan.end();
    } finally {
      row.release();
      trace.disable();
      await host.shutdown();
    }
  });

  it('keeps a complete row usable when another trace in its batch fails', async () => {
    initializeOtel(config);
    const tracer = trace.getTracer('test');
    const failed = tracer.startSpan('failed-row');
    const healthy = tracer.startSpan('healthy-row');
    const failedRow = trackLocalTrace(failed.spanContext().traceId)!;
    const healthyRow = trackLocalTrace(healthy.spanContext().traceId)!;
    mockAddSpans.mockImplementation(async (traceId) => {
      if (traceId === failed.spanContext().traceId) {
        throw new Error('Unrelated row cannot be stored');
      }
      return { stored: true };
    });
    failed.end();
    healthy.end();
    try {
      await expect(healthyRow.flush()).resolves.toBe(true);
      expect(healthyRow.isComplete()).toBe(true);
      await expect(failedRow.flush()).resolves.toBe(false);
      expect(failedRow.isComplete()).toBe(false);
      expect(mockAddSpans).toHaveBeenCalledTimes(2);
    } finally {
      failedRow.release();
      healthyRow.release();
    }
  });
});
