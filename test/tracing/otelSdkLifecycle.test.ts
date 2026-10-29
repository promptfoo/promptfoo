import { context, type ProxyTracerProvider, propagation, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { initializeOtel, shutdownOtel } from '../../src/tracing/otelSdk';

// Uses the real OpenTelemetry API: the bug was in how promptfoo's globals outlive a shutdown.
const config = { enabled: true, serviceName: 'promptfoo-test', localExport: false, debug: false };

function globalDelegate() {
  return (trace.getTracerProvider() as ProxyTracerProvider).getDelegate();
}

describe('OpenTelemetry SDK lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await shutdownOtel({ force: true });
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it('gives every traced evaluation in a process its own provider', async () => {
    const providers: unknown[] = [];
    for (const run of [1, 2]) {
      initializeOtel(config);
      providers.push(globalDelegate());
      expect(trace.getTracer('promptfoo.providers').startSpan(`eval ${run}`).isRecording()).toBe(
        true,
      );

      await shutdownOtel();
      // A shut-down provider must not keep receiving spans, which it would drop.
      expect(trace.getTracer('promptfoo.providers').startSpan('between').isRecording()).toBe(false);
    }
    expect(providers[1]).not.toBe(providers[0]);
  });

  it('keeps tracing for an evaluation that is still running when another finishes', async () => {
    const shutdown = vi.spyOn(NodeTracerProvider.prototype, 'shutdown');
    initializeOtel(config);
    initializeOtel(config);
    const provider = globalDelegate();

    await shutdownOtel();
    expect(shutdown).not.toHaveBeenCalled();
    expect(globalDelegate()).toBe(provider);

    await shutdownOtel();
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(trace.getTracer('promptfoo.providers').startSpan('done').isRecording()).toBe(false);
  });
});
