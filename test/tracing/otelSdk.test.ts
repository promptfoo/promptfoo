import { context, createContextKey, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { ExportResultCode } from '@opentelemetry/core';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { getGenAITracer } from '../../src/tracing/genaiTracer';
import { LocalSpanExporter } from '../../src/tracing/localSpanExporter';
import {
  flushOtel,
  getOtelTracer,
  initializeOtel,
  isOtelInitialized,
  shutdownOtel,
  withOtelContext,
} from '../../src/tracing/otelSdk';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import type { OtelConfig } from '../../src/tracing/otelConfig';

const remoteExports = vi.hoisted(() => new Map<string, unknown[]>());
vi.mock('@opentelemetry/exporter-trace-otlp-http', async () => {
  const { InMemorySpanExporter } = await import('@opentelemetry/sdk-trace-base');
  return {
    OTLPTraceExporter: class extends InMemorySpanExporter {
      constructor({ url }: { url: string }) {
        super();
        const spans: unknown[] = [];
        remoteExports.set(url, spans);
        const exportSpans = this.export.bind(this);
        this.export = (batch, callback) => {
          spans.push(...batch);
          exportSpans(batch, callback);
        };
      }
    },
  };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const config: OtelConfig = {
  enabled: true,
  serviceName: 'test-service',
  localExport: true,
  debug: false,
};
let localSpans: ReadableSpan[];

async function runScoped<T>(options: Partial<OtelConfig>, fn: () => Promise<T>): Promise<T> {
  return withOtelContext(async () => {
    try {
      initializeOtel({ ...config, ...options });
      return await fn();
    } finally {
      await shutdownOtel();
    }
  });
}

beforeEach(() => {
  trace.disable();
  context.disable();
  propagation.disable();
  remoteExports.clear();
  localSpans = [];
  vi.spyOn(LocalSpanExporter.prototype, 'export').mockImplementation((spans, callback) => {
    localSpans.push(...spans);
    callback({ code: ExportResultCode.SUCCESS });
  });
});

afterEach(() => {
  trace.disable();
  context.disable();
  propagation.disable();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('evaluation-owned OpenTelemetry', () => {
  it('does not initialize a disabled scope', async () => {
    await runScoped({ enabled: false }, async () => {
      expect(isOtelInitialized()).toBe(false);
      getGenAITracer().startSpan('disabled').end();
      await flushOtel();
    });
    expect(localSpans).toEqual([]);
  });

  it('exports sequential scopes using their own service and processors', async () => {
    for (const serviceName of ['first', 'second']) {
      await runScoped({ serviceName }, async () => {
        expect(isOtelInitialized()).toBe(true);
        initializeOtel({ ...config, serviceName: 'ignored duplicate' });
        getGenAITracer().startSpan(serviceName).end();
      });
      expect(isOtelInitialized()).toBe(false);
    }
    expect(localSpans.map((span) => [span.name, span.resource.attributes['service.name']])).toEqual(
      [
        ['first', 'first'],
        ['second', 'second'],
      ],
    );
  });

  it('isolates concurrent exporters and lets a peer keep recording after shutdown', async () => {
    const ready = deferred();
    const release = deferred();
    const first = runScoped(
      { serviceName: 'first', endpoint: 'https://first.invalid' },
      async () => {
        getGenAITracer().startSpan('first span').end();
        ready.resolve();
        await release.promise;
      },
    );
    await ready.promise;
    try {
      await runScoped(
        { serviceName: 'second', localExport: false, endpoint: 'https://second.invalid' },
        async () => {
          getGenAITracer().startSpan('second span').end();
          release.resolve();
          await first;
          getGenAITracer().startSpan('second after first shutdown').end();
          await flushOtel();
        },
      );
    } finally {
      release.resolve();
      await first;
    }
    expect(localSpans.map((span) => span.name)).toEqual(['first span']);
    expect(
      (remoteExports.get('https://first.invalid') as ReadableSpan[]).map(
        (span) => span.resource.attributes['service.name'],
      ),
    ).toEqual(['first']);
    expect(
      (remoteExports.get('https://second.invalid') as ReadableSpan[]).map((span) => [
        span.name,
        span.resource.attributes['service.name'],
      ]),
    ).toEqual([
      ['second span', 'second'],
      ['second after first shutdown', 'second'],
    ]);
  });

  it('shares the active evaluation tracer with a separate module instance', async () => {
    // The CLI and the public package can be separate bundles in custom providers.
    vi.resetModules();
    const otherBundle = await import('../../src/tracing/otelSdk');
    await runScoped({ serviceName: 'shared-scope' }, async () => {
      otherBundle.getOtelTracer('custom-provider').startSpan('separate bundle').end();
    });
    expect(localSpans.map((span) => [span.name, span.resource.attributes['service.name']])).toEqual(
      [['separate bundle', 'shared-scope']],
    );
  });

  it('routes a cached global tracer through sequential, overlapping, and disabled scopes', async () => {
    const custom = trace.getTracer('custom-provider-before-initialization');
    custom.startSpan('outside before').end();
    const entered = deferred();
    const release = deferred();
    const first = runScoped({ serviceName: 'first' }, async () => {
      await custom.startActiveSpan('first parent', async (parent) => {
        custom.startSpan('first child').end();
        entered.resolve();
        await release.promise;
        parent.end();
      });
    });
    await entered.promise;
    try {
      await runScoped({ serviceName: 'second' }, async () => {
        custom.startSpan('second').end();
        await withOtelContext(async () => {
          custom.startSpan('disabled nested').end();
        });
      });
    } finally {
      release.resolve();
      await first;
    }
    await runScoped({ serviceName: 'third' }, async () => {
      custom.startActiveSpan('third', {}, (span) => span.end());
    });
    custom.startSpan('outside after').end();
    expect(localSpans.map((span) => [span.name, span.resource.attributes['service.name']])).toEqual(
      expect.arrayContaining([
        ['first parent', 'first'],
        ['first child', 'first'],
        ['second', 'second'],
        ['third', 'third'],
      ]),
    );
    expect(localSpans).toHaveLength(4);
    const parent = localSpans.find((span) => span.name === 'first parent')!;
    expect(localSpans.find((span) => span.name === 'first child')!.parentSpanContext).toEqual(
      parent.spanContext(),
    );
  });

  it('does not let a nested untraced scope inherit its parent provider', async () => {
    await runScoped({}, async () => {
      getGenAITracer().startSpan('traced before').end();
      await withOtelContext(async () => {
        expect(isOtelInitialized()).toBe(false);
        getGenAITracer().startSpan('untraced').end();
        await flushOtel();
        await shutdownOtel();
      });
      getGenAITracer().startSpan('traced after').end();
    });
    expect(localSpans.map((span) => span.name)).toEqual(['traced before', 'traced after']);
  });

  it('preserves async parent linkage across provider scopes', async () => {
    await runScoped({}, async () => {
      await getGenAITracer().startActiveSpan('parent', async (parent) => {
        await Promise.resolve();
        const child = getGenAITracer().startSpan('child');
        child.end();
        parent.end();
      });
    });
    const parent = localSpans.find((span) => span.name === 'parent')!;
    const child = localSpans.find((span) => span.name === 'child')!;
    expect(child.parentSpanContext).toEqual(parent.spanContext());
  });

  it('lets a host register after evaluation and routes previously cached tracers to it', async () => {
    const custom = trace.getTracer('cached-custom');
    await runScoped({}, async () => {
      custom.startSpan('first eval').end();
    });
    const hostExporter = new InMemorySpanExporter();
    const host = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(hostExporter)],
    });
    expect(trace.setGlobalTracerProvider(host)).toBe(true);
    const globalProvider = trace.getTracerProvider();
    const shutdown = vi.spyOn(host, 'shutdown');
    try {
      custom.startSpan('host after eval').end();
      await runScoped({}, async () => {
        custom.startActiveSpan('host during eval', (span) => span.end());
        getGenAITracer().startSpan('owned during eval').end();
      });
      expect(trace.getTracerProvider()).toBe(globalProvider);
      expect(shutdown).not.toHaveBeenCalled();
      expect(hostExporter.getFinishedSpans().map((span) => span.name)).toEqual([
        'host after eval',
        'host during eval',
      ]);
      expect(localSpans.map((span) => span.name)).toEqual(['first eval', 'owned during eval']);
    } finally {
      await host.shutdown();
    }
  });

  it('keeps global routing registered while another bundle owns an active evaluation', async () => {
    vi.resetModules();
    const other = await import('../../src/tracing/otelSdk');
    await runScoped({}, async () => {
      await other.withOtelContext(async () => {
        other.initializeOtel({ ...config, serviceName: 'other' });
        await other.shutdownOtel();
      });
      trace.getTracer('new after peer shutdown').startSpan('remaining eval').end();
    });
    expect(localSpans.map((span) => span.name)).toEqual(['remaining eval']);
  });

  it('preserves a host tracer, context manager, and custom propagator', async () => {
    const hostExporter = new InMemorySpanExporter();
    const host = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(hostExporter)],
    });
    const manager = new AsyncLocalStorageContextManager().enable();
    const hostKey = createContextKey('host-marker');
    const hostPropagator = {
      fields: () => ['host-header'],
      inject: vi.fn(),
      extract: (ctx: typeof import('@opentelemetry/api').ROOT_CONTEXT) => ctx,
    };
    host.register({ contextManager: manager, propagator: hostPropagator });
    const globalProvider = trace.getTracerProvider();
    const disable = vi.spyOn(manager, 'disable');
    const shutdown = vi.spyOn(host, 'shutdown');
    try {
      await context.with(context.active().setValue(hostKey, 'host-value'), async () => {
        await runScoped({}, async () => {
          await Promise.resolve();
          expect(context.active().getValue(hostKey)).toBe('host-value');
          getGenAITracer().startSpan('owned').end();
          trace.getTracer('host').startSpan('host during').end();
        });
      });
      expect(trace.getTracerProvider()).toBe(globalProvider);
      expect(propagation.fields()).toEqual(['host-header']);
      expect(disable).not.toHaveBeenCalled();
      expect(shutdown).not.toHaveBeenCalled();
      getOtelTracer('host').startSpan('host after').end();
      expect(hostExporter.getFinishedSpans().map((span) => span.name)).toEqual([
        'host during',
        'host after',
      ]);
      expect(localSpans.map((span) => span.name)).toEqual(['owned']);
    } finally {
      await host.shutdown();
    }
  });

  it('removes owned shutdown handlers after a failed operation', async () => {
    const counts = ['SIGINT', 'SIGTERM', 'beforeExit'].map((signal) =>
      process.listenerCount(signal),
    );
    await expect(
      runScoped({}, async () => {
        throw new Error('fixture failure');
      }),
    ).rejects.toThrow('fixture failure');
    expect(
      ['SIGINT', 'SIGTERM', 'beforeExit'].map((signal) => process.listenerCount(signal)),
    ).toEqual(counts);
    expect(isOtelInitialized()).toBe(false);
  });

  it('logs flush and shutdown errors while releasing its scope', async () => {
    vi.spyOn(NodeTracerProvider.prototype, 'forceFlush').mockRejectedValueOnce(
      new Error('flush failed'),
    );
    const realShutdown = NodeTracerProvider.prototype.shutdown;
    vi.spyOn(NodeTracerProvider.prototype, 'shutdown').mockImplementationOnce(async function (
      this: NodeTracerProvider,
    ) {
      await realShutdown.call(this);
      throw new Error('shutdown failed');
    });
    const error = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    await runScoped({}, async () => {
      await flushOtel();
    });
    expect(error).toHaveBeenCalledTimes(2);
    expect(isOtelInitialized()).toBe(false);
  });
});
