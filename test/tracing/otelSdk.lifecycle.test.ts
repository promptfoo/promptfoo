import { context, ProxyTracerProvider, propagation, trace } from '@opentelemetry/api';
import { ExportResultCode, W3CTraceContextPropagator } from '@opentelemetry/core';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireOtel,
  flushOtel,
  initializeOtel,
  isOtelInitialized,
  shutdownOtel,
} from '../../src/tracing/otelSdk';
import type { ExportResult } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import type { OtelConfig } from '../../src/tracing/otelConfig';

const { exportedSpans } = vi.hoisted(() => ({ exportedSpans: [] as ReadableSpan[][] }));

// Keep the SDK, processors, context manager and API registration real. Replace
// only persistence with an in-memory exporter to inspect completed generations.
vi.mock('../../src/tracing/localSpanExporter', () => ({
  LocalSpanExporter: class {
    spans: ReadableSpan[] = [];

    constructor() {
      exportedSpans.push(this.spans);
    }

    export(spans: ReadableSpan[], callback: (result: ExportResult) => void) {
      this.spans.push(...spans);
      callback({ code: ExportResultCode.SUCCESS });
    }

    async shutdown() {}
  },
}));

vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const config: OtelConfig = {
  enabled: true,
  serviceName: 'sdk-lifecycle-test',
  localExport: true,
  debug: false,
};

