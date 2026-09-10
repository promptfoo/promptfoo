import {
  context,
  ProxyTracerProvider,
  propagation,
  ROOT_CONTEXT,
  TraceFlags,
  trace,
} from '@opentelemetry/api';
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
import type { Span, Tracer, TracerProvider } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

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

function wrapSavedProvider(
  previousProvider: TracerProvider,
  mode: 'direct' | 'eager' | 'lazy' | 'captured',
): TracerProvider {
  const captured = mode === 'captured' ? previousProvider.getTracer('captured') : undefined;
  return {
    getTracer(name, version, options): Tracer {
      if (mode === 'direct') {
        return previousProvider.getTracer(name, version, options);
      }
      const eager =
        mode === 'eager' ? previousProvider.getTracer(name, version, options) : undefined;
      const getTracer = () =>
        captured ?? eager ?? previousProvider.getTracer(name, version, options);
      return {
        startSpan(...args) {
          return getTracer().startSpan(...args);
        },
        startActiveSpan(...args: unknown[]) {
          const tracer = getTracer();
          return Reflect.apply(tracer.startActiveSpan, tracer, args);
        },
      };
    },
  };
}

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
    vi.restoreAllMocks();
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

  it('keeps tracers cached before and during initialization usable across SDK generations', async () => {
    const beforeInitialization = trace.getTracerProvider().getTracer('cached-before', '1.2.3', {
      schemaUrl: 'https://example.test/schema',
    });
    const beforeSpan = beforeInitialization.startSpan('disabled-before-initialization');
    expect(beforeSpan.isRecording()).toBe(false);
    beforeSpan.end();
    expect(isOtelInitialized()).toBe(false);
    expect(exportedSpans).toHaveLength(0);

    const releaseFirst = await acquireOtel(config);
    const duringInitialization = trace.getTracer('cached-during', '4.5.6');
    beforeInitialization.startSpan('before-first').end();
    duringInitialization.startSpan('during-first').end();
    await releaseFirst();

    for (const cached of [beforeInitialization, duringInitialization]) {
      const idleSpan = cached.startSpan('disabled-between-generations');
      expect(idleSpan.isRecording()).toBe(false);
      idleSpan.end();
    }
    expect(isOtelInitialized()).toBe(false);
    expect(exportedSpans).toHaveLength(1);
    const betweenGenerations = trace.getTracer('cached-between', '7.8.9');
    const idleSpan = betweenGenerations.startSpan('disabled-between-generations');
    expect(idleSpan.isRecording()).toBe(false);
    idleSpan.end();

    const releaseSecond = await acquireOtel({ ...config, serviceName: 'second-service' });
    beforeInitialization.startSpan('before-second').end();
    duringInitialization.startSpan('during-second').end();
    betweenGenerations.startSpan('between-second').end();
    await releaseSecond();

    expect(exportedSpans.map((spans) => spans.map((span) => span.name))).toEqual([
      ['before-first', 'during-first'],
      ['before-second', 'during-second', 'between-second'],
    ]);
    for (const spans of exportedSpans) {
      expect(spans[0].instrumentationScope).toMatchObject({
        name: 'cached-before',
        version: '1.2.3',
        schemaUrl: 'https://example.test/schema',
      });
      expect(spans[1].instrumentationScope).toMatchObject({
        name: 'cached-during',
        version: '4.5.6',
      });
    }
    expect(
      exportedSpans[1].every(
        (span) => span.resource.attributes['service.name'] === 'second-service',
      ),
    ).toBe(true);
  });

  it('preserves cached active-span overloads, context, return values and error identity', async () => {
    const cached = trace.getTracer('cached-active');
    const releaseFirst = await acquireOtel(config);
    cached.startActiveSpan('first-generation', (span) => span.end());
    await releaseFirst();
    const releaseSecond = await acquireOtel(config);

    const result = {};
    expect(
      cached.startActiveSpan('two-arguments', (span) => {
        expect(trace.getSpan(context.active())).toBe(span);
        span.end();
        return result;
      }),
    ).toBe(result);
    expect(
      cached.startActiveSpan('three-arguments', { attributes: { case: 'options' } }, (span) => {
        span.end();
        return 42;
      }),
    ).toBe(42);

    const parent = {
      traceId: '11111111111111111111111111111111',
      spanId: '2222222222222222',
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    };
    const promiseResult = Promise.resolve(result);
    const returned = cached.startActiveSpan(
      'four-arguments',
      { attributes: { case: 'explicit-context' } },
      trace.setSpanContext(ROOT_CONTEXT, parent),
      (span) => {
        expect(trace.getSpan(context.active())).toBe(span);
        span.end();
        return promiseResult;
      },
    );
    expect(returned).toBe(promiseResult);
    await returned;

    const failure = new Error('callback failed');
    let thrown: unknown;
    try {
      cached.startActiveSpan('synchronous-error', (span) => {
        span.end();
        throw failure;
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    const rejected = Promise.reject(failure);
    const forwarded = cached.startActiveSpan('asynchronous-error', (span) => {
      span.end();
      return rejected;
    });
    expect(forwarded).toBe(rejected);
    await expect(forwarded).rejects.toBe(failure);
    await releaseSecond();

    expect(exportedSpans[1].map((span) => span.name)).toEqual([
      'two-arguments',
      'three-arguments',
      'four-arguments',
      'synchronous-error',
      'asynchronous-error',
    ]);
    expect(exportedSpans[1][1].attributes).toMatchObject({ case: 'options' });
    expect(exportedSpans[1][2].parentSpanContext).toEqual(parent);
    expect(exportedSpans[1][2].spanContext().traceId).toBe(parent.traceId);
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

  it('lets a host register while idle without reassigning cached managed tracers', async () => {
    const cachedBefore = trace.getTracer('cached-before-host');
    const firstUsedAfterRelease = trace.getTracer('unused-before-host');
    const releaseOwned = await acquireOtel(config);
    const cachedDuring = trace.getTracer('cached-during-host');
    cachedBefore.startSpan('owned-before').end();
    cachedDuring.startSpan('owned-during').end();
    await releaseOwned();

    const hostExporter = new InMemorySpanExporter();
    hostProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(hostExporter)],
    });
    // No trace.disable(): the final owned lease must free the registration slot.
    hostProvider.register({ contextManager: null, propagator: null });
    const hostGlobal = trace.getTracerProvider();
    const hostShutdown = vi.spyOn(hostProvider, 'shutdown');
    const releaseBorrowed = await acquireOtel(config);
    for (const cached of [cachedBefore, cachedDuring, firstUsedAfterRelease]) {
      const inactive = cached.startSpan('inactive-owned-tracer');
      expect(inactive.isRecording()).toBe(false);
      inactive.end();
    }
    const hostTracer = trace.getTracer('host-after-release');
    await hostTracer.startActiveSpan('host-parent', async (parent) => {
      await Promise.resolve();
      hostTracer.startSpan('host-child').end();
      parent.end();
    });
    await releaseBorrowed();
    await shutdownOtel();
    await hostProvider.forceFlush();

    expect(trace.getTracerProvider()).toBe(hostGlobal);
    expect(hostShutdown).not.toHaveBeenCalled();
    expect(isOtelInitialized()).toBe(false);
    expect(exportedSpans).toHaveLength(1);
    const [child, parent] = hostExporter.getFinishedSpans();
    expect([child.name, parent.name]).toEqual(['host-child', 'host-parent']);
    expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    expect(child.instrumentationScope.name).toBe('host-after-release');
    expect(parent.instrumentationScope.name).toBe('host-after-release');
    expect(exportedSpans[0].map((span) => span.name)).toEqual(['owned-before', 'owned-during']);
  });

  it('matches native SDK affinity when a replacement host processor uses an older cached tracer', async () => {
    const originalExporter = new InMemorySpanExporter();
    const originalProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(originalExporter)],
    });
    try {
      originalProvider.register();
      const originalTracer = trace.getTracer('original-native');
      const hostExporter = new InMemorySpanExporter();
      const processor: SpanProcessor = {
        onStart(span, parentContext) {
          originalTracer.startSpan('original-child', {}, trace.setSpan(parentContext, span)).end();
        },
        onEnd() {},
        async forceFlush() {},
        async shutdown() {},
      };
      hostProvider = new NodeTracerProvider({
        spanProcessors: [processor, new SimpleSpanProcessor(hostExporter)],
      });
      trace.disable();
      hostProvider.register({ contextManager: null, propagator: null });
      trace.getTracer('replacement-native').startSpan('host-parent').end();
      await originalProvider.forceFlush();
      await hostProvider.forceFlush();

      const [child] = originalExporter.getFinishedSpans();
      const [parent] = hostExporter.getFinishedSpans();
      expect(originalExporter.getFinishedSpans().map((span) => span.name)).toEqual([
        'original-child',
      ]);
      expect(hostExporter.getFinishedSpans().map((span) => span.name)).toEqual(['host-parent']);
      expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    } finally {
      await originalProvider.shutdown();
    }
  });

  it.each([true, false])(
    'keeps cached managed tracer affinity with active SDK=%s',
    async (active) => {
      const release = await acquireOtel(config);
      const ownedTracer = trace.getTracer('managed-cached-child');
      if (!active) {
        await release();
      }
      const hostExporter = new InMemorySpanExporter();
      const recording: boolean[] = [];
      const processor: SpanProcessor = {
        onStart(span, parentContext) {
          const child = ownedTracer.startSpan(
            'managed-child',
            {},
            trace.setSpan(parentContext, span),
          );
          recording.push(child.isRecording());
          child.end();
        },
        onEnd() {},
        async forceFlush() {},
        async shutdown() {},
      };
      hostProvider = new NodeTracerProvider({
        spanProcessors: [processor, new SimpleSpanProcessor(hostExporter)],
      });
      trace.disable();
      hostProvider.register({ contextManager: null, propagator: null });
      trace.getTracer('host-parent').startSpan('host-parent').end();
      await hostProvider.forceFlush();
      await release();

      expect(recording).toEqual([active]);
      expect(hostExporter.getFinishedSpans().map((span) => span.name)).toEqual(['host-parent']);
      expect(exportedSpans[0].map((span) => span.name)).toEqual(active ? ['managed-child'] : []);
      if (active) {
        expect(exportedSpans[0][0].parentSpanContext?.spanId).toBe(
          hostExporter.getFinishedSpans()[0].spanContext().spanId,
        );
      }
    },
  );

  it.each([true, false])(
    'preserves host-owned onStart children with active managed SDK=%s',
    async (active) => {
      const release = await acquireOtel(config);
      if (!active) {
        await release();
      }
      const hostExporter = new InMemorySpanExporter();
      let hostTracer: Tracer;
      const processor: SpanProcessor = {
        onStart(span, parentContext) {
          if (span.name === 'host-parent') {
            hostTracer.startSpan('host-child', {}, trace.setSpan(parentContext, span)).end();
          }
        },
        onEnd() {},
        async forceFlush() {},
        async shutdown() {},
      };
      hostProvider = new NodeTracerProvider({
        spanProcessors: [processor, new SimpleSpanProcessor(hostExporter)],
      });
      trace.disable();
      hostProvider.register({ contextManager: null, propagator: null });
      hostTracer = trace.getTracer('host-owned-cache');
      hostTracer.startSpan('host-parent').end();
      await hostProvider.forceFlush();
      await release();

      const [child, parent] = hostExporter.getFinishedSpans();
      expect(hostExporter.getFinishedSpans().map((span) => span.name)).toEqual([
        'host-child',
        'host-parent',
      ]);
      expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
      expect(exportedSpans[0]).toHaveLength(0);
    },
  );

  it.each(['direct', 'eager', 'lazy', 'captured', 'restored'] as const)(
    'avoids cycles when a host uses the %s previous provider',
    async (mode) => {
      const release = await acquireOtel(config);
      const previousProvider = trace.getTracerProvider();
      const cached = trace.getTracer('cached-host-wrapper');
      cached.startSpan('before-host-wrapper').end();
      const replacement =
        mode === 'restored' ? previousProvider : wrapSavedProvider(previousProvider, mode);
      trace.disable();
      expect(trace.setGlobalTracerProvider(replacement)).toBe(true);
      const hostGlobal = trace.getTracerProvider();
      const wrapped = trace.getTracer('saved-provider-wrapper');
      wrapped.startActiveSpan('active-through-host-wrapper', (span) => span.end());
      await release();

      expect(trace.getTracerProvider()).toBe(hostGlobal);
      const inactive = wrapped.startSpan('inactive-through-host-wrapper');
      expect(inactive.isRecording()).toBe(false);
      inactive.end();
      expect(exportedSpans[0].map((span) => span.name)).toEqual([
        'before-host-wrapper',
        'active-through-host-wrapper',
      ]);
      expect(isOtelInitialized()).toBe(false);
      expect(exportedSpans).toHaveLength(1);
    },
  );

  it.each(['direct', 'eager', 'lazy', 'captured'] as const)(
    'avoids cycles with a %s saved provider after final release',
    async (mode) => {
      const release = await acquireOtel(config);
      const previousProvider = trace.getTracerProvider();
      const cached = trace.getTracer('cached-idle-host-wrapper');
      cached.startSpan('before-release').end();
      const replacement = wrapSavedProvider(previousProvider, mode);
      await release();
      expect(trace.setGlobalTracerProvider(replacement)).toBe(true);

      const inactive = trace.getTracer('saved-provider-after-release').startSpan('after-release');
      expect(inactive.isRecording()).toBe(false);
      inactive.end();
      const borrowed = await acquireOtel(config);
      await borrowed();
      expect(isOtelInitialized()).toBe(false);
      expect(exportedSpans).toHaveLength(1);
      expect(exportedSpans[0].map((span) => span.name)).toEqual(['before-release']);
    },
  );

  it('preserves borrowed host callback binding, nested spans and errors', async () => {
    const hostExporter = new InMemorySpanExporter();
    hostProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(hostExporter)],
    });
    const hostTracer = hostProvider.getTracer('host-callback');
    hostProvider.register();
    trace.disable();
    const binding = {};
    const extraArgument = {};
    expect(
      trace.setGlobalTracerProvider({
        getTracer(): Tracer {
          return {
            startSpan: hostTracer.startSpan.bind(hostTracer),
            startActiveSpan(...args: unknown[]) {
              const callback = args[args.length - 1] as (span: Span) => unknown;
              args[args.length - 1] = (span: Span) =>
                Reflect.apply(callback, binding, [span, extraArgument]);
              return Reflect.apply(hostTracer.startActiveSpan, hostTracer, args);
            },
          };
        },
      }),
    ).toBe(true);
    const cached = trace.getTracer('cached-host-callback');
    const release = await acquireOtel(config);

    const result = {};
    let callbackResult: Promise<object> | undefined;
    const returned = cached.startActiveSpan(
      'host-parent',
      function (this: unknown, span, extra?: unknown) {
        expect(this).toBe(binding);
        expect(extra).toBe(extraArgument);
        cached.startSpan('host-synchronous-child').end();
        callbackResult = Promise.resolve().then(() => {
          cached.startSpan('host-asynchronous-child').end();
          span.end();
          return result;
        });
        return callbackResult;
      },
    );
    expect(returned).toBe(callbackResult);
    await expect(returned).resolves.toBe(result);

    const failure = new Error('host callback failed');
    let thrown: unknown;
    try {
      cached.startActiveSpan('host-error', (span) => {
        span.end();
        throw failure;
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
    cached.startSpan('host-after-error').end();
    await hostProvider.forceFlush();
    const spans = hostExporter.getFinishedSpans();
    expect(spans.map((span) => span.name)).toEqual([
      'host-synchronous-child',
      'host-asynchronous-child',
      'host-parent',
      'host-error',
      'host-after-error',
    ]);
    expect(spans[0].parentSpanContext?.spanId).toBe(spans[2].spanContext().spanId);
    expect(spans[1].parentSpanContext?.spanId).toBe(spans[2].spanContext().spanId);
    await release();
    expect(exportedSpans).toHaveLength(0);
  });

  it('does not unregister a host provider installed while its own SDK is shutting down', async () => {
    const release = await acquireOtel(config);
    const cached = trace.getTracer('cached-during-shutdown');
    cached.startSpan('before-shutdown').end();
    let finishShutdown!: () => void;
    const originalShutdown = NodeTracerProvider.prototype.shutdown;
    let shutdownStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      shutdownStarted = resolve;
    });
    vi.spyOn(NodeTracerProvider.prototype, 'shutdown').mockImplementationOnce(async function (
      this: NodeTracerProvider,
    ) {
      shutdownStarted();
      await new Promise<void>((resolve) => {
        finishShutdown = resolve;
      });
      await originalShutdown.call(this);
    });
    const releasing = release();
    await started;
    const inactiveSpan = cached.startSpan('disabled-during-shutdown');
    expect(inactiveSpan.isRecording()).toBe(false);
    inactiveSpan.end();
    expect(exportedSpans).toHaveLength(1);

    trace.disable();
    const hostExporter = new InMemorySpanExporter();
    hostProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(hostExporter)],
    });
    hostProvider.register({ contextManager: null, propagator: null });
    const hostGlobal = trace.getTracerProvider();
    const beforeShutdown = cached.startSpan('cached-owned-before-shutdown-completes');
    expect(beforeShutdown.isRecording()).toBe(false);
    beforeShutdown.end();
    finishShutdown();
    await releasing;
    expect(trace.getTracerProvider()).toBe(hostGlobal);
    const afterShutdown = cached.startSpan('cached-owned-after-shutdown-completes');
    expect(afterShutdown.isRecording()).toBe(false);
    afterShutdown.end();
    const hostSpan = trace.getTracer('host').startSpan('host-after-owned-shutdown');
    expect(hostSpan.isRecording()).toBe(true);
    hostSpan.end();
    await hostProvider.forceFlush();
    expect(hostExporter.getFinishedSpans().map((span) => span.name)).toEqual([
      'host-after-owned-shutdown',
    ]);
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