describe('real OTEL SDK lifecycle', () => {
  let hostProvider: NodeTracerProvider | undefined;

  beforeEach(() => {
    trace.disable();
    context.disable();
    propagation.disable();
    exportedSpans.length = 0;
    vi.resetAllMocks();
  });

  afterEach(async () => {
    await shutdownOtel();
    await hostProvider?.shutdown();
    hostProvider = undefined;
    trace.disable();
    context.disable();
    propagation.disable();
    vi.resetAllMocks();
  });

  it('exports the completed lease while an overlapping lease keeps recording linked spans', async () => {
    const releaseFirst = await acquireOtel(config);
    const releaseSecond = await acquireOtel({ ...config, serviceName: 'ignored-second-config' });
    const first = trace.getTracer('test').startSpan('first-evaluation');
    const second = trace.getTracer('test').startSpan('second-evaluation');
    first.end();

    await releaseFirst();
    expect(exportedSpans).toHaveLength(1);
    expect(exportedSpans[0].map((span) => span.name)).toEqual(['first-evaluation']);
    expect(second.isRecording()).toBe(true);

    await context.with(trace.setSpan(context.active(), second), async () => {
      await Promise.resolve();
      const child = trace.getTracer('test').startSpan('second-child-after-first-release');
      child.end();
    });
    second.end();
    await releaseSecond();

    const [firstExport, childExport, secondExport] = exportedSpans[0];
    expect(childExport.parentSpanContext?.spanId).toBe(secondExport.spanContext().spanId);
    expect(childExport.spanContext().traceId).toBe(secondExport.spanContext().traceId);
    expect(firstExport.spanContext().traceId).not.toBe(secondExport.spanContext().traceId);
    expect(
      exportedSpans[0].every(
        (span) => span.resource.attributes['service.name'] === config.serviceName,
      ),
    ).toBe(true);
    expect(isOtelInitialized()).toBe(false);
  });

  it('registers a recording provider again after the previous generation shuts down', async () => {
    const releaseFirst = await acquireOtel(config);
    trace.getTracer('test').startSpan('first-generation').end();
    await releaseFirst();
    const inactiveProvider = trace.getTracerProvider();
    expect(inactiveProvider).toBeInstanceOf(ProxyTracerProvider);
    expect((inactiveProvider as ProxyTracerProvider).getDelegateTracer('test')).toBeUndefined();

    const releaseSecond = await acquireOtel({
      ...config,
      serviceName: 'second-generation-service',
    });
    const span = trace.getTracer('test').startSpan('second-generation');
    expect(span.isRecording()).toBe(true);
    span.end();
    await releaseSecond();

    expect(exportedSpans.map((spans) => spans.map((item) => item.name))).toEqual([
      ['first-generation'],
      ['second-generation'],
    ]);
    expect(exportedSpans[1][0].resource.attributes['service.name']).toBe(
      'second-generation-service',
    );
  });

  it('keeps an explicitly initialized SDK usable after evaluation release', async () => {
    initializeOtel(config);
    const hostGlobal = trace.getTracerProvider();
    const release = await acquireOtel(config);
    trace.getTracer('test').startSpan('evaluation').end();
    await release();
    expect(trace.getTracerProvider()).toBe(hostGlobal);
    expect(isOtelInitialized()).toBe(true);

    const span = trace.getTracer('host').startSpan('host-after-evaluation');
    expect(span.isRecording()).toBe(true);
    span.end();
    await flushOtel();
    expect(exportedSpans[0].map((item) => item.name)).toEqual([
      'evaluation',
      'host-after-evaluation',
    ]);
  });

  it('borrows an external SDK without modifying or shutting down its global registrations', async () => {
    const hostExporter = new InMemorySpanExporter();
    hostProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(hostExporter)],
    });
    hostProvider.register({ propagator: new W3CTraceContextPropagator() });
    const hostGlobal = trace.getTracerProvider();
    const hostShutdown = vi.spyOn(hostProvider, 'shutdown');
    const release = await acquireOtel(config);
    await release();
    await shutdownOtel();
    expect(isOtelInitialized()).toBe(false);
    expect(exportedSpans).toHaveLength(0);
    expect(hostShutdown).not.toHaveBeenCalled();
    expect(trace.getTracerProvider()).toBe(hostGlobal);

    const parent = trace.getTracer('host').startSpan('host-parent');
    await context.with(trace.setSpan(context.active(), parent), async () => {
      await Promise.resolve();
      const child = trace.getTracer('host').startSpan('host-child');
      const carrier: Record<string, string> = {};
      propagation.inject(trace.setSpan(context.active(), child), carrier);
      expect(carrier.traceparent).toContain(child.spanContext().spanId);
      child.end();
    });
    parent.end();
    await hostProvider.forceFlush();
    const [child, exportedParent] = hostExporter.getFinishedSpans();
    expect(child.parentSpanContext?.spanId).toBe(exportedParent.spanContext().spanId);
  });

  it('does not unregister a host provider installed while its own SDK is shutting down', async () => {
    const release = await acquireOtel(config);
    const active = trace.getTracerProvider() as ProxyTracerProvider;
    const owned = active.getDelegate() as NodeTracerProvider;
    let finishShutdown!: () => void;
    const originalShutdown = owned.shutdown.bind(owned);
    let shutdownStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      shutdownStarted = resolve;
    });
    vi.spyOn(owned, 'shutdown').mockImplementation(async () => {
      shutdownStarted();
      await new Promise<void>((resolve) => {
        finishShutdown = resolve;
      });
      await originalShutdown();
    });
    const releasing = release();
    await started;

    trace.disable();
    hostProvider = new NodeTracerProvider();
    hostProvider.register({ contextManager: null, propagator: null });
    const hostGlobal = trace.getTracerProvider();
    finishShutdown();
    await releasing;
    expect(trace.getTracerProvider()).toBe(hostGlobal);
    const hostSpan = trace.getTracer('host').startSpan('host-after-owned-shutdown');
    expect(hostSpan.isRecording()).toBe(true);
    hostSpan.end();
  });

  it('preserves independently installed host context and propagation across owned shutdown', async () => {
    const hostPropagator = new W3CTraceContextPropagator();
    const hostInject = vi.spyOn(hostPropagator, 'inject');
    hostProvider = new NodeTracerProvider();
    hostProvider.register({ propagator: hostPropagator });
    trace.disable();

    const hostParent = hostProvider.getTracer('host').startSpan('host-parent');
    await context.with(trace.setSpan(context.active(), hostParent), async () => {
      const release = await acquireOtel(config);
      trace.getTracer('test').startSpan('owned-child').end();
      await release();
      expect(trace.getSpan(context.active())).toBe(hostParent);
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);
      expect(hostInject).toHaveBeenCalledOnce();
      expect(carrier.traceparent).toContain(hostParent.spanContext().spanId);
    });
    hostParent.end();
    expect(exportedSpans[0][0].parentSpanContext?.spanId).toBe(hostParent.spanContext().spanId);
  });
});
